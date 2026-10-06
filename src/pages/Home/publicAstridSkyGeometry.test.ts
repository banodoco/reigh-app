// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPublicAstridSkyGeometry,
  quietField,
  readingLineBoxes,
  type PublicAstridSkyRect,
} from './publicAstridSkyGeometry';

type Frame = { id: number; callback: FrameRequestCallback };

class FakeMutationObserver {
  static instances: FakeMutationObserver[] = [];
  readonly callback: MutationCallback;

  constructor(callback: MutationCallback) {
    this.callback = callback;
    FakeMutationObserver.instances.push(this);
  }

  observe() {}
  disconnect() {}
}

const rect = (left: number, top: number, width: number, height: number): DOMRect => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
  width,
  height,
  x: left,
  y: top,
  toJSON: () => ({}),
} as DOMRect);

let frames: Frame[];
let nextFrame: number;

function paint() {
  const pending = frames;
  frames = [];
  pending.forEach(({ callback }) => callback(performance.now(), {} as FrameRequestCallback));
}

beforeEach(() => {
  frames = [];
  nextFrame = 0;
  FakeMutationObserver.instances = [];
  vi.stubGlobal('MutationObserver', FakeMutationObserver);
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    const frame = { id: ++nextFrame, callback };
    frames.push(frame);
    return frame.id;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    frames = frames.filter((frame) => frame.id !== id);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('public Astrid sky geometry', () => {
  it('projects viewport rects onto the fixed art grid and keeps scroll/reflow changes deterministic', () => {
    const box: PublicAstridSkyRect = rect(0, 0, 8, 4);
    const initial = quietField([box], 12, 12, 4, 24);
    const scrolled = quietField([{ ...box, top: 8, bottom: 12 }], 12, 12, 4, 24);

    expect(initial[6 * 12 + 6]).toBe(3);
    expect(scrolled[8 * 12 + 6]).toBe(3);
    expect(initial).not.toEqual(scrolled);
  });

  it('measures only the committed active root and ignores stale observer work after a round trip', () => {
    const home = document.createElement('main');
    const vision = document.createElement('main');
    const homeReading = document.createElement('h1');
    const visionReading = document.createElement('h1');
    homeReading.className = 'reading';
    visionReading.className = 'reading';
    home.append(homeReading);
    vision.append(visionReading);
    document.body.append(home, vision);

    let homeRect = rect(0, 0, 24, 12);
    let visionRect = rect(36, 0, 24, 12);
    vi.spyOn(homeReading, 'getBoundingClientRect').mockImplementation(() => homeRect);
    vi.spyOn(visionReading, 'getBoundingClientRect').mockImplementation(() => visionRect);
    const documentQuery = vi.spyOn(document, 'querySelectorAll');
    const homeQuery = vi.spyOn(home, 'querySelectorAll');
    const visionQuery = vi.spyOn(vision, 'querySelectorAll');

    const geometry = createPublicAstridSkyGeometry();
    geometry.setViewport(20, 20);
    geometry.mount();
    const releaseHome = geometry.registerRoot(home, '.reading', 'home');
    paint();

    expect(geometry.getSnapshot().owner).toBe('home');
    expect(geometry.getSnapshot().root).toBe(home);
    expect(homeQuery).toHaveBeenCalled();
    expect(visionQuery).not.toHaveBeenCalled();
    expect(documentQuery).not.toHaveBeenCalled();

    const homeRevision = geometry.getSnapshot().revision;
    homeRect = rect(0, 8, 24, 12);
    window.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('resize'));
    expect(frames).toHaveLength(1);
    paint();
    expect(geometry.getSnapshot().revision).toBeGreaterThan(homeRevision);

    const staleMutation = FakeMutationObserver.instances.at(-1)!.callback;
    const releaseVision = geometry.registerRoot(vision, '.reading', 'vision');
    paint();
    const visionRevision = geometry.getSnapshot().revision;
    const homeQueriesAfterSwitch = homeQuery.mock.calls.length;
    staleMutation([], {} as MutationObserver);
    paint();

    expect(geometry.getSnapshot().owner).toBe('vision');
    expect(geometry.getSnapshot().root).toBe(vision);
    expect(geometry.getSnapshot().revision).toBe(visionRevision);
    expect(homeQuery.mock.calls.length).toBe(homeQueriesAfterSwitch);
    expect(visionQuery).toHaveBeenCalled();

    visionRect = rect(36, 12, 24, 12);
    vision.dispatchEvent(new Event('transitionend', { bubbles: true }));
    paint();
    expect(geometry.getSnapshot().revision).toBeGreaterThan(visionRevision);

    releaseHome();
    releaseVision();
    const queriesAfterRelease = visionQuery.mock.calls.length;
    window.dispatchEvent(new Event('scroll'));
    paint();
    expect(geometry.getSnapshot().quiet).toBeNull();
    expect(visionQuery.mock.calls.length).toBe(queriesAfterRelease);
    geometry.destroy();
  });

  it('responds to active-root media readiness and disclosure mutations without a settle timer', () => {
    const root = document.createElement('main');
    const reading = document.createElement('p');
    const image = document.createElement('img');
    reading.className = 'reading';
    root.append(reading, image);
    document.body.append(root);
    let readingRect = rect(0, 0, 20, 12);
    vi.spyOn(reading, 'getBoundingClientRect').mockImplementation(() => readingRect);

    const geometry = createPublicAstridSkyGeometry();
    geometry.setViewport(20, 20);
    geometry.mount();
    geometry.registerRoot(root, '.reading', 'vision');
    paint();
    const firstRevision = geometry.getSnapshot().revision;

    readingRect = rect(12, 0, 20, 12);
    image.dispatchEvent(new Event('load'));
    paint();
    expect(geometry.getSnapshot().revision).toBeGreaterThan(firstRevision);

    const secondRevision = geometry.getSnapshot().revision;
    readingRect = rect(12, 12, 20, 12);
    FakeMutationObserver.instances.at(-1)?.callback([], {} as MutationObserver);
    paint();
    expect(geometry.getSnapshot().revision).toBeGreaterThan(secondRevision);
    geometry.destroy();
  });

  it('uses element viewport rects as the documented jsdom fallback when Range rects are unavailable', () => {
    const root = document.createElement('main');
    const reading = document.createElement('p');
    reading.className = 'reading';
    root.append(reading);
    const readingRect = rect(4, 8, 16, 8);
    vi.spyOn(reading, 'getBoundingClientRect').mockReturnValue(readingRect);

    const boxes = readingLineBoxes(root, '.reading');
    expect(boxes).toEqual([expect.objectContaining({ left: 4, top: 8, right: 20, bottom: 16 })]);
  });
});
