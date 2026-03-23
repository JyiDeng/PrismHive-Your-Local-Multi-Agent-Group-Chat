import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import OpenAI from "openai";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  getAgentConfig,
  getEnabledAgentMap,
  setAgentConfig,
} from "./store/agentStore.js";
import {
  appendMessages,
  createSession,
  getSessionById,
  listSessions,
} from "./store/historyStore.js";
import { getRuntimeConfig, setRuntimeConfig } from "./store/runtimeStore.js";
import { getGroupConfig, setGroupConfig } from "./store/groupStore.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8787;
let client = null;
let clientCacheKey = "";

function getClient(runtimeConfig) {
  const key = `${runtimeConfig.apiKey}@@${runtimeConfig.baseURL}`;
  if (!runtimeConfig.apiKey) return null;
  if (!client || clientCacheKey !== key) {
    client = new OpenAI({
      apiKey: runtimeConfig.apiKey,
      baseURL: runtimeConfig.baseURL,
    });
    clientCacheKey = key;
  }
  return client;
}

const mentionRegex = /@([a-zA-Z0-9_]+)/g;

function parseMentions(text = "", agentMap = {}) {
  const ids = new Set();
  let match;
  while ((match = mentionRegex.exec(text)) !== null) {
    const id = match[1].toLowerCase();
    if (agentMap[id]) ids.add(id);
  }
  return Array.from(ids);
}

function formatTranscript(messages) {
  return messages
    .slice(-12)
    .map((m) => `${m.role === "user" ? "用户" : m.agentName || "助手"}: ${m.content}`)
    .join("\n");
}

async function getGroupMap() {
  const groups = await getGroupConfig();
  return Object.fromEntries(groups.map((group) => [group.id, group]));
}

async function runAgent(agent, transcript, latestUserMessage, runtimeConfig) {
  const sdk = getClient(runtimeConfig);
  if (!sdk) {
    throw new Error("Missing API key. Please configure API Key in the API 配置面板。");
  }

  const completion = await sdk.chat.completions.create({
    model: runtimeConfig.model,
    temperature: 0.8,
    messages: [
      { role: "system", content: agent.system },
      {
        role: "user",
        content: [
          "以下是群聊上下文：",
          transcript || "（暂无历史）",
          "",
          `最新用户消息：${latestUserMessage}`,
          "",
          "请直接输出你在群里的回复，1-3段即可。",
        ].join("\n"),
      },
    ],
  });

  return completion.choices?.[0]?.message?.content?.trim() || "我暂时没有想法，稍后再试一次。";
}

app.get("/api/agents", (req, res) => {
  getEnabledAgentMap()
    .then((agentMap) => {
      const agents = Object.values(agentMap).map(({ id, name, intro }) => ({ id, name, intro }));
      res.json({ agents });
    })
    .catch((err) => res.status(500).json({ error: err.message || "Failed to load agents" }));
});

app.get("/api/agent-config", async (req, res) => {
  try {
    const agents = await getAgentConfig();
    res.json({ agents });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to load agent config" });
  }
});

app.put("/api/agent-config", async (req, res) => {
  try {
    const { agents = [] } = req.body || {};
    const saved = await setAgentConfig(agents);
    res.json({ agents: saved });
  } catch (err) {
    res.status(400).json({ error: err.message || "Failed to save agent config" });
  }
});

app.get("/api/groups", async (req, res) => {
  try {
    const groups = await getGroupConfig();
    res.json({ groups });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to load groups" });
  }
});

app.get("/api/group-config", async (req, res) => {
  try {
    const groups = await getGroupConfig();
    res.json({ groups });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to load group config" });
  }
});

app.put("/api/group-config", async (req, res) => {
  try {
    const { groups = [] } = req.body || {};
    const agents = await getAgentConfig();
    const validBotIdSet = new Set(agents.map((agent) => agent.id));
    const saved = await setGroupConfig(groups, validBotIdSet);
    res.json({ groups: saved });
  } catch (err) {
    res.status(400).json({ error: err.message || "Failed to save group config" });
  }
});

app.get("/api/runtime-config", async (req, res) => {
  try {
    const config = await getRuntimeConfig();
    res.json({ config });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to load runtime config" });
  }
});

app.put("/api/runtime-config", async (req, res) => {
  try {
    const { config = {} } = req.body || {};
    const saved = await setRuntimeConfig(config);
    res.json({ config: saved });
  } catch (err) {
    res.status(400).json({ error: err.message || "Failed to save runtime config" });
  }
});

app.get("/api/sessions", async (req, res) => {
  try {
    const groupId = req.query.groupId ? String(req.query.groupId) : null;
    const sessions = await listSessions(groupId);
    res.json({ sessions });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to load sessions" });
  }
});

app.post("/api/sessions", async (req, res) => {
  try {
    const { title = "新对话", groupId = "group_general" } = req.body || {};
    const groupMap = await getGroupMap();
    const group = groupMap[groupId];
    if (!group) {
      return res.status(400).json({ error: "Invalid groupId." });
    }

    const agentMap = await getEnabledAgentMap();
    const groupAgents = group.botIds.filter((id) => agentMap[id]).map((id) => agentMap[id]);
    const welcomeAgent = groupAgents[0] || agentMap.captain || Object.values(agentMap)[0] || null;
    const session = await createSession(title, welcomeAgent, group.id);
    res.status(201).json({ session });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to create session" });
  }
});

app.get("/api/sessions/:id", async (req, res) => {
  try {
    const session = await getSessionById(req.params.id);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    res.json({ session });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to load session" });
  }
});

app.post("/api/chat", async (req, res) => {
  try {
    const runtimeConfig = await getRuntimeConfig();
    if (!runtimeConfig.apiKey) {
      return res.status(500).json({ error: "Missing API key. Please configure API Key in API 配置。" });
    }

    const { sessionId, content = "" } = req.body || {};
    const text = String(content).trim();
    if (!sessionId || !text) {
      return res.status(400).json({ error: "sessionId and content are required." });
    }

    const existing = await getSessionById(sessionId);
    if (!existing) {
      return res.status(404).json({ error: "Session not found." });
    }

    const groupMap = await getGroupMap();
    const group = groupMap[existing.groupId];
    if (!group) {
      return res.status(400).json({ error: "Session group is not configured." });
    }

    const userMsg = {
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };

    const messageList = [...(existing.messages || []), userMsg];
    const transcript = formatTranscript(messageList);
    const enabledAgentMap = await getEnabledAgentMap();
    const agentMap = Object.fromEntries(
      group.botIds.filter((id) => enabledAgentMap[id]).map((id) => [id, enabledAgentMap[id]])
    );

    if (Object.keys(agentMap).length === 0) {
      return res.status(400).json({ error: "This group has no enabled bots." });
    }

    let selectedAgents = parseMentions(text, agentMap);
    if (selectedAgents.length === 0) {
      selectedAgents = group.botIds.filter((id) => agentMap[id]).slice(0, 3);
      if (selectedAgents.length === 0) {
        selectedAgents = Object.keys(agentMap).slice(0, 3);
      }
    }

    const replies = await Promise.all(
      selectedAgents.map(async (id) => {
        const agent = agentMap[id];
        const replyContent = await runAgent(agent, transcript, text, runtimeConfig);
        return {
          role: "assistant",
          agentId: agent.id,
          agentName: agent.name,
          content: replyContent,
          createdAt: new Date().toISOString(),
        };
      })
    );

    const isUntitled = /^对话 \d+$/.test(existing.title) || existing.title === "新对话";
    const nextTitle = isUntitled ? text.slice(0, 16) || existing.title : existing.title;
    const updated = await appendMessages(sessionId, [userMsg, ...replies], nextTitle);
    res.json({ replies, session: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Unknown server error" });
  }
});

app.use("/api", (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` });
});

app.use((err, req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return res.status(err.status || 500).json({ error: err.message || "Internal server error" });
  }
  return next(err);
});

app.listen(PORT, () => {
  console.log(`Multi-agent backend listening on http://localhost:${PORT}`);
});
