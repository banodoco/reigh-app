let fallbackCounter = 0;

/**
 * Generates stable, non-guessable session IDs without Math.random.
 * Prefer crypto APIs when available, with a deterministic fallback.
 */
export function createSessionId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const runtimeCrypto = globalThis.crypto;

  if (runtimeCrypto?.randomUUID) {
    const uuidToken = runtimeCrypto.randomUUID().replace(/-/g, '').slice(0, 12);
    return `${prefix}-${timestamp}-${uuidToken}`;
  }

  if (runtimeCrypto?.getRandomValues) {
    const randomBytes = new Uint8Array(6);
    runtimeCrypto.getRandomValues(randomBytes);
    const randomHex = Array.from(randomBytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${prefix}-${timestamp}-${randomHex}`;
  }

  fallbackCounter = (fallbackCounter + 1) % 1_679_616; // 36^4
  const counterToken = fallbackCounter.toString(36).padStart(4, '0');
  return `${prefix}-${timestamp}-${counterToken}`;
}
