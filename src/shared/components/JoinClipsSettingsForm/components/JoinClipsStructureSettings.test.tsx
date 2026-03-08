import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JoinClipsStructureSettings } from './JoinClipsStructureSettings';

const mocks = vi.hoisted(() => ({
  Visualization: vi.fn((props: { infoContent?: unknown }) => (
    <div data-testid="visualization">
      {props.infoContent as ReactNode}
    </div>
  )),
  JoinClipsVisualizationInfo: vi.fn(() => <div data-testid="visualization-info" />),
}));

vi.mock('@/shared/components/ui/button', () => ({
  Button: ({ children, ...props }: Record<string, unknown>) => <button {...props}>{children}</button>,
}));

vi.mock('@/shared/components/ui/collapsible', () => ({
  Collapsible: ({ children }: { children: unknown }) => <>{children}</>,
  CollapsibleTrigger: ({ children }: { children: unknown }) => <>{children}</>,
  CollapsibleContent: ({ children }: { children: unknown }) => <>{children}</>,
}));

vi.mock('@/shared/components/ui/primitives/label', () => ({
  Label: ({ children, ...props }: Record<string, unknown>) => <label {...props}>{children}</label>,
}));

vi.mock('@/shared/components/ui/switch', () => ({
  Switch: ({
    id,
    checked,
    disabled,
    onCheckedChange,
  }: {
    id?: string;
    checked?: boolean;
    disabled?: boolean;
    onCheckedChange?: (value: boolean) => void;
  }) => (
    <input
      data-testid={id}
      type="checkbox"
      role="switch"
      checked={checked}
      disabled={disabled}
      onChange={(event) => onCheckedChange?.(event.currentTarget.checked)}
    />
  ),
}));

vi.mock('@/shared/components/ui/slider', () => ({
  Slider: ({
    id,
    value,
    min,
    max,
    step,
    onValueChange,
  }: {
    id: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onValueChange?: (value: number) => void;
  }) => (
    <input
      data-testid={id}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onValueChange?.(Number(event.currentTarget.value))}
    />
  ),
}));

vi.mock('@/shared/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: unknown }) => <>{children}</>,
  Tooltip: ({ children }: { children: unknown }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: unknown }) => <>{children}</>,
  TooltipContent: ({ children }: { children: unknown }) => <>{children}</>,
}));

vi.mock('@/shared/components/ImageGenerationForm/components/SectionHeader', () => ({
  SectionHeader: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock('../Visualization', () => ({
  Visualization: (...args: unknown[]) => mocks.Visualization(...args),
}));

vi.mock('./JoinClipsVisualizationInfo', () => ({
  JoinClipsVisualizationInfo: (...args: unknown[]) => mocks.JoinClipsVisualizationInfo(...args),
}));

describe('JoinClipsStructureSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('wires sliders/toggles/restore defaults and passes visualization props', () => {
    const setGapFrames = vi.fn();
    const setReplaceMode = vi.fn();
    const setKeepBridgingImages = vi.fn();
    const setUseInputVideoResolution = vi.fn();
    const setUseInputVideoFps = vi.fn();
    const setNoisedInputVideo = vi.fn();
    const handleContextFramesChange = vi.fn();
    const onRestoreDefaults = vi.fn();

    render(
      <JoinClipsStructureSettings
        gapFrames={12}
        setGapFrames={setGapFrames}
        contextFrames={8}
        replaceMode={false}
        setReplaceMode={setReplaceMode}
        keepBridgingImagesValue={false}
        setKeepBridgingImages={setKeepBridgingImages}
        showResolutionToggle
        useInputVideoResolution={false}
        setUseInputVideoResolution={setUseInputVideoResolution}
        showFpsToggle
        useInputVideoFps={false}
        setUseInputVideoFps={setUseInputVideoFps}
        noisedInputVideo={0.5}
        setNoisedInputVideo={setNoisedInputVideo}
        maxGapFrames={20}
        maxContextFrames={12}
        handleContextFramesChange={handleContextFramesChange}
        sliderNumber={(value) => Number(value)}
        clipPairs={[{ pairIndex: 0 } as never]}
        shortestClipFrames={40}
        minClipFramesRequired={16}
        actualTotal={47}
        quantizedTotal={48}
        onRestoreDefaults={onRestoreDefaults}
      />,
    );

    fireEvent.click(screen.getByText('Restore Defaults'));
    expect(onRestoreDefaults).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByTestId('join-gap-frames'), {
      target: { value: '40' },
    });
    expect(setGapFrames).toHaveBeenCalledWith(20);

    fireEvent.change(screen.getByTestId('join-context-frames'), {
      target: { value: '50' },
    });
    expect(handleContextFramesChange).toHaveBeenCalledWith(12);

    fireEvent.click(screen.getByTestId('join-replace-mode'));
    expect(setReplaceMode).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByTestId('join-keep-bridge'));
    expect(setKeepBridgingImages).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByTestId('join-resolution-source'));
    expect(setUseInputVideoResolution).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByTestId('join-fps-source'));
    expect(setUseInputVideoFps).toHaveBeenCalledWith(true);

    fireEvent.change(screen.getByTestId('join-noised-input'), {
      target: { value: '0.9' },
    });
    expect(setNoisedInputVideo).toHaveBeenCalledWith(0.9);

    expect(screen.getByTestId('visualization')).toBeInTheDocument();
    expect(mocks.Visualization).toHaveBeenCalledWith(expect.objectContaining({
      gapFrames: 12,
      contextFrames: 8,
      replaceMode: false,
      keepBridgingImages: false,
      clipPairs: [{ pairIndex: 0 }],
      infoContent: expect.any(Object),
    }), {});
    expect(mocks.JoinClipsVisualizationInfo).toHaveBeenCalledWith(expect.objectContaining({
      actualTotal: 47,
      quantizedTotal: 48,
      shortestClipFrames: 40,
      minClipFramesRequired: 16,
      replaceMode: false,
      gapFrames: 12,
      contextFrames: 8,
    }), {});
  });

  it('disables bridge anchors when gap frames are too low and hides advanced controls when unavailable', () => {
    render(
      <JoinClipsStructureSettings
        gapFrames={8}
        setGapFrames={vi.fn()}
        contextFrames={4}
        replaceMode={true}
        setReplaceMode={vi.fn()}
        keepBridgingImagesValue={true}
        setKeepBridgingImages={vi.fn()}
        showResolutionToggle={false}
        showFpsToggle={false}
        noisedInputVideo={0.2}
        maxGapFrames={20}
        maxContextFrames={10}
        handleContextFramesChange={vi.fn()}
        sliderNumber={(value) => Number(value)}
        clipPairs={[]}
        shortestClipFrames={undefined}
        minClipFramesRequired={16}
        actualTotal={32}
        quantizedTotal={32}
      />,
    );

    const bridgeSwitch = screen.getByTestId('join-keep-bridge');
    expect(bridgeSwitch).toBeDisabled();
    expect(bridgeSwitch).not.toBeChecked();
    expect(screen.queryByText('Advanced')).not.toBeInTheDocument();
    expect(screen.queryByText('Restore Defaults')).not.toBeInTheDocument();
  });
});
