// deno-lint-ignore-file
import { edgeErrorResponse } from './edgeRequest.ts';
import {
  operationSuccess,
  type OperationFailure,
  type OperationResult,
} from './edgeOperation.ts';

/**
 * Rate limiting configuration
 */
interface RateLimitConfig {
  /** Maximum requests allowed in the window */
  maxRequests: number;
  /** Time window in seconds */
  windowSeconds: number;
}

/**
 * Rate limit check result
 */
interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfter?: number; // seconds until reset
  degraded?: {
    reason: RateLimitFailureReason;
    message: string;
    cause?: unknown;
  };
}

type DeniedRateLimitResult = Omit<RateLimitResult, 'allowed'> & { allowed: false };

/**
 * Default rate limit configs for different function types
 */
export const RATE_LIMITS = {
  // Unauthenticated/webhook endpoints - stricter
  webhook: { maxRequests: 100, windowSeconds: 60 },
  
  // Authenticated user actions - moderate  
  userAction: { maxRequests: 60, windowSeconds: 60 },
  
  // Expensive operations (AI, payments)
  expensive: { maxRequests: 30, windowSeconds: 60 },
  
  // Task creation - lenient (users create many tasks in bursts)
  taskCreation: { maxRequests: 120, windowSeconds: 60 },
  
  // Read operations - lenient
  read: { maxRequests: 120, windowSeconds: 60 },
};

/**
 * Check rate limit for a request
 * Uses database-backed sliding window counter
 * 
 * @param supabaseAdmin - Supabase admin client
 * @param functionName - Name of the function being rate limited
 * @param identifier - User ID or IP address
 * @param config - Rate limit configuration
 * @param logPrefix - Optional log prefix
 * @returns Rate limit check result
 */
interface SupabaseAdminClient {
  rpc: (fn: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
}

interface RateLimitRpcPayload {
  allowed: boolean;
  count: number;
  reset_at: string;
}

type RateLimitFailureReason = 'rpc_error' | 'runtime_error' | 'invalid_rpc_payload';

function failOpenRateLimit(
  now: Date,
  config: RateLimitConfig,
  reason: RateLimitFailureReason,
  message: string,
  cause: unknown,
): RateLimitResult {
  return {
    allowed: true,
    remaining: config.maxRequests,
    resetAt: new Date(now.getTime() + config.windowSeconds * 1000),
    degraded: {
      reason,
      message,
      cause,
    },
  };
}

function parseRateLimitRpcPayload(data: unknown): RateLimitRpcPayload | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return null;
  }
  const record = data as Record<string, unknown>;
  if (typeof record.allowed !== 'boolean') {
    return null;
  }
  if (typeof record.count !== 'number' || !Number.isFinite(record.count) || record.count < 0) {
    return null;
  }
  if (typeof record.reset_at !== 'string') {
    return null;
  }
  const resetAt = new Date(record.reset_at);
  if (Number.isNaN(resetAt.getTime())) {
    return null;
  }
  return {
    allowed: record.allowed,
    count: Math.trunc(record.count),
    reset_at: record.reset_at,
  };
}

export async function checkRateLimit(
  supabaseAdmin: SupabaseAdminClient,
  functionName: string,
  identifier: string,
  config: RateLimitConfig,
  logPrefix: string = "[RATE-LIMIT]"
): Promise<OperationResult<RateLimitResult>> {
  const now = new Date();
  const key = `${functionName}:${identifier}`;
  
  try {
    // Use upsert with atomic increment via RPC function
    // This handles race conditions properly
    const { data, error } = await supabaseAdmin.rpc('check_rate_limit', {
      p_key: key,
      p_window_seconds: config.windowSeconds,
      p_max_requests: config.maxRequests
    });
    
    if (error) {
      const message = `${logPrefix} Rate limit RPC error for key "${key}"`;
      const fallback = failOpenRateLimit(
        now,
        config,
        'rpc_error',
        message,
        error,
      );
      console.error(`${logPrefix} Rate limit RPC error for key "${key}" (allowing request):`, error);
      return operationSuccess(fallback, { policy: 'fail_open' });
    }

    const result = parseRateLimitRpcPayload(data);
    if (!result) {
      const message = `${logPrefix} Invalid rate limit RPC payload for key "${key}"`;
      const fallback = failOpenRateLimit(
        now,
        config,
        'invalid_rpc_payload',
        message,
        data,
      );
      console.error(`${logPrefix} Invalid rate limit RPC payload for key "${key}" (allowing request):`, data);
      return operationSuccess(fallback, { policy: 'fail_open' });
    }

    const resetAt = new Date(result.reset_at);
    const remaining = Math.max(0, config.maxRequests - result.count);
    
    if (!result.allowed) {
      const retryAfter = Math.max(0, Math.ceil((resetAt.getTime() - now.getTime()) / 1000));
      return operationSuccess({
        allowed: false,
        remaining: 0,
        resetAt,
        retryAfter,
      }, {
        policy: 'fail_closed',
      });
    }
    
    return operationSuccess(
      {
        allowed: true,
        remaining,
        resetAt,
      },
      { policy: 'best_effort' },
    );
  } catch (err) {
    const message = `${logPrefix} Rate limit runtime error for key "${key}"`;
    const fallback = failOpenRateLimit(
      now,
      config,
      'runtime_error',
      message,
      err,
    );
    console.error(`${logPrefix} Rate limit error for key "${key}" (allowing request):`, err);
    return operationSuccess(fallback, { policy: 'fail_open' });
  }
}

/**
 * Create rate limit headers for response
 */
function rateLimitHeaders(result: RateLimitResult, config: RateLimitConfig): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': config.maxRequests.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': Math.floor(result.resetAt.getTime() / 1000).toString(),
  };
  
  if (result.retryAfter) {
    headers['Retry-After'] = result.retryAfter.toString();
  }
  
  return headers;
}

/**
 * Create a 429 Too Many Requests response
 */
export function rateLimitResponse(result: RateLimitResult, config: RateLimitConfig): Response {
  const retryAfterSuffix = typeof result.retryAfter === 'number' && result.retryAfter > 0
    ? ` Please wait ${result.retryAfter} seconds before retrying.`
    : ' Please retry shortly.';
  return edgeErrorResponse(
    {
      errorCode: 'rate_limit_exceeded',
      message: `Rate limit exceeded.${retryAfterSuffix}`,
      recoverable: true,
      retryAfter: result.retryAfter,
    },
    429,
    rateLimitHeaders(result, config),
  );
}

function fallbackDeniedResult(config: RateLimitConfig): RateLimitResult {
  const now = new Date();
  return {
    allowed: false,
    remaining: 0,
    resetAt: new Date(now.getTime() + config.windowSeconds * 1000),
    retryAfter: config.windowSeconds,
  };
}

function extractDeniedResultFromFailure(
  failure: OperationFailure,
  config: RateLimitConfig,
): RateLimitResult {
  const decision = (failure.cause as { decision?: unknown } | undefined)?.decision;
  if (decision && typeof decision === 'object' && !Array.isArray(decision)) {
    const record = decision as Partial<RateLimitResult>;
    if (
      record.allowed === false
      && record.resetAt instanceof Date
      && typeof record.remaining === 'number'
    ) {
      return {
        allowed: false,
        remaining: record.remaining,
        resetAt: record.resetAt,
        retryAfter: record.retryAfter,
      };
    }
  }
  return fallbackDeniedResult(config);
}

export function isRateLimitExceededFailure(result: OperationResult<RateLimitResult>): boolean {
  if (result.ok) {
    return result.value.allowed === false;
  }
  return result.errorCode === 'rate_limit_exceeded';
}

export function rateLimitFailureResponse(
  result: OperationFailure | DeniedRateLimitResult,
  config: RateLimitConfig,
): Response {
  if ('allowed' in result) {
    return rateLimitResponse(result, config);
  }
  return rateLimitResponse(extractDeniedResultFromFailure(result, config), config);
}
