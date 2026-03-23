async function unwrapJson(response) {
  const contentType = response.headers.get("content-type") || "";
  const raw = await response.text();

  if (!contentType.includes("application/json")) {
    const short = raw.slice(0, 140).replace(/\s+/g, " ").trim();
    throw new Error(`Server returned non-JSON response (${response.status}): ${short || "empty body"}`);
  }

  let data;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`Invalid JSON response (${response.status}).`);
  }

  if (!response.ok) {
    throw new Error(data?.error || `Request failed (${response.status})`);
  }
  return data;
}

const RUNTIME_CONFIG_FALLBACK_KEY = "runtime_config_local_fallback_v1";
const GROUP_CONFIG_FALLBACK_KEY = "group_config_local_fallback_v1";

const DEFAULT_GROUPS = [
  {
    id: "group_general",
    name: "默认群聊",
    intro: "通用讨论群",
    botIds: ["captain", "newsbot", "moodbot"],
  },
];

function readRuntimeConfigFallback() {
  try {
    const raw = localStorage.getItem(RUNTIME_CONFIG_FALLBACK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      apiKey: String(parsed?.apiKey || ""),
      baseURL: String(parsed?.baseURL || ""),
      model: String(parsed?.model || ""),
    };
  } catch {
    return null;
  }
}

function writeRuntimeConfigFallback(config) {
  try {
    localStorage.setItem(RUNTIME_CONFIG_FALLBACK_KEY, JSON.stringify(config));
  } catch {
    // Ignore storage failures and continue with in-memory flow.
  }
}

function readGroupConfigFallback() {
  try {
    const raw = localStorage.getItem(GROUP_CONFIG_FALLBACK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeGroupConfigFallback(groups) {
  try {
    localStorage.setItem(GROUP_CONFIG_FALLBACK_KEY, JSON.stringify(groups));
  } catch {
    // Ignore storage failures and continue.
  }
}

export async function fetchAgents() {
  const response = await fetch("/api/agents");
  const data = await unwrapJson(response);
  return data.agents || [];
}

export async function fetchAgentConfig() {
  const response = await fetch("/api/agent-config");
  const data = await unwrapJson(response);
  return data.agents || [];
}

export async function saveAgentConfig(agents) {
  const response = await fetch("/api/agent-config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agents }),
  });
  const data = await unwrapJson(response);
  return data.agents || [];
}

export async function fetchRuntimeConfig() {
  try {
    const response = await fetch("/api/runtime-config");
    const data = await unwrapJson(response);
    const config = data.config || { apiKey: "", baseURL: "", model: "" };
    writeRuntimeConfigFallback(config);
    return config;
  } catch {
    return (
      readRuntimeConfigFallback() || {
        apiKey: "",
        baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        model: "glm-4.7",
      }
    );
  }
}

export async function saveRuntimeConfig(config) {
  try {
    const response = await fetch("/api/runtime-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config }),
    });
    const data = await unwrapJson(response);
    const saved = data.config || { apiKey: "", baseURL: "", model: "" };
    writeRuntimeConfigFallback(saved);
    return saved;
  } catch (err) {
    writeRuntimeConfigFallback(config);
    return {
      apiKey: String(config?.apiKey || ""),
      baseURL: String(config?.baseURL || ""),
      model: String(config?.model || ""),
      warning: err?.message || "runtime-config API unavailable, saved locally",
    };
  }
}

export async function fetchGroups() {
  try {
    const response = await fetch("/api/groups");
    const data = await unwrapJson(response);
    const groups = data.groups || [];
    if (groups.length > 0) {
      writeGroupConfigFallback(groups);
      return groups;
    }
  } catch {
    // Try fallback endpoint and local storage below.
  }

  try {
    const response = await fetch("/api/group-config");
    const data = await unwrapJson(response);
    const groups = data.groups || [];
    if (groups.length > 0) {
      writeGroupConfigFallback(groups);
      return groups;
    }
  } catch {
    // Fall back to local groups.
  }

  return readGroupConfigFallback() || DEFAULT_GROUPS;
}

export async function fetchGroupConfig() {
  try {
    const response = await fetch("/api/group-config");
    const data = await unwrapJson(response);
    const groups = data.groups || [];
    if (groups.length > 0) {
      writeGroupConfigFallback(groups);
      return groups;
    }
  } catch {
    // Fallback below.
  }
  return readGroupConfigFallback() || DEFAULT_GROUPS;
}

export async function saveGroupConfig(groups) {
  try {
    const response = await fetch("/api/group-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groups }),
    });
    const data = await unwrapJson(response);
    const saved = data.groups || [];
    if (saved.length > 0) {
      writeGroupConfigFallback(saved);
      return saved;
    }
  } catch {
    // Fallback below.
  }
  writeGroupConfigFallback(groups);
  return groups;
}

export async function fetchSessions(groupId) {
  const query = groupId ? `?groupId=${encodeURIComponent(groupId)}` : "";
  const response = await fetch(`/api/sessions${query}`);
  const data = await unwrapJson(response);
  return data.sessions || [];
}

export async function createSession(title, groupId) {
  const response = await fetch("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, groupId }),
  });
  const data = await unwrapJson(response);
  return data.session;
}

export async function fetchSessionDetail(sessionId) {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`);
  const data = await unwrapJson(response);
  return data.session;
}

export async function deleteSession(sessionId) {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const data = await unwrapJson(response);
    throw new Error(data?.error || `Request failed (${response.status})`);
  }
}

export async function sendChatMessage(sessionId, content) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, content }),
  });
  const data = await unwrapJson(response);
  return data.session;
}
