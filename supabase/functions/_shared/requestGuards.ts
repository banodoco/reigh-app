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

interface StoragePathGuardResult {
  ok: true;
  storagePath: string;
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

export function ensureOwnedStoragePath(
  storagePath: unknown,
  userId: string,
  logger: GuardLogger,
): GuardResult<StoragePathGuardResult> {
  const normalizedPath =
    typeof storagePath === "string"
      ? storagePath.trim().replace(/^\/+/, "").replace(/\/+$/, "")
      : "";

  if (!normalizedPath) {
    logger.error("Invalid storage path", { storagePath });
    return {
      ok: false,
      response: jsonResponse({ error: "Invalid storage path" }, 400),
    };
  }

  const segments = normalizedPath.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    logger.error("Invalid storage path segments", { storagePath: normalizedPath });
    return {
      ok: false,
      response: jsonResponse({ error: "Invalid storage path" }, 400),
    };
  }

  if (segments[0] !== userId) {
    logger.error("Storage path ownership mismatch", {
      storagePath: normalizedPath,
      userId,
    });
    return {
      ok: false,
      response: jsonResponse(
        { error: "Forbidden: storage path does not belong to authenticated user" },
        403,
      ),
    };
  }

  return {
    ok: true,
    storagePath: normalizedPath,
  };
}
