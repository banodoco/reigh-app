import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TimelineEmptyState } from './TimelineEmptyState';

const mocks = vi.hoisted(() => ({
  ImageUploadActions: vi.fn(() => <div data-testid="image-upload-actions" />),
}));

vi.mock('@/shared/components/ImageUploadActions', () => ({
  ImageUploadActions: (props: unknown) => mocks.ImageUploadActions(props),
}));

vi.mock('lucide-react', () => ({
  Image: () => <span data-testid="icon-image" />,
  Upload: () => <span data-testid="icon-upload" />,
}));

function buildProps(overrides: Partial<React.ComponentProps<typeof TimelineEmptyState>> = {}) {
  return {
    isDragOver: false,
    dragType: null,
    shotId: 'shot-1',
    onImageUpload: vi.fn(async () => undefined),
    isUploadingImage: false,
    onDragEnter: vi.fn(),
    onDragOver: vi.fn(),
    onDragLeave: vi.fn(),
    onDrop: vi.fn(),
    hasDropHandler: true,
    ...overrides,
  };
}

describe('TimelineEmptyState', () => {
  it('renders nothing when drop handling is disabled', () => {
    const { container } = render(<TimelineEmptyState {...buildProps({ hasDropHandler: false })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders default empty-state content and upload actions', () => {
    render(<TimelineEmptyState {...buildProps()} />);

    expect(screen.getByText('No images on timeline')).toBeInTheDocument();
    expect(screen.getByText('or drag and drop')).toBeInTheDocument();
    expect(screen.getByTestId('image-upload-actions')).toBeInTheDocument();
    expect(mocks.ImageUploadActions).toHaveBeenCalledWith(
      expect.objectContaining({
        shotId: 'shot-1',
        inputId: 'timeline-empty-image-upload',
      }),
    );
  });

  it('renders drag-over messaging and forwards drag handlers', () => {
    const props = buildProps({ isDragOver: true, dragType: 'generation' });
    const { container } = render(<TimelineEmptyState {...props} />);

    expect(screen.getByText('Drop image here')).toBeInTheDocument();
    expect(screen.getByText('Release to add to timeline')).toBeInTheDocument();

    const overlay = container.querySelector('.absolute.inset-0');
    expect(overlay).toBeInTheDocument();
    if (!overlay) return;

    fireEvent.dragEnter(overlay);
    fireEvent.dragOver(overlay);
    fireEvent.dragLeave(overlay);
    fireEvent.drop(overlay);

    expect(props.onDragEnter).toHaveBeenCalledTimes(1);
    expect(props.onDragOver).toHaveBeenCalledTimes(1);
    expect(props.onDragLeave).toHaveBeenCalledTimes(1);
    expect(props.onDrop).toHaveBeenCalledTimes(1);
  });
});
