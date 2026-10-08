import { readFileSync } from 'node:fs';
import { createServer, request as requestHttp } from 'node:http';
import { URL } from 'node:url';

const discoveryPath = process.env.ASTRID_WORKSPACE_DISCOVERY?.trim();
const port = Number(process.env.ASTRID_RUNTIME_PROXY_PORT ?? '17336');
const REQUEST_TIMEOUT_MS = 10_000;

function fail(message) {
  return { status: 503, body: JSON.stringify({
    code: 'runtime_unavailable',
    message,
  }) };
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`cannot read ${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function readToken(path) {
  const raw = readFileSync(path, 'utf8').trim();
  if (!raw) throw new Error('runtime credential is empty');
  if (!raw.startsWith('{')) return raw;
  const parsed = JSON.parse(raw);
  if (typeof parsed?.token !== 'string' || !parsed.token.trim()) {
    throw new Error('runtime credential has no token');
  }
  return parsed.token.trim();
}

function currentRuntime() {
  if (!discoveryPath) throw new Error('ASTRID_WORKSPACE_DISCOVERY is not configured');
  const discovery = readJson(discoveryPath, 'runtime discovery');
  const endpoint = new URL(String(discovery.endpoint ?? ''));
  if (endpoint.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(endpoint.hostname) || !endpoint.port) {
    throw new Error('runtime discovery endpoint must be an explicit HTTP loopback URL');
  }
  const credentialFile = String(discovery.credential_file ?? '').trim();
  if (!credentialFile) throw new Error('runtime discovery has no credential file');
  return { endpoint, token: readToken(credentialFile) };
}

function writeFailure(response, failure) {
  if (response.headersSent) {
    response.destroy();
    return;
  }
  response.writeHead(failure.status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json',
  });
  response.end(failure.body);
}

const server = createServer((incoming, response) => {
  let runtime;
  try {
    runtime = currentRuntime();
  } catch (error) {
    writeFailure(response, fail(error instanceof Error ? error.message : String(error)));
    return;
  }

  const headers = { ...incoming.headers };
  delete headers.host;
  delete headers.authorization;
  headers.authorization = `Bearer ${runtime.token}`;

  const upstream = requestHttp({
    hostname: runtime.endpoint.hostname,
    port: Number(runtime.endpoint.port),
    method: incoming.method,
    path: incoming.url || '/',
    headers,
    timeout: REQUEST_TIMEOUT_MS,
  }, (upstreamResponse) => {
    response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
    upstreamResponse.pipe(response);
  });

  upstream.on('timeout', () => upstream.destroy(new Error('runtime request timed out')));
  upstream.on('error', (error) => writeFailure(response, fail(`runtime request failed: ${error.message}`)));
  incoming.on('aborted', () => upstream.destroy());
  incoming.pipe(upstream);
});

server.on('error', (error) => {
  console.error(`runtime discovery proxy failed: ${error.message}`);
  process.exitCode = 1;
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Runtime discovery proxy listening on 127.0.0.1:${port}`);
});
