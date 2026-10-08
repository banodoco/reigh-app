import { beforeEach, describe, expect, it, vi } from 'vitest';

const bootstrapMocks = vi.hoisted(() => ({
  initializeVideoEditorExtensionRuntime: vi.fn(),
  renderApp: vi.fn(),
}));

// Mock both supported import paths to one deferred implementation. This keeps
// the test focused on the real entry's initialization-before-render sequence.
vi.mock('@/tools/video-editor/browser', () => ({
  initializeVideoEditorExtensionRuntime: bootstrapMocks.initializeVideoEditorExtensionRuntime,
}));

vi.mock('@/tools/video-editor/browser/initializeVideoEditorExtensionRuntime', () => ({
  initializeVideoEditorExtensionRuntime: bootstrapMocks.initializeVideoEditorExtensionRuntime,
}));

vi.mock('@/app/bootstrap', () => ({
  renderApp: bootstrapMocks.renderApp,
}));

describe('main entry bootstrap order', () => {
  beforeEach(() => {
    vi.resetModules();
    bootstrapMocks.initializeVideoEditorExtensionRuntime.mockReset();
    bootstrapMocks.renderApp.mockReset();
    document.body.replaceChildren();
  });

  it('waits for extension runtime initialization before rendering the app', async () => {
    let resolveInitialization!: () => void;
    bootstrapMocks.initializeVideoEditorExtensionRuntime.mockImplementation(() => new Promise<void>((resolve) => {
      resolveInitialization = resolve;
    }));

    const root = document.createElement('div');
    root.id = 'root';
    document.body.append(root);

    await import('@/app/main');

    expect(bootstrapMocks.initializeVideoEditorExtensionRuntime).toHaveBeenCalledOnce();
    expect(bootstrapMocks.renderApp).not.toHaveBeenCalled();

    resolveInitialization();
    await vi.waitFor(() => expect(bootstrapMocks.renderApp).toHaveBeenCalledOnce());
    expect(bootstrapMocks.renderApp).toHaveBeenCalledWith(root);
  });
});
