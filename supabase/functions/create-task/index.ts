import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { bootstrapEdgeHandler, NO_SESSION_RUNTIME_OPTIONS } from "../_shared/edgeHandler.ts";
import { edgeErrorResponse } from "../_shared/edgeRequest.ts";
import { jsonResponse } from "../_shared/http.ts";
import { JWT_AUTH_REQUIRED } from "../_shared/requestGuards.ts";

const RETIRED_MESSAGE = "Legacy task creation endpoint is retired; use canonical Astrid admission";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return jsonResponse({ ok: true });
  }

  const bootstrap = await bootstrapEdgeHandler(req, {
    functionName: "create-task",
    logPrefix: "[CREATE-TASK]",
    method: "POST",
    parseBody: "strict",
    corsPreflight: false,
    auth: JWT_AUTH_REQUIRED,
    ...NO_SESSION_RUNTIME_OPTIONS,
  });
  if (!bootstrap.ok) {
    return bootstrap.response;
  }

  const { logger } = bootstrap.value;
  logger.info(RETIRED_MESSAGE);
  await logger.flush();
  return edgeErrorResponse({
    errorCode: "legacy_task_endpoint_removed",
    message: RETIRED_MESSAGE,
    recoverable: false,
  }, 410);
});
