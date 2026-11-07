import { DEFAULT_GEMINI_MODEL, getSecret, getSetting, normalizeGeminiModel, type Provider } from './settings';

export type ModelInfo = {
  id: string;
  name: string;
  description?: string;
  contextLength?: number;
  isFree?: boolean;
  supportsTools?: boolean;
  recommended?: boolean;
  inputPrice?: number;
  outputPrice?: number;
};

export type ProviderTestResult = {
  ok: boolean;
  provider: Provider;
  message: string;
  detail?: string;
  models?: number;
  account?: string;
  credits?: { usage?: number; limit?: number | null; remaining?: number | null; label?: string };
};

export type ChatToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ChatToolCall[];
  tool_call_id?: string;
  name?: string;
};

export type Usage = { promptTokens?: number; completionTokens?: number; totalTokens?: number; cost?: number };

const GEMINI_NATIVE = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_OPENAI = 'https://generativelanguage.googleapis.com/v1beta/openai';
const OPENROUTER = 'https://openrouter.ai/api/v1';

const GEMINI_RECOMMENDED = [
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-pro-preview',
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite'
];

const NON_CHAT_MODEL =
  /(image|tts|live|audio|embedding|robotics|veo|imagen|lyria|nano-banana|omni|transcribe|deep-research|antigravity|computer-use)/i;

function requireKey(provider: Provider) {
  const key = getSecret(provider === 'gemini' ? 'geminiKey' : 'openrouterKey');
  if (!key) {
    throw new Error(
      provider === 'gemini'
        ? 'No Gemini API key is saved. Add one in Settings → Providers.'
        : 'No OpenRouter API key is saved. Add one in Settings → Providers.'
    );
  }
  return key;
}

async function readError(response: Response, prefix: string) {
  const text = await response.text().catch(() => '');
  let message = text;
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } | string; message?: string };
    message =
      (typeof parsed.error === 'object' ? parsed.error?.message : parsed.error) ||
      parsed.message ||
      text;
  } catch {
    // Use raw text.
  }
  message = String(message || '').replace(/\s+/g, ' ').slice(0, 500);
  if (response.status === 401) message = 'Invalid or revoked API key. ' + message;
  else if (response.status === 403) message = 'Access denied for this API key. ' + message;
  else if (response.status === 429) message = 'Rate limit reached. Wait a moment or check your provider quota. ' + message;
  return new Error(`${prefix} (${response.status}): ${message || 'request failed'}`);
}

function requestTimeout(ms = 30_000) {
  return AbortSignal.timeout(ms);
}

export async function listModels(provider: Provider): Promise<ModelInfo[]> {
  return provider === 'gemini' ? listGeminiModels() : listOpenRouterModels();
}

export async function listGeminiModels(): Promise<ModelInfo[]> {
  const key = requireKey('gemini');
  const response = await fetch(`${GEMINI_NATIVE}/models?pageSize=1000`, {
    headers: { 'x-goog-api-key': key },
    signal: requestTimeout(30_000)
  });
  if (!response.ok) throw await readError(response, 'Gemini model discovery failed');
  const body = (await response.json()) as {
    models?: Array<{
      name?: string;
      displayName?: string;
      description?: string;
      inputTokenLimit?: number;
      outputTokenLimit?: number;
      supportedGenerationMethods?: string[];
    }>;
  };
  const seen = new Set<string>();
  const models: ModelInfo[] = [];
  for (const raw of body.models || []) {
    const id = String(raw.name || '').replace(/^models\//, '').trim();
    if (!id || seen.has(id)) continue;
    if (!id.startsWith('gemini-')) continue;
    if (NON_CHAT_MODEL.test(id)) continue;
    if (raw.supportedGenerationMethods && !raw.supportedGenerationMethods.includes('generateContent')) continue;
    seen.add(id);
    const recommendedIndex = GEMINI_RECOMMENDED.indexOf(id);
    models.push({
      id,
      name: raw.displayName || id,
      description: raw.description,
      contextLength: raw.inputTokenLimit,
      supportsTools: true,
      recommended: recommendedIndex >= 0,
      isFree: false
    });
  }
  models.sort((a, b) => {
    const aRank = GEMINI_RECOMMENDED.indexOf(a.id);
    const bRank = GEMINI_RECOMMENDED.indexOf(b.id);
    if (aRank !== bRank) return (aRank < 0 ? 999 : aRank) - (bRank < 0 ? 999 : bRank);
    return b.id.localeCompare(a.id, undefined, { numeric: true });
  });
  const defaultModel = normalizeGeminiModel(getSetting('geminiModel', DEFAULT_GEMINI_MODEL));
  if (!models.some(model => model.id === defaultModel)) {
    models.unshift({
      id: defaultModel,
      name: defaultModel,
      description: 'Saved model (not returned by Google for this key)',
      supportsTools: true,
      recommended: true,
      isFree: false
    });
  }
  return models;
}

export async function listOpenRouterModels(): Promise<ModelInfo[]> {
  const key = getSecret('openrouterKey');
  const response = await fetch(`${OPENROUTER}/models`, {
    headers: key ? { Authorization: 'Bearer ' + key } : {},
    signal: requestTimeout(30_000)
  });
  if (!response.ok) throw await readError(response, 'OpenRouter model discovery failed');
  const body = (await response.json()) as {
    data?: Array<{
      id?: string;
      name?: string;
      description?: string;
      context_length?: number;
      pricing?: { prompt?: string; completion?: string };
      supported_parameters?: string[];
    }>;
  };
  return (body.data || [])
    .filter(model => Boolean(model.id))
    .map(model => {
      const prompt = Number(model.pricing?.prompt);
      const completion = Number(model.pricing?.completion);
      const isFree = Boolean(model.id?.endsWith(':free')) || (prompt === 0 && completion === 0);
      return {
        id: String(model.id),
        name: model.name || String(model.id),
        description: model.description,
        contextLength: model.context_length,
        isFree,
        supportsTools: model.supported_parameters?.includes('tools'),
        inputPrice: Number.isFinite(prompt) ? prompt * 1_000_000 : undefined,
        outputPrice: Number.isFinite(completion) ? completion * 1_000_000 : undefined
      };
    })
    .sort((a, b) => Number(Boolean(b.supportsTools)) - Number(Boolean(a.supportsTools)) || a.id.localeCompare(b.id));
}

export async function testProvider(provider: Provider): Promise<ProviderTestResult> {
  try {
    if (provider === 'gemini') {
      const models = await listGeminiModels();
      const wanted = normalizeGeminiModel(getSetting('geminiModel', DEFAULT_GEMINI_MODEL));
      const exists = models.some(model => model.id === wanted);
      return {
        ok: true,
        provider,
        models: models.length,
        message: `Gemini key verified. ${models.length} text model${models.length === 1 ? '' : 's'} available.`,
        detail: exists
          ? `Active model: ${wanted}`
          : `The saved model “${wanted}” was not returned for this key. Pick another model in Settings → Models.`
      };
    }

    const key = requireKey('openrouter');
    const response = await fetch(`${OPENROUTER}/key`, {
      headers: { Authorization: 'Bearer ' + key },
      signal: requestTimeout(20_000)
    });
    if (!response.ok) throw await readError(response, 'OpenRouter key verification failed');
    const body = (await response.json()) as {
      data?: {
        label?: string;
        limit?: number | null;
        usage?: number;
        limit_remaining?: number | null;
        is_free_tier?: boolean;
      };
    };
    const data = body.data || {};
    const models = await listOpenRouterModels().catch(() => []);
    return {
      ok: true,
      provider,
      models: models.length,
      account: data.label || (data.is_free_tier ? 'OpenRouter free tier' : 'OpenRouter account'),
      message: 'OpenRouter key verified.',
      detail:
        data.limit === null || data.limit === undefined
          ? `Usage: $${Number(data.usage || 0).toFixed(4)} (no hard limit)`
          : `Usage: $${Number(data.usage || 0).toFixed(4)} of $${Number(data.limit).toFixed(2)}`,
      credits: {
        usage: data.usage,
        limit: data.limit ?? null,
        remaining: data.limit_remaining ?? null,
        label: data.label
      }
    };
  } catch (error) {
    return {
      ok: false,
      provider,
      message: error instanceof Error ? error.message : String(error)
    };
  }
}

export type StreamChatRequest = {
  provider: Provider;
  model: string;
  messages: ChatMessage[];
  tools?: unknown[];
  temperature?: number;
  autoFallback?: boolean;
  fallbackModels?: string[];
  signal?: AbortSignal;
  onDelta?: (chunk: string) => void;
  onUsage?: (usage: Usage) => void;
};

export type StreamChatResult = {
  content: string;
  toolCalls: ChatToolCall[];
  finishReason?: string;
  usage?: Usage;
};

export async function streamChat(request: StreamChatRequest): Promise<StreamChatResult> {
  const key = requireKey(request.provider);
  const isGemini = request.provider === 'gemini';
  const model = isGemini ? normalizeGeminiModel(request.model) : request.model;
  const fallback = (request.fallbackModels || []).filter(item => item && item !== model);

  const body: Record<string, unknown> = {
    model,
    messages: request.messages,
    temperature: request.temperature ?? 0.2,
    stream: true
  };
  if (request.tools?.length) {
    body.tools = request.tools;
    body.tool_choice = 'auto';
  }
  if (!isGemini && request.autoFallback !== false && fallback.length) {
    body.models = [...new Set(fallback)];
  }

  const response = await fetch(
    isGemini ? `${GEMINI_OPENAI}/chat/completions` : `${OPENROUTER}/chat/completions`,
    {
      method: 'POST',
      signal: request.signal,
      headers: {
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json',
        ...(isGemini
          ? {}
          : {
              'HTTP-Referer': 'https://github.com/nur12islam/DARKI-Code-Studio',
              'X-OpenRouter-Title': 'DARKI Code Studio'
            })
      },
      body: JSON.stringify(body)
    }
  );

  if (!response.ok) throw await readError(response, isGemini ? 'Gemini request failed' : 'OpenRouter request failed');
  if (!response.body) throw new Error('The provider returned an empty streaming response.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let finishReason: string | undefined;
  let usage: Usage | undefined;
  const calls: Record<number, ChatToolCall> = {};

  const consume = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(':') || !trimmed.startsWith('data:')) return;
    const raw = trimmed.slice(5).trim();
    if (!raw || raw === '[DONE]') return;
    let payload: {
      error?: { message?: string; code?: number };
      choices?: Array<{
        delta?: {
          content?: string | null;
          tool_calls?: Array<{
            index?: number;
            id?: string;
            type?: 'function';
            function?: { name?: string; arguments?: string | Record<string, unknown> };
          }>;
        };
        finish_reason?: string;
      }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
        cost?: number;
      };
    };
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }
    if (payload.error) throw new Error(payload.error.message || 'The model provider returned an error.');
    if (payload.usage) {
      usage = {
        promptTokens: payload.usage.prompt_tokens,
        completionTokens: payload.usage.completion_tokens,
        totalTokens: payload.usage.total_tokens,
        cost: payload.usage.cost
      };
      request.onUsage?.(usage);
    }
    const choice = payload.choices?.[0];
    if (!choice) return;
    if (choice.finish_reason) finishReason = choice.finish_reason;
    const delta = choice.delta;
    if (typeof delta?.content === 'string' && delta.content) {
      content += delta.content;
      request.onDelta?.(delta.content);
    }
    for (const item of delta?.tool_calls || []) {
      const index = item.index ?? 0;
      if (!calls[index]) {
        calls[index] = { id: '', type: 'function', function: { name: '', arguments: '' } };
      }
      if (item.id) calls[index].id = item.id;
      if (item.function?.name) calls[index].function.name += item.function.name;
      if (typeof item.function?.arguments === 'string') {
        calls[index].function.arguments += item.function.arguments;
      } else if (item.function?.arguments && typeof item.function.arguments === 'object') {
        calls[index].function.arguments = JSON.stringify(item.function.arguments);
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) consume(line);
  }
  if (buffer.trim()) consume(buffer);

  const toolCalls = Object.keys(calls)
    .map(Number)
    .sort((a, b) => a - b)
    .map(index => {
      const call = calls[index];
      if (!call.id) call.id = 'call_' + Math.random().toString(36).slice(2);
      return call;
    })
    .filter(call => Boolean(call.function.name));

  return { content, toolCalls, finishReason, usage };
}
