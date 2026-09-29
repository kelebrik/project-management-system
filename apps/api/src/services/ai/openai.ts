import type { AiConfig } from './config.js';

type EnabledConfig = Extract<AiConfig, { enabled: true }>;

/** Largest answer we read from the provider; a normal one is a few kilobytes. */
const MAX_RESPONSE_BYTES = 2_000_000;

/** A provider failure with a message safe to show; never carries the key or the raw answer. */
export class AiProviderError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'AiProviderError';
  }
}

/**
 * Reads the body while counting bytes, so a huge or endless answer is cut off
 * instead of being buffered whole; aborts and timeouts become provider errors.
 */
async function readLimited(response: Response, combined: AbortSignal, timeout: AbortSignal, signal?: AbortSignal) {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  let received = 0;
  let text = '';
  try {
    for (;;) {
      if (combined.aborted) throw combined.reason;
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new AiProviderError('Ответ модели слишком большой');
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } catch (error) {
    if (error instanceof AiProviderError) throw error;
    if (timeout.aborted) throw new AiProviderError('Модель не ответила вовремя');
    if (signal?.aborted) throw new AiProviderError('Запрос отменен');
    throw new AiProviderError('Не удалось прочитать ответ модели');
  }
}

export type AiUsageTokens = { promptTokens: number; completionTokens: number };

/**
 * One Chat Completions call that must answer with JSON matching `schema`.
 * No tools, no browsing: the model can only return data. Redirects are refused
 * so the key is sent to the configured host only, and the answer is size- and
 * type-checked before parsing.
 */
export async function openAiStructured({
  config,
  system,
  user,
  schemaName,
  schema,
  maxCompletionTokens,
  signal,
  fetchImpl = fetch,
}: {
  config: EnabledConfig;
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
  maxCompletionTokens: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<{ content: unknown; usage: AiUsageTokens }> {
  const timeout = AbortSignal.timeout(config.timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let response: Response;
  try {
    response = await fetchImpl(new URL('chat/completions', config.baseUrl), {
      method: 'POST',
      redirect: 'error',
      signal: combined,
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        response_format: { type: 'json_schema', json_schema: { name: schemaName, strict: true, schema } },
        max_completion_tokens: maxCompletionTokens,
      }),
    });
  } catch (error) {
    if (timeout.aborted) throw new AiProviderError('Модель не ответила вовремя');
    if (signal?.aborted) throw new AiProviderError('Запрос отменен');
    throw new AiProviderError('Не удалось связаться с моделью');
  }
  if (!response.ok) {
    throw new AiProviderError(
      response.status === 429 ? 'Модель перегружена или исчерпан лимит поставщика' : `Модель вернула ошибку ${response.status}`,
      response.status,
    );
  }
  if (!(response.headers.get('content-type') ?? '').includes('application/json')) {
    throw new AiProviderError('Модель вернула ответ неожиданного типа');
  }
  const length = Number(response.headers.get('content-length') ?? 0);
  if (length > MAX_RESPONSE_BYTES) throw new AiProviderError('Ответ модели слишком большой');
  const text = await readLimited(response, combined, timeout, signal);

  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    throw new AiProviderError('Модель вернула некорректный ответ');
  }
  const usage: AiUsageTokens = {
    promptTokens: Number(body?.usage?.prompt_tokens) || 0,
    completionTokens: Number(body?.usage?.completion_tokens) || 0,
  };
  const choice = body?.choices?.[0];
  if (choice?.message?.refusal) throw Object.assign(new AiProviderError('Модель отказалась разбирать текст'), { usage });
  if (choice?.finish_reason === 'length') throw Object.assign(new AiProviderError('Ответ модели обрезан: протокол слишком длинный'), { usage });
  const content = choice?.message?.content;
  if (typeof content !== 'string') throw Object.assign(new AiProviderError('Модель вернула пустой ответ'), { usage });
  try {
    return { content: JSON.parse(content), usage };
  } catch {
    throw Object.assign(new AiProviderError('Модель вернула некорректный JSON'), { usage });
  }
}
