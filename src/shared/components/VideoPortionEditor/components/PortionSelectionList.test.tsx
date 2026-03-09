// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
const { portionSelectionCardMock } = vi.hoisted(() => ({
  portionSelectionCardMock: vi.fn(),
}));

vi.mock('lucide-react', () => ({
  Plus: () => <svg aria-hidden="true" />,
}));

vi.mock('./PortionSelectionCard', () => ({
  PortionSelectionCard: (props: {
    selection: { id: string; name?: string };
    index: number;
    totalSelections: number;
    gapFrames: number;
    contextFrames: number;
    videoUrl?: string;
    fps?: number | null;
  }) => {
    portionSelectionCardMock(props);
    return <div>{props.selection.name ?? props.selection.id}</div>;
  },
}));

const { PortionSelectionList } = await import('./PortionSelectionList');

describe('PortionSelectionList', () => {
  afterEach(() => {
    cleanup();
    portionSelectionCardMock.mockReset();
  });

  it('sorts selections by start and forwards shared props to each card', () => {
    render(
      <PortionSelectionList
        selections={[
          { id: 'late', name: 'Late', start: 8, end: 9 },
          { id: 'early', name: 'Early', start: 1, end: 2 },
          { id: 'middle', name: 'Middle', start: 5, end: 6 },
        ]}
        gapFrames={17}
        contextFrames={12}
        videoUrl="video.mp4"
        fps={24}
        onUpdateSelectionSettings={vi.fn()}
        onRemoveSelection={vi.fn()}
        onAddSelection={vi.fn()}
      />,
    );

    expect(screen.getAllByText(/Early|Middle|Late/).map((node) => node.textContent)).toEqual([
      'Early',
      'Middle',
      'Late',
    ]);

    expect(portionSelectionCardMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        selection: expect.objectContaining({ id: 'early' }),
        index: 0,
        totalSelections: 3,
        gapFrames: 17,
        contextFrames: 12,
        videoUrl: 'video.mp4',
        fps: 24,
      }),
    );
    expect(portionSelectionCardMock.mock.calls[2]?.[0]).toEqual(
      expect.objectContaining({
        selection: expect.objectContaining({ id: 'late' }),
        index: 2,
      }),
    );
  });

  it('renders the add selection affordance only when a handler is provided', () => {
    const onAddSelection = vi.fn();
    const { rerender } = render(
      <PortionSelectionList
        selections={[]}
        gapFrames={17}
        contextFrames={12}
        onUpdateSelectionSettings={vi.fn()}
        onAddSelection={onAddSelection}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /add selection/i }));
    expect(onAddSelection).toHaveBeenCalledTimes(1);

    rerender(
      <PortionSelectionList
        selections={[]}
        gapFrames={17}
        contextFrames={12}
        onUpdateSelectionSettings={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: /add selection/i })).toBeNull();
  });
});
