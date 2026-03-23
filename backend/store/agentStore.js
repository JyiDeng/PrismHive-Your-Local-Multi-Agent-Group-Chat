import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ensureJsonFile, readJsonFile, writeJsonFile } from "./jsonDb.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const defaultFile = path.resolve(__dirname, "../config/agents.default.json");
const agentConfigFile = path.resolve(__dirname, "../data/config/agents.json");

const idRegex = /^[a-zA-Z0-9_]+$/;

function normalizeAgent(agent) {
  const id = String(agent.id || "").trim().toLowerCase();
  return {
    id,
    name: String(agent.name || "").trim(),
    intro: String(agent.intro || "").trim(),
    system: String(agent.system || "").trim(),
    enabled: agent.enabled !== false,
  };
}

function validateAgents(agents) {
  if (!Array.isArray(agents) || agents.length === 0) {
    throw new Error("Agent config must be a non-empty array.");
  }

  const seen = new Set();
  for (const item of agents) {
    const agent = normalizeAgent(item);
    if (!idRegex.test(agent.id)) {
      throw new Error(`Invalid agent id: ${agent.id}`);
    }
    if (!agent.name || !agent.intro || !agent.system) {
      throw new Error(`Agent ${agent.id} is missing required fields.`);
    }
    if (seen.has(agent.id)) {
      throw new Error(`Duplicated agent id: ${agent.id}`);
    }
    seen.add(agent.id);
  }
}

async function getDefaultAgents() {
  const raw = await fs.readFile(defaultFile, "utf8");
  return JSON.parse(raw).map(normalizeAgent);
}

export async function ensureAgentConfig() {
  const defaults = await getDefaultAgents();
  await ensureJsonFile(agentConfigFile, defaults);
}

export async function getAgentConfig() {
  await ensureAgentConfig();
  const defaults = await getDefaultAgents();
  const agents = await readJsonFile(agentConfigFile, defaults);
  return Array.isArray(agents) ? agents.map(normalizeAgent) : defaults;
}

export async function setAgentConfig(nextAgents) {
  const normalized = nextAgents.map(normalizeAgent);
  validateAgents(normalized);
  await writeJsonFile(agentConfigFile, normalized);
  return normalized;
}

export async function getEnabledAgentMap() {
  const agents = await getAgentConfig();
  const enabled = agents.filter((agent) => agent.enabled);
  const source = enabled.length > 0 ? enabled : agents;
  return Object.fromEntries(source.map((agent) => [agent.id, agent]));
}
