import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import {
  VideoGenerationModalFormContent,
  VideoGenerationModalHeader,
  VideoGenerationModalLoadingContent,
} from './VideoGenerationModalSections';

const mocks = vi.hoisted(() => ({
  batchSettingsForm: vi.fn(
    ({
      onBatchVideoPromptChange,
    }: {
      onBatchVideoPromptChange: (value: string) => void;
    }) => (
      <button data-testid="batch-settings-form" onClick={() => onBatchVideoPromptChange('updated prompt')}>
        batch
      </button>
    ),
  ),
  motionControl: vi.fn(
    ({
      mode,
    }: {
      mode: {
        onMotionModeChange: (mode: 'basic' | 'advanced') => void;
        guidanceKind?: string;
      };
    }) => (
      <button data-testid="motion-control" onClick={() => mode.onMotionModeChange('advanced')}>
        motion
      </button>
    ),
  ),
}));

vi.mock('@/shared/lib/media/mediaUrl', () => ({
  getDisplayUrl: (src: string | null | undefined) => `display:${src ?? ''}`,
}));

vi.mock('@/shared/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/shared/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock('@/shared/components/ui/skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => <div data-testid="skeleton" className={className} />,
}));

vi.mock('@/tools/travel-between-images/components/BatchSettingsForm', () => ({
  BatchSettingsForm: (props: unknown) => mocks.batchSettingsForm(props),
}));

vi.mock('@/tools/travel-between-images/components/MotionControl', () => ({
  MotionControl: (props: unknown) => mocks.motionControl(props),
}));

vi.mock('@/shared/components/ImageGenerationForm/components', () => ({
  SectionHeader: ({ title }: { title: string }) => <h2>{title}</h2>,
}));

describe('VideoGenerationModalSections', () => {
  it('renders header with shot name and navigate action', () => {
    const onNavigateToShot = vi.fn();
    render(
      <VideoGenerationModalHeader
        shotName="Shot A"
        onNavigateToShot={onNavigateToShot}
      />,
    );

    expect(screen.getByText(/Generate Video -/)).toHaveTextContent('Shot A');

    fireEvent.click(screen.getByRole('button'));
    expect(onNavigateToShot).toHaveBeenCalledTimes(1);
  });

  it('shows unnamed fallback when no shot name', () => {
    render(
      <VideoGenerationModalHeader
        shotName={undefined}
        onNavigateToShot={vi.fn()}
      />,
    );

    expect(screen.getByText(/Unnamed Shot/)).toBeInTheDocument();
  });

  it('renders loading skeleton layout', () => {
    render(<VideoGenerationModalLoadingContent />);
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(5);
  });

  it('wires form callbacks from settings and motion controls', () => {
    const updateField = vi.fn();
    render(
      <VideoGenerationModalFormContent
        settings={{
          prompt: 'start',
          motionMode: 'basic',
          phaseConfig: undefined,
        } as never}
        updateField={updateField as never}
        projects={[]}
        selectedProjectId={null}
        selectedLoras={[]}
        availableLoras={[]}
        accelerated={false}
        onAcceleratedChange={vi.fn()}
        randomSeed={false}
        onRandomSeedChange={vi.fn()}
        imageCount={2}
        hasStructureVideo={false}
        guidanceKind="flow"
        validPresetId={undefined}
        status="ready"
        onOpenLoraModal={vi.fn()}
        onRemoveLora={vi.fn()}
        onLoraStrengthChange={vi.fn()}
        onAddTriggerWord={vi.fn()}
      />,
    );

    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Motion')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('batch-settings-form'));
    fireEvent.click(screen.getByTestId('motion-control'));

    expect(updateField).toHaveBeenCalledWith('prompt', 'updated prompt');
    expect(updateField).toHaveBeenCalledWith('motionMode', 'advanced');
    expect(updateField).toHaveBeenCalledWith('advancedMode', true);
    expect(mocks.motionControl).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: expect.objectContaining({
          guidanceKind: 'flow',
        }),
      }),
    );
  });
});
