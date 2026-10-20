export const BASE_URL = 'https://api.botconnector.id';
export const DEFAULT_MODEL_FALLBACK = 'agnes-3.0-flash';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function getJson(url, { key, fetchImpl = fetch, timeoutMs = 30000 }) {
  const headers = { accept: 'application/json' };
  if (key) headers.authorization = `Bearer ${key}`;
  let res;
  try {
    res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    throw new ApiError(`Tidak bisa menghubungi ${new URL(url).host}: ${error.message}`, 0);
  }
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { /* keep null */ }
  if (res.status === 401) throw new ApiError('Kunci API BotConnector tidak valid. Jalankan bclink configure.', 401);
  if (!res.ok) throw new ApiError(`BotConnector menjawab HTTP ${res.status}.`, res.status);
  return body;
}

export async function listModels(key, opts = {}) {
  const body = await getJson(`${BASE_URL}/v1/models`, { ...opts, key });
  return (body && body.data) || [];
}

// Public manifest: base URL, key prefix, and the default model. No key needed.
export async function getIntegrations(opts = {}) {
  return getJson(`${BASE_URL}/v1/integrations`, { ...opts, key: null });
}

// GET /v1/usage is not in the public docs yet. It returns plan quota windows and the PAYG balance as a snapshot.
export async function getUsage(key, opts = {}) {
  return getJson(`${BASE_URL}/v1/usage`, { timeoutMs: 10000, ...opts, key });
}
