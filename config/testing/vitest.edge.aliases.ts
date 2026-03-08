import path from 'node:path';

export function buildEdgeAliasMap(mocksDir: string): Record<string, string> {
  return {
    'https://deno.land/std@0.224.0/http/server.ts': path.resolve(
      mocksDir,
      'denoHttpServer.ts',
    ),
    'https://deno.land/std@0.177.0/http/server.ts': path.resolve(
      mocksDir,
      'denoHttpServer.ts',
    ),
    'https://deno.land/std@0.168.0/http/server.ts': path.resolve(
      mocksDir,
      'denoHttpServer.ts',
    ),
    'https://deno.land/std@0.177.0/crypto/mod.ts': path.resolve(
      mocksDir,
      'denoCrypto.ts',
    ),
    'https://esm.sh/@supabase/supabase-js@2.39.7': path.resolve(
      mocksDir,
      'supabaseClient.ts',
    ),
    'https://esm.sh/@supabase/supabase-js@2': path.resolve(
      mocksDir,
      'supabaseClient.ts',
    ),
    'npm:@supabase/supabase-js@2': path.resolve(
      mocksDir,
      'supabaseClient.ts',
    ),
    'https://esm.sh/stripe@12.18.0?target=deno': path.resolve(
      mocksDir,
      'stripe.ts',
    ),
    'https://esm.sh/@huggingface/hub@0.18.2': path.resolve(
      mocksDir,
      'huggingfaceHub.ts',
    ),
  };
}
