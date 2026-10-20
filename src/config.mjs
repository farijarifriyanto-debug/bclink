import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const KEY_PREFIX = 'bc_live_';

export function configDir(env = process.env, platform = process.platform) {
  if (env.BCLINK_CONFIG_DIR) return env.BCLINK_CONFIG_DIR;
  if (platform === 'win32') return path.join(env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'bclink');
  return path.join(env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'bclink');
}

export function configFile(env = process.env, platform = process.platform) {
  return path.join(configDir(env, platform), 'config.json');
}

export async function readStore(env = process.env, platform = process.platform) {
  try {
    return JSON.parse(await fs.readFile(configFile(env, platform), 'utf8'));
  } catch {
    return {};
  }
}

export async function writeStore(data, env = process.env, platform = process.platform) {
  const file = configFile(env, platform);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  // Windows ignores POSIX modes; the file lives under the per-user APPDATA folder there.
  await fs.chmod(file, 0o600).catch(() => {});
}

// Precedence matches Together Link: --api-key, then saved config, then the environment.
// A project .env file is never read.
export function resolveKey({ flagKey, store = {}, env = process.env }) {
  if (flagKey) return { key: flagKey, source: '--api-key' };
  if (store.apiKey) return { key: store.apiKey, source: 'config' };
  if (env.BOTCONNECTOR_API_KEY) return { key: env.BOTCONNECTOR_API_KEY, source: 'env' };
  return { key: null, source: null };
}

export function maskKey(key) {
  return `${key.slice(0, KEY_PREFIX.length + 2)}…${key.slice(-4)}`;
}
