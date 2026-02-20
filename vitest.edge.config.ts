import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const EDGE_UNIT_INCLUDE = [
  "supabase/functions/_shared/**/*.test.ts",
  "supabase/functions/create-task/**/*.test.ts",
  "supabase/functions/calculate-task-cost/**/*.test.ts",
  "supabase/functions/complete_task/**/*.test.ts",
  "supabase/functions/get-task-output/**/*.test.ts",
  "supabase/functions/tasks-list/**/*.test.ts",
  "supabase/functions/update-task-status/*.test.ts",
  "supabase/functions/get-orchestrator-children/**/*.test.ts",
  "supabase/functions/get-predecessor-output/**/*.test.ts",
  "supabase/functions/stripe-checkout/**/*.test.ts",
  "supabase/functions/stripe-webhook/**/*.test.ts",
  "supabase/functions/trigger-auto-topup/**/*.test.ts",
  "supabase/functions/update-worker-model/**/*.test.ts",
  "supabase/functions/huggingface-upload/**/*.test.ts",
] as const;
const EDGE_UNIT_EXCLUDE = [
  "supabase/functions/_tests/**/*.test.ts",
  "supabase/functions/complete_task/index.test.ts",
  "supabase/functions/update-task-status/index.test.ts",
  "supabase/functions/**/node_modules/**",
] as const;

export default defineConfig({
  resolve: {
    alias: {
      "https://deno.land/std@0.224.0/http/server.ts": path.resolve(
        __dirname,
        "supabase/functions/_tests/mocks/denoHttpServer.ts",
      ),
      "https://deno.land/std@0.177.0/http/server.ts": path.resolve(
        __dirname,
        "supabase/functions/_tests/mocks/denoHttpServer.ts",
      ),
      "https://deno.land/std@0.168.0/http/server.ts": path.resolve(
        __dirname,
        "supabase/functions/_tests/mocks/denoHttpServer.ts",
      ),
      "https://deno.land/std@0.177.0/crypto/mod.ts": path.resolve(
        __dirname,
        "supabase/functions/_tests/mocks/denoCrypto.ts",
      ),
      "https://esm.sh/@supabase/supabase-js@2.39.7": path.resolve(
        __dirname,
        "supabase/functions/_tests/mocks/supabaseClient.ts",
      ),
      "https://esm.sh/@supabase/supabase-js@2": path.resolve(
        __dirname,
        "supabase/functions/_tests/mocks/supabaseClient.ts",
      ),
      "npm:@supabase/supabase-js@2": path.resolve(
        __dirname,
        "supabase/functions/_tests/mocks/supabaseClient.ts",
      ),
      "https://esm.sh/stripe@12.18.0?target=deno": path.resolve(
        __dirname,
        "supabase/functions/_tests/mocks/stripe.ts",
      ),
      "https://esm.sh/@huggingface/hub@0.18.2": path.resolve(
        __dirname,
        "supabase/functions/_tests/mocks/huggingfaceHub.ts",
      ),
    },
  },
  test: {
    environment: "node",
    include: [...EDGE_UNIT_INCLUDE],
    exclude: [...EDGE_UNIT_EXCLUDE],
    globals: true,
    sequence: {
      concurrent: false,
    },
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
