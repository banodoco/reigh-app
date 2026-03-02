import { debugConfig } from './debug/debugConfig';
import { toJson } from '@/shared/lib/supabaseTypeHelpers';

// Lightweight logging helper that can be enabled/disabled via Vite env
// Usage:
//   import { log, time, timeEnd } from '@/shared/lib/logger';
//   log('MyTag', 'Some message', optionalData);
//   time('MyTag', 'expensive-operation');
//   ...do work...
//   timeEnd('MyTag', 'expensive-operation');
//
// Logs are only printed when `VITE_DEBUG_LOGS` is set to `true`.
// This avoids polluting the console in production while still allowing
// rich diagnostics for performance investigations.
//
// Log persistence (to system_logs table):
//   Set `VITE_PERSIST_LOGS=true` to buffer and send logs to system_logs.
//   When enabled, ALL console.log/warn/error calls are captured automatically.
//   Logs are batched and flushed every 10s or when buffer hits 50 entries.
//   Query with: SELECT * FROM system_logs WHERE source_type = 'browser'
//   Or use: debug.py logs --latest
//
// All logs share the same shape so they can be filtered easily.
// Tag format guideline (keep short & consistent):
//   [Area][Specific] e.g. [TaskPoller], [Render:GenerationsPane]

// ===== CONFIGURATION =====

const FLUSH_INTERVAL_MS = 10000; // Flush every 10 seconds
const FLUSH_BUFFER_SIZE = 100;   // Flush when buffer hits this size

function generateSessionId(): string {
  const timestamp = Date.now();
  const runtimeCrypto = globalThis.crypto;

  if (runtimeCrypto?.randomUUID) {
    return `browser-${timestamp}-${runtimeCrypto.randomUUID().slice(0, 8)}`;
  }

  if (runtimeCrypto?.getRandomValues) {
    const randomBytes = new Uint8Array(4);
    runtimeCrypto.getRandomValues(randomBytes);
    const randomHex = Array.from(randomBytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `browser-${timestamp}-${randomHex}`;
  }

  return `browser-${timestamp}-no-crypto`;
}

const SESSION_ID = generateSessionId();

// Store original console methods BEFORE any interception
const originalConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

// ===== LOG BUFFER =====

interface BufferedLog {
  timestamp: string;
  source_type: 'browser';
  source_id: string;
  log_level: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';
  message: string;
  task_id: string | null;
  metadata: Record<string, unknown>;
}

const logBuffer: BufferedLog[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let isFlushScheduled = false;
let loggerRuntimeInitialized = false;
let unloadHandlerRegistered = false;

// ===== HELPERS =====

function getEnvFlag(viteKey: string): string | undefined {
  const env = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env;
  const viteValue = env?.[viteKey];
  if (typeof viteValue === 'string') {
    return viteValue;
  }
  if (typeof process !== 'undefined') {
    return (process as { env?: Record<string, string | undefined> }).env?.[viteKey];
  }
  return undefined;
}

function shouldLog(): boolean {
  const flag = getEnvFlag('VITE_DEBUG_LOGS');
  return flag === 'true' || flag === '1';
}

function shouldPersist(): boolean {
  const flag = getEnvFlag('VITE_PERSIST_LOGS');
  return flag === 'true' || flag === '1';
}

function getUserId(): string | null {
  try {
    // Try to get user ID from localStorage (set by auth)
    const session = localStorage.getItem('sb-wczysqzxlwdndgxitrvc-auth-token');
    if (session) {
      const parsed = JSON.parse(session);
      return parsed?.user?.id || null;
    }
  } catch {
    // Ignore errors
  }
  return null;
}

// ===== PERSISTENCE =====

function addToBuffer(level: BufferedLog['log_level'], tag: string, args: unknown[]): void {
  if (!shouldPersist()) return;
  
  // Serialize args safely
  const message = `[${tag}] ${args.map(arg => {
    try {
      return typeof arg === 'string' ? arg : JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  }).join(' ')}`;
  
  logBuffer.push({
    timestamp: new Date().toISOString(),
    source_type: 'browser',
    source_id: SESSION_ID,
    log_level: level,
    message: message.slice(0, 2000), // Truncate very long messages
    task_id: null,
    metadata: {
      user_id: getUserId(),
      url: typeof window !== 'undefined' ? window.location.pathname : null,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    }
  });
  
  // Flush if buffer is full
  if (logBuffer.length >= FLUSH_BUFFER_SIZE) {
    flushLogs();
  } else if (!isFlushScheduled) {
    scheduleFlush();
  }
}

function scheduleFlush(): void {
  if (isFlushScheduled) return;
  isFlushScheduled = true;
  flushTimer = setTimeout(() => {
    isFlushScheduled = false;
    flushLogs();
  }, FLUSH_INTERVAL_MS);
}

async function flushLogs(): Promise<void> {
  if (logBuffer.length === 0) return;
  
  // Clear timer if running
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
    isFlushScheduled = false;
  }
  
  // Take all logs from buffer
  const logsToSend = logBuffer.splice(0, logBuffer.length);
  
  try {
    // Dynamically import supabase to avoid circular dependencies
    const { getSupabaseClient } = await import('@/integrations/supabase/client');
    const supabase = getSupabaseClient();
    
    const { error } = await supabase.rpc('func_insert_logs_batch', { 
      logs: toJson(logsToSend),
    });
    
    if (error) {
      // Use original to avoid recursion
      originalConsole.warn('[Logger] Failed to persist logs:', error.message);
      // Don't re-add to buffer - logs are in console anyway
    }
  } catch (e) {
    // Use original to avoid recursion
    originalConsole.warn('[Logger] Failed to persist logs:', e);
  }
}

function handleBeforeUnload(): void {
  if (logBuffer.length === 0) {
    return;
  }

  // Use sendBeacon for reliable delivery on unload.
  try {
    const logsToSend = logBuffer.splice(0, logBuffer.length);
    // sendBeacon doesn't support RPC, so we just lose these logs.
    // In practice, the periodic flush should have caught most of them.
    originalConsole.log('[Logger] Discarding', logsToSend.length, 'logs on unload (sendBeacon not supported for RPC)');
  } catch {
    // Ignore
  }
}

function registerBeforeUnloadHandler(): void {
  if (typeof window === 'undefined' || unloadHandlerRegistered) {
    return;
  }
  window.addEventListener('beforeunload', handleBeforeUnload);
  unloadHandlerRegistered = true;
}

// ===== PUBLIC API =====

export function log(tag: string, ...args: unknown[]): void {
  if (!shouldLog()) return;
   
  addToBuffer('INFO', tag, args);
}


// Dedicated onRender callback for React Profiler so callers don't need to re-implement it.
export function reactProfilerOnRender(...rawArgs: unknown[]): void {
  if (!debugConfig.isEnabled('reactProfiler')) {
    return; // Skip logging if ReactProfiler debugging is disabled
  }

  const [id, phase, actualDuration, baseDuration, startTime, commitTime, interactions] = rawArgs;
  const formatDurationMs = (value: unknown): string => {
    if (typeof value === 'number') {
      return `${value.toFixed(2)}ms`;
    }
    return `${String(value)}ms`;
  };
  const getSize = (value: unknown): number => {
    if (!value || typeof value !== 'object') return 0;
    const candidate = value as { size?: unknown };
    return typeof candidate.size === 'number' ? candidate.size : 0;
  };

  log('ReactProfiler', {
    id,
    phase,
    actualDuration: formatDurationMs(actualDuration),
    baseDuration: formatDurationMs(baseDuration),
    startTime: formatDurationMs(startTime),
    commitTime: formatDurationMs(commitTime),
    interactionsCount: getSize(interactions),
  });
}

// ===== GLOBAL CONSOLE INTERCEPTION & SUPPRESSION =====
// This module handles ALL console behavior:
// - VITE_PERSIST_LOGS=true: intercept and persist all logs to system_logs
// - VITE_DEBUG_LOGS=false: suppress console output (production-like)
// - VITE_DEBUG_LOGS=true: show console output normally
// This captures the 2000+ existing console.log calls without changing them

let isIntercepting = false; // Prevent recursion

function initializeConsole(): void {
  if (typeof window === 'undefined') return;
  
  const persist = shouldPersist();
  const debug = shouldLog();
  
  // Case 1: Persist logs - intercept everything and send to system_logs
  if (persist) {
    console.log = (...args: unknown[]) => {
      if (debug) originalConsole.log(...args);
      if (!isIntercepting) {
        isIntercepting = true;
        addToBufferRaw('INFO', args);
        isIntercepting = false;
      }
    };
    
    console.warn = (...args: unknown[]) => {
      if (debug) originalConsole.warn(...args);
      if (!isIntercepting) {
        isIntercepting = true;
        addToBufferRaw('WARNING', args);
        isIntercepting = false;
      }
    };
    
    console.error = (...args: unknown[]) => {
      // Always show errors in console
      originalConsole.error(...args);
      if (!isIntercepting) {
        isIntercepting = true;
        addToBufferRaw('ERROR', args);
        isIntercepting = false;
      }
    };
    
    // Also intercept console.info and console.debug
    console.info = (...args: unknown[]) => {
      if (debug) originalConsole.log(...args);
      if (!isIntercepting) {
        isIntercepting = true;
        addToBufferRaw('INFO', args);
        isIntercepting = false;
      }
    };
    
    console.debug = (...args: unknown[]) => {
      if (debug) originalConsole.log(...args);
      if (!isIntercepting) {
        isIntercepting = true;
        addToBufferRaw('DEBUG', args);
        isIntercepting = false;
      }
    };
    
    originalConsole.log('[Logger] Console interception enabled - all logs will be persisted to system_logs');
    originalConsole.log('[Logger] Session ID:', SESSION_ID);
  }
  // Case 2: No persist, no debug - suppress console output
  else if (!debug) {
    console.log = () => {};
    console.info = () => {};
    console.debug = () => {};
    console.warn = () => {};
    // Keep console.error working
  }
  // Case 3: Debug but no persist - leave console as-is (default behavior)
}

// Helper to add raw console args to buffer (extracts tag if present)
function addToBufferRaw(level: BufferedLog['log_level'], args: unknown[]): void {
  if (!shouldPersist() || args.length === 0) return;
  
  // Try to extract a tag from the first arg if it looks like [Tag] or [Tag:Sub]
  let tag = 'console';
  let messageArgs = args;
  
  const firstArg = args[0];
  if (typeof firstArg === 'string') {
    const tagMatch = firstArg.match(/^\[([^\]]+)\]$/);
    if (tagMatch) {
      tag = tagMatch[1];
      messageArgs = args.slice(1);
    } else if (firstArg.startsWith('[') && firstArg.includes(']')) {
      // Handle "[Tag] message" format
      const fullMatch = firstArg.match(/^\[([^\]]+)\]\s*(.*)/);
      if (fullMatch) {
        tag = fullMatch[1];
        messageArgs = fullMatch[2] ? [fullMatch[2], ...args.slice(1)] : args.slice(1);
      }
    }
  }
  
  // Serialize args safely
  const message = `[${tag}] ${messageArgs.map(arg => {
    try {
      if (typeof arg === 'string') return arg;
      if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  }).join(' ')}`;
  
  logBuffer.push({
    timestamp: new Date().toISOString(),
    source_type: 'browser',
    source_id: SESSION_ID,
    log_level: level,
    message: message.slice(0, 2000), // Truncate very long messages
    task_id: null,
    metadata: {
      user_id: getUserId(),
      url: typeof window !== 'undefined' ? window.location.pathname : null,
    }
  });
  
  // Flush if buffer is full
  if (logBuffer.length >= FLUSH_BUFFER_SIZE) {
    flushLogs();
  } else if (!isFlushScheduled) {
    scheduleFlush();
  }
}

export function initializeLoggerRuntime(): void {
  if (loggerRuntimeInitialized) {
    return;
  }
  initializeConsole();
  registerBeforeUnloadHandler();
  loggerRuntimeInitialized = true;
}
