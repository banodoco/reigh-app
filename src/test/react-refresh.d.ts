declare module '@test-react-refresh' {
  export function injectIntoGlobalHook(global: typeof globalThis): void;
  export function registerExportsForReactRefresh(id: string, exports: Record<string, unknown>): void;
  export function validateRefreshBoundaryAndEnqueueUpdate(
    id: string,
    previous: Record<string, unknown>,
    next: Record<string, unknown>,
  ): string | undefined;
}
