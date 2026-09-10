import path from 'node:path';

const HTTPS = 'https://';
const NPM = 'npm:';
const DENO_STD = `${HTTPS}deno.land/std`;
const ESM = `${HTTPS}esm.sh`;

const mockPath = (mocksDir: string, fileName: string): string =>
  path.resolve(mocksDir, fileName);

export function buildEdgeAliasMap(mocksDir: string): Record<string, string> {
  const projectRoot = path.resolve(mocksDir, '../../../../');
  return {
    '@reigh/editor-sdk': path.resolve(projectRoot, 'src/sdk/index.ts'),
    '@workspace-effects': path.resolve(projectRoot, 'vendor/banodoco-effects'),
    '@workspace-animations': path.resolve(projectRoot, 'vendor/banodoco-animations'),
    '@workspace-transitions': path.resolve(projectRoot, 'vendor/banodoco-transitions'),
    '@banodoco/timeline-composition/registry.generated': path.resolve(projectRoot, 'vendor/timeline-composition/typescript/src/registry.generated.ts'),
    '@banodoco/timeline-composition/theme-api': path.resolve(projectRoot, 'vendor/timeline-composition/typescript/src/theme-api.ts'),
    '@banodoco/timeline-composition': path.resolve(projectRoot, 'vendor/timeline-composition'),
    [`${DENO_STD}@0.224.0/http/server.ts`]: mockPath(mocksDir, 'denoHttpServer.ts'),
    [`${DENO_STD}@0.177.0/http/server.ts`]: mockPath(mocksDir, 'denoHttpServer.ts'),
    [`${DENO_STD}@0.168.0/http/server.ts`]: mockPath(mocksDir, 'denoHttpServer.ts'),
    [`${DENO_STD}@0.224.0/crypto/mod.ts`]: mockPath(mocksDir, 'denoCrypto.ts'),
    [`${DENO_STD}@0.177.0/crypto/mod.ts`]: mockPath(mocksDir, 'denoCrypto.ts'),
    [`${ESM}/@supabase/supabase-js@2.49.4`]: mockPath(mocksDir, 'supabaseClient.ts'),
    [`${ESM}/@supabase/supabase-js@2`]: mockPath(mocksDir, 'supabaseClient.ts'),
    [`${NPM}@supabase/supabase-js@2`]: mockPath(mocksDir, 'supabaseClient.ts'),
    [`${ESM}/stripe@12.18.0?target=deno`]: mockPath(mocksDir, 'stripe.ts'),
    [`${ESM}/@huggingface/hub@0.18.2`]: mockPath(mocksDir, 'huggingfaceHub.ts'),
  };
}
