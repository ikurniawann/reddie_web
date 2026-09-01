// ============================================================
// Abstraksi multi-provider LLM.
// Semua provider menerima bentuk yang sama:
//   complete({ modelId, system, messages, maxTokens }) -> { text }
// messages: [{role:'user'|'assistant', content:string}, ...]
// ============================================================

const OPENAI_COMPAT = {
  openai:   { base: 'https://api.openai.com/v1',  keyEnv: 'OPENAI_API_KEY' },
  deepseek: { base: 'https://api.deepseek.com/v1', keyEnv: 'DEEPSEEK_API_KEY' },
  custom:   { base: process.env.CUSTOM_BASE_URL,   keyEnv: 'CUSTOM_API_KEY' },
};

async function anthropicComplete({ modelId, system, messages, maxTokens }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new ProviderError('Provider anthropic belum dikonfigurasi (ANTHROPIC_API_KEY kosong)', 503);
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: modelId, max_tokens: maxTokens, system, messages }),
    signal: AbortSignal.timeout(60_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ProviderError(data?.error?.message || `anthropic HTTP ${res.status}`, res.status);
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  return { text, toolCalls: null, raw: null };
}

async function openaiCompatComplete(provider, { modelId, system, messages, maxTokens, tools }) {
  const cfg = OPENAI_COMPAT[provider];
  const key = process.env[cfg.keyEnv];
  if (!cfg?.base || !key) throw new ProviderError(`Provider ${provider} belum dikonfigurasi (${cfg?.keyEnv} kosong)`, 503);
  const res = await fetch(`${cfg.base.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: modelId,
      max_tokens: maxTokens,
      messages: [{ role: 'system', content: system }, ...messages],
      ...(tools && tools.length ? { tools } : {}),
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ProviderError(data?.error?.message || `${provider} HTTP ${res.status}`, res.status);
  // toolCalls dikembalikan apa adanya; pemanggilnya yang memutuskan mau
  // menjalankannya atau tidak. 'raw' dibutuhkan untuk disisipkan kembali ke
  // percakapan sebelum hasil tool dikirim balik ke model.
  const msg = data.choices?.[0]?.message || {};
  return { text: msg.content ?? '', toolCalls: msg.tool_calls || null, raw: msg };
}

// Provider uji: memantulkan pesan terakhir, tanpa API key. Untuk smoke test.
async function echoComplete({ messages }) {
  const last = messages[messages.length - 1]?.content ?? '';
  return { text: `Echo dari server: "${last}"`, toolCalls: null, raw: null };
}

export class ProviderError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}

export function complete(provider, args) {
  switch (provider) {
    case 'anthropic': return anthropicComplete(args);
    case 'openai':
    case 'deepseek':
    case 'custom':    return openaiCompatComplete(provider, args);
    case 'echo':      return echoComplete(args);
    default: throw new ProviderError(`Provider tidak dikenal: ${provider}`, 400);
  }
}

// Provider dianggap siap bila API key-nya terisi (echo selalu siap)
export function providerReady(provider) {
  if (provider === 'echo') return true;
  if (provider === 'anthropic') return !!process.env.ANTHROPIC_API_KEY;
  const cfg = OPENAI_COMPAT[provider];
  return !!(cfg?.base && process.env[cfg.keyEnv]);
}
