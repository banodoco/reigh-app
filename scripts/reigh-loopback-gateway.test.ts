import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { createLoopbackGateway, allowedAcpRoute, allowedRoute, loopbackEndpoint } from './reigh-loopback-gateway.ts';

test('closed method/path table rejects traversal, admin, remote endpoints', () => {
  assert(allowedRoute('/v1/projects/p/timelines/t/inspect', 'POST'));
  assert(allowedRoute('/v1/projects/p/timelines/t/composition-revisions/r', 'GET'));
  for (const path of ['/v1/doctor', '/v1/backup', '/v1/tasks/claim', '/v1/objects/../secret', '/v1/objects/a%2fb', '/v1/objects/a%252fb', '//remote.test/x']) assert(!allowedRoute(path, 'POST'));
  assert(!allowedRoute('/v1/projects/p/timelines/t/inspect', 'DELETE'));
  assert.throws(() => loopbackEndpoint('https://remote.test'));
  assert.throws(() => loopbackEndpoint('http://127.0.0.1:1234/redirect'));
});

test('gateway scopes host/origin/session and streams media directly with range headers', async () => {
  const hits: Array<{ path?: string; auth?: string; range?: string }> = [];
  const runtime = createServer((req, res) => {
    hits.push({ path: req.url, auth: req.headers.authorization, range: req.headers.range });
    if (req.url === '/v1/objects/redirect') { res.writeHead(302, { Location: 'https://remote.test/media' }); res.end(); return; }
    res.writeHead(206, { 'Content-Type': 'image/png', 'Content-Range': 'bytes 0-2/6', ETag: '"local"', 'Set-Cookie': 'secret=bad' }); res.end('PNG');
  });
  await new Promise<void>(resolve => runtime.listen(0, '127.0.0.1', resolve));
  const runtimeAddress = runtime.address() as { port: number };
  const audit: Array<Record<string, unknown>> = [];
  const origin = 'https://hosted.test';
  const g = createLoopbackGateway({ endpoint: `http://127.0.0.1:${runtimeAddress.port}`, token: 'only-local-product-token', origin, audit: entry => audit.push(entry) });
  await new Promise<void>(resolve => g.server.listen(0, '127.0.0.1', resolve));
  const port = (g.server.address() as { port: number }).port;
  const call = (path: string, method = 'GET', headers: Record<string, string> = {}) => new Promise<{ status: number; headers: import('node:http').IncomingHttpHeaders; body: string }>((resolve, reject) => {
    const r = request({ hostname: '127.0.0.1', port, path, method, headers }, res => { const chunks: Buffer[] = []; res.on('data', chunk => chunks.push(chunk)); res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks).toString() })); }); r.on('error', reject); r.end();
  });
  try {
    const path = `${g.prefix}/v1/objects/card`;
    assert.equal((await call(path)).status, 403);
    assert.equal((await call(path, 'GET', { Origin: 'https://evil.test' })).status, 403);
    assert.equal((await call(path, 'GET', { Origin: origin, Host: 'evil.test' })).status, 403);
    assert.equal((await call('/session/wrong/api/runtime/v1/health', 'GET', { Origin: origin })).status, 401);
    assert.equal((await call(path, 'GET', { Origin: origin, Authorization: 'Bearer browser' })).status, 403);
    assert.equal(hits.length, 0);
    const preflight = await call(path, 'OPTIONS', { Origin: origin, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'range', 'Access-Control-Request-Private-Network': 'true' });
    assert.equal(preflight.status, 204); assert.equal(preflight.headers['access-control-allow-private-network'], 'true');
    const result = await call(path, 'GET', { Origin: origin, Range: 'bytes=0-2' });
    assert.equal(result.status, 206); assert.equal(result.body, 'PNG'); assert.equal(result.headers.etag, '"local"');
    assert.equal(result.headers['access-control-allow-origin'], origin); assert.equal(result.headers['set-cookie'], undefined);
    assert.deepEqual(hits[0], { path: '/v1/objects/card', auth: 'Bearer only-local-product-token', range: 'bytes=0-2' });
    assert.equal((await call(path, 'GET', { Referer: origin + '/tools/video-editor' })).status, 206);
    assert.equal((await call(g.prefix.replace('/api/runtime', '/api/astrid') + '/v1/projects', 'GET', { Origin: origin })).status, 206);
    assert.equal((await call(g.prefix.replace('/api/runtime', '/api/astrid') + '/acp/connect', 'POST', { Origin: origin })).status, 404);
    assert(audit.some(entry => entry.path === '/v1/objects/card' && entry.response_bytes === 3));
    assert(!JSON.stringify(audit).includes(g.capability));
    assert(!JSON.stringify(audit).includes('only-local-product-token'));
    assert.equal((await call(`${g.prefix}/v1/objects/redirect`, 'GET', { Origin: origin })).status, 502);
  } finally { g.server.closeAllConnections(); runtime.closeAllConnections(); await Promise.all([new Promise<void>(resolve => g.server.close(() => resolve())), new Promise<void>(resolve => runtime.close(() => resolve()))]); }
});

test('gateway forwards only typed ACP lifecycle routes with its dedicated bridge credential', async () => {
  const calls: Array<{ path?: string; auth?: string; protocol?: string; body: string }> = [];
  const acp = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    calls.push({ path: req.url, auth: req.headers.authorization, protocol: typeof req.headers['x-astrid-bridge-version'] === 'string' ? req.headers['x-astrid-bridge-version'] : undefined, body: Buffer.concat(chunks).toString() });
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/connect') return res.end(JSON.stringify({ connection_id: 'connection-1', initialize: {} }));
    if (req.url === '/connection-1/rpc') return res.end(JSON.stringify({ result: { ok: true } }));
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'not_found' }));
  });
  await new Promise<void>(resolve => acp.listen(0, '127.0.0.1', resolve));
  const acpPort = (acp.address() as { port: number }).port;
  const runtime = createServer((_req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{}'); });
  await new Promise<void>(resolve => runtime.listen(0, '127.0.0.1', resolve));
  const runtimePort = (runtime.address() as { port: number }).port;
  const origin = 'https://hosted.test';
  const g = createLoopbackGateway({
    endpoint: `http://127.0.0.1:${runtimePort}`,
    token: 'runtime-token',
    origin,
    acpEndpoint: `http://127.0.0.1:${acpPort}`,
    acpToken: 'acp-token',
  });
  await new Promise<void>(resolve => g.server.listen(0, '127.0.0.1', resolve));
  const port = (g.server.address() as { port: number }).port;
  const base = g.prefix.replace('/api/runtime', '/api/astrid');
  const call = (path: string, method: string, body?: string, headers: Record<string, string> = {}) => new Promise<{ status: number; body: string }>((resolve, reject) => {
    const requestHeaders = { Origin: origin, ...headers, ...(body === undefined ? {} : { 'Content-Length': String(Buffer.byteLength(body)) }) };
    const requestBody = request({ hostname: '127.0.0.1', port, path, method, headers: requestHeaders }, response => {
      const chunks: Buffer[] = [];
      response.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      response.on('end', () => resolve({ status: response.statusCode!, body: Buffer.concat(chunks).toString() }));
    });
    requestBody.on('error', reject);
    if (body !== undefined) requestBody.end(body);
    else requestBody.end();
  });
  try {
    assert(allowedAcpRoute('/acp/connect', 'POST'));
    assert(!allowedAcpRoute('/acp/connection-1/rpc', 'GET'));
    assert.equal((await call(`${base}/acp/connect`, 'OPTIONS', undefined, {
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    })).status, 204);
    const connected = await call(`${base}/acp/connect`, 'POST', '{}', { 'Content-Type': 'application/json' });
    assert.equal(connected.status, 200);
    assert.deepEqual(JSON.parse(connected.body), { connection_id: 'connection-1', initialize: {} });
    const rpc = await call(`${base}/acp/connection-1/rpc`, 'POST', JSON.stringify({ method: 'session/list', params: {} }), { 'Content-Type': 'application/json' });
    assert.equal(rpc.status, 200);
    assert.deepEqual(JSON.parse(rpc.body), { result: { ok: true } });
    assert.equal((await call(`${base}/acp/connect`, 'POST', '{}', { Authorization: 'Bearer browser', 'Content-Type': 'application/json' })).status, 403);
    assert.deepEqual(calls.map(call => ({ path: call.path, auth: call.auth, protocol: call.protocol })), [
      { path: '/connect', auth: 'Bearer acp-token', protocol: 'v1' },
      { path: '/connection-1/rpc', auth: 'Bearer acp-token', protocol: 'v1' },
    ]);
  } finally {
    g.server.closeAllConnections();
    acp.closeAllConnections();
    runtime.closeAllConnections();
    await Promise.all([
      new Promise<void>(resolve => g.server.close(() => resolve())),
      new Promise<void>(resolve => acp.close(() => resolve())),
      new Promise<void>(resolve => runtime.close(() => resolve())),
    ]);
  }
});

test('binary streams exceed old 64MiB cap without buffering; lowered caps reject fixed and chunked bodies', async () => {
  const { DEFAULT_MAX_OBJECT_BYTES, resolveMaxObjectBytes } = await import('./reigh-loopback-gateway.ts');
  assert.equal(DEFAULT_MAX_OBJECT_BYTES, 5368709120);
  assert.equal(resolveMaxObjectBytes('4096'), 4096);
  for (const bad of ['0', '-1', '5368709121', '1.5', 'NaN']) assert.throws(() => resolveMaxObjectBytes(bad));
  let received = 0;
  const runtime = createServer(async (req, res) => {
    let size = 0;
    try {
      for await (const chunk of req) { size += chunk.length; await new Promise(r => setImmediate(r)); }
      received += size;
      res.end(JSON.stringify({ size }));
    } catch { /* cancellation is expected */ }
  });
  await new Promise<void>(r => runtime.listen(0, '127.0.0.1', r));
  const endpoint = `http://127.0.0.1:${(runtime.address() as { port: number }).port}`;
  const g = createLoopbackGateway({ endpoint, token: 'local', origin: 'https://hosted.test' });
  const small = createLoopbackGateway({ endpoint, token: 'local', origin: 'https://hosted.test', maxObjectBytes: 4096 });
  await Promise.all([new Promise<void>(r => g.server.listen(0, '127.0.0.1', r)), new Promise<void>(r => small.server.listen(0, '127.0.0.1', r))]);
  const upload = (gateway: typeof g, size: number, declared: boolean) => new Promise<{ status: number; body: string }>((resolve, reject) => {
    const r = request({ hostname: '127.0.0.1', port: (gateway.server.address() as { port: number }).port, path: gateway.prefix + '/v1/projects/p/objects', method: 'POST', headers: { Origin: 'https://hosted.test', 'Content-Type': 'video/mp4', ...(declared ? { 'Content-Length': String(size) } : {}) } }, res => {
      let body = ''; res.on('data', c => { body += c; }); res.on('end', () => resolve({ status: res.statusCode!, body }));
    });
    r.on('error', reject);
    const chunk = Buffer.alloc(64 * 1024);
    let remaining = size;
    const write = () => {
      while (remaining > 0 && !r.destroyed) {
        const amount = Math.min(remaining, chunk.length); remaining -= amount;
        if (!r.write(chunk.subarray(0, amount))) { r.once('drain', write); return; }
      }
      r.end();
    };
    write();
  });
  try {
    const size = 65 * 1024 * 1024;
    const result = await upload(g, size, false);
    assert.equal(result.status, 200); assert.equal(JSON.parse(result.body).size, size); assert.equal(received, size);
    assert.equal((await upload(small, 4097, true)).status, 413);
    const chunked = await upload(small, 4097, false);
    assert.equal(chunked.status, 413); assert.equal(JSON.parse(chunked.body).error, 'payload_too_large');
    assert.equal((await fetch(`http://127.0.0.1:${(g.server.address() as { port: number }).port}${g.prefix}/v1/projects`, { method: 'POST', headers: { Origin: 'https://hosted.test', 'Content-Length': '1048577' }, body: 'x'.repeat(1048577) })).status, 413);
  } finally {
    for (const server of [g.server, small.server, runtime]) server.closeAllConnections();
    await Promise.all([g.server, small.server, runtime].map(server => new Promise<void>(r => server.close(() => r()))));
  }
});

test('cancelled uploads and playback disconnect close upstream streams; transport failures are truthful', async () => {
  let uploadClosed!: () => void;
  let playbackClosed!: () => void;
  const uploadDone = new Promise<void>(r => { uploadClosed = r; });
  const playbackDone = new Promise<void>(r => { playbackClosed = r; });
  const runtime = createServer((req, res) => {
    if (req.method === 'POST') { req.on('data', () => {}); req.on('aborted', uploadClosed); return; }
    if (req.url === '/v1/health') { req.socket.destroy(); return; }
    res.writeHead(200, { 'Content-Type': 'video/mp4' });
    const timer = setInterval(() => res.write(Buffer.alloc(4096)), 5);
    res.on('close', () => { clearInterval(timer); playbackClosed(); });
  });
  await new Promise<void>(r => runtime.listen(0, '127.0.0.1', r));
  const g = createLoopbackGateway({ endpoint: `http://127.0.0.1:${(runtime.address() as { port: number }).port}`, token: 'local', origin: 'https://hosted.test' });
  await new Promise<void>(r => g.server.listen(0, '127.0.0.1', r));
  const options = { hostname: '127.0.0.1', port: (g.server.address() as { port: number }).port, headers: { Origin: 'https://hosted.test' } };
  const bounded = (promise: Promise<void>) => Promise.race([promise, new Promise<never>((_, reject) => { const timer = setTimeout(() => reject(new Error('upstream did not close')), 1500); timer.unref(); })]);
  try {
    const uploading = request({ ...options, path: g.prefix + '/v1/projects/p/objects', method: 'POST' });
    uploading.on('error', () => {}); uploading.write(Buffer.alloc(4096));
    await new Promise(r => setTimeout(r, 40)); uploading.destroy();
    await bounded(uploadDone);
    await new Promise<void>((resolve, reject) => {
      const playing = request({ ...options, path: g.prefix + '/v1/objects/movie' }, res => { res.once('data', () => { res.destroy(); resolve(); }); });
      playing.on('error', reject); playing.end();
    });
    await bounded(playbackDone);
    const failure = await fetch(`http://127.0.0.1:${options.port}${g.prefix}/v1/health`, { headers: options.headers });
    assert.equal(failure.status, 502); assert.equal((await failure.json()).error, 'runtime_unavailable');
  } finally {
    g.server.closeAllConnections(); runtime.closeAllConnections();
    await Promise.all([g.server, runtime].map(server => new Promise<void>(r => server.close(() => r()))));
  }
});
