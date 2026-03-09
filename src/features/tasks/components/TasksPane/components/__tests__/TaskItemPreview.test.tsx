import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GenerationRow } from '@/domains/generation/types';
import type { Task } from '@/types/tasks';
import { TaskItemPreview } from '../TaskItemPreview';

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  getTaskDisplayName: vi.fn((taskType: string) => `display:${taskType}`),
  getTaskVariantId: vi.fn(() => 'variant-from-task'),
}));

vi.mock('@/shared/components/ui/runtime/sonner', () => ({
  toast: (...args: unknown[]) => mocks.toast(...args),
}));

vi.mock('@/shared/lib/taskConfig', () => ({
  getTaskDisplayName: (...args: unknown[]) => mocks.getTaskDisplayName(...args),
}));

vi.mock('@/features/tasks/components/TasksPane/utils/getTaskVariantId', () => ({
  getTaskVariantId: (...args: unknown[]) => mocks.getTaskVariantId(...args),
}));

function createTask(overrides: Partial<Task> = {}): Task {
  return {
    status: 'Completed',
    errorMessage: null,
    ...overrides,
  } as unknown as Task;
}

function createGeneration(overrides: Partial<GenerationRow> = {}): GenerationRow {
  return {
    id: 'gen-1',
    imageUrl: 'https://example.com/generated.png',
    ...overrides,
  } as unknown as GenerationRow;
}

function renderPreview(overrides: Partial<React.ComponentProps<typeof TaskItemPreview>> = {}) {
  const props: React.ComponentProps<typeof TaskItemPreview> = {
    task: createTask(),
    imagesToShow: [],
    extraImageCount: 0,
    shouldShowPromptPreview: false,
    promptPreviewText: '',
    generationData: null,
    imageVariantId: undefined,
    onOpenImageLightbox: vi.fn(),
    isHoveringTaskItem: false,
    cascadedTaskId: null,
    cascadedTask: null,
    isCascadedTaskLoading: false,
    ...overrides,
  };

  render(<TaskItemPreview {...props} />);
  return props;
}

describe('TaskItemPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('renders image previews and extra image count', () => {
    renderPreview({
      imagesToShow: ['https://example.com/i1.png', 'https://example.com/i2.png'],
      extraImageCount: 3,
    });

    expect(screen.getByAltText('input-0')).toBeInTheDocument();
    expect(screen.getByAltText('input-1')).toBeInTheDocument();
    expect(screen.getByText('+ 3')).toBeInTheDocument();
  });

  it('opens lightbox from prompt preview using derived variant id', () => {
    const task = createTask();
    const generationData = createGeneration();
    const onOpenImageLightbox = vi.fn();

    renderPreview({
      task,
      shouldShowPromptPreview: true,
      promptPreviewText: 'make this cinematic',
      generationData,
      imageVariantId: 'variant-input',
      onOpenImageLightbox,
    });

    fireEvent.click(screen.getByRole('button'));

    expect(mocks.getTaskVariantId).toHaveBeenCalledWith(generationData, 'variant-input');
    expect(onOpenImageLightbox).toHaveBeenCalledWith(task, generationData, 'variant-from-task');
  });

  it('shows cascaded failure fallback and copies cascaded task id', () => {
    renderPreview({
      task: createTask({ status: 'Failed', errorMessage: 'top-level error' }),
      isHoveringTaskItem: true,
      cascadedTaskId: 'cascaded-123',
      cascadedTask: {
        error_message: null,
        task_type: 'video_generate',
      },
      isCascadedTaskLoading: false,
    });

    expect(screen.getByText('No error message available')).toBeInTheDocument();
    expect(screen.getByText('copy id')).toBeInTheDocument();
    expect(screen.getByText('Cascaded from related task (display:video_generate):')).toBeInTheDocument();

    fireEvent.click(screen.getByText('copy id'));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('cascaded-123');
    expect(mocks.toast).toHaveBeenCalledWith({
      title: 'Task ID Copied',
      description: 'Related task ID copied to clipboard',
      variant: 'default',
    });
  });
});
