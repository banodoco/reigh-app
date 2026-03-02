/**
 * Enforces a consistent provider-guard error for context hooks.
 */
export function requireContextValue<T>(
  context: T | undefined | null,
  hookName: string,
  providerName: string,
): T {
  if (context === undefined || context === null) {
    const article = /^a/i.test(providerName) ? 'an' : 'a';
    throw new Error(
      `${hookName} must be used within ${article} ${providerName}. ` +
        `Make sure the component is rendered inside the ${providerName} tree.`,
    );
  }
  return context;
}
