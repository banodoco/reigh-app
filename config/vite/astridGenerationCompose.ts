import { spawn } from 'node:child_process';
import { isAbsolute, resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Connect } from 'vite';

import { isSameOriginLoopbackRequest } from './astridProxySecurity';

export const ASTRID_GENERATION_COMPOSE_ROUTE = '/api/astrid/generation/compose';
export const GENERATION_COMPOSE_MAX_BODY_BYTES = 64 * 1024;
export const GENERATION_COMPOSE_MAX_OUTPUT_BYTES = 256 * 1024;
export const GENERATION_COMPOSE_TIMEOUT_MS = 10_000;

export interface AstridGenerationComposerConfig {
  readonly python: string;
  readonly sourceRoot: string;
}

export type AstridGenerationComposer = (body: Record<string, unknown>) => Promise<unknown>;

function jsonResponse(response: ServerResponse, status: number, body: Record<string, unknown>): void {
  const serialized = JSON.stringify(body);
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Length', Buffer.byteLength(serialized));
  response.end(serialized);
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, rejectBody) => {
    const chunks: Buffer[] = [];
    let total = 0;
    request.on('data', (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.byteLength;
      if (total > GENERATION_COMPOSE_MAX_BODY_BYTES) {
        rejectBody(new Error('request body exceeds bounded size'));
        request.destroy();
        return;
      }
      chunks.push(buffer);
    });
    request.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')));
    request.on('error', rejectBody);
  });
}

function validComposeBody(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).sort().join(',') !== 'capability_digest,params,project') return false;
  if (typeof body.project !== 'string' || !body.project.trim()) return false;
  if (typeof body.capability_digest !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(body.capability_digest)) return false;
  if (!body.params || typeof body.params !== 'object' || Array.isArray(body.params)) return false;
  const params = body.params as Record<string, unknown>;
  const keys = Object.keys(params).sort();
  const allowed = ['count', 'execution', 'mode', 'model', 'prompt', 'seed', 'size', 'steps'];
  if (keys.some((key) => !allowed.includes(key))) return false;
  return params.mode === 't2i' && params.execution === 'cloud'
    && typeof params.model === 'string' && typeof params.prompt === 'string'
    && typeof params.count === 'number' && Number.isSafeInteger(params.count)
    && typeof params.size === 'string';
}

export function resolveAstridGenerationComposer(
  env: Readonly<Record<string, string | undefined>>,
  sourceRoot?: string,
): AstridGenerationComposerConfig | null {
  const python = env.ASTRID_PYTHON?.trim();
  if (!python || !sourceRoot) return null;
  if (!isAbsolute(python)) throw new Error('ASTRID_PYTHON must be an absolute executable path');
  // Keep the configured entrypoint so a virtualenv's site packages remain available.
  // Canonicalizing its symlink here resolves it to the system interpreter and drops
  // dependencies that are intentionally installed only in the prepared runtime.
  return { python: resolve(python), sourceRoot: resolve(sourceRoot) };
}

export function createAstridGenerationComposer(config: AstridGenerationComposerConfig): AstridGenerationComposer {
  return (body) => new Promise((resolveResult, rejectResult) => {
    const checkoutRoot = resolve(config.sourceRoot, '..');
    const child = spawn(config.python, ['-m', 'astrid.sdk.generation_publication', '--json'], {
      cwd: checkoutRoot,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        PYTHONPATH: [checkoutRoot, process.env.PYTHONPATH].filter(Boolean).join(':'),
      },
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let outputBytes = 0;
    let settled = false;
    const finishError = (error: Error) => {
      if (settled) return;
      settled = true;
      rejectResult(error);
    };
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      finishError(new Error('generation composer timed out'));
    }, GENERATION_COMPOSE_TIMEOUT_MS);
    child.stdout.on('data', (chunk: Buffer) => {
      outputBytes += chunk.byteLength;
      if (outputBytes > GENERATION_COMPOSE_MAX_OUTPUT_BYTES) {
        child.kill('SIGTERM');
        finishError(new Error('generation composer output exceeds bounded size'));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.on('error', finishError);
    child.on('close', (code) => {
      clearTimeout(timer);
      if (settled) return;
      if (code !== 0) {
        try {
          const failed = JSON.parse(Buffer.concat(stdout).toString('utf8')) as {
            error?: { message?: unknown };
          };
          const message = typeof failed.error?.message === 'string' ? failed.error.message : 'generation composer rejected the request';
          const error = new Error(message);
          Object.assign(error, { statusCode: 422 });
          finishError(error);
        } catch {
          finishError(new Error(`generation composer failed${stderr.length ? `: ${Buffer.concat(stderr).toString('utf8').slice(0, 1000)}` : ''}`));
        }
        return;
      }
      try {
        const result = JSON.parse(Buffer.concat(stdout).toString('utf8')) as {
          ok?: unknown;
          request?: unknown;
        };
        if (result.ok !== true || !result.request || typeof result.request !== 'object' || Array.isArray(result.request)) {
          finishError(new Error('generation composer returned an invalid result envelope'));
          return;
        }
        resolveResult(result.request);
        settled = true;
      } catch {
        finishError(new Error('generation composer returned malformed JSON'));
      }
    });
    child.stdin.end(JSON.stringify(body));
  });
}

export function createAstridGenerationComposeHandler(composer: AstridGenerationComposer | null): Connect.NextHandleFunction {
  return async (request, response, next) => {
    if (request.method !== 'POST') {
      jsonResponse(response, 405, { error: 'method_not_allowed', detail: 'POST is required' });
      return;
    }
    if (!isSameOriginLoopbackRequest(
      typeof request.headers.origin === 'string' ? request.headers.origin : undefined,
      request.headers.host,
    )) {
      jsonResponse(response, 403, { error: 'same_origin_required', detail: 'same-origin loopback requests are required' });
      return;
    }
    const contentLength = request.headers['content-length'];
    if (typeof contentLength === 'string' && Number(contentLength) > GENERATION_COMPOSE_MAX_BODY_BYTES) {
      jsonResponse(response, 413, { error: 'request_too_large', detail: 'request body exceeds bounded size' });
      return;
    }
    let body: unknown;
    try {
      body = JSON.parse(await readBody(request));
    } catch (error) {
      jsonResponse(response, 400, { error: 'invalid_request', detail: error instanceof Error ? error.message : 'invalid JSON' });
      return;
    }
    if (!validComposeBody(body)) {
      jsonResponse(response, 400, { error: 'invalid_request', detail: 'closed image composition request required' });
      return;
    }
    if (!composer) {
      jsonResponse(response, 503, { error: 'composer_unavailable', detail: 'Astrid image generation composer is not configured' });
      return;
    }
    try {
      const result = await composer(body);
      if (!result || typeof result !== 'object' || Array.isArray(result)) {
        jsonResponse(response, 503, { error: 'composer_invalid_result', detail: 'composer returned a non-object response' });
        return;
      }
      jsonResponse(response, 200, result as Record<string, unknown>);
    } catch (error) {
      const statusCode = error && typeof error === 'object' && 'statusCode' in error
        && Number.isInteger((error as { statusCode?: unknown }).statusCode)
        ? Number((error as { statusCode: number }).statusCode)
        : 503;
      jsonResponse(response, statusCode, {
        error: statusCode === 422 ? 'composer_rejected' : 'composer_unavailable',
        detail: error instanceof Error ? error.message : 'composer failed',
      });
    }
    void next;
  };
}
