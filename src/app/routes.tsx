import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
const LegacyHomePage = lazy(() => import('@/pages/Home/HomePage'));
import ArtPage from '@/pages/ArtPage';
import PaymentSuccessPage from '@/pages/PaymentSuccessPage';
import PaymentCancelPage from '@/pages/PaymentCancelPage';
import SharePage from '@/pages/SharePage';
import PairingPage from '@/pages/PairingPage';

import VideoEditorPage from '@/tools/video-editor/pages/VideoEditorPage';
// Dev-only test harness route for extension activity region and manager states
const ExtensionHarnessPage = import.meta.env.DEV
  ? lazy(() => import('@/tools/video-editor/pages/ExtensionHarnessPage'))
  : null;
// Secondary tools: lazy-loaded (not default landing pages, so hydration race is less likely)
const BlogListPage = lazy(() => import('@/pages/Blog/BlogListPage'));
const BlogPostPage = lazy(() => import('@/pages/Blog/BlogPostPage'));
import NotFoundPage from '@/pages/NotFoundPage';
import ShotsPage from '@/pages/ShotsPage';
import { Layout } from './Layout';
import { DefaultToolRedirect } from './DefaultToolRedirect';
import { AppEnv } from '@/types/env';
import { ReighLoading } from '@/shared/components/ReighLoading';
import { ToolErrorBoundary } from '@/shared/components/ToolErrorBoundary';
import { ToolLaunchBoundary } from '@/shared/components/ToolLaunchBoundary';
import { TOOL_IDS } from '@/shared/lib/tooling/toolIds';
import { HomeDocumentHandoff } from './HomeDocumentHandoff.tsx';
import { isRecognizedOAuthCallbackUrl } from './entryClassification.ts';

// Determine the environment
const currentEnv = (import.meta.env.VITE_APP_ENV?.toLowerCase() || AppEnv.WEB);

// Loading fallback component for lazy loaded pages
const LazyLoadingFallback = () => (
  <ReighLoading />
);

function HomeWithAuthRedirect() {
  return (
    <Suspense fallback={<LazyLoadingFallback />}>
      <LegacyHomePage />
    </Suspense>
  );
}

function PublicHomeAppEntry({
  replaceDocument,
}: {
  replaceDocument?: (url: string) => void;
}) {
  if (isRecognizedOAuthCallbackUrl(new URL(window.location.href))) {
    return <HomeWithAuthRedirect />;
  }
  return <HomeDocumentHandoff replaceDocument={replaceDocument} />;
}

const usesPublicHomeDocument = currentEnv === AppEnv.WEB
  || currentEnv === AppEnv.DEV
  || currentEnv === AppEnv.LOCAL;

export function AppRoutes({
  homeDocumentReplacement,
}: {
  homeDocumentReplacement?: (url: string) => void;
} = {}) {
  return (
    <Routes>
      {currentEnv === AppEnv.WEB ? (
        <Route path="/" element={<HomeWithAuthRedirect />} />
      ) : null}

      <Route
        path="/home"
        element={usesPublicHomeDocument ? (
          <PublicHomeAppEntry replaceDocument={homeDocumentReplacement} />
        ) : <HomeWithAuthRedirect />}
      />

      <Route path="/payments/success" element={<PaymentSuccessPage />} />
      <Route path="/payments/cancel" element={<PaymentCancelPage />} />
      <Route path="/share/:shareId" element={<SharePage />} />
      <Route path="/pairing" element={<PairingPage />} />
      <Route
        path="/blog"
        element={(
          <Suspense fallback={<LazyLoadingFallback />}>
            <BlogListPage />
          </Suspense>
        )}
      />
      <Route
        path="/blog/:slug"
        element={(
          <Suspense fallback={<LazyLoadingFallback />}>
            <BlogPostPage />
          </Suspense>
        )}
      />

      <Route element={<Layout />}>
        {currentEnv !== AppEnv.WEB ? (
          <Route path="/" element={<DefaultToolRedirect />} />
        ) : null}
        <Route path="/tools" element={<DefaultToolRedirect />} />
        <Route
          path="/tools/image-generation"
          element={<Navigate to="/tools/video-editor" replace />}
        />
        <Route
          path="/tools/travel-between-images"
          element={<Navigate to="/tools/video-editor" replace />}
        />
        <Route
          path="/tools/character-animate"
          element={<Navigate to="/tools/video-editor" replace />}
        />
        <Route
          path="/tools/join-clips"
          element={<Navigate to="/tools/video-editor" replace />}
        />
        <Route
          path="/tools/edit-images"
          element={<Navigate to="/tools/video-editor" replace />}
        />
        <Route
          path="/tools/edit-video"
          element={<Navigate to="/tools/video-editor" replace />}
        />
        <Route
          path="/tools/video-editor"
          element={<ToolLaunchBoundary toolId={TOOL_IDS.VIDEO_EDITOR}>
            <ToolErrorBoundary toolName="Video Editor"><VideoEditorPage /></ToolErrorBoundary>
          </ToolLaunchBoundary>}
        />
        {import.meta.env.DEV && ExtensionHarnessPage ? (
          <Route
            path="/tools/video-editor/harness"
            element={(
              <ToolErrorBoundary toolName="Extension Harness">
                <Suspense fallback={<LazyLoadingFallback />}>
                  <ExtensionHarnessPage />
                </Suspense>
              </ToolErrorBoundary>
            )}
          />
        ) : null}
        <Route
          path="/tools/training-data-helper"
          element={<Navigate to="/tools/video-editor" replace />}
        />
        <Route path="/shots" element={<ShotsPage />} />
        <Route path="/art" element={<ArtPage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
