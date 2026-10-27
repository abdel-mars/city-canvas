import type { SocialEnv } from "./env.js";

export interface ApiRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
  url?: string;
  body?: unknown;
}

export interface ApiResponse {
  status(code: number): ApiResponse;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
  end(): void;
}

export function header(
  headers: ApiRequest["headers"],
  name: string,
): string | null {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function queryParam(req: ApiRequest, name: string): string | null {
  const fromQuery = req.query?.[name];
  if (fromQuery) return Array.isArray(fromQuery) ? fromQuery[0] ?? null : fromQuery;
  if (!req.url) return null;
  try {
    return new URL(req.url, "http://localhost").searchParams.get(name);
  } catch {
    return null;
  }
}

export function requestOrigin(req: ApiRequest, env: SocialEnv): string {
  if (env.appOrigin) return env.appOrigin;
  const host = header(req.headers, "x-forwarded-host") ?? header(req.headers, "host");
  if (host) {
    const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host);
    const proto = header(req.headers, "x-forwarded-proto") ?? (local ? "http" : "https");
    return `${proto}://${host}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "https://citylines-art.vercel.app";
}

export function corsHeaders(env: SocialEnv, methods = "POST, OPTIONS"): Record<string, string> {
  const headers: Record<string, string> = {
    Vary: "Origin",
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
  };
  if (env.appOrigin) headers["Access-Control-Allow-Origin"] = env.appOrigin;
  return headers;
}

export function sendJson(
  res: ApiResponse,
  env: SocialEnv,
  body: unknown,
  status: number,
  methods?: string,
): void {
  for (const [key, value] of Object.entries(corsHeaders(env, methods))) {
    res.setHeader(key, value);
  }
  res.status(status);
  if (status === 204) {
    res.end();
    return;
  }
  res.json(body);
}

export function readJsonBody(req: ApiRequest, maxBytes: number): unknown {
  if (typeof req.body === "string") {
    if (req.body.length > maxBytes) throw new Error("payload_too_large");
    return JSON.parse(req.body) as unknown;
  }
  if (req.body && typeof req.body === "object") {
    if (JSON.stringify(req.body).length > maxBytes) throw new Error("payload_too_large");
    return req.body;
  }
  throw new Error("invalid_json");
}
