import React from 'react';
import { GlassSidePane } from './GlassSidePane';
import {
  LoraStyleSection,
  MotionReferenceSection,
  PhilosophyClosingSection,
  PLACEHOLDER_MEDIA,
  TravelDemoSection,
  type PhilosophyExampleStyle,
  type PhilosophyTravelExample,
} from './sections/PhilosophySections';
import { usePhilosophyPaneMedia } from './hooks/usePhilosophyPaneMedia';

interface PhilosophyPaneProps {
  isOpen: boolean;
  onClose: () => void;
  isClosing: boolean;
  isOpening: boolean;
  currentExample: PhilosophyExampleStyle;
  navigate: (path: string) => void;
  selectedExampleStyle: string;
}

const travelExamples: PhilosophyTravelExample[] = [
  {
    id: '2-images',
    label: '2 Images',
    images: [PLACEHOLDER_MEDIA, PLACEHOLDER_MEDIA],
    video: PLACEHOLDER_MEDIA,
    poster: PLACEHOLDER_MEDIA,
  },
  {
    id: '4-images',
    label: '4 Images',
    images: ['/916-1.jpg', '/916-2.jpg', '/916-3.jpg', '/916-4.jpg'],
    video: '/916-output.mp4',
    poster: '/916-output-poster.jpg',
  },
  {
    id: '7-images',
    label: '7 Images',
    images: ['/h1-crop.webp', '/h2-crop.webp', '/h3-crop.webp', '/h4-crop.webp', '/h5-crop.webp', '/h6-crop.webp', '/h7-crop.webp'],
    video: '/h-output.mp4',
    poster: '/h-output-poster.jpg',
  },
];

const PHILOSOPHY_PANE_KEYFRAMES = `
  @keyframes revealBorderLeftToRight {
    from { clip-path: inset(0 100% 0 0); }
    to { clip-path: inset(0 0% 0 0); }
  }
  @keyframes hideBorderLeftToRight {
    from { clip-path: inset(0 0% 0 0); }
    to { clip-path: inset(0 0% 0 100%); }
  }
  @keyframes drainFillLeftToRight {
    from { clip-path: inset(0 0 0 0); }
    to { clip-path: inset(0 0 0 100%); }
  }
`;

export const PhilosophyPane: React.FC<PhilosophyPaneProps> = ({
  isOpen,
  onClose,
  isClosing,
  isOpening,
  currentExample,
  navigate,
  selectedExampleStyle,
}) => {
  const {
    philosophyVideoRef,
    travelVideoRefs,
    loraVideosRef,
    selectedTravelExample,
    loraPlaying,
    loadedImages,
    loadedVideos,
    autoAdvance,
    handleImageLoad,
    handleImageRef,
    handleVideoLoad,
    handleSelectExample,
    handleTravelVideoEnded,
    handleVideoTimeUpdate,
    playTravelVideo,
    toggleLoraPlay,
    handleLoraVideoEnded,
  } = usePhilosophyPaneMedia({
    isOpen,
    isClosing,
    isOpening,
    currentExample,
    travelExamples,
  });

  return (
    <GlassSidePane isOpen={isOpen} onClose={onClose} side="right" zIndex={60}>
      <style>{PHILOSOPHY_PANE_KEYFRAMES}</style>

      <div className="mt-8 sm:mt-10 mb-6 relative z-10">
        <h2 className="text-2xl sm:text-3xl font-theme-heading text-primary leading-tight mb-5">
          reigh is a tool made just for travelling between images
        </h2>
        <div className="w-20 h-1.5 bg-gradient-to-r from-wes-vintage-gold to-wes-vintage-gold/50 rounded-full animate-pulse-breathe opacity-90" />
      </div>

      <div className="space-y-8 pb-1 text-left text-foreground/85 font-medium">
        <div className="space-y-3">
          <p className="text-sm leading-7">
            There are many tools that aim to be a 'one-stop-shop' for creating with AI - a kind of 'Amazon for art'.
          </p>
          <p className="text-sm leading-7">
            <span className="font-theme-heading">Reigh</span> is not one of them.
          </p>
          <p className="text-sm leading-7">
            It's a tool <span className="text-wes-vintage-gold">just for travelling between images</span>:
          </p>
        </div>

        <TravelDemoSection
          currentExample={currentExample}
          selectedExampleStyle={selectedExampleStyle}
          travelExamples={travelExamples}
          selectedTravelExample={selectedTravelExample}
          autoAdvance={autoAdvance}
          loadedImages={loadedImages}
          philosophyVideoRef={philosophyVideoRef}
          travelVideoRefs={travelVideoRefs}
          handleImageLoad={handleImageLoad}
          handleImageRef={handleImageRef}
          handleSelectExample={handleSelectExample}
          handleVideoTimeUpdate={handleVideoTimeUpdate}
          handleTravelVideoEnded={handleTravelVideoEnded}
          playTravelVideo={playTravelVideo}
        />

        <MotionReferenceSection
          loadedImages={loadedImages}
          handleImageLoad={handleImageLoad}
          handleImageRef={handleImageRef}
        />

        <LoraStyleSection
          loraPlaying={loraPlaying}
          loadedImages={loadedImages}
          loadedVideos={loadedVideos}
          loraVideosRef={loraVideosRef}
          handleImageLoad={handleImageLoad}
          handleImageRef={handleImageRef}
          handleVideoLoad={handleVideoLoad}
          handleLoraVideoEnded={handleLoraVideoEnded}
          toggleLoraPlay={toggleLoraPlay}
        />

        <PhilosophyClosingSection navigate={navigate} />
      </div>
    </GlassSidePane>
  );
};
