const REQUEST_TIMEOUT_MS = 15_000;

export type JsonRecord = Record<string, unknown>;

export function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

export function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function readJson(response: Response): Promise<JsonRecord> {
  try {
    return asRecord(await response.json());
  } catch {
    return {};
  }
}

function requestSignal(timeoutMs: number): AbortSignal {
  if (typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(timeoutMs);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs) as unknown;
  if (timer && typeof timer === "object" && "unref" in timer) {
    (timer as { unref: () => void }).unref();
  }
  return controller.signal;
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  return fetch(url, { ...init, signal: requestSignal(timeoutMs) });
}
