// deno-lint-ignore-file

/**
 * Rate limiting configuration
 */
interface RateLimitConfig {
  /** Maximum requests allowed in the window */
  maxRequests: number;
  /** Time window in seconds */
  windowSeconds: number;
  /** Identifier type: 'ip', 'user', or 'combined' */
  identifierType: 'ip' | 'user' | 'combined';
}

/**
 * Rate limit check result
 */
interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfter?: number; // seconds until reset
}

/**
 * Default rate limit configs for different function types
 */
export const RATE_LIMITS = {
  // Unauthenticated/webhook endpoints - stricter
  webhook: { maxRequests: 100, windowSeconds: 60, identifierType: 'ip' as const },
  
  // Authenticated user actions - moderate  
  userAction: { maxRequests: 60, windowSeconds: 60, identifierType: 'user' as const },
  
  // Expensive operations (AI, payments)
  expensive: { maxRequests: 30, windowSeconds: 60, identifierType: 'user' as const },
  
  // Task creation - lenient (users create many tasks in bursts)
  taskCreation: { maxRequests: 120, windowSeconds: 60, identifierType: 'user' as const },
  
  // Read operations - lenient
  read: { maxRequests: 120, windowSeconds: 60, identifierType: 'user' as const },
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
export async function checkRateLimit(
  supabaseAdmin: unknown,
  functionName: string,
  identifier: string,
  config: RateLimitConfig,
  logPrefix: string = "[RATE-LIMIT]"
): Promise<RateLimitResult> {
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
      // If the RPC doesn't exist yet, fall through to allow (fail open)
      return {
        allowed: true,
        remaining: config.maxRequests,
        resetAt: new Date(now.getTime() + config.windowSeconds * 1000)
      };
    }
    
    const result = data as { allowed: boolean; count: number; reset_at: string };
    const resetAt = new Date(result.reset_at);
    const remaining = Math.max(0, config.maxRequests - result.count);
    
    if (!result.allowed) {
      const retryAfter = Math.ceil((resetAt.getTime() - now.getTime()) / 1000);
      return {
        allowed: false,
        remaining: 0,
        resetAt,
        retryAfter
      };
    }
    
    return {
      allowed: true,
      remaining,
      resetAt
    };
  } catch (err) {
    // Fail open - don't block requests if rate limiting fails
    console.error(`${logPrefix} Rate limit error (allowing request):`, err);
    return {
      allowed: true,
      remaining: config.maxRequests,
      resetAt: new Date(now.getTime() + config.windowSeconds * 1000)
    };
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
  return new Response(
    JSON.stringify({
      error: 'Too many requests',
      retryAfter: result.retryAfter,
      message: `Rate limit exceeded. Please wait ${result.retryAfter} seconds before retrying.`
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        ...rateLimitHeaders(result, config)
      }
    }
  );
}
