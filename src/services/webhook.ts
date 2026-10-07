import { N8N_WEBHOOK_URL } from '../constants';
import { SoundPriority } from '../types';

export interface SoundEventPayload {
  mode: 'sound_event';
  sound: string;
  priority: SoundPriority;
  time: string; // ISO time;
  confidence?: number;
}

export interface TextToSignPayload {
  mode: 'text_to_sign';
  text: string;
}

export interface WebhookResult {
  success: boolean;
  isJson?: boolean;
  status?: number | string;
  snippet?: string;
  message?: string;
  data?: unknown;
  error?: string;
}

/**
 * 10-second fetch wrapper directly calling https://bonu.app.n8n.cloud/webhook/nadasakhi from the browser.
 * If the request fails, times out after 10s, or does not return JSON,
 * provides friendly message ("Server unreachable, using offline mode") and details snippet (first 300 chars).
 */
export async function postWebhookJson<T = unknown>(
  body: Record<string, unknown>,
  timeoutMs: number = 10000
): Promise<WebhookResult & { data?: T }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const responseText = await response.text();
    const snippet = responseText.slice(0, 300) || '(Empty response body)';

    let parsedJson: unknown = null;
    let isJson = false;
    try {
      parsedJson = JSON.parse(responseText);
      isJson = true;
    } catch {
      isJson = false;
    }

    if (!response.ok) {
      return {
        success: false,
        isJson,
        status: response.status,
        snippet,
        message: 'Server unreachable, using offline mode',
        error: `HTTP error ${response.status}`,
      };
    }

    if (!isJson) {
      return {
        success: false,
        isJson: false,
        status: response.status,
        snippet,
        message: 'Server unreachable, using offline mode',
        error: 'Response was not valid JSON',
      };
    }

    return {
      success: true,
      isJson: true,
      status: response.status,
      snippet,
      message: 'Delivered successfully',
      data: parsedJson as T,
    };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const isAbort = (err as { name?: string })?.name === 'AbortError';
    const errMsg = isAbort ? 'Request timed out after 10 seconds' : (err instanceof Error ? err.message : String(err));
    return {
      success: false,
      isJson: false,
      status: isAbort ? 'Timeout (10s)' : 'Network Error',
      snippet: errMsg.slice(0, 300),
      message: 'Server unreachable, using offline mode',
      error: errMsg,
    };
  }
}

/**
 * Sends a sound_event webhook call with 10-second timeout.
 * Body: {"mode":"sound_event","sound":"<name>","priority":"<critical|medium|low>","time":"<ISO time>"}
 */
export async function sendSoundEventWebhook(
  soundName: string,
  priority: SoundPriority = 'critical',
  isoTime?: string,
  confidence?: number
): Promise<WebhookResult> {
  const payload: SoundEventPayload = {
    mode: 'sound_event',
    sound: soundName.trim().toUpperCase(),
    priority: priority,
    time: isoTime || new Date().toISOString(),
    ...(typeof confidence === 'number' ? { confidence: Math.round(confidence * 100) / 100 } : {}),
  };

  return await postWebhookJson(payload as unknown as Record<string, unknown>, 10000);
}

/**
 * Sends a text_to_sign webhook call with 10-second timeout.
 * Body: {"mode":"text_to_sign","text":"<English text>"}
 */
export async function sendTextToSignWebhook(
  englishText: string
): Promise<WebhookResult> {
  const payload: TextToSignPayload = {
    mode: 'text_to_sign',
    text: englishText,
  };

  return await postWebhookJson(payload as unknown as Record<string, unknown>, 10000);
}
