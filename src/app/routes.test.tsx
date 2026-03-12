import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { createBrowserRouterMock, routerProviderSpy, redirectMock } = vi.hoisted(() => ({
  createBrowserRouterMock: vi.fn(() => ({ id: 'router-instance' })),
  routerProviderSpy: vi.fn(),
  redirectMock: vi.fn((to: string) => ({ to })),
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
vi.mock('@/app/Layout', () => ({ Layout: () => null }));
vi.mock('@/shared/components/ReighLoading', () => ({ ReighLoading: () => null }));
vi.mock('@/shared/components/ToolErrorBoundary', () => ({
  ToolErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('routes module', () => {
  it('builds a browser router and renders RouterProvider in AppRoutes', async () => {
    const { AppRoutes } = await import('./routes');

    expect(createBrowserRouterMock).toHaveBeenCalledTimes(1);
    const routes = createBrowserRouterMock.mock.calls[0]?.[0] as Array<{ path?: string; children?: unknown[] }>;
    const homeRoute = routes.find((route) => route.path === '/home');
    const successRoute = routes.find((route) => route.path === '/payments/success');
    const cancelRoute = routes.find((route) => route.path === '/payments/cancel');
    const shareRoute = routes.find((route) => route.path === '/share/:shareId');
    const blogRoute = routes.find((route) => route.path === '/blog');
    const blogPostRoute = routes.find((route) => route.path === '/blog/:slug');
    const notFoundRoute = routes.find((route) => route.path === '*');
    const layoutRoute = routes.find((route) => Array.isArray(route.children));
    const layoutChildren = layoutRoute?.children as Array<{ path?: string }> | undefined;

    expect(routes.some((route) => route.path === '/tools')).toBe(false);
    expect(homeRoute?.path).toBe('/home');
    expect(successRoute?.path).toBe('/payments/success');
    expect(cancelRoute?.path).toBe('/payments/cancel');
    expect(shareRoute?.path).toBe('/share/:shareId');
    expect(blogRoute?.path).toBe('/blog');
    expect(blogPostRoute?.path).toBe('/blog/:slug');
    expect(notFoundRoute?.path).toBe('*');
    expect(layoutChildren).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '/tools' }),
        expect.objectContaining({ path: '/tools/image-generation' }),
        expect.objectContaining({ path: '/tools/travel-between-images' }),
        expect.objectContaining({ path: '/tools/character-animate' }),
        expect.objectContaining({ path: '/tools/join-clips' }),
        expect.objectContaining({ path: '/tools/edit-images' }),
        expect.objectContaining({ path: '/tools/edit-video' }),
        expect.objectContaining({ path: '/tools/training-data-helper' }),
        expect.objectContaining({ path: '/shots' }),
        expect.objectContaining({ path: '/art' }),
      ]),
    );
    expect(layoutChildren?.length).toBeGreaterThanOrEqual(10);
    expect(routes.length).toBeGreaterThanOrEqual(7);

    render(<AppRoutes />);
    expect(routerProviderSpy).toHaveBeenCalledWith({ id: 'router-instance' });
  });
});
