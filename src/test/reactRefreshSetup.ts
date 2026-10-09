// Install the real Vite refresh hook before testing-library loads ReactDOM.
// The refresh runtime itself reads window at module evaluation, so node-only
// transport/process tests must skip importing it. Vitest awaits setup modules.
if (typeof window !== 'undefined') {
  const { injectIntoGlobalHook } = await import('@test-react-refresh');
  injectIntoGlobalHook(globalThis);
}
