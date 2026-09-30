import type { ProxyOptions } from 'vite';

const RUNTIME_REQUEST_TIMEOUT_MS = 10_000;
// Server-only input. Vite exposes only VITE_-prefixed values to browser code.
// The launcher sets these bytes only after Runtime authenticates the bearer.
export const RUNTIME_TOKEN_ENV = 'WORKSPACE_RUNTIME_TOKEN';

export function createWorkspaceRuntimeProxyOptions(
  target: string,
  token: string | null,
): ProxyOptions {
  return {
    target,
    changeOrigin: true,
    timeout: RUNTIME_REQUEST_TIMEOUT_MS,
    proxyTimeout: RUNTIME_REQUEST_TIMEOUT_MS,
    rewrite: (incomingPath) => incomingPath.replace(/^\/api\/runtime/, ''),
    ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
  };
}
