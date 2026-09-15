import type { Connect, Plugin, ProxyOptions } from 'vite';

import {
  ASTRID_BRIDGE_PROTOCOL_HEADER,
  ASTRID_BRIDGE_PROTOCOL_VERSION,
  ASTRID_BRIDGE_REQUEST_TIMEOUT_MS,
} from '../../src/tools/video-editor/data/astridBridgeWire';
import { isSameOriginLoopbackRequest } from './astridProxySecurity';
import {
  ASTRID_GENERATION_COMPOSE_ROUTE,
  createAstridGenerationComposeHandler,
  type AstridGenerationComposer,
} from './astridGenerationCompose';

export const ASTRID_BRIDGE_STUB_OPT_IN_ENV = 'ASTRID_BRIDGE_ALLOW_UNAUTHENTICATED_STUB';
export const ASTRID_BRIDGE_TOKEN_ENV = 'ASTRID_BRIDGE_TOKEN';
export const ASTRID_ACP_BRIDGE_TOKEN_ENV = 'ASTRID_ACP_BRIDGE_TOKEN';
export const ASTRID_ACP_BRIDGE_PORT_ENV = 'VITE_ASTRID_ACP_BRIDGE_PORT';

export interface AstridBridgeProxyPolicy {
  readonly allowUnauthenticatedStub: boolean;
  readonly token: string | null;
  readonly acpToken: string | null;
}

export function resolveAstridBridgePort(value: string | undefined): number {
  const candidate = value ?? '17333';
  if (!/^[1-9]\d{0,4}$/.test(candidate)) {
    throw new Error('VITE_ASTRID_BRIDGE_PORT must be an integer from 1 to 65535');
  }
  const port = Number(candidate);
  if (!Number.isSafeInteger(port) || port > 65_535) {
    throw new Error('VITE_ASTRID_BRIDGE_PORT must be an integer from 1 to 65535');
  }
  return port;
}

export function resolveAstridAcpBridgePort(value: string | undefined): number {
  const candidate = value ?? '17335';
  if (!/^[1-9]\d{0,4}$/.test(candidate)) {
    throw new Error('VITE_ASTRID_ACP_BRIDGE_PORT must be an integer from 1 to 65535');
  }
  const port = Number(candidate);
  if (!Number.isSafeInteger(port) || port > 65_535) {
    throw new Error('VITE_ASTRID_ACP_BRIDGE_PORT must be an integer from 1 to 65535');
  }
  return port;
}

export function resolveAstridBridgeProxyPolicy(
  env: Readonly<Record<string, string | undefined>>,
): AstridBridgeProxyPolicy {
  const token = env[ASTRID_BRIDGE_TOKEN_ENV]?.trim() || null;
  return Object.freeze({
    allowUnauthenticatedStub: env[ASTRID_BRIDGE_STUB_OPT_IN_ENV] === '1',
    token,
    acpToken: env[ASTRID_ACP_BRIDGE_TOKEN_ENV]?.trim() || token,
  });
}

/** Headers injected by Vite's server-side proxy; the token never reaches browser code. */
export function astridBridgeUpstreamHeaders(
  policy: AstridBridgeProxyPolicy,
  token: string | null = policy.token,
): Readonly<Record<string, string>> {
  return Object.freeze({
    [ASTRID_BRIDGE_PROTOCOL_HEADER]: ASTRID_BRIDGE_PROTOCOL_VERSION,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  });
}

export function createAstridBridgeProxyOptions(
  policy: AstridBridgeProxyPolicy,
  port: number,
): ProxyOptions {
  return {
    target: `http://127.0.0.1:${port}`,
    changeOrigin: true,
    headers: astridBridgeUpstreamHeaders(policy),
    timeout: ASTRID_BRIDGE_REQUEST_TIMEOUT_MS,
    proxyTimeout: ASTRID_BRIDGE_REQUEST_TIMEOUT_MS,
    rewrite: (incomingPath) => incomingPath.replace(/^\/api\/astrid/, ''),
    configure: (proxy) => {
      proxy.on('proxyReq', (proxyRequest, incomingRequest) => {
        // A browser same-origin request can carry its app origin even though
        // it is being sent through this trusted loopback proxy. Astrid's
        // direct-origin allowlist quite correctly does not include arbitrary
        // Vite ports, so consume that header only after proving it names the
        // exact loopback app listener. Cross-origin origins remain intact and
        // are rejected by Astrid; this is not an allowlist relaxation.
        const incomingOrigin = typeof incomingRequest.headers.origin === 'string'
          ? incomingRequest.headers.origin
          : undefined;
        if (isSameOriginLoopbackRequest(incomingOrigin, incomingRequest.headers.host)) {
          proxyRequest.removeHeader('Origin');
        }
      });
    },
  };
}

/** The ACP host is a separate loopback process; REST traffic keeps its owner. */
export function createAstridAcpBridgeProxyOptions(
  policy: AstridBridgeProxyPolicy,
  port: number,
): ProxyOptions {
  return {
    target: `http://127.0.0.1:${port}`,
    changeOrigin: true,
    headers: astridBridgeUpstreamHeaders(policy, policy.acpToken),
    timeout: ASTRID_BRIDGE_REQUEST_TIMEOUT_MS,
    proxyTimeout: ASTRID_BRIDGE_REQUEST_TIMEOUT_MS,
    rewrite: (incomingPath) => incomingPath.replace(/^\/api\/astrid\/acp/, ''),
    configure: (proxy) => {
      proxy.on('proxyReq', (proxyRequest, incomingRequest) => {
        const incomingOrigin = typeof incomingRequest.headers.origin === 'string'
          ? incomingRequest.headers.origin
          : undefined;
        if (isSameOriginLoopbackRequest(incomingOrigin, incomingRequest.headers.host)) {
          proxyRequest.removeHeader('Origin');
        }
      });
    },
  };
}

/**
 * Refuse real bridge traffic unless the server has a bearer credential. The
 * committed deterministic stub is the only unauthenticated mode and requires
 * an explicit server-side opt-in.
 */
export function createAstridBridgeAuthGuard(
  policy: AstridBridgeProxyPolicy,
): Connect.NextHandleFunction {
  return (_request, response, next) => {
    if (policy.token || policy.allowUnauthenticatedStub) {
      next();
      return;
    }
    const body = JSON.stringify({
      error: 'astrid_bridge_auth_not_configured',
      detail: `${ASTRID_BRIDGE_TOKEN_ENV} is required for real Astrid bridge requests`,
    });
    response.statusCode = 503;
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader(ASTRID_BRIDGE_PROTOCOL_HEADER, ASTRID_BRIDGE_PROTOCOL_VERSION);
    response.setHeader('Content-Length', Buffer.byteLength(body));
    response.end(body);
  };
}

/** Install the same fail-closed boundary in Vite dev and production preview. */
export function createAstridBridgeAuthPlugin(
  policy: AstridBridgeProxyPolicy,
  generationComposer?: AstridGenerationComposer | null,
): Plugin {
  const register = (server: { middlewares: Connect.Server }) => {
    server.middlewares.use('/api/astrid', createAstridBridgeAuthGuard(policy));
    if (generationComposer !== undefined) {
      server.middlewares.use(
        ASTRID_GENERATION_COMPOSE_ROUTE,
        createAstridGenerationComposeHandler(generationComposer),
      );
    }
  };
  return {
    name: 'astrid-bridge-auth-boundary',
    configureServer: register,
    configurePreviewServer: register,
  };
}
