import fs from "node:fs/promises";
import path from "node:path";

async function writeJsonAtomic(filePath, value) {
  const dir = path.dirname(filePath);
  const tempPath = `${filePath}.tmp`;
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(tempPath, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(tempPath, filePath);
}

export async function ensureJsonFile(filePath, defaultValue) {
  try {
    await fs.access(filePath);
  } catch {
    await writeJsonAtomic(filePath, defaultValue);
  }
}

export async function readJsonFile(filePath, fallbackValue) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallbackValue;
  }
}

export async function writeJsonFile(filePath, value) {
  await writeJsonAtomic(filePath, value);
}
