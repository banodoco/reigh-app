// deno-lint-ignore-file
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

declare const Deno: { env: { get: (key: string) => string | undefined } };

/**
 * Fallback user ID used when task ownership cannot be resolved
 * (e.g., project lookup fails). Used for storage path construction
 * so files land in a known "system" folder instead of failing entirely.
 */
export const SYSTEM_USER_ID = 'system' as const;

/**
 * Authentication result for edge functions
 */
export interface AuthResult {
  isServiceRole: boolean;
  userId: string | null; // Set if user token (PAT or JWT)
  success: boolean;
  error?: string;
  statusCode?: number;
  isJwtAuth?: boolean; // True if authenticated via JWT (as opposed to PAT)
}

/**
 * Options for authenticateRequest
 */
export interface AuthOptions {
  /** If true, also accept Supabase JWTs and extract user ID from payload.sub */
  allowJwtUserAuth?: boolean;
}

export interface OwnershipVerificationResult {
  success: boolean;
  error?: string;
  statusCode?: number;
  projectId?: string;
}

interface ProjectOwnershipLogContext {
  resourceLabel?: string;
  resourceId?: string;
  forbiddenMessage?: string;
}

type ProjectOwnerLookupResult =
  | { ok: true; ownerUserId: string }
  | { ok: false; error: string; statusCode: number };

/**
 * Authenticates a request using Bearer token (Service Role Key, JWT, or PAT)
 *
 * This function handles authentication methods:
 * 1. Service Role Key - Direct match with SUPABASE_SERVICE_ROLE_KEY
 * 2. Personal Access Token (PAT) - Looked up in user_api_tokens table
 * 3. JWT User Auth (optional) - Extract user ID from JWT payload.sub
 *
 * NOTE: We intentionally do NOT accept JWTs with service_role claims.
 * Only the actual service key can be used for service role access.
 * This prevents unsigned/forged JWTs from gaining elevated privileges.
 *
 * @param req - The incoming HTTP request
 * @param supabaseAdmin - Supabase admin client for database queries
 * @param logPrefix - Optional prefix for log messages (e.g., "[FUNCTION-NAME]")
 * @param options - Optional settings for auth behavior
 * @returns AuthResult with authentication details
 */
export async function authenticateRequest(
  req: Request,
  supabaseAdmin: SupabaseClient,
  logPrefix: string = "[AUTH]",
  options: AuthOptions = {}
): Promise<AuthResult> {
  // Extract authorization header
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return {
      isServiceRole: false,
      userId: null,
      success: false,
      error: "Missing or invalid Authorization header",
      statusCode: 401
    };
  }

  const token = authHeader.slice(7); // Remove "Bearer " prefix
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!serviceKey) {
    console.error(`${logPrefix} Missing SUPABASE_SERVICE_ROLE_KEY environment variable`);
    return {
      isServiceRole: false,
      userId: null,
      success: false,
      error: "Server configuration error",
      statusCode: 500
    };
  }

  // 1) Check if token matches service-role key directly (SECURE)
  if (token === serviceKey) {
    return {
      isServiceRole: true,
      userId: null,
      success: true
    };
  }

  // 2) If JWT user auth is enabled, verify JWT and extract user ID
  if (options.allowJwtUserAuth) {
    try {
      const { data, error } = await supabaseAdmin.auth.getUser(token);
      const user = data?.user;
      if (!error && user) {
        const roleCandidate = typeof user.role === "string"
          ? user.role
          : typeof user.app_metadata?.role === "string"
            ? user.app_metadata.role
            : null;

        // Reject service/admin-role JWTs from user-auth path.
        if (!["service_role", "supabase_admin"].includes(roleCandidate ?? "") && user.id) {
          return {
            isServiceRole: false,
            userId: user.id,
            success: true,
            isJwtAuth: true
          };
        }
      }
    } catch {
      // Invalid or unverifiable JWT - continue to PAT lookup
    }
  }

  // 3) Personal Access Token (PAT) - look up in user_api_tokens table (SECURE)

  const { data, error } = await supabaseAdmin
    .from("user_api_tokens")
    .select("user_id")
    .eq("token", token)
    .single();

  if (error || !data) {
    console.error(`${logPrefix} Credential lookup failed`);
    return {
      isServiceRole: false,
      userId: null,
      success: false,
      error: "Invalid or expired token",
      statusCode: 403
    };
  }

  const userId = data.user_id;
  return {
    isServiceRole: false,
    userId,
    success: true
  };
}

async function lookupProjectOwnerUserId(
  supabaseAdmin: SupabaseClient,
  projectId: string,
  logPrefix: string,
): Promise<ProjectOwnerLookupResult> {
  const { data: projectData, error: projectError } = await supabaseAdmin
    .from("projects")
    .select("user_id")
    .eq("id", projectId)
    .single();

  if (projectError || !projectData) {
    console.error(`${logPrefix} Project lookup error:`, projectError);
    return {
      ok: false,
      error: "Project not found",
      statusCode: 404,
    };
  }

  return {
    ok: true,
    ownerUserId: projectData.user_id,
  };
}

export async function verifyProjectOwnership(
  supabaseAdmin: SupabaseClient,
  projectId: string,
  userId: string,
  logPrefix: string = "[AUTH]",
  context: ProjectOwnershipLogContext = {},
): Promise<OwnershipVerificationResult> {
  const ownerLookup = await lookupProjectOwnerUserId(supabaseAdmin, projectId, logPrefix);
  if (!ownerLookup.ok) {
    return {
      success: false,
      error: ownerLookup.error,
      statusCode: ownerLookup.statusCode,
    };
  }

  if (ownerLookup.ownerUserId !== userId) {
    const resourceLabel = context.resourceLabel ?? "Project";
    const resourceId = context.resourceId?.trim();
    if (resourceId && resourceLabel !== "Project") {
      console.error(
        `${logPrefix} ${resourceLabel} ${resourceId} belongs to project ${projectId} owned by ${ownerLookup.ownerUserId}, not user ${userId}`,
      );
    } else {
      console.error(
        `${logPrefix} Project ${projectId} is owned by ${ownerLookup.ownerUserId}, not user ${userId}`,
      );
    }
    return {
      success: false,
      error: context.forbiddenMessage ?? "Forbidden: Project does not belong to user",
      statusCode: 403,
    };
  }

  return {
    success: true,
    projectId,
  };
}

/**
 * Verifies that a user owns a specific task
 * 
 * @param supabaseAdmin - Supabase admin client
 * @param taskId - Task ID to verify
 * @param userId - User ID to check ownership
 * @param logPrefix - Optional prefix for log messages
 * @returns Object with success status and optional error details
 */
export async function verifyTaskOwnership(
  supabaseAdmin: SupabaseClient,
  taskId: string,
  userId: string,
  logPrefix: string = "[AUTH]"
): Promise<OwnershipVerificationResult> {

  // Get task and its project
  const { data: taskData, error: taskError } = await supabaseAdmin
    .from("tasks")
    .select("project_id")
    .eq("id", taskId)
    .single();

  if (taskError || !taskData) {
    console.error(`${logPrefix} Task lookup error:`, taskError);
    return {
      success: false,
      error: "Task not found",
      statusCode: 404
    };
  }

  return verifyProjectOwnership(
    supabaseAdmin,
    taskData.project_id,
    userId,
    logPrefix,
    {
      resourceLabel: "Task",
      resourceId: taskId,
      forbiddenMessage: "Forbidden: Task does not belong to user",
    },
  );
}

/**
 * Verifies that a user owns a specific shot (via its project)
 * 
 * @param supabaseAdmin - Supabase admin client
 * @param shotId - Shot ID to verify
 * @param userId - User ID to check ownership
 * @param logPrefix - Optional prefix for log messages
 * @returns Object with success status and optional error details
 */
export async function verifyShotOwnership(
  supabaseAdmin: SupabaseClient,
  shotId: string,
  userId: string,
  logPrefix: string = "[AUTH]"
): Promise<OwnershipVerificationResult> {

  // Get shot and its project
  const { data: shotData, error: shotError } = await supabaseAdmin
    .from("shots")
    .select("project_id")
    .eq("id", shotId)
    .single();

  if (shotError || !shotData) {
    console.error(`${logPrefix} Shot lookup error:`, shotError);
    return {
      success: false,
      error: "Shot not found",
      statusCode: 404
    };
  }

  return verifyProjectOwnership(
    supabaseAdmin,
    shotData.project_id,
    userId,
    logPrefix,
    {
      resourceLabel: "Shot",
      resourceId: shotId,
      forbiddenMessage: "Forbidden: Shot does not belong to user",
    },
  );
}

/**
 * Gets the user ID for a task (for service role requests)
 * 
 * @param supabaseAdmin - Supabase admin client
 * @param taskId - Task ID
 * @param logPrefix - Optional prefix for log messages
 * @returns Object with userId or error
 */
export async function getTaskUserId(
  supabaseAdmin: SupabaseClient,
  taskId: string,
  logPrefix: string = "[AUTH]"
): Promise<{ userId: string | null; error?: string; statusCode?: number }> {

  const { data: taskData, error: taskError } = await supabaseAdmin
    .from("tasks")
    .select("project_id")
    .eq("id", taskId)
    .single();

  if (taskError || !taskData) {
    console.error(`${logPrefix} Task lookup error:`, taskError);
    return {
      userId: null,
      error: "Task not found",
      statusCode: 404
    };
  }

  const ownerLookup = await lookupProjectOwnerUserId(
    supabaseAdmin,
    taskData.project_id,
    logPrefix,
  );
  if (!ownerLookup.ok) {
    // Fallback to system folder — files are stored under SYSTEM_USER_ID
    // so the task can still complete even if the project was deleted
    return {
      userId: SYSTEM_USER_ID
    };
  }

  return {
    userId: ownerLookup.ownerUserId
  };
}
