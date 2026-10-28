import { timingSafeEqual } from "node:crypto";
import type { SocialEnv } from "./env.js";
import { header, type ApiRequest } from "./http.js";

export interface CronAuthFailure {
  status: number;
  error: string;
  allow?: string;
}

function secretMatches(provided: string, expected: string): boolean {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function cronAuthFailure(
  req: ApiRequest,
  env: SocialEnv,
): CronAuthFailure | null {
  if (req.method !== "GET" && req.method !== "POST") {
    return { status: 405, error: "method_not_allowed", allow: "GET, POST" };
  }
  if (!env.cronSecret) {
    return { status: 503, error: "social_worker_unconfigured" };
  }

  const authorization = header(req.headers, "authorization") ?? "";
  const provided =
    header(req.headers, "x-social-secret") ??
    (authorization.toLowerCase().startsWith("bearer ")
      ? authorization.slice(7).trim()
      : "");
  if (!secretMatches(provided, env.cronSecret)) {
    return { status: 401, error: "unauthorized" };
  }
  return null;
}
