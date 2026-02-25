import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useReferralTracking } from '@/shared/hooks/useReferralTracking';
import { useDebounce } from '@/shared/hooks/core/useDebounce';
import { useIsMobile } from '@/shared/hooks/mobile';
import usePersistentState from '@/shared/hooks/usePersistentState';

import { HeroSection } from './components/hero/HeroSection';
import { CreativePartnerPane } from './components/panes/CreativePartnerPane';
import { PhilosophyPane } from './components/panes/PhilosophyPane';
import { ExamplesPane } from './components/panes/ExamplesPane';
import { HomeBackground } from './components/hero/HomeBackground';

import { usePaneState } from './hooks/usePaneState';
import { useVideoPreload } from './hooks/useVideoPreload';
import { useHomePagePreload } from './hooks/useHomePagePreload';
import { useHomeAuth } from './hooks/useHomeAuth';
import { useHeroVideo } from './hooks/useHeroVideo';
import { useHomePageTheme } from './hooks/useHomePageTheme';
import { useHomePageRuntimeEffects } from './hooks/useHomePageRuntimeEffects';
import { useDiscordSignIn } from './hooks/useDiscordSignIn';
import { exampleStyles } from './constants';

export default function HomePage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [userDarkModePref] = usePersistentState<boolean>('dark-mode', true);
  useHomePageTheme(userDarkModePref);

  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const [ecosystemTipOpen, setEcosystemTipOpen] = useState(false);
  const [ecosystemTipDisabled, setEcosystemTipDisabled] = useState(false);

  const selectedExampleStyle = 'Dramatic';
  const currentExample = exampleStyles[selectedExampleStyle as keyof typeof exampleStyles];

  const paneState = usePaneState();
  useHomePagePreload();

  const { session } = useHomeAuth();
  const {
    videoARef,
    videoBRef,
    isLoopVideo,
    posterLoaded,
    videoRevealRef,
    handleVideoAEnded,
  } = useHeroVideo(isMobile);

  useVideoPreload({
    showPhilosophy: paneState.showPhilosophy,
    videoUrl: currentExample?.video,
  });

  useReferralTracking();

  useHomePageRuntimeEffects({
    isMobile,
    ecosystemTipOpen,
    setEcosystemTipOpen,
    setEcosystemTipDisabled,
    setAssetsLoaded,
  });

  const handleDiscordSignIn = useDiscordSignIn();
  const barTransitionCompleted = useDebounce(assetsLoaded, 200);

  return (
    <div className="min-h-screen overflow-hidden" style={{ backgroundColor: '#010E00' }}>
      <HomeBackground
        isMobile={isMobile}
        isLoopVideo={isLoopVideo}
        posterLoaded={posterLoaded}
        videoARef={videoARef}
        videoBRef={videoBRef}
        videoRevealRef={videoRevealRef}
        onVideoAEnded={handleVideoAEnded}
      />

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
        onEcosystemTipOpenChange={setEcosystemTipOpen}
        onEcosystemTipDisabledChange={setEcosystemTipDisabled}
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
