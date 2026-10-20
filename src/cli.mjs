import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { parseArgv, takeFlag } from './args.mjs';
import { ApiError, DEFAULT_MODEL_FALLBACK, getIntegrations, listModels } from './api.mjs';
import { KEY_PREFIX, maskKey, readStore, resolveKey, writeStore } from './config.mjs';
import { claudeEnv, codexArgs, codexEnv, resolveExecutable, runTool } from './launch.mjs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

// OpenCode is not offered: OpenCode 2.0.32 loads custom providers only from project or global config, so the
// model cannot be pinned per launch without writing user files. See README.
const TOOLS = {
  claude: { label: 'Claude Code', executable: 'claude', install: 'pasang Claude Code dulu dengan petunjuk resmi Anthropic' },
  codex: { label: 'Codex', executable: 'codex', install: 'pasang Codex CLI dulu dengan petunjuk resmi OpenAI' },
};

export const HELP = `bclink ${pkg.version} — jalankan agen coding dengan model BotConnector

Pemakaian:
  bclink configure [--api-key KUNCI]   simpan kunci API BotConnector (divalidasi dulu)
  bclink models                        daftar model yang bisa dipakai
  bclink [--main MODEL] claude [args]  jalankan Claude Code dengan model BotConnector
  bclink [--main MODEL] codex [args]   jalankan Codex CLI dengan model BotConnector
  bclink [--api-key KUNCI] ...         pakai kunci ini untuk satu perintah saja

Urutan kunci: --api-key, lalu kunci tersimpan (configure), lalu BOTCONNECTOR_API_KEY.
Konfigurasi milik tool tidak diubah. Konfigurasi sementara dihapus setelah tool selesai.
`;

function promptKey() {
  if (!process.stdin.isTTY) return Promise.resolve(null);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return rl.question('Kunci API BotConnector: ').finally(() => rl.close());
}

export async function run(argv, deps = {}) {
  const out = deps.stdout || process.stdout;
  const err = deps.stderr || process.stderr;
  const env = deps.env || process.env;
  const platform = deps.platform || process.platform;
  const fetchImpl = deps.fetchImpl || fetch;
  const runToolImpl = deps.runTool || runTool;
  const resolveImpl = deps.resolveExecutable || resolveExecutable;
  const promptImpl = deps.prompt === undefined ? promptKey : deps.prompt;
  const fail = (message, code = 1) => { err.write(`bclink: ${message}\n`); return code; };

  let parsed;
  try { parsed = parseArgv(argv); } catch (error) { return fail(error.message, 2); }
  if (parsed.version) { out.write(`${pkg.version}\n`); return 0; }
  if (parsed.help || !parsed.command) { out.write(HELP); return 0; }

  const store = await readStore(env, platform);
  const keyFor = (flagKey) => resolveKey({ flagKey, store, env });

  try {
    if (parsed.command === 'configure') {
      const taken = takeFlag(parsed.rest, '--api-key');
      let key = parsed.apiKey || taken.value;
      if (!key) key = promptImpl ? await promptImpl() : null;
      key = (key || '').trim();
      if (!key) return fail('kunci kosong. Pakai --api-key KUNCI.', 2);
      if (!key.startsWith(KEY_PREFIX)) return fail(`kunci harus diawali ${KEY_PREFIX}.`, 2);
      await listModels(key, { fetchImpl });
      await writeStore({ ...store, apiKey: key }, env, platform);
      out.write(`Kunci tersimpan (${maskKey(key)}). Coba: bclink models\n`);
      return 0;
    }

    if (parsed.command === 'models') {
      const { key } = keyFor(parsed.apiKey);
      if (!key) return fail('belum ada kunci. Jalankan: bclink configure', 1);
      const models = await listModels(key, { fetchImpl });
      for (const m of models) {
        const access = m.botconnector_access || '-';
        const tools = m.botconnector_capabilities?.tools ? 'tools' : '';
        out.write([m.id, access, tools].filter(Boolean).join('\t') + '\n');
      }
      return 0;
    }

    const tool = TOOLS[parsed.command];
    if (!tool) return fail(`perintah '${parsed.command}' tidak dikenal.\n\n${HELP}`, 2);

    const { key } = keyFor(parsed.apiKey);
    if (!key) return fail('belum ada kunci. Jalankan: bclink configure', 1);

    const integrations = await getIntegrations({ fetchImpl }).catch(() => null);
    const defaultModel = integrations?.default_model || DEFAULT_MODEL_FALLBACK;
    const models = await listModels(key, { fetchImpl });
    const model = parsed.main || defaultModel;
    const entry = models.find((m) => m.id === model);
    if (!entry) return fail(`model '${model}' tidak ada. Jalankan: bclink models`, 2);

    const executable = resolveImpl(tool.executable, platform);
    if (!executable) return fail(`${tool.label} belum terpasang di PATH; ${tool.install}.`, 1);

    const access = entry.botconnector_access || 'model';
    err.write(`${tool.label} › ${model} (BotConnector, ${access})\n`);

    if (parsed.command === 'codex') {
      return await runToolImpl({ executable, args: [...codexArgs({ model }), ...parsed.rest], env: codexEnv({ key, env }), platform });
    }

    // A per-launch config folder, like Together Link: the user's plugins, hooks and MCP servers are not loaded
    // into this session, and the user's ~/.claude stays untouched. Removed after the session ends.
    const configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bclink-claude-'));
    try {
      const env2 = { ...claudeEnv({ key, model, env }), CLAUDE_CONFIG_DIR: configDir };
      return await runToolImpl({ executable, args: ['--model', model, ...parsed.rest], env: env2, platform });
    } finally {
      await fs.rm(configDir, { recursive: true, force: true });
    }
  } catch (error) {
    if (error instanceof ApiError) return fail(error.message, 1);
    return fail(error.message || String(error), 1);
  }
}
