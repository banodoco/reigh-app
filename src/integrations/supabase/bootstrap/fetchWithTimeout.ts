const EDGE_FUNCTION_TIMEOUT_MS = 60_000;
const STORAGE_UPLOAD_TIMEOUT_MS = 30_000;

interface ComposedSignalResult {
  signal: AbortSignal;
  cleanup: () => void;
}

function getRequestUrl(input: URL | RequestInfo): string {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  if (input instanceof Request) {
    return input.url;
  }
  return String(input);
}

export function composeAbortSignals(timeoutSignal: AbortSignal, callerSignal?: AbortSignal): ComposedSignalResult {
  if (!callerSignal) {
    return {
      signal: timeoutSignal,
      cleanup: () => {},
    };
  }

  const composedController = new AbortController();
  const abort = () => {
    if (!composedController.signal.aborted) {
      composedController.abort();
    }
  };

  if (timeoutSignal.aborted || callerSignal.aborted) {
    abort();
    return {
      signal: composedController.signal,
      cleanup: () => {},
    };
  }

  const onAbort = () => abort();
  timeoutSignal.addEventListener('abort', onAbort, { once: true });
  callerSignal.addEventListener('abort', onAbort, { once: true });

  return {
    signal: composedController.signal,
    cleanup: () => {
      timeoutSignal.removeEventListener('abort', onAbort);
      callerSignal.removeEventListener('abort', onAbort);
    },
  };
}

function toAbortError(reason: unknown): Error {
  if (reason instanceof Error) {
    return reason;
  }

  const message = typeof reason === 'string'
    ? reason
    : 'The operation was aborted.';

  if (typeof DOMException !== 'undefined') {
    return new DOMException(message, 'AbortError');
  }

  return new Error(message);
}

export function fetchWithTimeout(input: URL | RequestInfo, init: RequestInit = {}): Promise<Response> {
  const url = getRequestUrl(input);
  const isEdgeFunction = url.includes('/functions/v1/');
  const isStorageUpload = url.includes('/storage/v1/object/');

  if (!isEdgeFunction && !isStorageUpload) {
    return fetch(input, init);
  }

  const callerSignal = init.signal instanceof AbortSignal ? init.signal : undefined;
  if (callerSignal?.aborted) {
    return Promise.reject(toAbortError(callerSignal.reason));
  }

  const controller = new AbortController();
  const timeoutMs = isEdgeFunction ? EDGE_FUNCTION_TIMEOUT_MS : STORAGE_UPLOAD_TIMEOUT_MS;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const { signal, cleanup } = composeAbortSignals(
    controller.signal,
    callerSignal,
  );

  return fetch(input, { ...init, signal }).finally(() => {
    clearTimeout(timeoutId);
    cleanup();
  });
}
