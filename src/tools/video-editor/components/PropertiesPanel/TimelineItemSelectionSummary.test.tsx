// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { DataLaneView } from '@/tools/video-editor/data/typed/envelope.ts';
import { TimelineItemSelectionSummary } from './TimelineItemSelectionSummary.tsx';
import { VideoEditorRuntimeProvider } from '@/tools/video-editor/contexts/VideoEditorRuntimeContext.tsx';

afterEach(cleanup);

const lane = (laneId: string, kindId: string, label: string) => ({
  laneId,
  kindId,
  label,
}) as DataLaneView;

describe('TimelineItemSelectionSummary', () => {
  it('uses the owning data-kind contribution label from the manifest', () => {
    const runtime = { extensionRuntime: { extensions: [{ manifest: {
      id: 'example.editor', label: 'Editor Tools', contributions: [{
        kind: 'dataKind', kindId: 'example.lyrics', label: 'Lyrics',
      }],
    } }] } } as never;
    render(<VideoEditorRuntimeProvider value={runtime}>
      <TimelineItemSelectionSummary clipCount={0}
        dataItems={[{ laneId: 'lyrics', itemId: 'one' }]}
        lanes={[lane('lyrics', 'example.lyrics', 'Stale lane label')]} />
    </VideoEditorRuntimeProvider>);
    expect(screen.getByRole('status')).toHaveTextContent('1 lyrics item selected');
    expect(screen.getByRole('status')).toHaveTextContent('Lyrics · 1');
  });
  it('renders no summary when nothing is selected', () => {
    const { container } = render(
      <TimelineItemSelectionSummary clipCount={0} dataItems={[]} lanes={[]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('describes transcript-only multi-selection and counts by friendly lane label', () => {
    render(
      <TimelineItemSelectionSummary
        clipCount={0}
        dataItems={[
          { laneId: 'transcript-lane', itemId: 'word-a' },
          { laneId: 'transcript-lane', itemId: 'word-b' },
        ]}
        lanes={[lane('transcript-lane', 'astrid.transcript', 'Transcript')]}
      />,
    );

    const summary = screen.getByRole('status', { name: 'Timeline selection summary' });
    expect(summary).toHaveTextContent('2 transcript items selected');
    expect(summary).toHaveTextContent('Transcript · 2');
    expect(summary.querySelector('input,textarea,button')).toBeNull();
  });

  it('summarizes mixed media and transcript selections without exposing editing controls', () => {
    render(
      <TimelineItemSelectionSummary
        clipCount={2}
        dataItems={[
          { laneId: 'transcript-lane', itemId: 'word-a' },
          { laneId: 'transcript-lane', itemId: 'word-b' },
          { laneId: 'transcript-lane', itemId: 'word-c' },
        ]}
        lanes={[lane('transcript-lane', 'astrid.transcript', 'Transcript')]}
      />,
    );

    const summary = screen.getByTestId('timeline-item-selection-summary');
    expect(summary).toHaveTextContent('5 items selected');
    expect(summary).toHaveTextContent('2 media clips · 3 transcript items');
    expect(summary.querySelector('input,textarea,button,[contenteditable="true"]')).toBeNull();
  });

  it('uses generic copy and friendly lane counts for other typed data', () => {
    render(
      <TimelineItemSelectionSummary
        clipCount={1}
        dataItems={[
          { laneId: 'captions', itemId: 'caption-a' },
          { laneId: 'markers', itemId: 'marker-a' },
          { laneId: 'markers', itemId: 'marker-b' },
        ]}
        lanes={[
          lane('captions', 'astrid.caption', 'Captions'),
          lane('markers', 'astrid.marker', 'Markers'),
        ]}
      />,
    );

    const summary = screen.getByTestId('timeline-item-selection-summary');
    expect(summary).toHaveTextContent('4 items selected');
    expect(summary).toHaveTextContent('1 media clip · Captions · 1 · Markers · 2');
  });
});
