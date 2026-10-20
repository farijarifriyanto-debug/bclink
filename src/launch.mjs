import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { BASE_URL } from './api.mjs';

// Claude Code: everything goes through environment variables for this launch only.
// Nothing is written to ~/.claude, so the user's own settings and login stay as they are.
export function claudeEnv({ key, model, baseUrl = BASE_URL, env = process.env }) {
  return {
    ...env,
    ANTHROPIC_BASE_URL: baseUrl,
    ANTHROPIC_API_KEY: key,
    ANTHROPIC_MODEL: model,
    // Keep Claude Code's background calls on the same model instead of its built-in Claude names.
    ANTHROPIC_SMALL_FAST_MODEL: model,
  };
}

// Codex: gateway settings go on the command line for this run only, so ~/.codex is never rewritten.
// The key is read from BOTCONNECTOR_API_KEY in the child environment and never appears in the arguments.
export function codexArgs({ model, baseUrl = BASE_URL }) {
  const provider = `{name="BotConnector",base_url="${baseUrl}/v1",env_key="BOTCONNECTOR_API_KEY",wire_api="responses"}`;
  return ['-c', 'model_provider="botc"', '-c', `model_providers.botc=${provider}`, '-m', model];
}

export function codexEnv({ key, env = process.env }) {
  return { ...env, BOTCONNECTOR_API_KEY: key };
}

export function resolveExecutable(name, platform = process.platform) {
  const command = platform === 'win32' ? 'where.exe' : 'which';
  try {
    const found = execFileSync(command, [name], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true })
      .split(/\r?\n/).filter(Boolean);
    if (platform !== 'win32') return found[0] || null;
    // npm installs a Unix-style shim next to the real .cmd file; only the .cmd/.exe can be spawned.
    return found.find((p) => /\.(?:cmd|exe|bat)$/i.test(p)) || found[0] || null;
  } catch {
    return null;
  }
}

function quoteForCmd(arg) {
  return `"${String(arg).replace(/"/g, '\\"')}"`;
}

// Resolves to the child's exit code. Windows .cmd shims need cmd.exe; other executables spawn directly.
export function runTool({ executable, args, env, cwd = process.cwd(), platform = process.platform }) {
  return new Promise((resolve, reject) => {
    const useCmd = platform === 'win32' && /\.(?:cmd|bat)$/i.test(executable);
    const child = useCmd
      // cmd /s strips one outer pair of quotes, so the whole command line needs its own wrapper.
      ? spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `"${[quoteForCmd(executable), ...args.map(quoteForCmd)].join(' ')}"`], { env, cwd, stdio: 'inherit', windowsVerbatimArguments: true })
      : spawn(executable, args, { env, cwd, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve(code === null ? (signal ? 1 : 0) : code));
  });
}
