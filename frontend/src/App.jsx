import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  createSession,
  fetchAgentConfig,
  fetchGroupConfig,
  fetchGroups,
  fetchRuntimeConfig,
  fetchSessionDetail,
  fetchSessions,
  saveAgentConfig,
  saveGroupConfig,
  saveRuntimeConfig,
  sendChatMessage,
} from "./api/chatApi";

function emptyDraftAgent() {
  return {
    id: "",
    name: "",
    intro: "",
    system: "",
    enabled: true,
  };
}

function emptyDraftGroup() {
  return {
    id: "",
    name: "",
    intro: "",
    botIds: [],
  };
}

const DEFAULT_GROUP_ID = "group_general";

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function App() {
  const [groups, setGroups] = useState([]);
  const [activeGroupId, setActiveGroupId] = useState("");
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState("");
  const [activeSession, setActiveSession] = useState(null);
  const [agents, setAgents] = useState([]);
  const activeSessionIdRef = useRef("");

  const [input, setInput] = useState("");
  const [loadingBySession, setLoadingBySession] = useState({});
  const [booting, setBooting] = useState(true);

  const [showBotConfig, setShowBotConfig] = useState(false);
  const [showGroupConfig, setShowGroupConfig] = useState(false);
  const [showRuntimeConfig, setShowRuntimeConfig] = useState(false);

  const [configAgents, setConfigAgents] = useState([]);
  const [newAgent, setNewAgent] = useState(emptyDraftAgent());
  const [showAddBotModal, setShowAddBotModal] = useState(false);
  const [addBotSaving, setAddBotSaving] = useState(false);
  const [addBotError, setAddBotError] = useState("");
  const [configSaving, setConfigSaving] = useState(false);
  const [configError, setConfigError] = useState("");

  const [configGroups, setConfigGroups] = useState([]);
  const [newGroup, setNewGroup] = useState(emptyDraftGroup());
  const [showAddGroupModal, setShowAddGroupModal] = useState(false);
  const [addGroupSaving, setAddGroupSaving] = useState(false);
  const [addGroupError, setAddGroupError] = useState("");
  const [groupSaving, setGroupSaving] = useState(false);
  const [groupError, setGroupError] = useState("");

  const [runtimeConfig, setRuntimeConfig] = useState({ apiKey: "", baseURL: "", model: "" });
  const [runtimeSaving, setRuntimeSaving] = useState(false);
  const [runtimeError, setRuntimeError] = useState("");

  const [isComposing, setIsComposing] = useState(false);

  const messages = activeSession?.messages || [];
  const activeSessionLoading = useMemo(() => !!(activeSessionId && loadingBySession[activeSessionId]), [activeSessionId, loadingBySession]);
  const canSend = useMemo(() => input.trim().length > 0 && !activeSessionLoading && !!activeSessionId, [input, activeSessionLoading, activeSessionId]);

  const activeGroup = useMemo(() => groups.find((group) => group.id === activeGroupId) || null, [groups, activeGroupId]);

  const enabledAgentMap = useMemo(() => Object.fromEntries(agents.map((agent) => [agent.id, agent])), [agents]);

  const activeGroupAgents = useMemo(() => {
    if (!activeGroup) return [];
    return (activeGroup.botIds || []).map((id) => enabledAgentMap[id]).filter(Boolean);
  }, [activeGroup, enabledAgentMap]);

  function enforceDefaultGroupBots(groups, botIds) {
    const normalizedBotIds = Array.from(new Set((botIds || []).map((id) => String(id || "").trim().toLowerCase()).filter(Boolean)));
    return (groups || []).map((group) => {
      if (group.id !== DEFAULT_GROUP_ID) return group;
      return { ...group, botIds: normalizedBotIds };
    });
  }

  async function refreshAgents() {
    const fullConfig = await fetchAgentConfig();
    setConfigAgents(fullConfig);
    setAgents(fullConfig.filter((agent) => agent.enabled !== false));
  }

  async function refreshGroups() {
    const simpleGroups = await fetchGroups();
    setGroups(simpleGroups);
    const detailGroups = await fetchGroupConfig();
    setConfigGroups(detailGroups);
    return simpleGroups;
  }

  async function refreshRuntimeConfig() {
    const config = await fetchRuntimeConfig();
    setRuntimeConfig(config);
  }

  async function loadSessionsForGroup(groupId) {
    if (!groupId) {
      setSessions([]);
      setActiveSession(null);
      setActiveSessionId("");
      return [];
    }
    const list = await fetchSessions(groupId);
    setSessions(list);
    return list;
  }

  async function loadSessionDetail(sessionId) {
    if (!sessionId) {
      setActiveSession(null);
      setActiveSessionId("");
      return null;
    }
    const detail = await fetchSessionDetail(sessionId);
    setActiveSession(detail);
    setActiveSessionId(detail.id);
    return detail;
  }

  async function ensureSessionForGroup(groupId) {
    const list = await loadSessionsForGroup(groupId);
    if (list.length > 0) {
      await loadSessionDetail(list[0].id);
      return;
    }
    const created = await createSession("对话 1", groupId);
    setSessions([
      {
        id: created.id,
        groupId: created.groupId,
        title: created.title,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
        messageCount: created.messages?.length || 0,
      },
    ]);
    setActiveSession(created);
    setActiveSessionId(created.id);
  }

  async function ensureBootstrap() {
    setBooting(true);
    try {
      await Promise.all([refreshAgents(), refreshRuntimeConfig()]);
      const loadedGroups = await refreshGroups();
      const firstGroupId = loadedGroups[0]?.id || "";
      setActiveGroupId(firstGroupId);
      if (firstGroupId) {
        await ensureSessionForGroup(firstGroupId);
      }
    } finally {
      setBooting(false);
    }
  }

  useEffect(() => {
    ensureBootstrap().catch((err) => {
      setActiveSession({
        id: "local_error",
        title: "错误",
        messages: [
          {
            role: "assistant",
            agentId: "system",
            agentName: "System",
            content: `初始化失败：${err.message}`,
            createdAt: new Date().toISOString(),
          },
        ],
      });
    });
  }, []);

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  async function switchGroup(groupId) {
    if (!groupId || groupId === activeGroupId) return;
    setActiveGroupId(groupId);
    setInput("");
    await ensureSessionForGroup(groupId);
  }

  async function createConversation() {
    if (!activeGroupId) return;
    const created = await createSession(`对话 ${sessions.length + 1}`, activeGroupId);
    const list = await fetchSessions(activeGroupId);
    setSessions(list);
    setActiveSession(created);
    setActiveSessionId(created.id);
    setInput("");
  }

  async function switchConversation(sessionId) {
    if (!sessionId) return;
    await loadSessionDetail(sessionId);
    setInput("");
  }

  function setSessionLoading(sessionId, isLoading) {
    if (!sessionId) return;
    setLoadingBySession((prev) => {
      const next = { ...prev };
      if (isLoading) next[sessionId] = true;
      else delete next[sessionId];
      return next;
    });
  }

  function atAgent(agentId) {
    setInput((v) => `${v}${v.endsWith(" ") || v.length === 0 ? "" : " "}@${agentId} `);
  }

  function updateSessionSummary(detail) {
    setSessions((prev) => {
      const next = prev.map((session) =>
        session.id !== detail.id
          ? session
          : {
              ...session,
              title: detail.title,
              updatedAt: detail.updatedAt,
              messageCount: detail.messages?.length || 0,
            }
      );
      return next.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    });
  }

  async function onSend(e) {
    e.preventDefault();
    if (!canSend) return;

    const targetSessionId = activeSessionId;
    const content = input.trim();
    setInput("");
    setSessionLoading(targetSessionId, true);

    try {
      const updated = await sendChatMessage(targetSessionId, content);
      if (activeSessionIdRef.current === targetSessionId) {
        setActiveSession(updated);
      }
      updateSessionSummary(updated);
    } catch (error) {
      if (activeSessionIdRef.current === targetSessionId) {
        setActiveSession((prev) => ({
          ...(prev || { id: targetSessionId, title: "错误", messages: [] }),
          messages: [
            ...((prev && prev.messages) || []),
            {
              role: "assistant",
              agentId: "system",
              agentName: "System",
              content: `后端错误：${error.message}`,
              createdAt: new Date().toISOString(),
            },
          ],
        }));
      }
    } finally {
      setSessionLoading(targetSessionId, false);
    }
  }

  function onInputKeyDown(e) {
    if (e.key !== "Enter" || e.shiftKey) return;
    if (isComposing || e.nativeEvent?.isComposing) return;
    e.preventDefault();
    onSend(e);
  }

  function updateConfigAgent(idx, key, value) {
    setConfigAgents((prev) => prev.map((agent, i) => (i === idx ? { ...agent, [key]: value } : agent)));
  }

  function removeConfigAgent(idx) {
    setConfigAgents((prev) => prev.filter((_, i) => i !== idx));
  }

  function openAddBotModal() {
    setNewAgent(emptyDraftAgent());
    setAddBotError("");
    setShowAddBotModal(true);
  }

  async function addDraftAgent() {
    const draftId = newAgent.id.trim().toLowerCase();
    const draftName = newAgent.name.trim();
    const draftIntro = newAgent.intro.trim();
    const draftSystem = newAgent.system.trim();
    const idRegex = /^[a-zA-Z0-9_]+$/;

    if (!draftId || !draftName || !draftIntro || !draftSystem) {
      setAddBotError("新增 Bot 需要填写 ID、名称、简介和系统 Prompt。");
      return;
    }
    if (!idRegex.test(draftId)) {
      setAddBotError("Bot ID 只允许字母、数字和下划线。");
      return;
    }
    if (configAgents.some((agent) => agent.id === draftId)) {
      setAddBotError(`Bot ID 重复：${draftId}`);
      return;
    }

    const nextAgents = [
      ...configAgents,
      {
        ...newAgent,
        id: draftId,
        name: draftName,
        intro: draftIntro,
        system: draftSystem,
        enabled: newAgent.enabled !== false,
      },
    ];

    setAddBotSaving(true);
    setAddBotError("");
    try {
      const saved = await saveAgentConfig(nextAgents);
      if (!saved.some((agent) => agent.id === draftId)) {
        throw new Error("新增 Bot 未生效，请重试。若仍失败，请检查后端 /api/agent-config 接口日志。");
      }
      // Reload from backend source of truth to avoid stale state being saved over by later actions.
      await refreshAgents();
      const latestGroups = await fetchGroupConfig();
      const syncedGroups = enforceDefaultGroupBots(
        latestGroups,
        saved.filter((agent) => agent.enabled !== false).map((agent) => agent.id)
      );
      const finalGroups = await saveGroupConfig(syncedGroups);
      setConfigGroups(finalGroups);
      setGroups(finalGroups);
      setShowAddBotModal(false);
      setNewAgent(emptyDraftAgent());
      setConfigError("");
    } catch (err) {
      setAddBotError(err?.message || "新增 Bot 失败，请稍后重试。");
    } finally {
      setAddBotSaving(false);
    }
  }

  async function onSaveBotConfig() {
    setConfigSaving(true);
    setConfigError("");
    try {
      const saved = await saveAgentConfig(configAgents);
      setConfigAgents(saved);
      await refreshAgents();
      await refreshGroups();
      setShowBotConfig(false);
    } catch (err) {
      setConfigError(err.message);
    } finally {
      setConfigSaving(false);
    }
  }

  function updateConfigGroup(idx, key, value) {
    setConfigGroups((prev) => prev.map((group, i) => (i === idx ? { ...group, [key]: value } : group)));
  }

  function toggleBotForGroup(idx, botId) {
    setConfigGroups((prev) =>
      prev.map((group, i) => {
        if (i !== idx) return group;
        const set = new Set(group.botIds || []);
        if (set.has(botId)) set.delete(botId);
        else set.add(botId);
        return { ...group, botIds: Array.from(set) };
      })
    );
  }

  function removeGroup(idx) {
    setConfigGroups((prev) => prev.filter((_, i) => i !== idx));
  }

  function openAddGroupModal() {
    setNewGroup(emptyDraftGroup());
    setAddGroupError("");
    setShowAddGroupModal(true);
  }

  async function addDraftGroup() {
    const draftId = newGroup.id.trim().toLowerCase();
    const draftName = newGroup.name.trim();
    const idRegex = /^[a-zA-Z0-9_]+$/;
    if (!draftId || !draftName) {
      setAddGroupError("新增群聊至少需要 ID 和名称。");
      return;
    }
    if (!idRegex.test(draftId)) {
      setAddGroupError("群聊 ID 只允许字母、数字和下划线。");
      return;
    }
    if (configGroups.some((group) => group.id === draftId)) {
      setAddGroupError(`群聊 ID 重复：${draftId}`);
      return;
    }

    const nextGroups = [
      ...configGroups,
      {
        id: draftId,
        name: draftName,
        intro: newGroup.intro.trim(),
        botIds: Array.from(new Set((newGroup.botIds || []).map((id) => String(id).toLowerCase()))),
      },
    ];

    setAddGroupSaving(true);
    setAddGroupError("");
    try {
      const saved = await saveGroupConfig(nextGroups);
      setConfigGroups(saved);
      setGroups(saved);
      setShowAddGroupModal(false);
      setNewGroup(emptyDraftGroup());
    } catch (err) {
      setAddGroupError(err.message);
    } finally {
      setAddGroupSaving(false);
    }
  }

  async function onSaveGroupConfig() {
    setGroupSaving(true);
    setGroupError("");
    try {
      const enforced = enforceDefaultGroupBots(configGroups, configAgents.map((agent) => agent.id));
      const saved = await saveGroupConfig(enforced);
      setConfigGroups(saved);
      setGroups(saved);

      const nextGroupId = saved.some((group) => group.id === activeGroupId) ? activeGroupId : saved[0]?.id || "";
      setActiveGroupId(nextGroupId);
      if (nextGroupId) {
        await ensureSessionForGroup(nextGroupId);
      }
      setShowGroupConfig(false);
    } catch (err) {
      setGroupError(err.message);
    } finally {
      setGroupSaving(false);
    }
  }

  async function onSaveRuntimeConfig() {
    setRuntimeSaving(true);
    setRuntimeError("");
    try {
      const saved = await saveRuntimeConfig(runtimeConfig);
      setRuntimeConfig(saved);
      setShowRuntimeConfig(false);
    } catch (err) {
      setRuntimeError(err.message);
    } finally {
      setRuntimeSaving(false);
    }
  }

  function onExportBotConfig() {
    downloadJson("bot-config.export.json", configAgents);
  }

  function onExportGroupConfig() {
    downloadJson("group-config.export.json", configGroups);
  }

  return (
    <div className="page">
      <aside className="sidebar">
        <h1>Open Multi-Agent Group Chat</h1>
        <p className="desc">左侧选择群聊，Bot 在上方快捷 @，实现群与 Bot 解耦管理。</p>

        <div className="sidebar-section group-section">
          <div className="section-head">
            <h2>群聊列表</h2>
            <div className="config-tools">
              <button className="new-chat" type="button" onClick={() => setShowBotConfig(true)}>
                全局 Bot 配置
              </button>
              <button className="new-chat" type="button" onClick={() => setShowGroupConfig(true)}>
                群聊设置
              </button>
            </div>
          </div>
          <div className="group-list">
            {groups.map((group) => (
              <button
                key={group.id}
                className={`group-item ${group.id === activeGroupId ? "active" : ""}`}
                onClick={() => switchGroup(group.id)}
                type="button"
              >
                <div className="group-title">{group.name}</div>
                <div className="group-sub">{group.intro || group.id}</div>
              </button>
            ))}
          </div>
        </div>
      </aside>

      <main className="chat">
        <div className="chat-topbar">
          <div className="chat-top-left">
            <strong>{activeGroup?.name || "未选择群聊"}</strong>
            <span>{activeGroup?.intro || ""}</span>
          </div>
          <div className="chat-top-actions">
            <button className="new-chat" type="button" onClick={createConversation} disabled={!activeGroupId}>
              + 新对话
            </button>
            <button className="config-btn small-btn" type="button" onClick={() => setShowRuntimeConfig(true)}>
              API 配置
            </button>
          </div>
        </div>

        <div className="mention-toolbar">
          {activeGroupAgents.map((agent) => (
            <button key={agent.id} className="mention-chip" onClick={() => atAgent(agent.id)} type="button">
              @{agent.id}
            </button>
          ))}
        </div>

        <div className="session-strip">
          {sessions.map((session) => (
            <button
              key={session.id}
              className={`session-pill ${session.id === activeSessionId ? "active" : ""}`}
              onClick={() => switchConversation(session.id)}
              type="button"
            >
              {session.title}
            </button>
          ))}
        </div>

        <div className="messages">
          {booting && (
            <div className="msg assistant">
              <div className="meta">系统</div>
              <div className="bubble">正在加载群聊与历史会话...</div>
            </div>
          )}
          {messages.map((m, idx) => (
            <div key={`${idx}-${m.createdAt || "t"}`} className={`msg ${m.role}`}>
              <div className="meta">{m.role === "user" ? "你" : `${m.agentName} (@${m.agentId})`}</div>
              <div className="bubble markdown-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{String(m.content || "")}</ReactMarkdown>
              </div>
            </div>
          ))}
          {activeSessionLoading && (
            <div className="msg assistant">
              <div className="meta">系统</div>
              <div className="bubble">当前群聊里的 Bot 正在思考中...</div>
            </div>
          )}
        </div>

        <form className="composer" onSubmit={onSend}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onInputKeyDown}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            placeholder="在当前群聊发言，或使用上方 @ 按钮快速点名"
          />
          <button disabled={!canSend} type="submit">
            发送
          </button>
        </form>
      </main>

      {showBotConfig && (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className="config-panel">
            <div className="config-head">
              <h2>Bot 配置中心</h2>
              <div className="config-head-actions">
                <button type="button" className="ghost" onClick={openAddBotModal}>
                  + 新建 Bot
                </button>
                <button type="button" className="ghost" onClick={onSaveBotConfig} disabled={configSaving}>
                  {configSaving ? "保存中..." : "保存并关闭"}
                </button>
              </div>
            </div>

            <div className="config-actions">
              <button type="button" className="ghost" onClick={onExportBotConfig}>
                导出 JSON
              </button>
            </div>

            <div className="config-list">
              {configAgents.map((agent, idx) => (
                <div className="config-item" key={`agent_row_${idx}`}>
                  <div className="config-grid">
                    <label>
                      ID
                      <input
                        value={agent.id}
                        onChange={(e) => updateConfigAgent(idx, "id", e.target.value)}
                        placeholder="example_bot"
                      />
                    </label>
                    <label>
                      名称
                      <input value={agent.name} onChange={(e) => updateConfigAgent(idx, "name", e.target.value)} />
                    </label>
                    <label>
                      简介
                      <input value={agent.intro} onChange={(e) => updateConfigAgent(idx, "intro", e.target.value)} />
                    </label>
                    <label className="checkbox-row">
                      启用
                      <input
                        type="checkbox"
                        checked={agent.enabled !== false}
                        onChange={(e) => updateConfigAgent(idx, "enabled", e.target.checked)}
                      />
                    </label>
                  </div>
                  <label>
                    系统 Prompt
                    <textarea
                      className="system-input"
                      value={agent.system}
                      onChange={(e) => updateConfigAgent(idx, "system", e.target.value)}
                    />
                  </label>
                  <div className="row-end bot-delete-row">
                    <button type="button" className="danger" onClick={() => removeConfigAgent(idx)}>
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {configError && <p className="error-text">{configError}</p>}
          </div>
        </div>
      )}

      {showBotConfig && showAddBotModal && (
        <div className="overlay nested-overlay" role="dialog" aria-modal="true">
          <div className="config-panel add-bot-panel">
            <div className="config-head">
              <h2>新增 Bot</h2>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setShowAddBotModal(false);
                  setAddBotError("");
                }}
              >
                关闭
              </button>
            </div>

            <div className="config-list">
              <div className="config-item">
                <div className="config-grid">
                  <label>
                    ID
                    <input
                      value={newAgent.id}
                      onChange={(e) => setNewAgent((prev) => ({ ...prev, id: e.target.value }))}
                      placeholder="new_bot"
                    />
                  </label>
                  <label>
                    名称
                    <input
                      value={newAgent.name}
                      onChange={(e) => setNewAgent((prev) => ({ ...prev, name: e.target.value }))}
                    />
                  </label>
                  <label>
                    简介
                    <input
                      value={newAgent.intro}
                      onChange={(e) => setNewAgent((prev) => ({ ...prev, intro: e.target.value }))}
                    />
                  </label>
                  <label className="checkbox-row">
                    启用
                    <input
                      type="checkbox"
                      checked={newAgent.enabled}
                      onChange={(e) => setNewAgent((prev) => ({ ...prev, enabled: e.target.checked }))}
                    />
                  </label>
                </div>
                <label>
                  系统 Prompt
                  <textarea
                    className="system-input"
                    value={newAgent.system}
                    onChange={(e) => setNewAgent((prev) => ({ ...prev, system: e.target.value }))}
                  />
                </label>
              </div>
            </div>

            {addBotError && <p className="error-text">{addBotError}</p>}

            <div className="row-end add-bot-submit-row">
              <button type="button" onClick={addDraftAgent} disabled={addBotSaving}>
                {addBotSaving ? "保存中..." : "创建并自动保存"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showGroupConfig && (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className="config-panel">
            <div className="config-head">
              <h2>群聊设置</h2>
              <div className="config-head-actions">
                <button type="button" className="ghost" onClick={openAddGroupModal}>
                  + 新建群聊
                </button>
                <button type="button" className="ghost" onClick={onSaveGroupConfig} disabled={groupSaving}>
                  {groupSaving ? "保存中..." : "保存并关闭"}
                </button>
              </div>
            </div>

            <div className="config-actions">
              <button type="button" className="ghost" onClick={onExportGroupConfig}>
                导出 JSON
              </button>
            </div>

            <div className="config-list">
              {configGroups.map((group, idx) => (
                <div className="config-item" key={`group_row_${idx}`}>
                  <div className="config-grid">
                    <label>
                      群聊 ID
                      <input value={group.id} onChange={(e) => updateConfigGroup(idx, "id", e.target.value)} />
                    </label>
                    <label>
                      群聊名称
                      <input value={group.name} onChange={(e) => updateConfigGroup(idx, "name", e.target.value)} />
                    </label>
                    <label>
                      简介
                      <input value={group.intro} onChange={(e) => updateConfigGroup(idx, "intro", e.target.value)} />
                    </label>
                  </div>
                  <div className="bot-select-wrap">
                    <span>选择该群可用 Bot</span>
                    <div className="bot-select-grid">
                      {configAgents.map((agent) => (
                        <button
                          key={`${group.id}_${agent.id}`}
                          className={`bot-select-chip ${
                            group.id === DEFAULT_GROUP_ID || (group.botIds || []).includes(agent.id) ? "selected" : ""
                          } ${group.id === DEFAULT_GROUP_ID ? "locked" : ""}`}
                          type="button"
                          onClick={() => {
                            if (group.id === DEFAULT_GROUP_ID) return;
                            toggleBotForGroup(idx, agent.id);
                          }}
                        >
                          {agent.name} (@{agent.id})
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="row-end group-delete-row">
                    <button type="button" className="danger" onClick={() => removeGroup(idx)}>
                      删除群聊
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {groupError && <p className="error-text">{groupError}</p>}
          </div>
        </div>
      )}

      {showGroupConfig && showAddGroupModal && (
        <div className="overlay nested-overlay" role="dialog" aria-modal="true">
          <div className="config-panel add-group-panel">
            <div className="config-head">
              <h2>新增群聊</h2>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setShowAddGroupModal(false);
                  setAddGroupError("");
                }}
              >
                关闭
              </button>
            </div>

            <div className="config-list">
              <div className="config-item">
                <div className="config-grid">
                  <label>
                    群聊 ID
                    <input
                      value={newGroup.id}
                      onChange={(e) => setNewGroup((prev) => ({ ...prev, id: e.target.value }))}
                      placeholder="group_team_a"
                    />
                  </label>
                  <label>
                    群聊名称
                    <input
                      value={newGroup.name}
                      onChange={(e) => setNewGroup((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="Team A"
                    />
                  </label>
                  <label>
                    简介
                    <input
                      value={newGroup.intro}
                      onChange={(e) => setNewGroup((prev) => ({ ...prev, intro: e.target.value }))}
                      placeholder="研发讨论"
                    />
                  </label>
                </div>

                <div className="bot-select-wrap">
                  <span>选择该群可用 Bot</span>
                  <div className="bot-select-grid">
                    {configAgents.map((agent) => (
                      <button
                        key={`draft_${agent.id}`}
                        className={`bot-select-chip ${(newGroup.botIds || []).includes(agent.id) ? "selected" : ""}`}
                        type="button"
                        onClick={() => {
                          setNewGroup((prev) => {
                            const set = new Set(prev.botIds || []);
                            if (set.has(agent.id)) set.delete(agent.id);
                            else set.add(agent.id);
                            return { ...prev, botIds: Array.from(set) };
                          });
                        }}
                      >
                        {agent.name} (@{agent.id})
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {addGroupError && <p className="error-text">{addGroupError}</p>}

            <div className="row-end add-group-submit-row">
              <button type="button" onClick={addDraftGroup} disabled={addGroupSaving}>
                {addGroupSaving ? "保存中..." : "创建并自动保存"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRuntimeConfig && (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className="config-panel runtime-panel">
            <div className="config-head">
              <h2>API 配置</h2>
              <button type="button" className="ghost" onClick={onSaveRuntimeConfig} disabled={runtimeSaving}>
                {runtimeSaving ? "保存中..." : "保存并关闭"}
              </button>
            </div>

            <div className="config-list">
              <div className="config-item">
                <div className="config-grid runtime-grid">
                  <label>
                    API Key
                    <input
                      type="password"
                      value={runtimeConfig.apiKey}
                      onChange={(e) => setRuntimeConfig((prev) => ({ ...prev, apiKey: e.target.value }))}
                      placeholder="sk-..."
                    />
                  </label>
                  <label>
                    API URL
                    <input
                      value={runtimeConfig.baseURL}
                      onChange={(e) => setRuntimeConfig((prev) => ({ ...prev, baseURL: e.target.value }))}
                      placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1"
                    />
                  </label>
                  <label>
                    模型名称
                    <input
                      value={runtimeConfig.model}
                      onChange={(e) => setRuntimeConfig((prev) => ({ ...prev, model: e.target.value }))}
                      placeholder="qwen-plus"
                    />
                  </label>
                </div>
                <p className="hint-text">配置会保存在后端本地文件（backend/data/config），不会上传云端。</p>
              </div>
            </div>

            {runtimeError && <p className="error-text">{runtimeError}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
