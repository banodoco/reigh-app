import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import {
  LoraStyleSection,
  MotionReferenceSection,
  PhilosophyClosingSection,
  TravelDemoSection,
} from './PhilosophySections';

const mocks = vi.hoisted(() => ({
  travelSelector: vi.fn(() => <div data-testid="travel-selector" />),
  motionComparison: vi.fn(() => <div data-testid="motion-comparison" />),
}));

vi.mock('../../motion/VideoWithPoster', () => ({
  getThumbPath: (src: string) => `thumb:${src}`,
}));

vi.mock('../../motion/TravelSelector', () => ({
  TravelSelector: (props: unknown) => mocks.travelSelector(props),
}));

vi.mock('../../motion/MotionComparison', () => ({
  MotionComparison: (props: unknown) => mocks.motionComparison(props),
}));

describe('PhilosophySections', () => {
  it('renders travel demo and triggers replay for the selected example', () => {
    const playTravelVideo = vi.fn();
    render(
      <TravelDemoSection
        currentExample={{
          prompt: 'a prompt',
          image1: '/image-1.jpg',
          image2: '/image-2.jpg',
          video: '/example.mp4',
        }}
        selectedExampleStyle="style-a"
        travelExamples={[
          {
            id: 'demo-0',
            label: 'Two image',
            images: ['/image-1.jpg', '/image-2.jpg'],
            video: '/example.mp4',
            poster: '/poster.jpg',
          },
        ]}
        selectedTravelExample={0}
        autoAdvance={{
          nextAdvanceIdx: null,
          prevAdvanceIdx: null,
          drainingIdx: null,
          videoProgress: 0,
          videoEnded: new Set([0]),
          videoPlayed: new Set(),
        }}
        loadedImages={new Set(['/image-1.jpg', '/image-2.jpg'])}
        philosophyVideoRef={{ current: null }}
        travelVideoRefs={{ current: [] }}
        handleImageLoad={vi.fn()}
        handleImageRef={vi.fn()}
        handleSelectExample={vi.fn()}
        handleVideoTimeUpdate={vi.fn()}
        handleTravelVideoEnded={vi.fn()}
        playTravelVideo={playTravelVideo}
      />,
    );

    expect(screen.getByTestId('travel-selector')).toBeInTheDocument();
    expect(mocks.travelSelector).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedIndex: 0,
        twoImageImages: ['/image-1.jpg', '/image-2.jpg'],
      }),
    );

    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(playTravelVideo).toHaveBeenCalledWith(0);
  });

  it('renders motion reference grid and embedded comparison component', () => {
    render(
      <MotionReferenceSection
        loadedImages={new Set()}
        handleImageLoad={vi.fn()}
        handleImageRef={vi.fn()}
      />,
    );

    expect(screen.getByTestId('motion-comparison')).toBeInTheDocument();
    expect(screen.getAllByAltText(/Input \d+/)).toHaveLength(16);
  });

  it('renders lora section controls and invokes replay toggle', () => {
    const toggleLoraPlay = vi.fn();
    render(
      <LoraStyleSection
        loraPlaying={false}
        loadedImages={new Set(['/lora-grid-combined-poster.jpg'])}
        loadedVideos={new Set(['/lora-grid-pingpong.mp4'])}
        loraVideosRef={{ current: [] }}
        handleImageLoad={vi.fn()}
        handleImageRef={vi.fn()}
        handleVideoLoad={vi.fn()}
        handleLoraVideoEnded={vi.fn()}
        toggleLoraPlay={toggleLoraPlay}
      />,
    );

    fireEvent.click(screen.getByRole('button'));
    expect(toggleLoraPlay).toHaveBeenCalledTimes(1);
  });

  it('renders closing actions and navigates to the tool route', () => {
    const navigate = vi.fn();
    render(<PhilosophyClosingSection navigate={navigate} />);

    fireEvent.click(screen.getByRole('button', { name: 'Try the tool' }));
    expect(navigate).toHaveBeenCalledWith('/tools');
    expect(screen.getByRole('link', { name: 'Join the community' })).toHaveAttribute(
      'href',
      'https://discord.gg/D5K2c6kfhy',
    );
  });
});
