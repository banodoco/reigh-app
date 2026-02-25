import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'
import { authenticateRequest } from "../_shared/auth.ts"
import { SystemLogger } from "../_shared/systemLogger.ts"
import { checkRateLimit, isRateLimitExceededFailure, rateLimitFailureResponse } from "../_shared/rateLimit.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Create admin client and logger early so logger is available in catch
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )
  const logger = new SystemLogger(supabaseAdmin, 'delete-project')

  try {

    const auth = await authenticateRequest(req, supabaseAdmin, "[DELETE-PROJECT]", { allowJwtUserAuth: true })
    if (!auth.success || !auth.userId) {
      return new Response(
        JSON.stringify({ error: auth.error || 'Unauthorized' }),
        { status: auth.statusCode || 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Rate limit: 10 requests per minute for this destructive operation
    const deleteProjectLimit = { maxRequests: 10, windowSeconds: 60 }
    const rateLimitResult = await checkRateLimit(
      supabaseAdmin,
      'delete-project',
      auth.userId,
      deleteProjectLimit,
      '[DELETE-PROJECT]'
    )
    if (!rateLimitResult.ok) {
      if (isRateLimitExceededFailure(rateLimitResult)) {
        logger.warn("Rate limit exceeded", { user_id: auth.userId })
        await logger.flush()
        return rateLimitFailureResponse(rateLimitResult, deleteProjectLimit)
      }

      logger.error("Rate limit check failed", {
        user_id: auth.userId,
        error_code: rateLimitResult.errorCode,
        message: rateLimitResult.message,
      })
      await logger.flush()
      return new Response(
        JSON.stringify({ error: 'Rate limit service unavailable' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (rateLimitResult.policy === 'fail_open') {
      logger.warn("Rate limit check degraded; allowing request", {
        user_id: auth.userId,
        reason: rateLimitResult.value.degraded?.reason,
        message: rateLimitResult.value.degraded?.message,
      })
    }

    // Parse request body
    const { projectId } = await req.json()
    if (!projectId) {
      return new Response(
        JSON.stringify({ error: 'Missing projectId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    logger.info('Starting deletion', { projectId, user_id: auth.userId })

    // Call the PostgreSQL function with extended timeout (5 minutes)
    // This handles large projects that would otherwise timeout due to CASCADE deletes
    const { error: deleteError } = await supabaseAdmin.rpc(
      'delete_project_with_extended_timeout',
      { p_project_id: projectId, p_user_id: auth.userId }
    )

    if (deleteError) {
      logger.error('Error deleting project', { projectId, error: deleteError.message })
      await logger.flush()
      return new Response(
        JSON.stringify({ error: `Failed to delete project: ${deleteError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    logger.info('Successfully deleted project', { projectId })

    await logger.flush()
    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    logger.error('Unexpected error', { error: err.message })
    await logger.flush()
    return new Response(
      JSON.stringify({ error: err.message || 'Unexpected error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
