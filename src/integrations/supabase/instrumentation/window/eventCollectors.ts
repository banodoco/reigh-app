/** Shape of a Phoenix channel message received over WebSocket */
interface PhoenixMessage {
  event?: string;
  topic?: string;
  ref?: string;
  payload?: Record<string, unknown>;
}

export interface WindowErrorCaptureInput {
  message: unknown;
  source: unknown;
  lineno?: number;
  colno?: number;
  error: Error | null;
}

export interface WindowErrorInfo {
  message: string;
  source: string;
  lineno?: number;
  colno?: number;
  error: { name: string; message: string; stack: string | undefined } | null;
  timestamp: number;
  userAgent: string;
}

export interface UnhandledRejectionInfo {
  reason: unknown;
  promise: string;
  timestamp: number;
}

export interface PhoenixMessageInfo {
  event: string;
  topic?: string;
  ref?: string;
  payload: string[] | null;
}

export const SUPABASE_JS_KNOWN_ERROR_LINE = 2372;

export function collectWindowErrorInfo({
  message,
  source,
  lineno,
  colno,
  error,
}: WindowErrorCaptureInput): WindowErrorInfo {
  return {
    message: String(message),
    source: String(source),
    lineno,
    colno,
    error: error
      ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      }
      : null,
    timestamp: Date.now(),
    userAgent: navigator.userAgent.slice(0, 100),
  };
}

export function collectUnhandledRejectionInfo(event: PromiseRejectionEvent): UnhandledRejectionInfo {
  return {
    reason: event.reason,
    promise: '[PROMISE_OBJECT]',
    timestamp: Date.now(),
  };
}

export function isKnownSupabaseSourceLine(source: unknown, lineno: number | undefined): boolean {
  return typeof source === 'string'
    && source.includes('supabase-js.js')
    && lineno === SUPABASE_JS_KNOWN_ERROR_LINE;
}

export function isSupabaseRealtimeRelated(value: unknown): boolean {
  const text = String(value ?? '').toLowerCase();
  return text.includes('supabase') || text.includes('realtime') || text.includes('websocket');
}

export function isSupabaseRealtimeSocket(url: string): boolean {
  return url.includes('supabase.co/realtime');
}

export function isSupabaseWebSocket(url: string): boolean {
  return url.includes('supabase.co') && url.includes('websocket');
}

export function parsePhoenixMessage(data: unknown): PhoenixMessageInfo | null {
  if (typeof data !== 'string') {
    return null;
  }

  try {
    const parsed = JSON.parse(data) as PhoenixMessage;
    if (!parsed.event) {
      return null;
    }

    return {
      event: parsed.event,
      topic: parsed.topic,
      ref: parsed.ref,
      payload: parsed.payload ? Object.keys(parsed.payload) : null,
    };
  } catch {
    return null;
  }
}
