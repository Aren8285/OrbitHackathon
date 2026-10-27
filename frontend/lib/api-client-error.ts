/**
 * Low-level fetch helper used by every API module.
 *
 * Single origin: `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`).
 */

export type ApiFetchOptions = RequestInit & {
  /** Override the base URL for a single call (e.g. testing). */
  baseUrl?: string;
};

const BASE_URL =
  typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_API_URL
    ? process.env.NEXT_PUBLIC_API_URL
    : 'http://localhost:8000';

export async function apiFetch<T>(
  path: string,
  opts?: ApiFetchOptions,
): Promise<T> {
  const base = opts?.baseUrl ?? BASE_URL;
  const response = await fetch(`${base}${path}`, {
    ...opts,
    headers: {
      'accept': 'application/json',
      ...opts?.headers,
    },
  });

  if (!response.ok) {
    let detail = `Request failed: ${response.status}`;
    try {
      const body = (await response.json()) as { detail?: unknown };
      detail = body.detail ? String(body.detail) : detail;
    } catch {
      // fallback: keep the status-based message
    }
    const error: ApiErrorPayload = {
      message: detail,
      status: response.status,
      url: `${base}${path}`,
    };
    throw error;
  }

  // JSON responses may be empty (e.g. 204); defend here.
  const text = await response.text();
  if (text === '') {
    return {} as T;
  }
  return JSON.parse(text) as T;
}

/**
 * POST helper with JSON body. Used by mutation endpoints.
 */
export async function apiFetchJson<T>(
  path: string,
  payload: unknown,
  opts?: ApiFetchOptions,
): Promise<T> {
  return apiFetch<T>(path, {
    ...opts,
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...opts?.headers,
    },
    body: JSON.stringify(payload),
  });
}

/**
 * Simple exponential backoff fetch. Used by pages that poll for completion
 * (e.g. simulation run) but not inside the hot client path.
 */
export async function fetchWithBackoff<T>(
  path: string,
  opts?: ApiFetchOptions & { maxRetries?: number; baseMs?: number },
): Promise<T> {
  const maxRetries = opts?.maxRetries ?? 4;
  const baseMs = opts?.baseMs ?? 250;

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await apiFetch<T>(path, opts);
    } catch (err) {
      lastError = err;
      if (attempt === maxRetries) {
        throw err;
      }
      await sleep(baseMs * Math.pow(2, attempt));
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Map a thrown API payload (or any Error) into a user-facing string.
 *
 * Pages use this when they want to render a single error notice. It is
 * deliberately coarse: the UI owns retry / recovery, not this helper.
 */
export function mapApiError(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    const payload = err as ApiErrorPayload;
    if (typeof payload.message === 'string' && payload.message.length > 0) {
      return payload.message;
    }
  }
  if (err instanceof Error) {
    return err.message;
  }
  return 'Request failed. Is the backend running on localhost:8000?';
}

export interface ApiErrorPayload {
  message: string;
  status: number;
  url: string;
}
