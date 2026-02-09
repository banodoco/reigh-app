// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { authenticateRequest } from "../_shared/auth.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any;

/**
 * Edge function: get-task-status
 *
 * Returns the current status of a task by ID.
 * Read-only, no side effects.
 *
 * POST /functions/v1/get-task-status
 * Headers: Authorization: Bearer <service-key or PAT>
 * Body: { "task_id": "uuid" }
 *
 * Returns:
 * - 200 OK with { status }
 * - 400 Bad Request if task_id missing
 * - 404 Not Found if task doesn't exist
 */
serve(async (req) => {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");

  if (!serviceKey || !supabaseUrl) {
    return new Response("Server configuration error", { status: 500 });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceKey);

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let requestBody: any = {};
  try {
    const bodyText = await req.text();
    if (bodyText) {
      requestBody = JSON.parse(bodyText);
    }
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const taskId = requestBody.task_id;
  if (!taskId) {
    return new Response("task_id is required", { status: 400 });
  }

  const auth = await authenticateRequest(req, supabaseAdmin, "[GET-TASK-STATUS]");
  if (!auth.success) {
    return new Response(auth.error || "Authentication failed", { status: auth.statusCode || 403 });
  }

  try {
    const { data: task, error } = await supabaseAdmin
      .from("tasks")
      .select("status")
      .eq("id", taskId)
      .single();

    if (error || !task) {
      return new Response("Task not found", { status: 404 });
    }

    return new Response(JSON.stringify({ status: task.status }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(`Internal server error: ${error?.message}`, { status: 500 });
  }
});
