import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureJsonFile, readJsonFile, writeJsonFile } from "./jsonDb.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const historyDbFile = path.resolve(__dirname, "../data/history/history.db.json");
const DEFAULT_GROUP_ID = "group_general";

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function buildWelcomeMessage(agent) {
  return {
    role: "assistant",
    agentId: agent?.id || "system",
    agentName: agent?.name || "System",
    content: "欢迎来到多 Agent 群聊。你可以输入 @agent_id 来点名，或直接提问让多个 Agent 协作。",
    createdAt: nowIso(),
  };
}

async function ensureHistoryDb() {
  await ensureJsonFile(historyDbFile, { sessions: [] });
}

async function readDb() {
  await ensureHistoryDb();
  const db = await readJsonFile(historyDbFile, { sessions: [] });
  if (!Array.isArray(db.sessions)) return { sessions: [] };
  db.sessions = db.sessions.map((session) => ({
    ...session,
    groupId: String(session.groupId || DEFAULT_GROUP_ID),
    messages: Array.isArray(session.messages) ? session.messages : [],
  }));
  return db;
}

async function writeDb(db) {
  await writeJsonFile(historyDbFile, db);
}

export async function listSessions(groupId = null) {
  const db = await readDb();
  const source = groupId ? db.sessions.filter((session) => session.groupId === groupId) : db.sessions;
  return source
    .map((session) => ({
      id: session.id,
      groupId: session.groupId,
      title: session.title,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      messageCount: Array.isArray(session.messages) ? session.messages.length : 0,
    }))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export async function createSession(title, welcomeAgent, groupId = DEFAULT_GROUP_ID) {
  const db = await readDb();
  const now = nowIso();
  const session = {
    id: createId("s"),
    groupId: String(groupId || DEFAULT_GROUP_ID),
    title: String(title || "新对话").trim() || "新对话",
    createdAt: now,
    updatedAt: now,
    messages: [buildWelcomeMessage(welcomeAgent)],
  };
  db.sessions.unshift(session);
  await writeDb(db);
  return session;
}

export async function getSessionById(sessionId) {
  const db = await readDb();
  return db.sessions.find((session) => session.id === sessionId) || null;
}

export async function appendMessages(sessionId, appendedMessages, nextTitle) {
  const db = await readDb();
  const idx = db.sessions.findIndex((session) => session.id === sessionId);
  if (idx < 0) return null;

  const session = db.sessions[idx];
  const mergedMessages = [...(session.messages || []), ...(appendedMessages || [])];
  const title = String(nextTitle || session.title || "新对话").trim() || "新对话";
  const updated = {
    ...session,
    title,
    updatedAt: nowIso(),
    messages: mergedMessages,
  };

  db.sessions[idx] = updated;
  await writeDb(db);
  return updated;
}

export async function removeSession(sessionId) {
  const db = await readDb();
  const idx = db.sessions.findIndex((session) => session.id === sessionId);
  if (idx < 0) return false;
  db.sessions.splice(idx, 1);
  await writeDb(db);
  return true;
}
