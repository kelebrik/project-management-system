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
async function readLimited(
  response: Response,
  combined: AbortSignal,
  timeout: AbortSignal,
  signal?: AbortSignal,
  limit = MAX_RESPONSE_BYTES,
) {
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
      if (received > limit) {
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

/** Largest error answer we read: OpenAI's are a few hundred bytes. */
const MAX_ERROR_BYTES = 64_000;

type ProviderErrorDetail = { code: string; type: string; message: string };

/** The provider's own error code and message, if it sent them as JSON. */
async function readProviderError(response: Response, combined: AbortSignal, timeout: AbortSignal, signal?: AbortSignal) {
  const empty: ProviderErrorDetail = { code: '', type: '', message: '' };
  if (!(response.headers.get('content-type') ?? '').includes('application/json')) return empty;
  try {
    const text = await readLimited(response, combined, timeout, signal, MAX_ERROR_BYTES);
    const error = (JSON.parse(text) as { error?: Record<string, unknown> })?.error ?? {};
    const field = (value: unknown) => (typeof value === 'string' ? value : '');
    // Codes and types are short identifiers; anything else is not shown.
    const identifier = (value: unknown) => (/^[a-z0-9_.]{1,64}$/i.test(field(value)) ? field(value) : '');
    return { code: identifier(error.code), type: identifier(error.type), message: field(error.message).slice(0, 2000) };
  } catch {
    return empty;
  }
}

/** Keys can appear in provider messages ("Incorrect API key provided: sk-..."): never pass them on. */
function redact(message: string) {
  return message
    .replace(/\b(sk|rk|pk)[-_][^\s"'`,;)]*/gi, '$1-…')
    .replace(/[A-Za-z0-9_\-]{32,}/g, '…')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

/** The configured model name, when it looks like one; a mistyped secret must not be echoed. */
function modelLabel(model: string) {
  // Model names are short dotted or dashed words ("gpt-4o-mini"); a long unbroken run or a key prefix is not echoed.
  const looksLikeModel =
    /^[A-Za-z0-9._:\-/]{1,64}$/.test(model) && !/(sk|rk|pk)[-_]/i.test(model) && !/[A-Za-z0-9]{24,}/.test(model);
  return looksLikeModel ? `«${model}»` : 'из AI_MODEL';
}

/**
 * A provider error in words an administrator can act on: which setting to
 * check, whether to wait, or what the provider itself said.
 */
export function explainProviderError(status: number, detail: ProviderErrorDetail, model: string) {
  const said = detail.message ? ` Ответ поставщика: ${redact(detail.message)}` : '';
  const code = detail.code || detail.type;
  if (status === 401 || code === 'invalid_api_key') {
    return 'Поставщик модели не принял ключ API. Проверьте AI_API_KEY в настройках сервера.';
  }
  if (status === 404 || code === 'model_not_found') {
    return `Модель ${modelLabel(model)} не найдена у поставщика или недоступна для этого ключа. Проверьте название в AI_MODEL (оно должно совпадать с названием модели в API OpenAI).${said}`;
  }
  if (code === 'insufficient_quota') {
    return 'У поставщика закончились средства на счете или не подключена оплата API. Пополните баланс в кабинете OpenAI.';
  }
  if (status === 429) return `Поставщик модели ограничил частоту запросов. Повторите через минуту.${said}`;
  if (status === 403) return `Поставщик запретил доступ к модели для этого ключа, проекта или региона.${said}`;
  if (status === 400 && /response_format|json_schema/i.test(detail.message) && /not supported|unsupported/i.test(detail.message)) {
    return `Модель ${modelLabel(model)} не поддерживает ответ по JSON-схеме (structured outputs). Выберите в AI_MODEL модель, которая его поддерживает.${said}`;
  }
  if (status === 400) return `Поставщик модели отклонил запрос.${said}`;
  if (status >= 500) return `Сервис модели временно недоступен (ошибка ${status}). Повторите позже.`;
  return `Поставщик модели вернул ошибку ${status}${code ? ` (${code})` : ''}.${said}`;
}

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
    const detail = await readProviderError(response, combined, timeout, signal);
    throw new AiProviderError(explainProviderError(response.status, detail, config.model), response.status);
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
