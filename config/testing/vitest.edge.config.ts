import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEdgeVitestTestConfig } from './vitest.edge.shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const EDGE_UNIT_INCLUDE = [
  'supabase/functions/_shared/**/*.test.ts',
  'supabase/functions/ai-prompt/**/*.test.ts',
  'supabase/functions/ai-voice-prompt/**/*.test.ts',
  'supabase/functions/broadcast-realtime/**/*.test.ts',
  'supabase/functions/calculate-task-cost/**/*.test.ts',
  'supabase/functions/claim-next-task/**/*.test.ts',
  'supabase/functions/complete-auto-topup-setup/**/*.test.ts',
  'supabase/functions/create-task/**/*.test.ts',
  'supabase/functions/delete-project/**/*.test.ts',
  'supabase/functions/discord-daily-stats/**/*.test.ts',
  'supabase/functions/generate-pat/**/*.test.ts',
  'supabase/functions/generate-thumbnail/**/*.test.ts',
  'supabase/functions/generate-upload-url/**/*.test.ts',
  'supabase/functions/get-completed-segments/**/*.test.ts',
  'supabase/functions/get-task-output/**/*.test.ts',
  'supabase/functions/get-task-status/**/*.test.ts',
  'supabase/functions/get-orchestrator-children/**/*.test.ts',
  'supabase/functions/get-predecessor-output/**/*.test.ts',
  'supabase/functions/huggingface-upload/**/*.test.ts',
  'supabase/functions/process-auto-topup/**/*.test.ts',
  'supabase/functions/setup-auto-topup/**/*.test.ts',
  'supabase/functions/grant-credits/**/*.test.ts',
  'supabase/functions/task-counts/**/*.test.ts',
  'supabase/functions/trim-video/**/*.test.ts',
  'supabase/functions/update-shot-pair-prompts/**/*.test.ts',
  'supabase/functions/complete_task/**/*.test.ts',
  'supabase/functions/tasks-list/**/*.test.ts',
  'supabase/functions/update-task-status/*.test.ts',
  'supabase/functions/stripe-checkout/**/*.test.ts',
  'supabase/functions/stripe-webhook/**/*.test.ts',
  'supabase/functions/trigger-auto-topup/**/*.test.ts',
  'supabase/functions/update-worker-model/**/*.test.ts',
] as const;

const EDGE_UNIT_EXCLUDE = [
  'supabase/functions/_tests/**/*.test.ts',
  'supabase/functions/complete_task/index.test.ts',
  'supabase/functions/update-task-status/index.test.ts',
  'supabase/functions/**/node_modules/**',
] as const;

const MOCKS_DIR = path.resolve(__dirname, '../../supabase/functions/_tests/mocks');

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../../src'),
      'https://deno.land/std@0.224.0/http/server.ts': path.resolve(
        MOCKS_DIR,
        'denoHttpServer.ts',
      ),
      'https://deno.land/std@0.177.0/http/server.ts': path.resolve(
        MOCKS_DIR,
        'denoHttpServer.ts',
      ),
      'https://deno.land/std@0.168.0/http/server.ts': path.resolve(
        MOCKS_DIR,
        'denoHttpServer.ts',
      ),
      'https://deno.land/std@0.177.0/crypto/mod.ts': path.resolve(
        MOCKS_DIR,
        'denoCrypto.ts',
      ),
      'https://esm.sh/@supabase/supabase-js@2.39.7': path.resolve(
        MOCKS_DIR,
        'supabaseClient.ts',
      ),
      'https://esm.sh/@supabase/supabase-js@2': path.resolve(
        MOCKS_DIR,
        'supabaseClient.ts',
      ),
      'npm:@supabase/supabase-js@2': path.resolve(
        MOCKS_DIR,
        'supabaseClient.ts',
      ),
      'https://esm.sh/stripe@12.18.0?target=deno': path.resolve(
        MOCKS_DIR,
        'stripe.ts',
      ),
      'https://esm.sh/stripe@14.21.0': path.resolve(
        MOCKS_DIR,
        'stripe.ts',
      ),
      'https://esm.sh/@huggingface/hub@0.18.2': path.resolve(
        MOCKS_DIR,
        'huggingfaceHub.ts',
      ),
      'npm:groq-sdk@0.26.0': path.resolve(
        MOCKS_DIR,
        'groqSdk.ts',
      ),
    },
  },
  test: createEdgeVitestTestConfig({
    include: EDGE_UNIT_INCLUDE,
    exclude: EDGE_UNIT_EXCLUDE,
  }),
});
