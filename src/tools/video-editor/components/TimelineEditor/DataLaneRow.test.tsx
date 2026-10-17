// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DataLaneRendererProps } from '@astrid/editor-sdk';
import type { DataLaneView, FrozenDataItem } from '@/tools/video-editor/data/typed/envelope.ts';
import { DataLaneRow } from './DataLaneRow.tsx';

afterEach(cleanup);

const makeItem = (id: string): FrozenDataItem => ({
  id,
  shape: 'interval',
  domain: 'source_seconds',
  extent: { start: 0 },
  schemaRef: 'test.segment/v1',
  payload: { text: id },
  provenance: { adapterId: 'test', adapterVersion: '1' },
});

const makeLane = (overrides: Partial<DataLaneView> = {}): DataLaneView => ({
  laneId: 'transcript-lane',
  kindId: 'astrid.transcript',
  label: 'Transcript',
  schemaRef: 'test.segment/v1',
  shape: 'interval',
  domain: 'source_seconds',
  items: [
    { item: makeItem('word-a'), timelineStart: 0, timelineEnd: 1 },
    { item: makeItem('word-b'), timelineStart: 2, timelineEnd: 3 },
  ],
  hidden: false,
  height: 48,
  opaque: false,
  ...overrides,
});

function LaneRendererProbe(props: DataLaneRendererProps) {
  return (
    <div data-testid="lane-renderer">
      {props.items.map((item) => {
        const selected = props.selectedItemIds !== undefined
          ? props.selectedItemIds.includes(item.id)
          : props.selectedItemId === undefined
            ? item.id === props.activeItemId
            : props.selectedItemId === item.id;
        return (
          <button
            key={item.id}
            type="button"
            data-testid={`item-${item.id}`}
            data-selected={String(selected)}
            aria-pressed={selected}
            tabIndex={item.id === props.activeItemId ? 0 : -1}
            onClick={(event) => {
              if (event.shiftKey || event.metaKey || event.ctrlKey) {
                props.onSelectItem?.(item.id, { additive: true });
              } else {
                props.onSelectItem?.(item.id);
              }
            }}
          >
            {item.id}
          </button>
        );
      })}
    </div>
  );
}

describe('DataLaneRow selection boundary', () => {
  it('forwards an explicit selected set, including empty, independently of the active item', () => {
    const lane = makeLane({ laneRenderer: LaneRendererProbe as unknown as DataLaneView['laneRenderer'] });
    const view = render(
      <DataLaneRow lane={lane} pixelsPerSecond={100} selectedItemIds={['word-b']} />,
    );

    expect(screen.getByTestId('item-word-a')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('item-word-b')).toHaveAttribute('aria-pressed', 'true');

    view.rerender(
      <DataLaneRow lane={lane} pixelsPerSecond={100} selectedItemIds={[]} selectedItemId="word-b" />,
    );
    expect(screen.getByTestId('item-word-a')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('item-word-b')).toHaveAttribute('aria-pressed', 'false');
  });

  it('forwards additive intent from a renderer click without changing keyboard focus rules', () => {
    const lane = makeLane({ laneRenderer: LaneRendererProbe as unknown as DataLaneView['laneRenderer'] });
    const onSelectItem = vi.fn();
    render(
      <DataLaneRow lane={lane} pixelsPerSecond={100} onSelectItem={onSelectItem} />,
    );

    const first = screen.getByTestId('item-word-a');
    expect(first).toHaveAttribute('tabindex', '0');
    fireEvent.click(screen.getByTestId('item-word-b'), { shiftKey: true });
    expect(onSelectItem).toHaveBeenCalledWith('word-b', { additive: true });
    expect(screen.getByTestId('item-word-b')).toHaveAttribute('tabindex', '0');

    fireEvent.click(screen.getByTestId('item-word-a'));
    expect(onSelectItem).toHaveBeenLastCalledWith('word-a');
  });

  it('keeps host-painted extent bars selected by occurrence and forwards modifier intent', () => {
    const lane = makeLane({ laneRenderer: undefined, opaque: true });
    const onSelectItem = vi.fn();
    render(
      <DataLaneRow
        lane={lane}
        pixelsPerSecond={100}
        selectedItemIds={['word-b']}
        onSelectItem={onSelectItem}
      />,
    );

    const bars = screen.getAllByTestId('data-lane-extent-bar');
    expect(bars.map((bar) => bar.getAttribute('data-selected'))).toEqual(['false', 'true']);
    fireEvent.click(bars[0], { ctrlKey: true });
    expect(onSelectItem).toHaveBeenCalledWith('word-a', { additive: true });
  });

  it('selects the lane from its header only, leaving empty body clicks available to lasso and clear', () => {
    const onSelectLane = vi.fn();
    render(
      <DataLaneRow
        lane={makeLane({ items: [] })}
        pixelsPerSecond={100}
        onSelectLane={onSelectLane}
      />,
    );

    fireEvent.click(screen.getByTestId('data-lane-body'));
    expect(onSelectLane).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('data-lane-header'));
    expect(onSelectLane).toHaveBeenCalledTimes(1);
  });
});
