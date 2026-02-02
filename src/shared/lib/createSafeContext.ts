import { createContext, useContext, type Context, type Provider } from 'react';

/**
 * Creates a typed React context with both strict and safe access hooks.
 *
 * @param name - Display name for the context (used in error messages)
 * @returns Object with Provider, useContext (strict), and useContextSafe (permissive)
 *
 * @example
 * ```tsx
 * interface MyState {
 *   count: number;
 *   increment: () => void;
 * }
 *
 * const { Provider, useContext, useContextSafe } = createSafeContext<MyState>('MyContext');
 *
 * // In a component that MUST be within the provider:
 * const { count, increment } = useContext(); // Throws if outside provider
 *
 * // In a component that may or may not be within the provider:
 * const state = useContextSafe(); // Returns undefined if outside
 * if (state) {
 *   // Safe to use state
 * }
 * ```
 */
export function createSafeContext<T>(name: string) {
  const Context = createContext<T | undefined>(undefined);
  Context.displayName = name;

  /**
   * Hook that requires the context to be present.
   * Throws an error if used outside the provider.
   */
  function useContextStrict(): T {
    const context = useContext(Context);
    if (context === undefined) {
      throw new Error(`use${name} must be used within a ${name}Provider`);
    }
    return context;
  }

  /**
   * Hook that safely returns the context or undefined.
   * Use when the component may render both inside and outside the provider.
   */
  function useContextSafe(): T | undefined {
    return useContext(Context);
  }

  /**
   * Check if we're inside the provider without accessing the value.
   * Useful for conditional rendering or behavior.
   */
  function useHasProvider(): boolean {
    return useContext(Context) !== undefined;
  }

  return {
    /** The raw React Context (for advanced use cases) */
    Context,
    /** The Provider component */
    Provider: Context.Provider as Provider<T>,
    /** Hook that throws if used outside provider */
    useContext: useContextStrict,
    /** Hook that returns undefined if used outside provider */
    useContextSafe,
    /** Hook that returns true if inside provider */
    useHasProvider,
  };
}

/**
 * Creates a context with a default value (no provider required).
 * Useful for contexts that have sensible defaults.
 *
 * @param name - Display name for the context
 * @param defaultValue - Value to use when no provider is present
 */
export function createContextWithDefault<T>(name: string, defaultValue: T) {
  const Context = createContext<T>(defaultValue);
  Context.displayName = name;

  function useContextValue(): T {
    return useContext(Context);
  }

  return {
    Context,
    Provider: Context.Provider,
    useContext: useContextValue,
  };
}
