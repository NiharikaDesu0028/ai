# Claude Chat — PC Agent

A Claude-like chat interface that runs **locally** as an Electron desktop app, powered by **LM Studio** and a **LangChain agent** with real PC-access tools.

---

## ✨ Features

- 🖥 **Native Electron app** — runs as a desktop window with system tray, native menus & keyboard shortcuts
- 🤖 **LangChain ReAct agent** — Qwen3.5 0.8B (via LM Studio) reasons step-by-step and calls tools autonomously
- 🔧 **`cmd` tool** — executes any PowerShell / CMD command on your PC
- 🔍 **`grep` tool** — searches file contents recursively using regex (like ripgrep)
- 📡 **SSE streaming** — tool calls and results stream live into the UI as collapsible cards
- 🌙 **Dark mode** — toggle via sidebar or `Ctrl+D`
- 💾 **Chat history** — sessions saved in `localStorage`
- 📦 **Buildable** — package into a distributable `.exe` installer with one command

---

## 🖼 Screenshot

```
┌─────────────────────────────────────────────────────────┐
│  Claude Chat  ·  PC Agent  ·  Qwen3.5 0.8B             │
├──────────┬──────────────────────────────────────────────┤
│          │                                              │
│  New     │        Your PC, your agent                  │
│  Search  │                                              │
│  ------- │  ┌─────────────────────────────────────┐    │
│  ● cmd   │  │ 📂 List Desktop files               │    │
│  ● grep  │  │ ⚙️  Running processes               │    │
│          │  │ 💾 Disk usage    🐍 Find .py files  │    │
│  Chats   │  └─────────────────────────────────────┘    │
│  > ...   │                                              │
│          │  ┌──────────────────────────────────────┐   │
│          │  │ How can I help you today?        🔶  │   │
│          │  │ Agent  🖥 cmd  🔍 grep  Qwen3.5 0.8B│   │
│          │  └──────────────────────────────────────┘   │
└──────────┴──────────────────────────────────────────────┘
```

---

## 🏗 Architecture

```
claude-chat/
├── main.js          ← Electron main process (splash, server boot, BrowserWindow)
├── preload.js       ← Secure contextBridge API
├── server.js        ← LangChain AgentExecutor + SSE HTTP server (:3000)
├── index.html       ← Chat UI (vanilla JS + CSS, no framework)
├── tools/
│   ├── cmd.js       ← PowerShell execution tool (30s timeout, 8KB cap)
│   └── grep.js      ← Select-String file search (regex, recursive)
├── assets/
│   └── icon.ico     ← App icon
└── package.json     ← Deps + electron-builder config
```

### How the agent loop works

```
You type a message
      │
      ▼
AgentExecutor (LangChain)
      │
      ▼
Qwen3.5 0.8B (LM Studio at 127.0.0.1:1234)
      │  decides to call a tool
      ▼
  cmd  /  grep  ← executes on your Windows PC
      │  result fed back to model
      ▼
Model reasons → calls more tools or gives final answer
      │
      ▼
SSE streams each step live → Tool cards appear in UI
```

---

## 🚀 Getting Started

### Prerequisites

| Requirement | Version |
|---|---|
| [Node.js](https://nodejs.org) | v18+ |
| [LM Studio](https://lmstudio.ai) | Latest |
| Windows | 10 / 11 |

### 1. Clone the repo

```bash
git clone https://github.com/NiharikaDesu0028/ai.git
cd ai/claude-chat
```

### 2. Install dependencies

```bash
npm install
```

> On first run this downloads the Electron binary (~100 MB). If the download fails due to network issues, set the mirror:
> ```powershell
> $env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
> npm install
> ```

### 3. Start LM Studio

1. Open **LM Studio**
2. Go to **Model Server** tab
3. Load **Qwen3.5 0.8B** (or any OpenAI-compatible model)
4. Toggle the server **ON** → it should listen at `http://127.0.0.1:1234`

### 4. Launch the app

```bash
npm run electron
```

The app will:
1. Show a **splash screen** while the LangChain agent initialises
2. Open the **main window** once ready

---

## 🎮 Usage

### Try these prompts

| Prompt | Tools used |
|---|---|
| `List all files on my Desktop` | `cmd → Get-ChildItem` |
| `Show me running processes` | `cmd → Get-Process` |
| `What's my IP address?` | `cmd → ipconfig` |
| `How much free disk space do I have?` | `cmd → Get-PSDrive` |
| `Find TODO comments in my project` | `grep → Select-String` |
| `Read the contents of my hosts file` | `cmd → Get-Content` |
| `Search for .py files in C:\Users` | `grep + cmd` |

### Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Enter` | Send message |
| `Shift+Enter` | New line in input |
| `Ctrl+N` | New chat |
| `Ctrl+D` | Toggle dark mode |
| `F12` | Open DevTools |
| `Ctrl+R` | Reload UI |

---

## 🔧 Configuration

Edit the top of [`server.js`](./server.js) or use environment variables:

| Variable | Default | Description |
|---|---|---|
| `LM_HOST` | `127.0.0.1` | LM Studio host |
| `LM_PORT` | `1234` | LM Studio port |
| `LM_MODEL` | `qwen3.5-0.8b` | Model identifier |

```powershell
# Example: use a different model
$env:LM_MODEL="llama-3.2-3b-instruct"; npm run electron
```

---

## 📦 Build Distributable

Build a Windows installer (`.exe`) + portable version:

```bash
# Install builder (one-time)
npm install --save-dev electron-builder

# Build → output goes to dist/
npm run build
```

Output in `dist/`:
- `Claude Chat Setup.exe` — NSIS installer
- `Claude Chat.exe` — Portable executable

---

## 🛠 Tools Reference

### `cmd` — PowerShell Executor

Runs any PowerShell or CMD command on the local machine.

- **Timeout:** 30 seconds
- **Output cap:** 8 KB (truncated if larger)
- **Working directory:** `C:\Users\<you>` (configurable per call)

### `grep` — File Search

Searches file contents using PowerShell `Select-String` (supports regex).

- **Recursive:** yes (default)
- **Case sensitive:** no (default)
- **Result cap:** 100 matches
- **Supported:** any text file, filtered by glob (e.g. `*.js`, `*.log`)

---

## 🔒 Security Notes

- The agent runs commands **as your current Windows user** — it has the same permissions you do
- No commands are sent to any external server — everything stays on your machine
- LM Studio runs fully offline — your prompts never leave your PC
- Review agent tool calls before acting on results (shown live in the UI)

---

## 📄 License

MIT
