/* eslint-disable */
// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";

// Helper for standard JSON responses with CORS headers
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    },
  });
}

serve(async (req) => {
  // CORS pre-flight
  if (req.method === "OPTIONS") {
    return jsonResponse({ ok: true });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // Initialize Supabase admin client
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    {
      auth: {
        persistSession: false,
      },
    },
  );

  // Authenticate the request
  const auth = await authenticateRequest(req, supabaseAdmin, "[TASKS-LIST]", { allowJwtUserAuth: true });

  if (!auth.success) {
    return jsonResponse({ error: auth.error || "Authentication failed" }, auth.statusCode || 401);
  }

  // Parse body
  let body: { projectId?: string; status?: string[] };
  try {
    body = await req.json();
  } catch (_err: unknown) {
    return jsonResponse({ error: "Invalid JSON payload" }, 400);
  }

  const { projectId, status: statusFilter = [] } = body;

  if (!projectId) {
    return jsonResponse({ error: "projectId is required" }, 400);
  }

  // For non-service-role requests, verify the user owns the project
  if (!auth.isServiceRole && auth.userId) {
    const { data: project, error: projectError } = await supabaseAdmin
      .from("projects")
      .select("user_id")
      .eq("id", projectId)
      .single();

    if (projectError || !project) {
      return jsonResponse({ error: "Project not found" }, 404);
    }

    if (project.user_id !== auth.userId) {
      return jsonResponse({ error: "Forbidden: You do not own this project" }, 403);
    }
  }

  try {
    // Build query
    let query = supabaseAdmin
      .from("tasks")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    // Apply status filter if provided
    if (statusFilter.length > 0) {
      query = query.in("status", statusFilter);
    }

    const { data: tasks, error } = await query;

    if (error) {
      console.error("[TASKS-LIST] Query error:", error);
      return jsonResponse({ error: "Failed to fetch tasks", details: error.message }, 500);
    }

    return jsonResponse(tasks || []);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error("[TASKS-LIST] Unexpected error:", message);
    return jsonResponse({ error: "Internal server error", details: message }, 500);
  }
}); 