import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  normalizeAndPresentErrorMock,
} = vi.hoisted(() => ({
  normalizeAndPresentErrorMock: vi.fn(),
}));

vi.mock('@/pages/Home/HomePage', () => ({
  default: () => <div data-testid="home-page" />,
}));
vi.mock('@/pages/ArtPage', () => ({
  default: () => <div data-testid="art-page" />,
}));
vi.mock('@/pages/PaymentSuccessPage', () => ({
  default: () => <div data-testid="payment-success-page" />,
}));
vi.mock('@/pages/PaymentCancelPage', () => ({
  default: () => <div data-testid="payment-cancel-page" />,
}));
vi.mock('@/pages/SharePage', () => ({
  default: () => <div data-testid="share-page" />,
}));
vi.mock('@/tools/image-generation/pages/ImageGenerationToolPage', () => ({
  default: () => <div data-testid="image-generation-page" />,
}));
vi.mock('@/tools/travel-between-images/pages/VideoTravelToolPage', () => ({
  default: () => <div data-testid="video-travel-page" />,
}));
vi.mock('@/tools/character-animate/pages/CharacterAnimatePage', () => ({
  default: () => <div data-testid="character-animate-page" />,
}));
vi.mock('@/tools/join-clips/pages/JoinClipsPage', () => ({
  default: () => <div data-testid="join-clips-page" />,
}));
vi.mock('@/tools/edit-video/pages/EditVideoPage', () => ({
  default: () => <div data-testid="edit-video-page" />,
}));
vi.mock('@/tools/video-editor/pages/VideoEditorPage', () => ({
  default: () => <div data-testid="video-editor-page" />,
}));
vi.mock('@/tools/video-editor/pages/ExtensionHarnessPage', () => ({
  default: () => <div data-testid="extension-harness-page" />,
}));
vi.mock('@/tools/edit-images/pages/EditImagesPage', () => ({
  default: () => <div data-testid="edit-images-page" />,
}));
vi.mock('@/tools/training-data-helper/pages/TrainingDataHelperPage', () => ({
  default: () => <div data-testid="training-data-helper-page" />,
}));
vi.mock('@/pages/Blog/BlogListPage', () => ({
  default: () => <div data-testid="blog-list-page" />,
}));
vi.mock('@/pages/Blog/BlogPostPage', () => ({
  default: () => <div data-testid="blog-post-page" />,
}));
vi.mock('@/pages/NotFoundPage', () => ({
  default: () => <div data-testid="not-found-page" />,
}));
vi.mock('@/pages/ShotsPage', () => ({
  default: () => <div data-testid="shots-page" />,
}));
vi.mock('@/app/Layout', async () => {
  const { Outlet } = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    Layout: () => <Outlet />,
  };
});
vi.mock('./DefaultToolRedirect', () => ({
  DefaultToolRedirect: () => <div data-testid="default-tool-redirect" />,
}));
vi.mock('@/shared/components/ReighLoading', () => ({
  ReighLoading: () => <div data-testid="reigh-loading" />,
}));
vi.mock('@/shared/components/ToolErrorBoundary', () => ({
  ToolErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: normalizeAndPresentErrorMock,
}));

async function loadRoutes(environment: 'web' | 'dev' | 'local') {
  vi.resetModules();
  vi.stubEnv('VITE_APP_ENV', environment);
  return (await import('./routes')).AppRoutes;
}

function renderRoute(
  AppRoutes: typeof import('./routes').AppRoutes,
  path: string,
  homeDocumentReplacement?: (url: string) => void,
) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes homeDocumentReplacement={homeDocumentReplacement} />
    </MemoryRouter>,
  );
}

describe('AppRoutes', () => {
  beforeEach(() => {
    normalizeAndPresentErrorMock.mockReset();
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(['web', 'dev', 'local'] as const)(
    'hands ordinary %s /home routes to one fresh public document with query and hash',
    async (environment) => {
      const AppRoutes = await loadRoutes(environment);
      const replaceDocument = vi.fn();
      window.history.replaceState({}, '', '/home?source=guard#return');
      renderRoute(AppRoutes, '/home?source=guard#return', replaceDocument);

      await vi.waitFor(() => expect(replaceDocument).toHaveBeenCalledTimes(1));
      expect(replaceDocument).toHaveBeenCalledWith(
        window.location.origin + '/home?source=guard#return',
      );
      expect(screen.queryByTestId('home-page')).not.toBeInTheDocument();
    },
  );

  it('keeps the app-only root Home route available for callback-owned boots', async () => {
    const AppRoutes = await loadRoutes('web');
    window.history.replaceState({}, '', '/#access_token=access&refresh_token=refresh');
    renderRoute(AppRoutes, '/');

    expect(await screen.findByTestId('home-page')).toBeInTheDocument();
  });

  it.each(['web', 'dev', 'local'] as const)(
    'keeps a recognized %s /home callback in the lazy legacy Home owner',
    async (environment) => {
      const AppRoutes = await loadRoutes(environment);
      const replaceDocument = vi.fn();
      window.history.replaceState({}, '', '/home#access_token=access&refresh_token=refresh');
      renderRoute(AppRoutes, '/home#access_token=access&refresh_token=refresh', replaceDocument);

      expect(await screen.findByTestId('home-page')).toBeInTheDocument();
      expect(replaceDocument).not.toHaveBeenCalled();
    },
  );

  it.each(['web', 'dev', 'local'] as const)('preserves protected routes in %s', async (environment) => {
    const AppRoutes = await loadRoutes(environment);
    renderRoute(AppRoutes, '/tools/video-editor');

    expect(screen.getByTestId('video-editor-page')).toBeInTheDocument();
  });

  it.each([
    ['/tools/image-generation', 'image-generation-page'],
    ['/tools/character-animate', 'character-animate-page'],
    ['/tools/edit-images', 'edit-images-page'],
    ['/tools/edit-video', 'edit-video-page'],
    ['/tools/travel-between-images', 'video-travel-page'],
    ['/tools/join-clips', 'join-clips-page'],
    ['/tools/training-data-helper', 'training-data-helper-page'],
  ])('guards legacy Tool route %s before mounting its hidden page', async (path, hiddenPageTestId) => {
    const AppRoutes = await loadRoutes('local');
    renderRoute(AppRoutes, path);

    expect(await screen.findByTestId('video-editor-page')).toBeInTheDocument();
    expect(screen.queryByTestId(hiddenPageTestId)).not.toBeInTheDocument();
  });

  it('preserves WEB and non-WEB root mappings', async () => {
    const WebRoutes = await loadRoutes('web');
    const web = renderRoute(WebRoutes, '/');
    expect(await screen.findByTestId('home-page')).toBeInTheDocument();
    web.unmount();

    const DevRoutes = await loadRoutes('dev');
    const dev = renderRoute(DevRoutes, '/');
    expect(await screen.findByTestId('default-tool-redirect')).toBeInTheDocument();
    dev.unmount();

    const LocalRoutes = await loadRoutes('local');
    renderRoute(LocalRoutes, '/');
    expect(await screen.findByTestId('default-tool-redirect')).toBeInTheDocument();
  });

  it('renders the dev extension harness route through a Suspense boundary', async () => {
    const AppRoutes = await loadRoutes('web');
    renderRoute(AppRoutes, '/tools/video-editor/harness?scenario=populated&localTest=1');

    expect(await screen.findByTestId('extension-harness-page')).toBeInTheDocument();
  });

  it('renders public routes outside the layout tree', async () => {
    const AppRoutes = await loadRoutes('web');
    renderRoute(AppRoutes, '/payments/success');

    expect(screen.getByTestId('payment-success-page')).toBeInTheDocument();
  });

  it('renders the catch-all route for unknown paths', async () => {
    const AppRoutes = await loadRoutes('web');
    renderRoute(AppRoutes, '/does-not-exist');

    expect(screen.getByTestId('not-found-page')).toBeInTheDocument();
  });
});
