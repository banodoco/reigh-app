import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

import { authenticateRequest } from '../_shared/auth.ts';
import { SystemLogger } from '../_shared/systemLogger.ts';

import { handleCascadingTaskFailure } from './cascade.ts';
import { handleOrchestratorCancellationBilling } from './cancellationBilling.ts';
import { buildTaskUpdatePayload } from './payload.ts';
import { parseAndValidateRequest } from './request.ts';
import { validateStatusTransition } from './statusValidation.ts';
import { fetchCurrentTaskStatus, updateTaskByRole } from './taskUpdates.ts';

declare const Deno: { env: { get: (key: string) => string | undefined } };

serve(async (req) => {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');

  if (!serviceKey || !supabaseUrl) {
    console.error('[UPDATE-TASK-STATUS] Missing required environment variables');
    return new Response('Server configuration error', { status: 500 });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceKey);
  const logger = new SystemLogger(supabaseAdmin, 'update-task-status');

  if (req.method !== 'POST') {
    logger.warn('Method not allowed', { method: req.method });
    await logger.flush();
    return new Response('Method not allowed', { status: 405 });
  }

  const parseResult = await parseAndValidateRequest(req, logger);
  if (!parseResult.ok) {
    return parseResult.response;
  }

  const requestBody = parseResult.data;
  logger.setDefaultTaskId(requestBody.task_id);
  logger.info('Processing status update', {
    task_id: requestBody.task_id,
    status: requestBody.status,
  });

  const auth = await authenticateRequest(req, supabaseAdmin, '[UPDATE-TASK-STATUS]');
  if (!auth.success) {
    logger.error('Authentication failed', { error: auth.error });
    await logger.flush();
    return new Response(auth.error || 'Authentication failed', { status: auth.statusCode || 403 });
  }

  const isServiceRole = auth.isServiceRole;
  const callerId = auth.userId;

  try {
    const currentTaskResult = await fetchCurrentTaskStatus(supabaseAdmin, requestBody.task_id);
    if (currentTaskResult.error) {
      logger.error('Error checking current task status', { error: currentTaskResult.error.message });
      await logger.flush();
      return new Response(`Failed to check current task status: ${currentTaskResult.error.message}`, { status: 500 });
    }

    if (!currentTaskResult.data) {
      logger.warn('Task not found while checking current status', { task_id: requestBody.task_id });
      await logger.flush();
      return new Response('Task not found or not accessible', { status: 404 });
    }

    const transitionResponse = validateStatusTransition(
      logger,
      requestBody.task_id,
      currentTaskResult.data.status,
      requestBody.status,
    );

    if (transitionResponse) {
      await logger.flush();
      return transitionResponse;
    }

    const updatePayload = buildTaskUpdatePayload(requestBody);
    const updateResult = await updateTaskByRole(
      supabaseAdmin,
      requestBody.task_id,
      updatePayload,
      isServiceRole,
      callerId,
    );

    if (updateResult.error) {
      if (updateResult.error.message === 'User has no projects') {
        logger.error('User has no projects', { user_id: callerId ?? undefined });
        await logger.flush();
        return new Response('User has no projects', { status: 403 });
      }

      if (updateResult.error.code === 'PGRST116') {
        logger.warn('Task not found or not accessible', { task_id: requestBody.task_id });
        await logger.flush();
        return new Response('Task not found or not accessible', { status: 404 });
      }

      logger.error('Database update error', {
        task_id: requestBody.task_id,
        error: updateResult.error.message,
        code: updateResult.error.code,
      });
      await logger.flush();
      return new Response(`Database error: ${updateResult.error.message}`, { status: 500 });
    }

    if (!updateResult.data) {
      logger.warn('Task not found or not accessible (no data)', { task_id: requestBody.task_id });
      await logger.flush();
      return new Response('Task not found or not accessible', { status: 404 });
    }

    logger.info('Task status updated successfully', {
      task_id: requestBody.task_id,
      old_status: currentTaskResult.data.status,
      new_status: requestBody.status,
    });

    if (requestBody.status === 'Failed' || requestBody.status === 'Cancelled') {
      await handleCascadingTaskFailure(
        supabaseAdmin,
        logger,
        requestBody.task_id,
        requestBody.status,
        updateResult.data,
      );

      if (requestBody.status === 'Cancelled') {
        await handleOrchestratorCancellationBilling(
          supabaseAdmin,
          supabaseUrl,
          serviceKey,
          logger,
          requestBody.task_id,
          updateResult.data,
        );
      }
    }

    await logger.flush();
    return new Response(JSON.stringify({
      success: true,
      task_id: requestBody.task_id,
      status: requestBody.status,
      message: `Task status updated to '${requestBody.status}'`,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.critical('Unexpected error', { task_id: requestBody.task_id, error: message });
    await logger.flush();
    return new Response(`Internal server error: ${message}`, { status: 500 });
  }
});
