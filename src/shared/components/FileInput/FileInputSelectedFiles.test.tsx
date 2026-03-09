import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FileInputSelectedFiles } from './FileInputSelectedFiles';

const mocks = vi.hoisted(() => ({
  cropFilename: vi.fn((value: string) => `cropped:${value}`),
}));

vi.mock('@/shared/components/ui/button', () => ({
  Button: ({ children, ...props }: Record<string, unknown>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock('@/shared/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: unknown }) => <>{children}</>,
  Tooltip: ({ children }: { children: unknown }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: unknown }) => <>{children}</>,
  TooltipContent: ({ children }: { children: unknown }) => <>{children}</>,
}));

vi.mock('@/shared/lib/stringFormatting', () => ({
  cropFilename: (...args: unknown[]) => mocks.cropFilename(...args),
}));

vi.mock('lucide-react', () => ({
  FileText: () => <svg data-testid="icon-file-text" />,
  ImagePlus: () => <svg data-testid="icon-image-plus" />,
  Trash2: () => <svg data-testid="icon-trash" />,
  VideoIcon: () => <svg data-testid="icon-video" />,
  X: () => <svg data-testid="icon-x" />,
}));

describe('FileInputSelectedFiles', () => {
  it('renders selection summary and wires remove callbacks when enabled', () => {
    const onRemoveAll = vi.fn();
    const onRemoveFile = vi.fn();

    render(
      <FileInputSelectedFiles
        displayFiles={[
          { name: 'photo.png', type: 'image/png' },
          { name: 'clip.mp4', type: 'video/mp4' },
          { name: 'notes.txt', type: 'text/plain' },
        ]}
        displayPreviewUrls={[
          'https://assets/photo.png',
          'https://assets/clip.mp4',
          '',
        ]}
        multiple
        disabled={false}
        suppressSelectionSummary={false}
        suppressRemoveAll={false}
        onRemoveAll={onRemoveAll}
        onRemoveFile={onRemoveFile}
      />,
    );

    expect(screen.getByText('3 files selected')).toBeInTheDocument();
    expect(screen.getByText('Click or drag to add more')).toBeInTheDocument();
    expect(screen.getByAltText('photo.png')).toHaveAttribute('src', 'https://assets/photo.png');
    expect(screen.getByTestId('icon-video')).toBeInTheDocument();
    expect(screen.getByTestId('icon-file-text')).toBeInTheDocument();
    expect(screen.getByText('cropped:photo.png')).toBeInTheDocument();
    expect(screen.getByText('cropped:clip.mp4')).toBeInTheDocument();
    expect(screen.getByText('cropped:notes.txt')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(onRemoveAll).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Remove clip.mp4' }));
    expect(onRemoveFile).toHaveBeenCalledWith(1);
  });

  it('hides summary and remove controls when disabled/suppressed', () => {
    render(
      <FileInputSelectedFiles
        displayFiles={[{ name: 'single.png', type: 'image/png' }]}
        displayPreviewUrls={['https://assets/single.png']}
        multiple={false}
        disabled
        suppressSelectionSummary
        suppressRemoveAll={false}
        onRemoveAll={vi.fn()}
        onRemoveFile={vi.fn()}
      />,
    );

    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove single.png' })).not.toBeInTheDocument();
  });
});
