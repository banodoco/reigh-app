import { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider, redirect } from 'react-router-dom';
import HomePage from '@/pages/Home/HomePage';
import ArtPage from '@/pages/ArtPage';
import PaymentSuccessPage from '@/pages/PaymentSuccessPage';
import PaymentCancelPage from '@/pages/PaymentCancelPage';
import SharePage from '@/pages/SharePage';

// Main tools: eagerly loaded because lazy() caused blank screens on Safari mobile
// (dynamic import race with TanStack Query hydration — query cache not ready when component mounts)
import ImageGenerationToolPage from '@/tools/image-generation/pages/ImageGenerationToolPage';
import VideoTravelToolPage from '@/tools/travel-between-images/pages/VideoTravelToolPage';
import CharacterAnimatePage from '@/tools/character-animate/pages/CharacterAnimatePage';
import JoinClipsPage from '@/tools/join-clips/pages/JoinClipsPage';
import EditVideoPage from '@/tools/edit-video/pages/EditVideoPage';
// Secondary tools: lazy-loaded (not default landing pages, so hydration race is less likely)
const EditImagesPage = lazy(() => import('@/tools/edit-images/pages/EditImagesPage'));
const TrainingDataHelperPage = lazy(() => import('@/tools/training-data-helper/pages/TrainingDataHelperPage'));
import BlogListPage from '@/pages/Blog/BlogListPage';
import BlogPostPage from '@/pages/Blog/BlogPostPage';
import NotFoundPage from '@/pages/NotFoundPage';
import ShotsPage from "@/pages/ShotsPage";
import Layout from './Layout'; // Import the new Layout component
import { AppEnv } from '@/types/env';
import { ReighLoading } from '@/shared/components/ReighLoading';
import { ToolErrorBoundary } from '@/shared/components/ToolErrorBoundary';
import { probeStoredSessionToken } from '@/shared/lib/supabaseSession';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';

// Determine the environment
const currentEnv = (import.meta.env.VITE_APP_ENV?.toLowerCase() || AppEnv.WEB);

// Loading fallback component for lazy loaded pages
const LazyLoadingFallback = () => (
  <ReighLoading />
);

// Synchronous loader — no navigator.locks, no network request.
// Layout handles the authoritative auth check; if the stored session is expired,
// AuthContext will detect it and Layout will redirect back to /home.
function authRedirectLoader() {
  const storedSessionProbe = probeStoredSessionToken();
  if (!storedSessionProbe.ok) {
    normalizeAndPresentError(storedSessionProbe.error, {
      context: 'routes.authRedirect.storageProbe',
      showToast: false,
      logData: {
        errorCode: storedSessionProbe.errorCode,
        recoverable: storedSessionProbe.recoverable,
        policy: storedSessionProbe.policy,
      },
    });
    return null;
  }

  return storedSessionProbe.value ? redirect('/tools/travel-between-images') : null;
}

const router = createBrowserRouter([
  // HomePage route without Layout (no header) when in web environment
  // Redirects logged-in users to /tools/travel-between-images
  ...(currentEnv === AppEnv.WEB ? [{
    path: '/',
    element: <HomePage />,
    loader: authRedirectLoader,
    errorElement: <NotFoundPage />,
  }] : []),

  // Add /home route that also leads to HomePage
  {
    path: '/home',
    element: <HomePage />,
    errorElement: <NotFoundPage />,
  },

  // Payment pages (outside of Layout to avoid auth requirements)
  {
    path: '/payments/success',
    element: <PaymentSuccessPage />,
    errorElement: <NotFoundPage />,
  },
  {
    path: '/payments/cancel',
    element: <PaymentCancelPage />,
    errorElement: <NotFoundPage />,
  },

  // Share page (public, outside of Layout)
  {
    path: '/share/:shareId',
    element: <SharePage />,
    errorElement: <NotFoundPage />,
  },

  // Blog pages (public, outside of Layout)
  {
    path: '/blog',
    element: <BlogListPage />,
    errorElement: <NotFoundPage />,
  },
  {
    path: '/blog/:slug',
    element: <BlogPostPage />,
    errorElement: <NotFoundPage />,
  },


  {
    element: <Layout />,
    errorElement: <NotFoundPage />,
    children: [
      // In non-web (PWA) environments, `/` just redirects to tools
      // Layout handles auth - unauthed users get sent to /home
      ...(currentEnv !== AppEnv.WEB ? [{
        path: '/',
        loader: () => redirect('/tools/travel-between-images'),
      }] : []),
      {
        path: '/tools',
        loader: () => redirect('/tools/travel-between-images'),
      },
      {
        path: '/tools/image-generation',
        element: <ToolErrorBoundary toolName="Image Generation"><ImageGenerationToolPage /></ToolErrorBoundary>,
        // Add a stable key to prevent remounting on route revisits
        loader: () => null,
      },
      {
        path: '/tools/travel-between-images',
        element: <ToolErrorBoundary toolName="Video Travel"><VideoTravelToolPage /></ToolErrorBoundary>,
      },
      {
        path: '/tools/character-animate',
        element: <ToolErrorBoundary toolName="Character Animate"><CharacterAnimatePage /></ToolErrorBoundary>,
      },
      {
        path: '/tools/join-clips',
        element: <ToolErrorBoundary toolName="Join Clips"><JoinClipsPage /></ToolErrorBoundary>,
      },
      {
        path: '/tools/edit-images',
        element: (
          <ToolErrorBoundary toolName="Edit Images">
            <Suspense fallback={<LazyLoadingFallback />}>
              <EditImagesPage />
            </Suspense>
          </ToolErrorBoundary>
        ),
      },
      {
        path: '/tools/edit-video',
        element: <ToolErrorBoundary toolName="Edit Video"><EditVideoPage /></ToolErrorBoundary>,
      },
      {
        path: '/tools/training-data-helper',
        element: (
          <ToolErrorBoundary toolName="Training Data Helper">
            <Suspense fallback={<LazyLoadingFallback />}>
              <TrainingDataHelperPage />
            </Suspense>
          </ToolErrorBoundary>
        ),
      },
      {
        path: '/shots',
        element: <ShotsPage />,
      },
      {
        path: '/art',
        element: <ArtPage />,
      },
      // Any other top-level page routes can become children here
    ]
  },
  // If you have routes that shouldn't use the Layout, they can remain outside
  // For example, a dedicated login page or a full-screen error page.
  // However, for most standard pages, they will be children of the Layout route.
  // The root NotFoundPage is handled by errorElement on the Layout route.
  // If you need a catch-all * route, it can be added as a child of Layout as well.
  {
    path: '*',
    element: <NotFoundPage /> // This can be a child of Layout or a separate top-level route
    // If child of Layout: { path: '*', element: <NotFoundPage /> }
    // If you want NotFoundPage to also have the Layout, put it in children array.
    // For a non-layout 404, keep it separate or rely on the errorElement.
  }
]);

export function AppRoutes() {
  return <RouterProvider router={router} future={{ v7_startTransition: true }} />;
} 
