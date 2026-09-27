import { classifyBrowserEntry } from '@/app/entryClassification.ts';

async function main(): Promise<void> {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error("Failed to render app: element with id 'root' was not found.");
  }

  const owner = classifyBrowserEntry(new URL(window.location.href), {
    VITE_APP_ENV: import.meta.env.VITE_APP_ENV,
  });
  if (owner === 'public') {
    const { renderPublicEntry } = await import('@/app/publicBootstrap.tsx');
    renderPublicEntry(rootElement);
    return;
  }

  const [
    { renderApp },
    { initializeVideoEditorExtensionRuntime },
  ] = await Promise.all([
    import('@/app/bootstrap'),
    import('@/tools/video-editor/browser/initializeVideoEditorExtensionRuntime.ts'),
  ]);
  await initializeVideoEditorExtensionRuntime({ development: import.meta.env.DEV });
  renderApp(rootElement);
}

void main();
