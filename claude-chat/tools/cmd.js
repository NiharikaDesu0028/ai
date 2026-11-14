/**
 * tools/cmd.js
 * CMD / PowerShell execution tool for the LangChain PC-access agent.
 * Runs commands in a sandboxed PowerShell shell with a timeout.
 */
const { DynamicStructuredTool } = require('@langchain/core/tools');
const { z } = require('zod');
const { exec } = require('child_process');

const TIMEOUT_MS = 30_000; // 30 s hard limit

const cmdTool = new DynamicStructuredTool({
  name: 'cmd',
  description: `Execute any PowerShell or Windows CMD command on the user's local PC.
Use this to: list files, read file contents, run scripts, check system info, manage processes,
query the registry, run git commands, start/stop services, etc.
Returns the combined stdout + stderr output (truncated to 8000 chars).
Examples:
  - List files:            dir C:\\Users
  - Read a file:           Get-Content C:\\path\\to\\file.txt
  - System info:           systeminfo
  - Running processes:     Get-Process
  - Disk usage:            Get-PSDrive
  - Network info:          ipconfig /all
  - Find text in file:     Select-String -Path C:\\file.txt -Pattern "keyword"
  - Run Python script:     python C:\\script.py`,

  schema: z.object({
    command: z.string().describe('The PowerShell or CMD command to execute'),
    cwd: z.string().nullable().optional().describe('Working directory (optional, defaults to user home)'),
  }),

  func: async ({ command, cwd }) => {
    const workDir = cwd || process.env.USERPROFILE || 'C:\\Users';
    console.log(`\n[CMD] 🖥  ${command}  (cwd: ${workDir})`);

    return new Promise((resolve) => {
      // Use PowerShell for richer command support
      const ps = `powershell.exe -NoProfile -NonInteractive -Command "${command.replace(/"/g, '\\"')}"`;

      exec(ps, {
        cwd:      workDir,
        timeout:  TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024, // 10 MB
        encoding: 'utf8',
        windowsHide: true,
      }, (err, stdout, stderr) => {
        const out   = (stdout || '').trim();
        const errOut = (stderr || '').trim();
        let result  = '';

        if (out)   result += out;
        if (errOut) result += (result ? '\n--- STDERR ---\n' : '') + errOut;
        if (err && !out && !errOut) result = `Error: ${err.message}`;
        if (!result) result = '(no output)';

        // Truncate to avoid flooding the context
        if (result.length > 8000) {
          result = result.slice(0, 8000) + '\n… [output truncated]';
        }

        console.log(`[CMD] ✓ ${result.slice(0, 120).replace(/\n/g,' ')}…`);
        resolve(result);
      });
    });
  },
});

module.exports = { cmdTool };
