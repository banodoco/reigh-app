/**
 * VideoEditContext Tests
 *
 * Tests for the video edit context and safe hooks.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

import {
  VideoEditProvider,
  useVideoEditSafe,
  type VideoEditState,
} from '../VideoEditContext';

describe('VideoEditContext', () => {
  describe('useVideoEditSafe outside provider', () => {
    it('returns default empty state', () => {
      function Consumer() {
        const state = useVideoEditSafe();
        return (
          <div>
            <span data-testid="isInVideoEditMode">{String(state.isInVideoEditMode)}</span>
            <span data-testid="videoEditSubMode">{String(state.videoEditSubMode)}</span>
            <span data-testid="isVideoTrimModeActive">{String(state.isVideoTrimModeActive)}</span>
            <span data-testid="isVideoEditModeActive">{String(state.isVideoEditModeActive)}</span>
            <span data-testid="videoDuration">{state.videoDuration}</span>
            <span data-testid="hasTrimChanges">{String(state.hasTrimChanges)}</span>
            <span data-testid="trimmedDuration">{state.trimmedDuration}</span>
          </div>
        );
      }

      render(<Consumer />);

      expect(screen.getByTestId('isInVideoEditMode')).toHaveTextContent('false');
      expect(screen.getByTestId('videoEditSubMode')).toHaveTextContent('null');
      expect(screen.getByTestId('isVideoTrimModeActive')).toHaveTextContent('false');
      expect(screen.getByTestId('isVideoEditModeActive')).toHaveTextContent('false');
      expect(screen.getByTestId('videoDuration')).toHaveTextContent('0');
      expect(screen.getByTestId('hasTrimChanges')).toHaveTextContent('false');
      expect(screen.getByTestId('trimmedDuration')).toHaveTextContent('0');
    });

    it('default setters are no-ops and do not throw', () => {
      function Consumer() {
        const state = useVideoEditSafe();
        return (
          <div>
            <button data-testid="enter" onClick={state.handleEnterVideoEditMode}>
              Enter
            </button>
            <button data-testid="exit" onClick={state.handleExitVideoEditMode}>
              Exit
            </button>
            <button data-testid="trim" onClick={state.handleEnterVideoTrimMode}>
              Trim
            </button>
            <button data-testid="resetTrim" onClick={state.resetTrim}>
              Reset
            </button>
          </div>
        );
      }

      render(<Consumer />);

      // Should not throw
      screen.getByTestId('enter').click();
      screen.getByTestId('exit').click();
      screen.getByTestId('trim').click();
      screen.getByTestId('resetTrim').click();
    });
  });

  describe('VideoEditProvider', () => {
    const mockValue: VideoEditState = {
      isInVideoEditMode: true,
      videoEditSubMode: 'trim',
      isVideoTrimModeActive: true,
      isVideoEditModeActive: false,
      setVideoEditSubMode: vi.fn(),
      handleEnterVideoEditMode: vi.fn(),
      handleExitVideoEditMode: vi.fn(),
      handleEnterVideoTrimMode: vi.fn(),
      handleEnterVideoReplaceMode: vi.fn(),
      handleEnterVideoRegenerateMode: vi.fn(),
      handleEnterVideoEnhanceMode: vi.fn(),
      trimState: { startTrim: 0, endTrim: 5, videoDuration: 10 },
      setStartTrim: vi.fn(),
      setEndTrim: vi.fn(),
      resetTrim: vi.fn(),
      trimmedDuration: 5,
      hasTrimChanges: true,
      videoDuration: 10,
      setVideoDuration: vi.fn(),
      trimCurrentTime: 2.5,
      setTrimCurrentTime: vi.fn(),
      trimVideoRef: { current: null },
      videoEditing: null,
      enhanceSettings: {
        enableInterpolation: false,
        enableUpscale: true,
        numFrames: 1,
        upscaleFactor: 2,
        colorFix: true,
        outputQuality: 'high',
      },
      updateEnhanceSetting: vi.fn(),
    };

    it('renders children', () => {
      render(
        <VideoEditProvider value={mockValue}>
          <div data-testid="child">Hello</div>
        </VideoEditProvider>
      );

      expect(screen.getByTestId('child')).toHaveTextContent('Hello');
    });

    it('provides state to consumers', () => {
      function Consumer() {
        const state = useVideoEditSafe();
        return (
          <div>
            <span data-testid="isInVideoEditMode">{String(state.isInVideoEditMode)}</span>
            <span data-testid="videoEditSubMode">{state.videoEditSubMode}</span>
            <span data-testid="isVideoTrimModeActive">{String(state.isVideoTrimModeActive)}</span>
            <span data-testid="videoDuration">{state.videoDuration}</span>
            <span data-testid="hasTrimChanges">{String(state.hasTrimChanges)}</span>
          </div>
        );
      }

      render(
        <VideoEditProvider value={mockValue}>
          <Consumer />
        </VideoEditProvider>
      );

      expect(screen.getByTestId('isInVideoEditMode')).toHaveTextContent('true');
      expect(screen.getByTestId('videoEditSubMode')).toHaveTextContent('trim');
      expect(screen.getByTestId('isVideoTrimModeActive')).toHaveTextContent('true');
      expect(screen.getByTestId('videoDuration')).toHaveTextContent('10');
      expect(screen.getByTestId('hasTrimChanges')).toHaveTextContent('true');
    });

    it('provides enhance settings', () => {
      function Consumer() {
        const state = useVideoEditSafe();
        return (
          <div>
            <span data-testid="upscaleFactor">{state.enhanceSettings.upscaleFactor}</span>
            <span data-testid="outputQuality">{state.enhanceSettings.outputQuality}</span>
          </div>
        );
      }

      render(
        <VideoEditProvider value={mockValue}>
          <Consumer />
        </VideoEditProvider>
      );

      expect(screen.getByTestId('upscaleFactor')).toHaveTextContent('2');
      expect(screen.getByTestId('outputQuality')).toHaveTextContent('high');
    });
  });
});
