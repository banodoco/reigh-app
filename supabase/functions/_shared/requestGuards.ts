import { jsonResponse } from "./http.ts";

interface GuardAuth {
  isServiceRole: boolean;
  userId: string | null;
}

interface GuardLogger {
  error: (message: string, context?: Record<string, unknown>) => void;
}

interface UserGuardResult {
  ok: true;
  userId: string;
}

interface ServiceGuardResult {
  ok: true;
}

interface GuardFailure {
  ok: false;
  response: Response;
}

type GuardResult<T> = T | GuardFailure;

export const JWT_AUTH_REQUIRED = {
  required: true,
  options: { allowJwtUserAuth: true },
} as const;

export function authenticationFailedResponse(logger: GuardLogger): Response {
  logger.error("Authentication failed");
  return jsonResponse({ error: "Authentication failed" }, 401);
}

export function ensureTaskActor(
  auth: GuardAuth | null | undefined,
  logger: GuardLogger,
): GuardResult<{ ok: true }> {
  if (auth && (auth.userId || auth.isServiceRole)) {
    return { ok: true };
  }
  return { ok: false, response: authenticationFailedResponse(logger) };
}

export function ensureUserAuth(
  auth: GuardAuth | null | undefined,
  logger: GuardLogger,
): GuardResult<UserGuardResult> {
  if (auth?.userId) {
    return { ok: true, userId: auth.userId };
  }
  return { ok: false, response: authenticationFailedResponse(logger) };
}

export function ensureServiceRoleAuth(
  auth: GuardAuth | null | undefined,
  logger: GuardLogger,
): GuardResult<ServiceGuardResult> {
  if (auth?.isServiceRole) {
    return { ok: true };
  }
  return { ok: false, response: authenticationFailedResponse(logger) };
}

export function normalizeTaskId(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  return "";
}
