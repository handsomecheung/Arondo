[English](README.md) | Translated by AI([日本語](README.ja.md) | [简体中文](README.zh-Hans.md) | [繁體中文](README.zh-Hant.md))

# Arondo

Arondo 是一个移动优先的开发人员工作区，它将编码任务委托给 AI Agent 并监控多台机器的执行情况。它遵循 **Frontend + Server + Runner** 架构，其中基于 Go 的轻量级 Runner 安装在开发机器上，中央 Server 协调所有操作。

## 基本工作流程

Arondo 允许用户从适合移动设备的工作区将工作委派给 AI Agent，查看更改、验证更改，并继续相同的对话，直到任务准备好提交。

### 1. 开始会话

选择 Runner、项目和 Agent，然后描述任务并发送。

<img src="public/readme/basic-usage/01-create-session.jpg" alt="Creating a new session by choosing a runner, project, and agent, then entering a task" width="360">

### 2. 审查、验证和提交

查看 Agent 结果和差异、运行验证、在需要时提供后续说明，并通过在同一会话中提交已完成的工作来完成。

<p>
<img src="public/readme/basic-usage/02-review-result.jpg" alt="已完成的 Codex 响应，包含更改的文件链接和后续消息输入" width="360">
<img src="public/readme/basic-usage/03-review-changes.jpg" alt="Git diff 查看器显示已更改的文件以及内联添加和删除" width="360">
<img src="public/readme/basic-usage/04-run-test.jpg" alt="显示集成测试输出的会话 Script 卡" width="360">
<img src="public/readme/basic-usage/05-follow-up-fix.jpg" alt="测试输出失败，随后请求重新应用应用程序更改" width="360">
<img src="public/readme/basic-usage/06-commit.jpg" alt="已完成提交 Agent Commands 和最终 Codex 响应" width="360">
</p>

## Agent Commands

通过定义命令名称、发送到 Agent 的指令以及（需要时）正则表达式匹配器（其捕获组可插入为 `$1`、`$2` 等），在 **设置 → Agent Commands** 中创建可重用的斜杠命令；在会话中输入 `/` 以浏览和运行内置命令和自定义命令。

<p>
<img src="public/readme/agent-command-add.png" alt="用于创建自定义斜线命令的 Agent Commands 设置表单" width="360">
<img src="public/readme/agent-command-list.png" alt="列出内置和自定义斜线命令的会话命令菜单" width="360">
</p>

## Script

通过 **编辑 Script** 保存项目的命名 shell 命令，然后在会话中输入 `!` 以选择并运行它，选择要执行的文件，或输入临时命令。

<p>
<img src="public/readme/script-add.png" alt="添加带有名称和命令字段的 Script 对话框" width="360">
<img src="public/readme/script-list.png" alt="会话快速运行菜单在输入感叹号后显示已保存的 Script" width="360">
</p>

## 终端

当用户需要检查异常情况或从异常情况中恢复时，可以从会话的三点菜单中在选定的 Runner 上打开实时 shell。

> **仅备用：** Arondo 是围绕 Agent 和保存的 Script 设计的，这是推荐的工作方式。终端仅作为一种兜底的方式，而不是作为主要工作流程；因为命令行界面在移动屏幕上使用起来很不方便。

<p>
<img src="public/readme/terminal-menu.png" alt="带有“打开终端”操作的会话三点菜单" width="360">
<img src="public/readme/terminal-htop.png" alt="使用移动特殊键栏运行 htop 的实时终端" width="360">
</p>

## Todo 消息

当存在运行中的 AI Agent 或有未提交的更改时，将提示保存为 Todo 消息，然后选择是在代码库准备就绪后自动发送、稍后手动发送还是在预定时间发送；待处理的消息在被调度之前会一直显示在会话中。

<p>
<img src="public/readme/todo-new.png" alt="具有自动、手动和预定 Todo 消息模式的新会话表单" width="360">
<img src="public/readme/todo-confirm.png" alt="项目未就绪对话框提供自动、手动和立即发送选项" width="360">
<img src="public/readme/todo-message.png" alt="等待代码库准备就绪的待处理 Todo 消息" width="360">
</p>

## Auto Mode

在 Agent 选择器中选择 **Auto**，让 Arondo 在所选 Runner 上已安装的 Agent CLI 之间进行选择。**Runner** 页面显示为此选择提供依据的配额数据。

Auto Mode 使用以下优先顺序：

1. 考虑安装具有已知订阅配额的 Antigravity、Claude 和 Codex CLI； API 密钥计费帐户被保留作为最后的手段。
2. 当其他候选 Agent 的可用配额充足时，降低小时配额不足 15% 的 Agent 的优先级；如果所有候选 Agent 的配额都较低，则保留所有候选 Agent。
3. 根据每周剩余配额对其余候选 Agent 排序，并按距每周重置的剩余时间进行调整。
4. 如果不知道订阅配额，请使用配额未知的 Agent，然后再回退到 API 密钥计费 Agent。

<img src="public/readme/auto-mode-quota.png" alt="Runner page showing Claude, Antigravity, and Codex quota information used by Auto Mode" width="360">

## 访问控制

使用三个相关控件从 **设置** 配置身份验证：

- **System Access Tokens** 对 Arondo 进行人员和自动化的身份验证。创建 `admin` Token 以实现完全管理访问，并创建 `user` Token 以实现受限访问；Token 值仅在生成时完整显示，因此请安全地存储它们。
- **Runner Tokens** 对每台 Runner 机器进行身份验证。每个 Runner 生成一个专用 Token，并通过 `--token` 或 `ARONDO_RUNNER_TOKEN` 传递；它绑定到第一个连接的 Runner 身份，防止泄漏的 Token 冒充不同的 Runner。
- **Runner Access Control** 授予单个 `user` Token 对选定 Runner 的访问权限。管理 Token 可以访问每个 Runner；用户只能访问明确包含其 Token 的 Runner，因此没有选定用户的 Runner 仍仅具有管理员权限。

<img src="public/readme/access-control.png" alt="Settings page for system access tokens, runner tokens, and per-runner access control" width="360">

## 架构

```
Browser (Next.js UI)  <--ws-->  Server (Next.js)  <--ws-->  Runner A (Go, machine-1)
                                                  <--ws-->  Runner B (Go, machine-2)
```

- **Runner** (`runner/`)：通过 WebSocket 连接到 Server 的 Go 二进制文件。执行命令、管理 PTY 会话、运行 git/文件系统操作。最小配置 — 只需一个 Server URL 和 Token。
- **Server**：将操作路由到 Runner。管理所有持久状态（会话、项目、消息、日志）。服务于前端。
- **前端**：单页 React UI，具有 Runner 选择、文件浏览、聊天、终端模式和任务队列。

所有执行都通过 Runner - Server 上没有本地回退。

## 功能

- **多机 Runner**：在任何开发机器上安装 Go Runner。用户界面允许用户选择哪个 Runner 运行每个会话。支持从 Runner 仪表板中删除断开连接的 Runner。
- **Todo 消息（草稿、计划发送、自动队列跟进和配额重试）**：“稍后发送此消息”是一条带有状态/触发器（手动、代码库就绪、afterSession、quotaAvailable 或固定时间）的 `user-todo` 聊天消息，通过三点菜单（取消/立即发送/更改触发器）内联呈现。涵盖项目有未提交的更改或正在运行的 Agent 时保存的 TODO 草稿、在正在运行的 Agent 后面排队的后续操作以及自动配额耗尽重试 - 所有这些都在任务仪表板中显示为一级任务。一个会话可以同时对多个 Todo 消息进行排队；当存在草稿/待处理 Todo 时，聊天输入保持启用状态，以便用户可以继续撰写进一步的后续内容。聊天输入的“+”弹出菜单提供“上传文件”、“稍后发送”（手动）、“清理时发送”（代码库就绪）和“安排发送”（选择未来的日期/时间）——所有这些都由相同的 Todo 消息管道支持。由于 Server 重新启动而在发送过程中卡住的预定（“at”）Todo 将自动解析为 `failed`，而不是挂起。
- **会话存档**：自动存档空闲时间超过配置时间的会话，或手动存档/取消存档它们。固定会话免于自动存档。存档会话是只读的，以防止发送新消息，同时保留历史记录、日志和差异视图。自动存档前的默认空闲天数可在“设置”页面中配置。如果会话的父项目已被删除，则取消归档会话将被禁用。在删除项目之前，警告对话框会标记所有可能变得不可用的关联存档会话。
- **最近的会话、固定、过滤和三点菜单**：侧边栏以最近的会话为中心，带有轻量级的存档会话提示，而不是单独的项目选项卡。将重要会话固定到顶部（按固定时间戳排序），在需要时按项目或 Runner 进行过滤，并使用每个会话的三点菜单来固定、重命名、存档或删除它。
- **项目就绪警告**：当项目有未提交的更改或正在运行的 Agent 时，在创建会话或在空会话上发送第一条消息之前发出警告，提供无论如何发送、准备好后自动发送或保存为 TODO 会话的选项。当 Agent 已经运行时，“无论如何立即发送”选项将被隐藏，因为在这种情况下 Server 总是拒绝它。已具有历史记录的会话上的后续消息将跳过此检查，并且仅阻止该会话自己的运行状态或已排队的 Todo。
- **项目三点菜单**：项目页面标题提供了一个三点菜单，其中包含文件浏览器、打开终端、显示更改（项目工作树的无会话视觉差异，清理时禁用）和删除项目。
- **基于多用户 Token 的身份验证**：使用支持 `admin` 和 `user` 角色的基于 Token 的身份验证来保护应用程序。如果尚未配置，则在首次启动时自动生成管理员访问 Token。客户端 Token 支持自定义名称和不同的颜色，这些名称和颜色与发件人头像一起显示在用户消息卡上。管理员可以从“设置”仪表板管理访问 Token 并配置特定于 Runner 的访问控制列表（将 Runner 限制为特定用户 Token UUID）。
- **安全 WebSocket 通信**：通过 `Sec-WebSocket-Protocol` 标头 (`arondo-token`) 传递身份验证 Token 来保护浏览器到 Server 的 WebSocket 连接，从而防止查询参数或 Server 日志中的敏感凭据暴露。
- **基于会话的工作空间**：每个任务都封装在配置目录（默认情况下为 `~/.arondo/sessions/[sessionId]/`）下的独立会话中，跟踪历史记录、设置和输出。
- **精细执行日志记录**：每个 CLI 命令执行的输出都单独记录在 `~/.arondo/sessions/[sessionId]/logs/[messageId].log` 下，当 Agent 在管道模式下运行时，stderr 会在相邻的 `.stderr.log` 文件中捕获。可以从 Agent 执行卡的菜单（显示 Stderr）以模式查看 Stderr 输出。
- **多个 AI Agent 支持**：支持用于代码生成任务的 **反重力 CLI (agy)**、**Claude Code**、**Codex** 和 **OpenCode**。
- **交互式终端 (PTY)**：Agent 和 Script 执行都通过 Go 的 `creack/pty` 在完整的伪终端中运行，并使用 `xterm.js` 在浏览器中呈现。支持交互式标准输入、ANSI 颜色和光标控制。 PTY 确保 Runner 退出时可靠的进程清理 (SIGHUP)。交互式 shell 终端直接在 Runner 上生成，而不是在 Server 上生成。
- **移动终端键盘栏**：包括用于终端模式的特定于移动设备的特殊键栏（ESC、TAB、CTRL、ALT、箭头和 F1-F12 的 FN 层）。它动态跟踪 VisualViewport 将其自身固定在虚拟键盘上方，防止键盘阻塞。
- **专用执行卡和丰富的 Markdown 视图**：Script 执行使用 `ScriptExecCard`（支持快速运行命令的内联日志流），而 Agent 执行使用 `AgentExecCard`，它将输出呈现为带有语法突出显示 (`rehype-highlight`) 和可点击文件/URL 链接的 Markdown。单击已验证的文件路径会自动打开远程文件浏览器。用户可以直接从卡的菜单复制格式化的 Markdown 输出或原始文本输出。用户还可以使用用户聊天卡上的复制操作来复制聊天消息。
- **终端会话持久性和重新附加**：终端会话在浏览器刷新或关闭事件中持续存在。重新打开终端会自动重新连接到 Runner 上的活动 PTY 会话并重播输出缓冲区。
- **配额和会话限制检测**：通过扫描 stdout 和 stderr 日志自动检测 AI Agent API 限制（例如 Claude 的会话限制命中、Codex 限制或 `agy` 配额错误，包括个人配额耗尽和订阅升级警告）并显示人类可读的错误消息。
- **AI Agent 配额监控**：通过 Runner 上的 tmux 自动收集 Claude、Antigravity 和 Codex 的配额使用数据，识别 API 密钥计费帐户，并在 Runner 仪表板中显示已知的剩余配额或明确的未知状态。
- **AI Agent 自动选择（Auto Mode）**：从已知订阅配额中自动选择最佳 Agent 和模型，优先选择可用容量而不是未知数据，并仅使用 API 密钥计费选择作为最后的后备。
- **手动 Agent 切换**：当 Agent 空闲时，在现有会话中即时切换活动 Agent（Antigravity CLI、Claude Code、Codex、OpenCode 或 Auto）。
- **Agent 会话连续性（恢复）**：同一会话中的对话保留其特定于 Agent 的历史记录。 Claude Code 使用本机恢复支持，Codex CLI 存储并重用 Codex 会话 ID，OpenCode CLI 存储并重用 OpenCode 会话 ID，Antigravity CLI (agy) 存储检测到的对话 ID 以供后续 `--conversation` 运行。
- **安全提示传递**：使用临时文件和环境变量（使用 `ARONDO_PROMPT_FILE` 环境变量）将提示传递给 Agent，避免 shell 命令行长度限制并在命令参数中暴露敏感提示。在“显示提示”面板中显示真正解析的提示，而不是原始输入。
- **并发 Script 执行**：允许在单个会话中同时运行多个 Script。用户可以在后台 Script 运行时继续聊天。还支持在 Agent 执行时运行项目范围的 Script。
- **全局和会话范围的 Script**：支持在全局（独立于会话，直接从项目面板）或在特定会话中运行项目范围的自定义 Script。
- **配置驱动和自定义斜杠命令**：内置斜杠命令（例如 `/new`、`/delete` 和 `/rename <name>` 来重命名当前会话）和自定义用户定义 Agent 斜杠命令是配置驱动且可自定义的。用户可以通过“设置”中的 **Agent Commands** 管理 UI（默认保存在 `~/.arondo/agent-commands.json` 中）配置用户定义的 Agent 斜杠命令，并支持正则表达式匹配器和替换扩展。
- **智能聊天输入、草稿和文件上传**：支持 Tab 完成以循环显示命令菜单中的斜线命令。支持输入 `@` 符号触发打开文件/目录选择器模式并将相对路径插入聊天输入。聊天输入支持直接文件上传（文件被发送到 Runner 的临时目录，并将解析的路径传递给 Agent）。每个会话的聊天草稿都会保留在 `localStorage` 中，以便在切换会话或客户端重新加载时继续存在。输入 `!` 触发器可以快速执行项目范围的 Script（具有自动完成功能），包括在创建新会话时、5 个最常用的临时历史命令、“选择...”条目以直接作为 shell 命令运行选定的文件，或回退到任意 shell 命令。键盘行为得到简化：在 `Enter` 上发送消息，在 `Ctrl+Enter` / `Meta+Enter` 上插入换行符。还支持用于 PWA/独立应用程序使用的全局重新加载快捷方式（`F5` 或 `Ctrl+R` / `Cmd+R`），以及跨应用程序的手动“刷新应用程序”按钮。
- **远程文件浏览和文件浏览器**：选择项目路径时，直接从 UI 浏览任何连接的 Runner 上的目录。从会话的三点菜单中打开远程文件浏览器，具有代码语法突出显示（滚动时以 64KB 块加载以支持任何大小的文件）、自动换行切换以及管理员可配置的隐藏文件设置。
- **全局 Agent 规则同步**：在设置 UI 中配置全局 Agent 规则，这些规则会自动同步到 Runner 上的 `~/.gemini/GEMINI.md`、`~/.claude/CLAUDE.md` 和 `~/.codex/AGENTS.md`。全局规则存储在 `~/.arondo/global-rules.md` 中。
- **集成差异查看器 (diff2html) 和提交历史记录**：直接从浏览器查看可视化代码更改，支持会话范围差异和直接从 Agent 执行卡中的文件链接触发的单文件内联差异查看器模式。支持在差异视图中动态折叠和展开单个更改的文件。还支持通过模式查看 git 提交历史记录和特定提交差异（显示提交）。
- **计划任务、自动排队跟进和配额重试**：安排项目范围的 Script 在未来的固定时间运行。聊天输入在 Agent 运行期间保持活动状态；后续消息将自动作为 `afterSession` 计划任务排队。如果 Agent 达到配额限制，一旦配额可用，它会自动安排重试并显示最后一次用户提示。
- **Runner 连接稳定性（心跳和死链接检测）**：Go Runner 客户端通过定期心跳维持与 Server 的持久连接，使用读取截止时间和 ping/pong 交换来检测死 WebSocket 连接，并通过指数退避自动重新连接。
- **任务队列和实时跟踪**：标头中的活动任务队列，具有 PID 跟踪和实时日志检查。单击任务将打开其专用控制台日志模式。每个正在运行的任务都可以从队列中终止，并且停止的项目范围任务可以从其三点菜单中删除。已完成的任务将保留 3 天，并在会话存档后立即从队列中删除。属于隐藏项目的任务和 Todo 消息会自动从活动队列和任务仪表板中过滤掉。
- **任务分组、过滤和内联日志**：在任务仪表板中，可以按类型（Agent/Script）过滤任务，默认情况下切换为仅显示未完成的任务，并按范围或状态进行分组。现在还可以内联查看 Script 执行日志。
- **任务持久性**：活动任务上下文通过将执行元数据直接序列化到会话和项目 `messages.json` 文件中来持久保留，并在 Server 重新启动时动态恢复。Runner ID 在重新连接后保持稳定。
- **自动化数据生命周期**：如果会话或项目的父引用（例如项目或 Runner）不再存在，则在列出查询期间自动清除会话或项目。
- **移动友好的用户界面**：采用可折叠面板、模式日志、响应式菜单和触摸友好操作进行设计。支持对移动侧边栏中的会话项目进行滑动删除手势。
- **项目管理**：确定仓库路径内的范围并跟踪会话。支持自定义项目 Script 和 AI 自动 Script 发现（在选定的 Runner 上安全执行）。
- **未读会话完成指示器**：自动跟踪后台运行会话何时完成（`done` 或 `error`）。它将会话的 `completedAt` 时间戳与用户的 `lastViewedAt` 时间戳进行比较。如果会话有未查看的完成情况，UI 会在侧边栏中的会话旁边显示一个彩色点（绿色表示成功，红色表示错误），并在标题菜单按钮中显示未读计数徽章。
- **PWA / 可安装应用程序**：发送 Web 应用程序清单 (`app/manifest.ts`) 和注册的 Service Worker (`public/sw.js`)，以便可以使用独立窗口将应用程序安装到主屏幕，包括在 Android Chrome 上，这需要具有获取处理程序的 Service Worker 才能实现完全安装。

## 快速开始

### 1.安装依赖并启动 Server

```bash
npm install
npm run dev
```

### 2. 构建并启动 Runner

```bash
cd runner
go build -o arondo-runner .
# Pass the runner token printed in the server console on startup
./arondo-runner --server ws://localhost:3251/runner --token <runner_access_token>

# Alternatively, pass it via environment variable:
# ARONDO_RUNNER_TOKEN=<runner_access_token> ./arondo-runner --server ws://localhost:3251/runner
```

或者使用方便的 Script：

```bash
./scripts/run.runner.sh
```

### 3. 打开用户界面

在浏览器中打开 [http://localhost:3251](http://localhost:3251)。选择连接的 Runner，选择项目目录，然后启动会话。

## 配置与环境变量

- `ARONDO_CONFIG_DIR` –（可选）用于存储配置和运行时数据的自定义目录。在开发和生产中默认为 `~/.arondo`。
- `PORT` –（可选）Server 端口。开发中默认为 `3251`，生产中默认为 `3250`。
- `ARONDO_SESSION_ARCHIVE_DAYS_DEFAULT` –（可选）自动存档活动会话之前的默认空闲天数，在“设置”中未设置覆盖时使用。默认为 `7`。
- `ARONDO_FILE_SHOW_HIDDEN_DEFAULT` –（可选）默认隐藏文件/目录（点文件）是否出现在文件浏览器和 @ 路径选择器中，在“设置”中未设置覆盖时使用。默认为 `true`；设置为 `false` 以默认隐藏点文件。

### 配置文件（在 `ARONDO_CONFIG_DIR` 或 `~/.arondo/` 中）

- `arondo.json` – 统一运行时配置，包含多用户访问 Token、每个 Runner 访问 Token 和全局应用程序设置。按以下结构存储：
  ```json
  {
    "clients": [
      {
        "token": "32-character-hex-string",
        "uuid": "canonical-uuid-string",
        "name": "Display Name",
        "type": "admin"
      }
    ],
    "runners": [
      {
        "id": "token-id",
        "token": "32-character-hex-string",
        "name": "Runner Token Name",
        "createdAt": 1720000000000,
        "lastUsedAt": 1720000100000,
        "boundRunnerId": "server-generated-runner-id"
      }
    ],
    "setitngs": {
      "sessionArchiveDays": 7,
      "showHiddenFiles": true
    }
  }
  ```
如果启动时不存在带有 `type: "admin"` 的 Token，则会自动生成一个 Token，写入配置，并打印在 Server 日志中。Runner Tokens 由管理员在“设置”（Runner Tokens 部分）中单独创建和管理；每个都锁定第一个注册的 Runner 身份（`boundRunnerId`）。
- `global-rules.md` – 规则同步到已连接 Runner 上的 `~/.gemini/GEMINI.md`、`~/.claude/CLAUDE.md` 和 `~/.codex/AGENTS.md`。
- `agent-commands.json` – 用户定义的 Agent 斜线命令。
- 全局应用程序配置设置存储在 `arondo.json` 的顶级 `setitngs` 字段下。
- `agent-sessions.json` – Agent 对话/会话连续性映射，存储为 `{ "agy": {}, "codex": {}, "opencode": {} }`。

## 自动化 API

Script 和外部程序可以使用与 UI 相同的 REST 端点通过 HTTP 直接驱动 Arondo。三个端点涵盖了完整的创建→消息→轮询生命周期：

### 验证

每个请求都必须包含有效的客户端 Token，作为标头或查询参数：

```
x-arondo-token: <client_access_token>
# or
?token=<client_access_token>
```

Token 由管理员从“设置”→“客户端 Token”(`/api/auth/client-tokens`) 颁发，存储在 `~/.arondo/arondo.json` 中。 `user` 角色 Token 还必须通过其 `allowedUserTokenUuids` 列表被授予对目标 Runner 的访问权限； `admin` 角色 Token 可以访问任何 Runner。

### 1. 创建会话

```
POST /api/sessions
Content-Type: application/json
x-arondo-token: <token>

{
  "repoPath": "/path/to/repo",   // repository path on the runner — required unless "tempDir" is set
  "tempDir": false,              // optional — create the session in a fresh temp dir generated on the runner instead of "repoPath" (mutually exclusive with "repoPath")
  "runnerId": "runner-id",       // target runner (see GET /api/runners) — required, unless "tempDir" is set, in which case it's optional and a random available runner is picked
  "prompt": "Fix the login bug", // prompt sent to the agent; omit/blank to create an idle session
  "agentType": "auto",           // optional — "antigravity" | "claude" | "codex" | "opencode" | "auto" (default: "auto")
  "name": "My session",          // optional — defaults to first line of the prompt
  "force": false                 // optional — bypass the dirty-working-tree / already-running checks
}
```

- 设置 `tempDir: true` 以使 Arondo 在 Runner 上生成临时目录并将其用作仓库路径 - 在这种情况下不要传递 `repoPath`。 `runnerId` 也成为可选的；当省略时，将从允许 Token 访问的 Runner 中随机挑选一个 Runner。
- 返回 `201` 以及创建的 `Session` 对象（包括 `id`）。
- 如果仓库有未提交的更改或 Agent 已在运行且未设置 `force`，则返回 `409 { needsConfirmation: true, reason: { dirty, busy } }` — 重试 `force: true` 以继续。

### 2. 向会话发送消息

```
POST /api/sessions/{id}/messages
Content-Type: application/json
x-arondo-token: <token>

{
  "message": "Also add a test for this", // required
  "force": false                         // optional — bypass the dirty-working-tree / already-running checks
}
```

- 再次运行 Agent，并将新消息附加到会话历史记录中（保留 Agent 会话连续性/恢复）。
- 如果会话已存档，则返回 `403` — 首先将其取消存档。
- 如果这是会话上发送的第一条消息，则应用与会话创建相同的脏/忙确认门：返回 `409 { needsConfirmation: true, reason: { dirty, busy, isFollowup: false } }`，除非设置了 `force: true`。对于后续的后续操作，只有此会话自己的运行状态和已排队的 Todo 消息会阻止发送：返回 `409 { needsConfirmation: true, reason: { dirty: false, busy, queued, isFollowup: true } }`。

### 3、查询会话状态

```
GET /api/sessions/{id}
x-arondo-token: <token>
```

- 返回 `Session` 对象。检查 `status`，其中之一：`idle`、`running`、`script-running`、`done`、`error`。
- `done`/`error`表示 Agent 完成；轮询此端点，直到状态离开 `running`/`script-running`。

### CLI

`cli/arondo-cli` 是一个无依赖项的 Go CLI。使用 `cd cli && go build -o arondo-cli . && cd ..` 构建。它的 `send` 命令会创建会话或向现有会话发送消息，然后轮询直到完成并打印结果。所需的消息作为最终位置参数传递。

```bash
cli/arondo-cli send \
  --server http://localhost:3251 \
  --client-token <client_access_token> \
  --temp-dir \
  "Print the current date"
```

该命令打印会话 ID。使用它在稍后的调用中继续该对话：

```bash
cli/arondo-cli send \
  --server http://localhost:3251 \
  --client-token <client_access_token> \
  --resume \
  "Now also print the current directory"
```

创建不带 `--temp-dir` 或 `--path` 的会话时，Script 使用其当前工作目录作为仓库路径。
当省略 `--runner-id` 时，它会选择当前主机名连接的 Runner；当没有 Runner 或多个 Runner 共享该主机名时，使用 `--runner-id`。
使用 `--resume` 将消息发送到所选 Runner 和仓库路径的最近更新的会话。它不能与 `--session-id` 或 `--temp-dir` 结合使用。
使用 `--confirmation auto`、`--confirmation draft` 或 `--confirmation force` 来处理 Server 的 `needsConfirmation` 响应，对应 Web UI 的三个按钮：自动排队发送、保存为手动草稿、或立即发送。
当 Server 返回 `needsConfirmation: true` 时，CLI 会打印一条提示，列出这些重试选项。
最终 JSON 结果使用 `sessionId` 并包含 Agent 的标准输出作为 `rawOutput`。
最终的JSON结果被写入stdout；进度消息和错误将写入 stderr。

## Runner CLI

```
arondo-runner [flags]

Flags:
  --server string   Server WebSocket URL (default "ws://localhost:3251/runner")
  --token string    Runner access token (optional, can also set ARONDO_RUNNER_TOKEN)
```

如果 Server 连接断开，Runner 会以指数退避自动重新连接。它没有自己的显示名称 - UI 上显示的名称来自 Runner Tokens 的 `name`，由管理员在“设置”中生成 Token 时设置。

## 测试

集成测试是使用 Playwright 实现的。他们生成一个模拟配置的 Server 和一个 Go Runner 来端到端测试 API 端点和 WebSocket 操作。

要运行集成测试：

```bash
npm run test:integration
```

测试 Runner 将：
1. 构建 Go Runner 二进制文件。
2. 使用临时配置目录 (`.arondo-test/`) 在端口 `3252` 上启动 Next.js Server。
3. 生成 Go Runner 以连接到测试 Server。
4. 运行 Server API 测试 (`tests/server/`) 和 Runner 功能测试 (`tests/runner/`)。
5. 终止所有测试进程并自动清理临时测试配置和日志。
