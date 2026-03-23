# PrismHive

PrismHive 是一个本地优先的多 Agent 群聊应用，让不同能力的 Bot 在多群多会话中并行协作完成回复。

English README: [README.md](README.md)

## 快速开始

### 1) 安装依赖

```bash
npm install
```

### 2) 配置环境变量

```bash
cp .env.example .env
```

`.env` 示例：

```env
DASHSCOPE_API_KEY=your_api_key_here
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
DASHSCOPE_MODEL=qwen-plus
PORT=8787
```

说明：

- 后端优先使用 `DASHSCOPE_API_KEY`。
- `OPENAI_API_KEY` 可作为兼容兜底。

### 3) 启动开发模式

```bash
npm run dev
```

默认地址：

- 前端：`http://localhost:5173`
- 后端：`http://localhost:8787`

### 4) 构建前端

```bash
npm run build
```

## 产品亮点

- 🚀 多 Agent 协作：同一条消息可触发多个 Bot 并行回复。
- 🎯 `@` 点名机制：通过 `@agent_id` 精准指定参与回复的 Bot。
- 🧠 智能兜底编排：未点名时自动选择当前群聊可用 Bot（最多 3 个）。
- 🧩 多群聊管理：支持创建/编辑/删除群聊，并配置每个群可用 Bot。
- 🤖 全局 Bot 管理：支持创建/编辑/删除 Bot，维护名称、简介、系统 Prompt、启用状态。
- 🛡️ 默认群聊保护：`group_general` 始终绑定所有有效 Bot，新 Bot 会自动加入。
- ⚡ 多会话并发：请求按会话维度管理，发送中可自由切换群聊和对话。
- 💾 本地持久化：Bot/群聊/API 配置与会话历史落盘保存，重启可恢复。
- 🔧 运行时 API 配置：可在 UI 中直接修改 API Key、Base URL、Model。
- 📝 Markdown 支持：聊天内容支持 Markdown 与 GFM 渲染。

## 功能清单（完整）

### 1. 群聊与会话

- 群聊列表展示与切换。
- 在当前群聊新建会话。
- 会话列表展示与切换。
- 默认会话标题自动升级命名。
- 会话历史持久化到 `backend/data/history/history.db.json`。

### 2. 消息与编排

- 用户消息发送。
- `@agent_id` 提及解析（仅匹配当前群聊可用 Bot）。
- 未提及时自动选择 Bot 协作回复。
- 使用近期上下文构建转录。
- 多 Bot 并行生成并合并写回历史。

### 3. Bot 配置中心

- 查看全部 Bot。
- 编辑 Bot 字段：ID、名称、简介、系统 Prompt、启用状态。
- 弹窗新增 Bot 并自动保存。
- 删除 Bot。
- 导出 Bot 配置 JSON。
- 保存并关闭。

### 4. 群聊设置中心

- 查看全部群聊。
- 编辑群聊字段：ID、名称、简介。
- 配置群聊可用 Bot。
- 弹窗新增群聊并自动保存。
- 删除群聊。
- 导出群聊配置 JSON。
- 保存并关闭。
- `group_general` 全选锁定规则。

### 5. API 配置中心

- 可视化编辑 `apiKey` / `baseURL` / `model`。
- 保存并关闭。
- 后端接口异常时前端可使用 localStorage fallback。

### 6. 可靠性与体验

- 会话级 loading，避免全局阻塞。
- 回包绑定原会话，避免异步结果覆盖错误页面。
- JSON 解析与错误处理增强。

## 技术架构

- 前端：React + Vite + react-markdown + remark-gfm
- 后端：Node.js + Express + OpenAI SDK
- 存储：本地 JSON 文件
- 模型接口：DashScope OpenAI 兼容 API（亦兼容 OpenAI 风格 baseURL + key）

## NPM 脚本

- 根目录
  - `npm run dev`：并行启动前后端
  - `npm run dev:frontend`：仅启动前端
  - `npm run dev:backend`：仅启动后端
  - `npm run build`：构建前端
- 前端工作区
  - `npm run dev -w frontend`
  - `npm run build -w frontend`
- 后端工作区
  - `npm run dev -w backend`

## HTTP API 概览

- `GET /api/agents`
- `GET /api/agent-config`
- `PUT /api/agent-config`
- `GET /api/groups`
- `GET /api/group-config`
- `PUT /api/group-config`
- `GET /api/runtime-config`
- `PUT /api/runtime-config`
- `GET /api/sessions?groupId=...`
- `POST /api/sessions`
- `GET /api/sessions/:id`
- `POST /api/chat`

## 数据与隐私

- 本地文件会保存 Bot 配置、群聊配置、运行时 API 配置、聊天历史。
- 前端会将部分 fallback 数据写入浏览器 localStorage。
- `.gitignore` 已忽略敏感与运行时文件，避免误提交隐私数据。

## 发布前安全建议

- 使用低权限并定期轮换的 API Key。
- 为后端接口加入鉴权。
- 限制 CORS 来源并增加限流。
- 生产环境建议替换 JSON 存储为数据库并增加访问控制。
- 增加审计日志与敏感字段脱敏。
