export const DEFAULT_MODEL = process.env.LLM_MODEL || 'gpt-4.1-mini';
export const FAST_MODEL = process.env.LLM_FAST_MODEL || DEFAULT_MODEL;
export const VISION_MODEL = process.env.LLM_VISION_MODEL || DEFAULT_MODEL;

export interface ContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string; detail?: 'high' | 'low' | 'auto' };
}

export interface ChatMessageInput {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}

interface ModelOptions {
  model?: string;
  temperature?: number;
  signal?: AbortSignal;
}

function endpoint(): string {
  const base = (process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  return `${base}/chat/completions`;
}

function headers(): HeadersInit {
  const key = process.env.LLM_API_KEY?.trim();
  return {
    'Content-Type': 'application/json',
    ...(key ? { Authorization: `Bearer ${key}` } : {}),
  };
}

function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object' && 'text' in part) {
        return typeof part.text === 'string' ? part.text : '';
      }
      return '';
    })
    .join('');
}

export async function invokeModel(
  messages: ChatMessageInput[],
  options: ModelOptions = {},
): Promise<string> {
  const response = await fetch(endpoint(), {
    method: 'POST',
    headers: headers(),
    signal: options.signal,
    body: JSON.stringify({
      model: options.model || DEFAULT_MODEL,
      messages,
      temperature: options.temperature ?? 0.7,
      stream: false,
    }),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 800);
    throw new Error(`Model request failed (${response.status}): ${detail || response.statusText}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  return extractText(data.choices?.[0]?.message?.content);
}

export async function invokeVisionModel(
  prompt: string,
  imageDataUris: string[],
  options: ModelOptions = {},
): Promise<string> {
  const content: ContentPart[] = [{ type: 'text', text: prompt }];
  for (const uri of imageDataUris) {
    content.push({ type: 'image_url', image_url: { url: uri, detail: 'high' } });
  }
  return invokeModel(
    [{ role: 'user', content }],
    { ...options, model: options.model || VISION_MODEL, temperature: options.temperature ?? 0.3 },
  );
}

export function streamModelChat(
  messages: ChatMessageInput[],
  options: ModelOptions = {},
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const response = await fetch(endpoint(), {
          method: 'POST',
          headers: headers(),
          signal: options.signal,
          body: JSON.stringify({
            model: options.model || DEFAULT_MODEL,
            messages,
            temperature: options.temperature ?? 0.7,
            stream: true,
          }),
        });

        if (!response.ok || !response.body) {
          const detail = (await response.text()).slice(0, 800);
          throw new Error(`Model request failed (${response.status}): ${detail || response.statusText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const payload = trimmed.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;
            try {
              const chunk = JSON.parse(payload) as {
                choices?: Array<{ delta?: { content?: unknown } }>;
              };
              const text = extractText(chunk.choices?.[0]?.delta?.content);
              if (text) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: text })}\n\n`));
              }
            } catch {
              // Ignore non-JSON keepalive events from compatible providers.
            }
          }
        }

        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (error) {
        if (options.signal?.aborted) {
          controller.close();
          return;
        }
        const message = error instanceof Error ? error.message : 'Model request failed';
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`));
        controller.close();
      }
    },
  });
}
