// @vitest-environment jsdom

import React, { useState } from 'react';
import { fireEvent, render, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TaskDetailsSummaryAndParams } from './TaskDetailsSummaryAndParams';
import { TaskGuidanceImages } from './TaskGuidanceImages';
import { TaskLoraDetails } from './TaskLoraDetails';
import { TaskPhaseDetails } from './TaskPhaseDetails';
import { TaskPromptDetails } from './TaskPromptDetails';
import { TaskTravelMetadata } from './TaskTravelMetadata';
import { getVariantConfig } from '../../../types/taskDetailsTypes';
import type { Task } from '../../../../types/tasks';
import type { LoraModel } from '../../../../domains/lora/types/lora';

const generationDetailsPropsSpy = vi.fn();

vi.mock('../../../../domains/generation/components/GenerationDetails', () => ({
  GenerationDetails: (props: Record<string, unknown>) => {
    generationDetailsPropsSpy(props);
    return <div data-testid="generation-details">Generation details stub</div>;
  },
}));

vi.mock('../../ui/button', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

function createTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    taskType: 'travel_orchestrator',
    params: { prompt: 'hello', frames: 16 },
    status: 'Complete',
    createdAt: '2026-03-09T12:00:00Z',
    projectId: 'project-1',
    ...overrides,
  };
}

const availableLoras: LoraModel[] = [
  {
    'Model ID': 'lora-1',
    Name: 'Painterly',
    Author: 'OpenAI',
    Images: [],
    'Model Files': [],
    huggingface_url: 'https://cdn.example.com/loras/painterly.safetensors',
  },
];

describe('TaskDetails coverage', () => {
  it('renders guidance images and structure video metadata', () => {
    const onShowAllImagesChange = vi.fn();
    const onLoadVideo = vi.fn();
    const { container } = render(
      <TaskGuidanceImages
        config={getVariantConfig('hover', false, 6)}
        effectiveInputImages={[
          'image-1.png',
          'image-2.png',
          'image-3.png',
          'image-4.png',
          'image-5.png',
          'image-6.png',
        ]}
        showAllImages={false}
        onShowAllImagesChange={onShowAllImagesChange}
        videoPath="guide.mp4"
        videoLoaded={false}
        onLoadVideo={onLoadVideo}
        structureGuidance={{
          target: 'structure',
          strength: 0.42,
          step_window: [4, 12],
        }}
        videoTreatment="clip"
        motionStrength={0.33}
      />,
    );
    const scope = within(container);

    expect(scope.getByText('Image Guidance (6)')).toBeTruthy();
    expect(scope.getByText('1 more')).toBeTruthy();
    expect(scope.getByText('Structure')).toBeTruthy();
    expect(scope.getByText('Window:')).toBeTruthy();
    expect(scope.getByText('4→12')).toBeTruthy();
    expect(scope.getByText('clip')).toBeTruthy();
    expect(scope.getByText('33%')).toBeTruthy();

    fireEvent.click(scope.getByText('1 more'));
    const videoTrigger = container.querySelector('div[style="width: 80px;"]');
    expect(videoTrigger).toBeTruthy();
    fireEvent.click(videoTrigger!);

    expect(onShowAllImagesChange).toHaveBeenCalledWith(true);
    expect(onLoadVideo).toHaveBeenCalled();
  });

  it('renders LoRA and phase details with copy actions', () => {
    const onCopyLoraUrl = vi.fn();
    const { container } = render(
      <>
        <TaskLoraDetails
          config={getVariantConfig('panel', false, 2)}
          additionalLoras={{
            'https://cdn.example.com/loras/painterly.safetensors': 0.75,
          }}
          availableLoras={availableLoras}
          copiedLoraUrl={null}
          onCopyLoraUrl={onCopyLoraUrl}
        />
        <TaskPhaseDetails
          config={getVariantConfig('panel', false, 2)}
          phaseConfig={{
            num_phases: 2,
            flow_shift: 5,
            sample_solver: 'euler',
            phases: [
              {
                phase: 1,
                guidance_scale: 7.5,
                loras: [
                  {
                    url: 'https://cdn.example.com/loras/painterly.safetensors',
                    multiplier: 0.65,
                  },
                ],
              },
              { phase: 2, guidance_scale: 9.0, loras: [] },
            ],
            steps_per_phase: [12, 14],
          }}
          phaseStepsDisplay="12 -> 14 (26 total)"
          showSummary
          availableLoras={availableLoras}
          copiedLoraUrl={null}
          onCopyLoraUrl={onCopyLoraUrl}
        />
      </>,
    );
    const scope = within(container);

    expect(scope.getAllByText('Painterly')).toHaveLength(2);
    expect(scope.getByText('0.8')).toBeTruthy();
    expect(scope.getByText('Phase Settings')).toBeTruthy();
    expect(scope.getByText('12 -> 14 (26 total)')).toBeTruthy();
    expect(scope.getByText('Phase 1')).toBeTruthy();
    expect(scope.getAllByText('Steps:')).toHaveLength(2);

    fireEvent.click(scope.getAllByTitle('Copy LoRA URL')[0]);
    fireEvent.click(scope.getAllByTitle('Copy LoRA URL')[1]);
    expect(onCopyLoraUrl).toHaveBeenCalledTimes(2);
    expect(onCopyLoraUrl).toHaveBeenCalledWith(
      'https://cdn.example.com/loras/painterly.safetensors',
    );
  });

  it('renders prompt details with truncation and external controls', () => {
    const onShowFullPromptChange = vi.fn();
    const onShowFullNegativePromptChange = vi.fn();
    const onCopyPrompt = vi.fn();
    const { container } = render(
      <TaskPromptDetails
        config={getVariantConfig('hover', false, 2)}
        prompt={'A'.repeat(110)}
        enhancePrompt="enhanced"
        negativePrompt={'B'.repeat(90)}
        showFullPrompt={false}
        onShowFullPromptChange={onShowFullPromptChange}
        showFullNegativePrompt={false}
        onShowFullNegativePromptChange={onShowFullNegativePromptChange}
        showCopyButtons
        copiedPrompt={false}
        onCopyPrompt={onCopyPrompt}
      />,
    );
    const scope = within(container);

    expect(scope.getByText('Prompt (enhanced)')).toBeTruthy();
    expect(scope.getAllByText('Show More')).toHaveLength(2);

    fireEvent.click(scope.getByTitle('Copy prompt'));
    fireEvent.click(scope.getAllByText('Show More')[0]);
    fireEvent.click(scope.getAllByText('Show More')[1]);

    expect(onCopyPrompt).toHaveBeenCalledWith('A'.repeat(110));
    expect(onShowFullPromptChange).toHaveBeenCalledWith(true);
    expect(onShowFullNegativePromptChange).toHaveBeenCalledWith(true);
  });

  it('renders travel metadata with preset, style, and advanced fields', () => {
    const { container } = render(
      <TaskTravelMetadata
        config={getVariantConfig('panel', false, 2)}
        isSegmentTask={false}
        isAdvancedMode
        modelName="wan_2_2_i2v_lightning_baseline_2_2_1"
        resolution="1280x720"
        frames={24}
        phaseConfig={{ flow_shift: 7, sample_solver: 'euler' }}
        styleImage="style.png"
        styleStrength={0.4}
        presetName="Studio preset"
      />,
    );
    const scope = within(container);

    expect(scope.getByText('Style Reference')).toBeTruthy();
    expect(scope.getByAltText('Style').getAttribute('src')).toBe('style.png');
    expect(scope.getByText('Strength: 40%')).toBeTruthy();
    expect(scope.getByText('Studio preset')).toBeTruthy();
    expect(scope.getByText('Wan 2.2 I2V Lightning (2.2.1)')).toBeTruthy();
    expect(scope.getByText('1280x720')).toBeTruthy();
    expect(scope.getByText('24')).toBeTruthy();
    expect(scope.getByText('7')).toBeTruthy();
    expect(scope.getAllByText('euler').length).toBeGreaterThan(0);
  });

  it('renders summary/details shell around generation details and toggles params view', () => {
    function Wrapper() {
      const [showDetailedParams, setShowDetailedParams] = useState(false);
      const [paramsCopied, setParamsCopied] = useState(false);

      return (
        <TaskDetailsSummaryAndParams
          task={createTask()}
          inputImages={['image-a.png']}
          detailsVariant="modal"
          isMobile={false}
          availableLoras={availableLoras}
          showAllImages={false}
          onShowAllImagesChange={() => {}}
          showFullPrompt={false}
          onShowFullPromptChange={() => {}}
          showFullNegativePrompt={false}
          onShowFullNegativePromptChange={() => {}}
          showDetailedParams={showDetailedParams}
          onShowDetailedParamsChange={setShowDetailedParams}
          paramsCopied={paramsCopied}
          onCopyParams={() => setParamsCopied(true)}
          showCopyButtons
        >
          <div>Extra child block</div>
        </TaskDetailsSummaryAndParams>
      );
    }

    const { container } = render(<Wrapper />);
    const scope = within(container);

    expect(scope.getByTestId('generation-details')).toBeTruthy();
    expect(generationDetailsPropsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'modal',
        inputImages: ['image-a.png'],
        showCopyButtons: true,
      }),
    );
    expect(scope.getByText('Detailed Task Parameters')).toBeTruthy();
    expect(scope.getByText('Extra child block')).toBeTruthy();

    fireEvent.click(scope.getByTitle('Copy all parameters'));
    fireEvent.click(scope.getByText('Show'));

    expect(scope.getByText(/"prompt": "hello"/)).toBeTruthy();
    expect(scope.getByText(/"frames": 16/)).toBeTruthy();
  });
});
