import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { PublicAstridShell } from './PublicAstridShell.tsx';
import { PublicAstridVision } from './PublicAstridVision.tsx';
import { VISION_PATH } from './publicAstridLinks';
import './PublicAstridSite.css';

type PublicAstridPage = 'home' | 'vision';

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<void> };
};

function pageAtLocation(): PublicAstridPage {
  return window.location.pathname === VISION_PATH ? 'vision' : 'home';
}

/**
 * Home and Vision & Issues are two rooms of one page rather than two page loads, so moving between them is
 * a single View Transition: the brand glides between the hero and Vision's header, the BETA stamp opens
 * out into Vision's "Vision & Issues" label (and folds back into the stamp on the way home), and the rest
 * crossfades with the home page receding behind Vision. The sky is the same on both, so it holds still.
 * Home stays mounted while Vision is open, so coming back keeps App/Agent, the editor and the scroll
 * position exactly as they were.
 */
export function PublicAstridSite() {
  const [page, setPage] = useState<PublicAstridPage>(pageAtLocation);
  const [homeMounted, setHomeMounted] = useState(page === 'home');
  const pageRef = useRef(page);
  const homeUrlRef = useRef(page === 'home' ? window.location.href : '/');
  const homeScrollRef = useRef(0);

  const show = useCallback((next: PublicAstridPage) => {
    if (pageRef.current === next) return;
    const commit = () => {
      if (next === 'vision') homeScrollRef.current = window.scrollY;
      pageRef.current = next;
      flushSync(() => {
        setPage(next);
        if (next === 'home') setHomeMounted(true);
      });
      window.scrollTo(0, next === 'vision' ? 0 : homeScrollRef.current);
    };
    const doc = document as ViewTransitionDocument;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion || typeof doc.startViewTransition !== 'function') {
      commit();
      return;
    }
    // Scopes the shared-element names and the page animations in PublicAstridSite.css to this transition,
    // so the App/Agent colour fade keeps its own.
    const root = document.documentElement;
    root.dataset.astridPageTransition = next;
    doc.startViewTransition(commit).finished.finally(() => {
      if (root.dataset.astridPageTransition === next) delete root.dataset.astridPageTransition;
    });
  }, []);

  useEffect(() => {
    const onPopState = () => show(pageAtLocation());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [show]);

  const openVision = useCallback(() => {
    homeUrlRef.current = window.location.href;
    window.history.pushState({ astridPage: 'vision' }, '', VISION_PATH);
    show('vision');
  }, [show]);

  const goHome = useCallback(() => {
    // Opened from home: step back through history, as the browser's Back button would.
    if ((window.history.state as { astridPage?: string } | null)?.astridPage === 'vision') {
      window.history.back();
      return;
    }
    window.history.pushState(null, '', homeUrlRef.current);
    show('home');
  }, [show]);

  return (
    <>
      {homeMounted && (
        // Set aside rather than display: none, which would restart the editor's entrance animations when
        // the page comes back (see [data-astrid-page-away] in PublicAstridSite.css). Inert while away.
        <div data-astrid-page-away={page !== 'home' || undefined} {...(page !== 'home' ? { inert: '' } : {})}>
          <PublicAstridShell onOpenVision={openVision} />
        </div>
      )}
      {page === 'vision' && <PublicAstridVision onGoHome={goHome} />}
    </>
  );
}
