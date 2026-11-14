/**
 * server.js  —  LangChain PC-Access Agent
 *
 * Stack:
 *   - LangChain.js  (AgentExecutor + createOpenAIToolsAgent)
 *   - @langchain/openai  (ChatOpenAI → LM Studio endpoint)
 *   - Tools: cmd, grep
 *   - Transport: plain Node http  +  SSE for real-time streaming
 */

'use strict';
const http  = require('http');
const fs    = require('fs');
const path  = require('path');

// ── Config ───────────────────────────────────────────────
const PORT     = 3000;
const LM_HOST  = process.env.LM_HOST  || '127.0.0.1';
const LM_PORT  = process.env.LM_PORT  || 1234;
const LM_MODEL = process.env.LM_MODEL || 'qwen3.5-0.8b';
const BASE_URL = `http://${LM_HOST}:${LM_PORT}/v1`;

const MIME = {
  '.html': 'text/html', '.css':  'text/css',
  '.js':   'application/javascript', '.json': 'application/json',
  '.png':  'image/png', '.ico':  'image/x-icon',
};

// ── LangChain setup (lazy-loaded so server boots fast) ───
let agentExecutor = null;

async function getAgent() {
  if (agentExecutor) return agentExecutor;

  const { ChatOpenAI }              = require('@langchain/openai');
  const { AgentExecutor, createOpenAIToolsAgent } = require('langchain/agents');
  const { ChatPromptTemplate, MessagesPlaceholder } = require('@langchain/core/prompts');
  const { AIMessage, HumanMessage, SystemMessage }  = require('@langchain/core/messages');

  const { cmdTool }  = require('./tools/cmd.js');
  const { grepTool } = require('./tools/grep.js');

  const tools = [cmdTool, grepTool];

  // Point ChatOpenAI at LM Studio
  const llm = new ChatOpenAI({
    model:       LM_MODEL,
    temperature: 0.3,
    maxTokens:   4096,
    openAIApiKey: 'lm-studio',          // LM Studio ignores the key value
    configuration: {
      baseURL: BASE_URL,
    },
  });

  const prompt = ChatPromptTemplate.fromMessages([
    ['system', `You are a powerful PC-access agent running on the user's Windows machine.
You have access to two tools:

1. **cmd**  — Execute any PowerShell or CMD command on the local PC.
2. **grep** — Search for text patterns inside files on the local PC.

RULES:
- Always use tools to answer questions about the PC, files, processes, or system state.
- Think step by step. Break complex tasks into tool calls.
- When reading files, always use cmd with Get-Content or type command.
- When listing directories, use cmd with dir or Get-ChildItem.
- After every tool call, analyze the output and decide if more calls are needed.
- Provide a clear, concise final answer after gathering all needed information.
- If a command fails, try an alternative approach.
- Working directory default: C:\\Users\\gowth`],
    new MessagesPlaceholder('chat_history'),
    ['human', '{input}'],
    new MessagesPlaceholder('agent_scratchpad'),
  ]);

  const agent = await createOpenAIToolsAgent({ llm, tools, prompt });

  agentExecutor = new AgentExecutor({
    agent,
    tools,
    maxIterations:   10,
    returnIntermediateSteps: true,
    verbose: true,
  });

  console.log('[Agent] ✓ LangChain agent initialized');
  return agentExecutor;
}

// Convert stored plain messages → LangChain message objects
function toLangChainHistory(messages) {
  const { HumanMessage, AIMessage } = require('@langchain/core/messages');
  // Drop the last user message (it becomes 'input')
  const history = messages.slice(0, -1);
  return history.map(m =>
    m.role === 'user'
      ? new HumanMessage(m.content)
      : new AIMessage(m.content)
  );
}

// ── HTTP Server ──────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  // ════════════════════════════════════════════════════════
  //  POST /api/chat  — SSE streaming agent execution
  // ════════════════════════════════════════════════════════
  if (req.method === 'POST' && req.url === '/api/chat') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {

      // Set up SSE
      res.writeHead(200, {
        'Content-Type':  'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection':    'keep-alive',
      });

      const send = (type, data) => {
        res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
      };

      try {
        const { messages } = JSON.parse(body);
        const userInput     = messages[messages.length - 1].content;
        const chatHistory   = toLangChainHistory(messages);

        const executor = await getAgent();

        send('status', { text: 'Thinking…' });

        const result = await executor.invoke({
          input:        userInput,
          chat_history: chatHistory,
        });

        // Send each intermediate step (tool calls)
        for (const step of (result.intermediateSteps || [])) {
          const action = step.action;
          const obs    = step.observation;

          send('tool_call', {
            tool:   action.tool,
            input:  typeof action.toolInput === 'object'
                      ? JSON.stringify(action.toolInput, null, 2)
                      : String(action.toolInput),
          });

          send('tool_result', {
            tool:   action.tool,
            output: String(obs).slice(0, 4000),
          });
        }

        // Final answer
        send('answer', { content: result.output });

      } catch (err) {
        console.error('[Agent Error]', err.message);
        send('error', { message: err.message });
      } finally {
        res.end();
      }
    });
    return;
  }

  // ── GET /api/model ──
  if (req.method === 'GET' && req.url === '/api/model') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ model: LM_MODEL, host: `${LM_HOST}:${LM_PORT}`, agent: true }));
    return;
  }

  // ── Static files ──
  const filePath    = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
  const contentType = MIME[path.extname(filePath)] || 'text/plain';

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); }
    else      { res.writeHead(200, { 'Content-Type': contentType }); res.end(data); }
  });
});

server.listen(PORT, async () => {
  console.log(`\n✦ Claude Chat  →  http://localhost:${PORT}`);
  console.log(`✦ LM Studio    →  http://${LM_HOST}:${LM_PORT}  (model: ${LM_MODEL})`);
  console.log('✦ Tools        →  cmd, grep');
  console.log('\nPre-loading LangChain agent…');
  try {
    await getAgent();
  } catch (e) {
    console.error('⚠  Agent pre-load failed:', e.message);
    console.error('   Make sure LM Studio is running and the model is loaded.\n');
  }
});
