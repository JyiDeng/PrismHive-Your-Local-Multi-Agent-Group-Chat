import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ensureJsonFile, readJsonFile, writeJsonFile } from "./jsonDb.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const defaultFile = path.resolve(__dirname, "../config/groups.default.json");
const groupConfigFile = path.resolve(__dirname, "../data/config/groups.json");
const DEFAULT_GROUP_ID = "group_general";

const idRegex = /^[a-zA-Z0-9_]+$/;

function normalizeGroup(group) {
  const botIds = Array.isArray(group.botIds) ? group.botIds : [];
  return {
    id: String(group.id || "").trim().toLowerCase(),
    name: String(group.name || "").trim(),
    intro: String(group.intro || "").trim(),
    botIds: Array.from(new Set(botIds.map((id) => String(id || "").trim().toLowerCase()).filter(Boolean))),
  };
}

function validateGroups(groups) {
  if (!Array.isArray(groups) || groups.length === 0) {
    throw new Error("Group config must be a non-empty array.");
  }

  const seen = new Set();
  for (const item of groups) {
    const group = normalizeGroup(item);
    if (!idRegex.test(group.id)) {
      throw new Error(`Invalid group id: ${group.id}`);
    }
    if (!group.name) {
      throw new Error(`Group ${group.id} is missing name.`);
    }
    if (seen.has(group.id)) {
      throw new Error(`Duplicated group id: ${group.id}`);
    }
    seen.add(group.id);
  }
}

async function getDefaultGroups() {
  const raw = await fs.readFile(defaultFile, "utf8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed.map(normalizeGroup) : [];
}

export async function ensureGroupConfig() {
  const defaults = await getDefaultGroups();
  await ensureJsonFile(groupConfigFile, defaults);
}

export async function getGroupConfig() {
  await ensureGroupConfig();
  const defaults = await getDefaultGroups();
  const groups = await readJsonFile(groupConfigFile, defaults);
  if (!Array.isArray(groups) || groups.length === 0) {
    return defaults;
  }
  return groups.map(normalizeGroup);
}

export async function setGroupConfig(nextGroups, validBotIdSet = null) {
  const normalized = (nextGroups || []).map(normalizeGroup);
  validateGroups(normalized);

  if (validBotIdSet && validBotIdSet.size > 0) {
    for (const group of normalized) {
      if (group.id === DEFAULT_GROUP_ID) {
        group.botIds = Array.from(validBotIdSet);
      } else {
        group.botIds = group.botIds.filter((id) => validBotIdSet.has(id));
      }
    }
  }

  await writeJsonFile(groupConfigFile, normalized);
  return normalized;
}
