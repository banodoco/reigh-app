/**
 * Stable host-facing bridge APIs.
 *
 * App integrations consume this entrypoint instead of reaching into the
 * editor implementation directory. The bridge schemas and discovery hook are
 * intentionally kept together because they describe the local host boundary.
 */
export * from './data/bridgeContract.ts';
export * from './hooks/useAstridBridgeDiscovery.ts';
