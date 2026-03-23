import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureJsonFile, readJsonFile, writeJsonFile } from "./jsonDb.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const runtimeConfigFile = path.resolve(__dirname, "../data/config/runtime.local.json");

function getEnvDefaults() {
  return {
    apiKey: String(process.env.DASHSCOPE_API_KEY || process.env.OPENAI_API_KEY || "").trim(),
    baseURL: String(
      process.env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1"
    ).trim(),
    model: String(process.env.DASHSCOPE_MODEL || "glm-4.7").trim(),
  };
}

function normalizeRuntimeConfig(input = {}) {
  return {
    apiKey: String(input.apiKey || "").trim(),
    baseURL: String(input.baseURL || "").trim(),
    model: String(input.model || "").trim(),
  };
}

async function ensureRuntimeConfig() {
  await ensureJsonFile(runtimeConfigFile, getEnvDefaults());
}

export async function getRuntimeConfig() {
  await ensureRuntimeConfig();
  const defaults = getEnvDefaults();
  const data = await readJsonFile(runtimeConfigFile, defaults);
  return {
    apiKey: data?.apiKey ?? defaults.apiKey,
    baseURL: data?.baseURL ?? defaults.baseURL,
    model: data?.model ?? defaults.model,
  };
}

export async function setRuntimeConfig(nextConfig) {
  const normalized = normalizeRuntimeConfig(nextConfig);
  if (!normalized.baseURL) {
    throw new Error("baseURL is required.");
  }
  if (!normalized.model) {
    throw new Error("model is required.");
  }
  await writeJsonFile(runtimeConfigFile, normalized);
  return normalized;
}
