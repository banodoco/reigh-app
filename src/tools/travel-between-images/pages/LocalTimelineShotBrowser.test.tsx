// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalTimelineShotBrowser } from './LocalTimelineShotBrowser';
import fixture from '@/tools/video-editor/data/shotComposition.fixture.json';

// The production list/editor are integration-tested separately. These focused
// tests keep the document-to-shot adapter and URL contract deterministic without
// requiring the full application provider tree (auth, panes, and settings).
vi.mock('../components/VideoGallery/ShotListDisplay.tsx', () => ({
  ShotListDisplay: ({ shots, onSelectShot }: { shots: Array<{ id: string; name: string }>; onSelectShot: (shot: unknown) => void }) => (
    <div data-testid="production-shot-list">
      {shots.map((shot) => (
        <button key={shot.id} type="button" onClick={() => onSelectShot(shot)}>
          Select shot {shot.name}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('./ShotEditorView.tsx', () => ({
  ShotEditorView: ({ shotToEdit, canonicalOccurrence, canonicalShotComposition }: { shotToEdit: { name: string; images?: Array<{ id: string }> }; canonicalOccurrence?: { occurrenceId: string; stableDeepLink: string }; canonicalShotComposition?: unknown }) => {
    const navigate = useNavigate();
    const location = useLocation();
    return (
      <div data-testid="production-shot-editor">
        <button
          type="button"
          onClick={() => navigate({ pathname: location.pathname, search: location.search, hash: '' })}
        >Back to all shots</button>
        <h1>{shotToEdit.name}</h1>
        <div data-testid="canonical-occurrence">{canonicalOccurrence?.occurrenceId}:{canonicalOccurrence?.stableDeepLink}</div>
        <div data-testid="canonical-adapter">{canonicalShotComposition ? 'shared' : 'missing'}</div>
        <div data-testid="selected-shot-image-ids">{shotToEdit.images?.map((image) => image.id).join(',')}</div>
      </div>
    );
  },
}));

const mocks = vi.hoisted(() => ({
  loadTimeline: vi.fn(),
  loadAssetRegistry: vi.fn(),
  onResolve: vi.fn(({ file }: { file: string }) => `https://bridge.test/${file}`),
  loadShotComposition: vi.fn(),
}));

vi.mock('@/tools/video-editor/data/AstridBridgeDataProvider.ts', () => ({
  AstridBridgeDataProvider: class MockAstridBridgeDataProvider {
    loadTimeline = mocks.loadTimeline;
    loadAssetRegistry = mocks.loadAssetRegistry;
    onResolve = mocks.onResolve;
    shotComposition = { load: mocks.loadShotComposition };
  },
}));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}{location.hash}</output>;
}

function renderBrowser(initialEntry = '/tools/travel-between-images?localProject=demo&localTimeline=timeline-1') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <LocalTimelineShotBrowser projectSlug="demo" timelineRef="timeline-1" />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('LocalTimelineShotBrowser', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    mocks.loadTimeline.mockReset();
    mocks.loadAssetRegistry.mockReset();
    mocks.onResolve.mockClear();
    mocks.loadShotComposition.mockReset();
    mocks.loadTimeline.mockResolvedValue({
      config: {
        output: { resolution: '1280x720', fps: 24, file: 'out.mp4' },
        tracks: [{ id: 'V1', kind: 'visual', label: 'Visual' }],
        clips: [{ id: 'clip-a', at: 0, track: 'V1', asset: 'asset-a', from: 0, to: 2 }],
      },
      configVersion: 1,
    });
    mocks.loadAssetRegistry.mockResolvedValue({
      assets: {
        'alpha-image': { media_id: 'object-alpha-image', type: 'image/png', duration: 2 },
        'beta-image': { media_id: 'object-beta-image', type: 'image/png', duration: 1.2 },
      },
    });
    mocks.loadShotComposition.mockResolvedValue(fixture);
  });

  it('renders the established shot list from document-derived shot models', async () => {
    renderBrowser();

    expect(await screen.findAllByRole('button', { name: 'Select shot shot-alpha' })).not.toHaveLength(0);
    expect(screen.getByTestId('production-shot-list')).toBeInTheDocument();
  });

  it('opens the established shot editor with only the selected group clips', async () => {
    renderBrowser();
    const shot = (await screen.findAllByRole('button', { name: 'Select shot shot-alpha' }))[0];
    fireEvent.click(shot);

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/tools/travel-between-images?localProject=demo&localTimeline=timeline-1#project%2Fproject-001%2Fdocument%2Fdocument-primary%2Fshot%2Fshot-alpha%2Frevision%2Frev-a%2Foccurrence%2Focc-1',
      );
      expect(screen.getByRole('heading', { name: 'shot-alpha' })).toBeInTheDocument();
      expect(screen.getByTestId('production-shot-editor')).toBeInTheDocument();
      expect(screen.getByTestId('canonical-occurrence')).toHaveTextContent('occ-1');
      expect(screen.getByTestId('canonical-adapter')).toHaveTextContent('shared');
      expect(screen.getByTestId('selected-shot-image-ids')).toHaveTextContent('occ-1:alpha-video');
    });
  });

  it('opens a valid deep link directly in shot detail after refresh', async () => {
    renderBrowser('/tools/travel-between-images?localProject=demo&localTimeline=timeline-1#project%2Fproject-001%2Fdocument%2Fdocument-primary%2Fshot%2Fshot-alpha%2Frevision%2Frev-a%2Foccurrence%2Focc-1');

    expect(await screen.findByRole('heading', { name: 'shot-alpha' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Back to all shots/i })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/tools/travel-between-images?localProject=demo&localTimeline=timeline-1#project%2Fproject-001%2Fdocument%2Fdocument-primary%2Fshot%2Fshot-alpha%2Frevision%2Frev-a%2Foccurrence%2Focc-1',
    );
  });

  it.each([
    ['malformed', '/tools/travel-between-images?localProject=demo&localTimeline=timeline-1#%E0%A4%A'],
    ['unknown', '/tools/travel-between-images?localProject=demo&localTimeline=timeline-1#not-a-shot'],
  ])('falls back to the overview for a %s hash', async (_kind, initialEntry) => {
    renderBrowser(initialEntry);

    expect(await screen.findAllByRole('button', { name: 'Select shot shot-alpha' })).not.toHaveLength(0);
    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/tools/travel-between-images?localProject=demo&localTimeline=timeline-1',
      );
    });
    expect(screen.queryByTestId('production-shot-editor')).not.toBeInTheDocument();
  });

  it('returns from shot detail to the complete overview while preserving local scope', async () => {
    renderBrowser();
    fireEvent.click((await screen.findAllByRole('button', { name: 'Select shot shot-alpha' }))[0]);

    const back = await screen.findByRole('button', { name: /Back to all shots/i });
    fireEvent.click(back);

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/tools/travel-between-images?localProject=demo&localTimeline=timeline-1',
      );
      expect(screen.getAllByRole('button', { name: 'Select shot shot-alpha' })).not.toHaveLength(0);
    });
  });

  it('reports a typed canonical graph failure', async () => {
    mocks.loadShotComposition.mockRejectedValueOnce(new Error('missing canonical dependency'));
    renderBrowser();
    expect(await screen.findByRole('alert')).toHaveTextContent('missing canonical dependency');
  });
});
