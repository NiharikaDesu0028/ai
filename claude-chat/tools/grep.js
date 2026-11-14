/**
 * tools/grep.js
 * Grep / file-search tool for the LangChain PC-access agent.
 * Uses PowerShell's Select-String (ripgrep-like) with optional recursion.
 */
const { DynamicStructuredTool } = require('@langchain/core/tools');
const { z } = require('zod');
const { exec } = require('child_process');

const TIMEOUT_MS = 20_000;

const grepTool = new DynamicStructuredTool({
  name: 'grep',
  description: `Search for a text pattern inside files on the user's PC (like grep/ripgrep).
Use this to: find strings in source files, search logs, locate config values, find TODO comments, etc.
Supports regex patterns. Returns matching lines with file name and line number.
Examples:
  - Find "TODO" in JS files:        pattern="TODO", path="C:\\project", filter="*.js"
  - Search Python for import:       pattern="import pandas", path="C:\\code", filter="*.py"
  - Find IP in logs:                pattern="\\d{1,3}\\.\\d{1,3}", path="C:\\logs", filter="*.log"
  - Recursive search all files:     pattern="password", path="C:\\project" (no filter = all files)`,

  schema: z.object({
    pattern: z.string().describe('Text or regex pattern to search for'),
    path: z.string().describe('Directory or file path to search in'),
    filter: z.string().nullable().optional().describe('File glob filter e.g. "*.js", "*.txt" (default: all files)'),
    recursive: z.boolean().nullable().optional().describe('Search subdirectories recursively (default: true)'),
    caseSensitive: z.boolean().nullable().optional().describe('Case-sensitive search (default: false)'),
    maxResults: z.number().nullable().optional().describe('Maximum number of matching lines to return (default: 100)'),
  }),

  func: async ({ pattern, path: searchPath, filter, recursive = true, caseSensitive = false, maxResults = 100 }) => {
    console.log(`\n[GREP] 🔍  "${pattern}"  in  ${searchPath}  (filter: ${filter || '*'})`);

    // Build PowerShell Select-String command
    const pathArg  = searchPath.replace(/'/g, "''");
    const fileGlob = filter ? `-Filter '${filter}'` : '';
    const recurse  = recursive ? '-Recurse' : '';
    const csFlag   = caseSensitive ? '' : '-CaseSensitive:$false';

    const cmd = [
      `Get-ChildItem -Path '${pathArg}' ${fileGlob} ${recurse} -File -ErrorAction SilentlyContinue`,
      `| Select-String -Pattern '${pattern.replace(/'/g, "''")}' ${csFlag} -ErrorAction SilentlyContinue`,
      `| Select-Object -First ${maxResults}`,
      `| ForEach-Object { "$($_.Filename):$($_.LineNumber): $($_.Line.Trim())" }`,
    ].join(' | ');

    return new Promise((resolve) => {
      exec(`powershell.exe -NoProfile -NonInteractive -Command "${cmd.replace(/"/g, '\\"')}"`, {
        timeout:   TIMEOUT_MS,
        maxBuffer: 5 * 1024 * 1024,
        encoding:  'utf8',
        windowsHide: true,
      }, (err, stdout, stderr) => {
        const out = (stdout || '').trim();
        const errOut = (stderr || '').trim();

        if (err && !out) {
          const msg = errOut || err.message;
          resolve(`Error running grep: ${msg.slice(0, 500)}`);
          return;
        }

        if (!out) {
          resolve(`No matches found for pattern "${pattern}" in ${searchPath}`);
          return;
        }

        const lines   = out.split('\n');
        const count   = lines.length;
        let   result  = `Found ${count} match${count !== 1 ? 'es' : ''}:\n\n${out}`;

        if (result.length > 8000) {
          result = result.slice(0, 8000) + '\n… [truncated]';
        }

        console.log(`[GREP] ✓  ${count} matches`);
        resolve(result);
      });
    });
  },
});

module.exports = { grepTool };
