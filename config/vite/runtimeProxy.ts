import type { ProxyOptions } from 'vite';

const RUNTIME_REQUEST_TIMEOUT_MS = 10_000;
export const RUNTIME_TOKEN_FILE_ENV = 'WORKSPACE_RUNTIME_TOKEN_FILE';

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
