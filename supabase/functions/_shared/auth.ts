// deno-lint-ignore-file
declare const Deno: { env: { get: (key: string) => string | undefined } };

/**
 * Authentication result for edge functions
 */
interface AuthResult {
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
interface AuthOptions {
  /** If true, also accept Supabase JWTs and extract user ID from payload.sub */
  allowJwtUserAuth?: boolean;
}

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
  supabaseAdmin: unknown,
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

  // 2) If JWT user auth is enabled, try to decode JWT and extract user ID
  if (options.allowJwtUserAuth) {
    try {
      const parts = token.split(".");
      if (parts.length === 3) {
        const payloadB64 = parts[1];
        const padded = payloadB64 + "=".repeat((4 - payloadB64.length % 4) % 4);
        const payload = JSON.parse(atob(padded));

        // Check if this is a regular user JWT (not service role)
        const role = payload.role || payload.app_metadata?.role;
        if (!["service_role", "supabase_admin"].includes(role) && payload.sub) {
          return {
            isServiceRole: false,
            userId: payload.sub,
            success: true,
            isJwtAuth: true
          };
        }
      }
    } catch (e) {
      // Not a valid JWT - continue to PAT lookup
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
  supabaseAdmin: unknown,
  taskId: string,
  userId: string,
  logPrefix: string = "[AUTH]"
): Promise<{ success: boolean; error?: string; statusCode?: number; projectId?: string }> {

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

  // Check if user owns the project that this task belongs to
  const { data: projectData, error: projectError } = await supabaseAdmin
    .from("projects")
    .select("user_id")
    .eq("id", taskData.project_id)
    .single();

  if (projectError || !projectData) {
    console.error(`${logPrefix} Project lookup error:`, projectError);
    return {
      success: false,
      error: "Project not found",
      statusCode: 404
    };
  }

  if (projectData.user_id !== userId) {
    console.error(`${logPrefix} Task ${taskId} belongs to project ${taskData.project_id} owned by ${projectData.user_id}, not user ${userId}`);
    return {
      success: false,
      error: "Forbidden: Task does not belong to user",
      statusCode: 403
    };
  }

  return {
    success: true,
    projectId: taskData.project_id
  };
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
  supabaseAdmin: unknown,
  shotId: string,
  userId: string,
  logPrefix: string = "[AUTH]"
): Promise<{ success: boolean; error?: string; statusCode?: number; projectId?: string }> {

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

  // Check if user owns the project that this shot belongs to
  const { data: projectData, error: projectError } = await supabaseAdmin
    .from("projects")
    .select("user_id")
    .eq("id", shotData.project_id)
    .single();

  if (projectError || !projectData) {
    console.error(`${logPrefix} Project lookup error:`, projectError);
    return {
      success: false,
      error: "Project not found",
      statusCode: 404
    };
  }

  if (projectData.user_id !== userId) {
    console.error(`${logPrefix} Shot ${shotId} belongs to project ${shotData.project_id} owned by ${projectData.user_id}, not user ${userId}`);
    return {
      success: false,
      error: "Forbidden: Shot does not belong to user",
      statusCode: 403
    };
  }

  return {
    success: true,
    projectId: shotData.project_id
  };
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
  supabaseAdmin: unknown,
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

  const { data: projectData, error: projectError } = await supabaseAdmin
    .from("projects")
    .select("user_id")
    .eq("id", taskData.project_id)
    .single();

  if (projectError || !projectData) {
    console.error(`${logPrefix} Project lookup error:`, projectError);
    // Fallback to system folder
    return {
      userId: 'system'
    };
  }

  return {
    userId: projectData.user_id
  };
}
