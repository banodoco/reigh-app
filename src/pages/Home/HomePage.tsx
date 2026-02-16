import { useState, useEffect, useLayoutEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate, useLocation } from 'react-router-dom';

import { toast } from '@/shared/components/ui/use-toast';
import { handleError } from '@/shared/lib/errorHandler';
import { useReferralTracking } from '@/shared/hooks/useReferralTracking';
import { ConstellationCanvas } from '@/shared/components/ConstellationCanvas';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import usePersistentState from '@/shared/hooks/usePersistentState';

// Components
import { HeroSection } from './components/HeroSection';
import { CreativePartnerPane } from './components/CreativePartnerPane';
import { PhilosophyPane } from './components/PhilosophyPane';
import { ExamplesPane } from './components/ExamplesPane';

// Hooks & Constants
import { usePaneState } from './hooks/usePaneState';
import { useVideoPreload } from './hooks/useVideoPreload';
import { useHomePagePreload } from './hooks/useHomePagePreload';
import { useHomeAuth } from './hooks/useHomeAuth';
import { useHeroVideo } from './hooks/useHeroVideo';
import { exampleStyles } from './constants';

export default function HomePage() {
  // --- State Management ---
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  // Get user's actual dark mode preference (don't use the hook to avoid side effects)
  const [userDarkModePref] = usePersistentState<boolean>('dark-mode', true);

  // Force dark mode on homepage without changing user's settings
  // Use useLayoutEffect to set dark mode BEFORE paint, preventing flash
  useLayoutEffect(() => {
    // Always add dark class on homepage
    document.documentElement.classList.add('dark');

    // Restore user's preference when leaving
    return () => {
      if (!userDarkModePref) {
        document.documentElement.classList.remove('dark');
      }
    };
  }, [userDarkModePref]);

  // Assets & Animation State
  const [assetsLoaded, setAssetsLoaded] = useState(false);

  const [ecosystemTipOpen, setEcosystemTipOpen] = useState(false);
  const [ecosystemTipDisabled, setEcosystemTipDisabled] = useState(false);

  // Example Style
  const selectedExampleStyle = 'Dramatic';
  const currentExample = exampleStyles[selectedExampleStyle as keyof typeof exampleStyles];

  // Pane Logic Hook
  const paneState = usePaneState();

  // Preload home page thumbnails (only when this component mounts)
  useHomePagePreload();

  // Extracted hooks
  const { session } = useHomeAuth();
  const {
    videoARef,
    videoBRef,
    isLoopVideo,
    posterLoaded,
    videoRevealRef,
    handleVideoAEnded,
  } = useHeroVideo(isMobile);

  // Video Preload Hook
  useVideoPreload({
    showPhilosophy: paneState.showPhilosophy,
    videoUrl: currentExample?.video
  });

  // Referral Tracking
  useReferralTracking();

  // --- Effects ---

  // Preload assets with fallback timeout
  useEffect(() => {
    let loaded = false;
    const markLoaded = () => {
      if (!loaded) {
        loaded = true;
        setAssetsLoaded(true);
      }
    };

    const img = new Image();
    img.src = '/favicon-16x16.png';
    img.onload = markLoaded;
    img.onerror = markLoaded;

    // Fallback: if image events don't fire within 2s, proceed anyway
    const fallbackTimer = setTimeout(markLoaded, 2000);

    return () => clearTimeout(fallbackTimer);
  }, []);

  // Redirect check
  useEffect(() => {
    if ((location.state as { fromProtected?: boolean } | null)?.fromProtected) {
      toast({ description: 'You need to be logged in to view that page.' });
      navigate(location.pathname, { replace: true });
    }
  }, [location, navigate]);

  // Scroll & Body handling
  useEffect(() => {
    window.scrollTo(0, 0);
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, []);

  // Tooltip Mobile Scroll Logic
  useEffect(() => {
    if (!isMobile || !ecosystemTipOpen) return;

    const handleScroll = () => {
      setEcosystemTipOpen(false);
      setEcosystemTipDisabled(false);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    document.addEventListener('touchmove', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      document.removeEventListener('touchmove', handleScroll);
    };
  }, [isMobile, ecosystemTipOpen]);

  // --- Handlers ---

  const handleDiscordSignIn = async () => {
    try {
      try { localStorage.setItem('oauthInProgress', 'true'); } catch { /* intentionally ignored */ }
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'discord',
        options: {
          redirectTo: window.location.origin,
        },
      });

      if (error) {
        handleError(error, { context: 'HomePage', toastTitle: 'Failed to start Discord sign-in. Please try again.' });
        return;
      }

    } catch (err) {
      handleError(err, { context: 'HomePage', toastTitle: 'An unexpected error occurred. Please try again.' });
    }
  };

  const barTransitionCompleted = useDebounce(assetsLoaded, 200);

  return (
    <div className="min-h-screen overflow-hidden" style={{ backgroundColor: '#010E00' }}>
      {/* Background Videos - Two-video system for seamless looping on desktop */}
      {/* Wrapped in video-reveal container for painterly mask animation */}
      <div ref={videoRevealRef} className="fixed inset-0 video-reveal" style={{ zIndex: 0 }}>
        {isMobile ? (
          // Mobile: single looping video
          <video
            ref={videoARef}
            autoPlay
            loop
            muted
            playsInline
            // @ts-expect-error webkit-specific attribute for iOS
            webkit-playsinline="true"
            preload="auto"
            poster={posterLoaded ? "/hero-background-poster.jpg" : undefined}
            src="/hero-background-mobile.mp4"
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <>
            {/* Video A - Landing video (plays once) */}
            <video
              ref={videoARef}
              autoPlay
              muted
              playsInline
              // @ts-expect-error webkit-specific attribute for iOS
              webkit-playsinline="true"
              preload="auto"
              poster={posterLoaded ? "/hero-background-poster.jpg" : undefined}
              src="/hero-background-easeout-smooth-web.mp4"
              className="absolute inset-0 w-full h-full object-cover"
              style={{
                // Hide Video A once we switch to loop video
                opacity: isLoopVideo ? 0 : 1,
                pointerEvents: isLoopVideo ? 'none' : 'auto',
              }}
              onEnded={handleVideoAEnded}
            />

            {/* Video B - Loop video (preloaded, shown after Video A ends) */}
            <video
              ref={videoBRef}
              loop
              muted
              playsInline
              // @ts-expect-error webkit-specific attribute for iOS
              webkit-playsinline="true"
              preload="none"
              src="/hero-background-loop.mp4"
              className="absolute inset-0 w-full h-full object-cover"
              style={{
                // Show Video B once we switch to loop video
                opacity: isLoopVideo ? 1 : 0,
                pointerEvents: isLoopVideo ? 'auto' : 'none',
              }}
            />
          </>
        )}
      </div>

      {/* Film grain overlay - above video, below darkening */}
      <div className="fixed inset-0 bg-film-grain opacity-30 animate-film-grain pointer-events-none" style={{ zIndex: 1 }} />

      {/* Overlay to darken video for readability */}
      <div className="fixed inset-0 bg-black/50" style={{ zIndex: 2 }} />

      <ConstellationCanvas />

      {/* Main content - above background layers */}
      <div className="relative" style={{ zIndex: 10 }}>
        <HeroSection
          barTransitionCompleted={barTransitionCompleted}
          session={session}
          handleDiscordSignIn={handleDiscordSignIn}
          navigate={navigate}
          assetsLoaded={assetsLoaded}
          handleOpenToolActivate={paneState.handleOpenToolActivate}
          handleEmergingActivate={paneState.handleEmergingActivate}
          currentExample={currentExample}
          isPaneOpen={paneState.showCreativePartner || paneState.showPhilosophy || paneState.showExamples}
        />
      </div>

      {/* Overlay for Panes */}
      {(paneState.showCreativePartner || paneState.showPhilosophy || paneState.showExamples) && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-all duration-300"
          onClick={paneState.closeAllPanes}
        />
      )}

      <CreativePartnerPane
        isOpen={paneState.showCreativePartner}
        onClose={paneState.handleCloseCreativePartner}
        isClosing={paneState.isCreativePartnerPaneClosing}
        isOpening={paneState.isCreativePartnerPaneOpening}
        ecosystemTipOpen={ecosystemTipOpen}
        ecosystemTipDisabled={ecosystemTipDisabled}
        setEcosystemTipOpen={setEcosystemTipOpen}
        setEcosystemTipDisabled={setEcosystemTipDisabled}
        navigate={navigate}
      />

      <PhilosophyPane
        isOpen={paneState.showPhilosophy}
        onClose={paneState.handleClosePhilosophy}
        isClosing={paneState.isPhilosophyPaneClosing}
        isOpening={paneState.isPhilosophyPaneOpening}
        currentExample={currentExample}
        navigate={navigate}
        selectedExampleStyle={selectedExampleStyle}
      />

      <ExamplesPane
        isOpen={paneState.showExamples}
        onClose={paneState.handleCloseExamples}
        navigate={navigate}
      />

    </div>
  );
}
