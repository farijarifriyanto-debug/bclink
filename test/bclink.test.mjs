import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseArgv, takeFlag } from '../src/args.mjs';
import { maskKey, readStore, resolveKey, writeStore, configFile } from '../src/config.mjs';
import { claudeEnv, codexArgs, codexEnv } from '../src/launch.mjs';
import { run } from '../src/cli.mjs';

const KEY = 'bc_live_0123456789abcdefSECRET7890';

function sink() {
  const chunks = [];
  return { write: (s) => { chunks.push(String(s)); return true; }, text: () => chunks.join('') };
}

function fakeFetch(routes) {
  return async (url) => {
    const path = new URL(url).pathname;
    const route = routes[path];
    if (!route) return { ok: false, status: 404, text: async () => '{}' };
    const value = typeof route === 'function' ? route(url) : route;
    const wrapped = 'body' in value || 'status' in value;
    const status = wrapped ? (value.status ?? 200) : 200;
    const body = wrapped ? value.body : value;
    return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
  };
}

const MODELS = {
  data: [
    { id: 'agnes-3.0-flash', botconnector_access: 'free', botconnector_capabilities: { tools: true } },
    { id: 'payg:kimi-k3', botconnector_access: 'payg', botconnector_capabilities: { tools: true } },
  ],
};
const INTEGRATIONS = { default_model: 'agnes-3.0-flash' };

async function tmpConfigDir(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bclink-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}

test('parseArgv: global flags before the tool, passthrough after it', () => {
  const p = parseArgv(['--main', 'agnes-3.0-flash', 'claude', '-p', 'hi', '--main', 'x']);
  assert.equal(p.main, 'agnes-3.0-flash');
  assert.equal(p.command, 'claude');
  assert.deepEqual(p.rest, ['-p', 'hi', '--main', 'x']);
});

test('parseArgv: --api-key=value and --help', () => {
  assert.equal(parseArgv(['--api-key=abc', 'models']).apiKey, 'abc');
  assert.equal(parseArgv(['-h']).help, true);
});

test('parseArgv: flag without value is an error', () => {
  assert.throws(() => parseArgv(['--main']), /butuh nilai/);
});

test('takeFlag removes --api-key from configure arguments', () => {
  const t = takeFlag(['--api-key', KEY, 'extra'], '--api-key');
  assert.equal(t.value, KEY);
  assert.deepEqual(t.rest, ['extra']);
});

test('resolveKey precedence: flag, then saved config, then environment', () => {
  const env = { BOTCONNECTOR_API_KEY: 'bc_live_env' };
  assert.equal(resolveKey({ flagKey: 'bc_live_flag', store: { apiKey: 'bc_live_saved' }, env }).source, '--api-key');
  assert.equal(resolveKey({ store: { apiKey: 'bc_live_saved' }, env }).source, 'config');
  assert.equal(resolveKey({ store: {}, env }).source, 'env');
  assert.equal(resolveKey({ store: {}, env: {} }).key, null);
});

test('maskKey never shows the full key', () => {
  const masked = maskKey(KEY);
  assert.ok(masked.startsWith('bc_live_01'));
  assert.ok(masked.endsWith('7890'));
  assert.ok(!masked.includes('SECRET'));
});

test('config round-trip stores the key only under the config directory', async (t) => {
  const dir = await tmpConfigDir(t);
  const env = { BCLINK_CONFIG_DIR: dir };
  await writeStore({ apiKey: KEY }, env, 'linux');
  assert.equal(configFile(env, 'linux'), path.join(dir, 'config.json'));
  assert.equal((await readStore(env, 'linux')).apiKey, KEY);
  if (process.platform !== 'win32') {
    const mode = (await fs.stat(path.join(dir, 'config.json'))).mode & 0o777;
    assert.equal(mode, 0o600);
  }
});

test('claudeEnv sets the BotConnector route and leaves process.env alone', () => {
  const before = process.env.ANTHROPIC_BASE_URL;
  const env = claudeEnv({ key: KEY, model: 'agnes-3.0-flash', env: { PATH: '/bin' } });
  assert.equal(env.ANTHROPIC_BASE_URL, 'https://api.botconnector.id');
  assert.equal(env.ANTHROPIC_API_KEY, KEY);
  assert.equal(env.ANTHROPIC_MODEL, 'agnes-3.0-flash');
  assert.equal(env.ANTHROPIC_SMALL_FAST_MODEL, 'agnes-3.0-flash');
  assert.equal(process.env.ANTHROPIC_BASE_URL, before);
});

test('run: help, version and unknown command', async () => {
  const out = sink(); const err = sink();
  assert.equal(await run([], { stdout: out, stderr: err }), 0);
  assert.match(out.text(), /Pemakaian/);
  assert.equal(await run(['nope'], { stdout: sink(), stderr: err, env: {} }), 2);
  assert.match(err.text(), /tidak dikenal/);
});

test('configure rejects keys without the bc_live_ prefix before any network call', async (t) => {
  const dir = await tmpConfigDir(t);
  const err = sink();
  let called = false;
  const code = await run(['configure', '--api-key', 'sk-wrong'], {
    stdout: sink(), stderr: err, env: { BCLINK_CONFIG_DIR: dir }, fetchImpl: async () => { called = true; throw new Error('no'); },
  });
  assert.equal(code, 2);
  assert.equal(called, false);
  assert.match(err.text(), /bc_live_/);
});

test('configure validates the key and stores it masked in output', async (t) => {
  const dir = await tmpConfigDir(t);
  const out = sink();
  const code = await run(['configure', '--api-key', KEY], {
    stdout: out, stderr: sink(), env: { BCLINK_CONFIG_DIR: dir },
    fetchImpl: fakeFetch({ '/v1/models': MODELS }),
  });
  assert.equal(code, 0);
  assert.ok(!out.text().includes('SECRET'));
  assert.equal((await readStore({ BCLINK_CONFIG_DIR: dir })).apiKey, KEY);
});

test('models lists access and tool support', async (t) => {
  const dir = await tmpConfigDir(t);
  const out = sink();
  const code = await run(['models'], {
    stdout: out, stderr: sink(), env: { BCLINK_CONFIG_DIR: dir, BOTCONNECTOR_API_KEY: KEY },
    fetchImpl: fakeFetch({ '/v1/models': MODELS }),
  });
  assert.equal(code, 0);
  assert.match(out.text(), /agnes-3\.0-flash\tfree\ttools/);
  assert.match(out.text(), /payg:kimi-k3\tpayg\ttools/);
});

test('claude launch: default model from the manifest, args pass through, --model added', async (t) => {
  const dir = await tmpConfigDir(t);
  let seen;
  const code = await run(['claude', '-p', 'hello'], {
    stdout: sink(), stderr: sink(), env: { BCLINK_CONFIG_DIR: dir, BOTCONNECTOR_API_KEY: KEY }, platform: 'linux',
    fetchImpl: fakeFetch({ '/v1/models': MODELS, '/v1/integrations': INTEGRATIONS }),
    resolveExecutable: () => '/usr/bin/claude',
    runTool: async (o) => { seen = o; seen.existedDuring = await fs.access(o.env.CLAUDE_CONFIG_DIR).then(() => true, () => false); return 0; },
  });
  assert.equal(code, 0);
  assert.equal(seen.executable, '/usr/bin/claude');
  assert.deepEqual(seen.args, ['--model', 'agnes-3.0-flash', '-p', 'hello']);
  assert.equal(seen.env.ANTHROPIC_API_KEY, KEY);
  assert.ok(seen.env.CLAUDE_CONFIG_DIR, 'per-launch Claude config folder is set');
  assert.equal(seen.existedDuring, true, 'folder exists while the session runs');
  await assert.rejects(fs.access(seen.env.CLAUDE_CONFIG_DIR), 'folder is removed after the session');
});

test('--main selects another listed model; unknown model is refused without launching', async (t) => {
  const dir = await tmpConfigDir(t);
  let launched = false;
  const deps = () => ({
    stdout: sink(), stderr: sink(), env: { BCLINK_CONFIG_DIR: dir, BOTCONNECTOR_API_KEY: KEY }, platform: 'linux',
    fetchImpl: fakeFetch({ '/v1/models': MODELS, '/v1/integrations': INTEGRATIONS }),
    resolveExecutable: () => '/usr/bin/claude',
    runTool: async () => { launched = true; return 0; },
  });
  assert.equal(await run(['--main', 'nope-model', 'claude'], deps()), 2);
  assert.equal(launched, false);
});

test('launch without any key asks the user to configure first', async (t) => {
  const dir = await tmpConfigDir(t);
  const err = sink();
  const code = await run(['claude'], { stdout: sink(), stderr: err, env: { BCLINK_CONFIG_DIR: dir }, platform: 'linux' });
  assert.equal(code, 1);
  assert.match(err.text(), /bclink configure/);
});

test('a missing tool is reported and nothing is launched', async (t) => {
  const dir = await tmpConfigDir(t);
  const err = sink();
  const code = await run(['claude'], {
    stdout: sink(), stderr: err, env: { BCLINK_CONFIG_DIR: dir, BOTCONNECTOR_API_KEY: KEY }, platform: 'linux',
    fetchImpl: fakeFetch({ '/v1/models': MODELS, '/v1/integrations': INTEGRATIONS }),
    resolveExecutable: () => null,
  });
  assert.equal(code, 1);
  assert.match(err.text(), /belum terpasang/);
});

test('codexArgs set the BotConnector provider per run and never contain the key', () => {
  const args = codexArgs({ model: 'agnes-3.0-flash' });
  const text = args.join(' ');
  assert.ok(text.includes('model_provider="botc"'));
  assert.ok(text.includes('base_url="https://api.botconnector.id/v1"'));
  assert.ok(text.includes('wire_api="responses"'));
  assert.ok(text.includes('env_key="BOTCONNECTOR_API_KEY"'));
  assert.deepEqual(args.slice(-2), ['-m', 'agnes-3.0-flash']);
  assert.ok(!text.includes(KEY));
  assert.equal(codexEnv({ key: KEY, env: {} }).BOTCONNECTOR_API_KEY, KEY);
});

test('codex launch: provider flags first, user arguments after, key only in the environment', async (t) => {
  const dir = await tmpConfigDir(t);
  let seen;
  const code = await run(['--main', 'agnes-3.0-flash', 'codex', 'exec', 'say hi'], {
    stdout: sink(), stderr: sink(), env: { BCLINK_CONFIG_DIR: dir, BOTCONNECTOR_API_KEY: KEY }, platform: 'linux',
    fetchImpl: fakeFetch({ '/v1/models': MODELS, '/v1/integrations': INTEGRATIONS }),
    resolveExecutable: () => '/usr/bin/codex',
    runTool: async (o) => { seen = o; return 0; },
  });
  assert.equal(code, 0);
  assert.equal(seen.executable, '/usr/bin/codex');
  assert.deepEqual(seen.args.slice(-2), ['exec', 'say hi']);
  assert.ok(seen.args.includes('-m'));
  assert.ok(!seen.args.join(' ').includes(KEY));
  assert.equal(seen.env.BOTCONNECTOR_API_KEY, KEY);
  assert.equal(seen.env.CLAUDE_CONFIG_DIR, undefined);
});
