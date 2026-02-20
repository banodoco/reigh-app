import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { createBrowserRouterMock, routerProviderSpy, redirectMock, getSessionMock } = vi.hoisted(() => ({
  createBrowserRouterMock: vi.fn(() => ({ id: 'router-instance' })),
  routerProviderSpy: vi.fn(),
  redirectMock: vi.fn((to: string) => ({ to })),
  getSessionMock: vi.fn().mockResolvedValue({ data: { session: null } }),
}));

vi.mock('react-router-dom', () => ({
  createBrowserRouter: createBrowserRouterMock,
  RouterProvider: ({ router }: { router: unknown }) => {
    routerProviderSpy(router);
    return <div data-testid="router-provider" />;
  },
  redirect: redirectMock,
}));

vi.mock('@/pages/Home/HomePage', () => ({ default: () => null }));
vi.mock('@/pages/ArtPage', () => ({ default: () => null }));
vi.mock('@/pages/PaymentSuccessPage', () => ({ default: () => null }));
vi.mock('@/pages/PaymentCancelPage', () => ({ default: () => null }));
vi.mock('@/pages/SharePage', () => ({ default: () => null }));
vi.mock('@/tools/image-generation/pages/ImageGenerationToolPage', () => ({ default: () => null }));
vi.mock('@/tools/travel-between-images/pages/VideoTravelToolPage', () => ({ default: () => null }));
vi.mock('@/tools/character-animate/pages/CharacterAnimatePage', () => ({ default: () => null }));
vi.mock('@/tools/join-clips/pages/JoinClipsPage', () => ({ default: () => null }));
vi.mock('@/tools/edit-video/pages/EditVideoPage', () => ({ default: () => null }));
vi.mock('@/tools/edit-images/pages/EditImagesPage', () => ({ default: () => null }));
vi.mock('@/tools/training-data-helper/pages/TrainingDataHelperPage', () => ({ default: () => null }));
vi.mock('@/pages/Blog/BlogListPage', () => ({ default: () => null }));
vi.mock('@/pages/Blog/BlogPostPage', () => ({ default: () => null }));
vi.mock('@/pages/NotFoundPage', () => ({ default: () => null }));
vi.mock('@/pages/ShotsPage', () => ({ default: () => null }));
vi.mock('@/app/Layout', () => ({ default: () => null }));
vi.mock('@/shared/components/ReighLoading', () => ({ ReighLoading: () => null }));
vi.mock('@/shared/components/ToolErrorBoundary', () => ({
  ToolErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: getSessionMock,
    },
  },
}));

describe('routes module', () => {
  it('builds a browser router and renders RouterProvider in AppRoutes', async () => {
    const { AppRoutes } = await import('./routes');

    expect(createBrowserRouterMock).toHaveBeenCalledTimes(1);
    const routes = createBrowserRouterMock.mock.calls[0]?.[0] as Array<{ path?: string; children?: unknown[] }>;
    expect(routes.some((route) => route.path === '/tools')).toBe(false);
    expect(routes.some((route) => route.path === '/home')).toBe(true);
    expect(routes.some((route) => route.path === '/payments/success')).toBe(true);
    expect(routes.some((route) => route.path === '*')).toBe(true);

    render(<AppRoutes />);
    expect(routerProviderSpy).toHaveBeenCalledWith({ id: 'router-instance' });
  });
});
