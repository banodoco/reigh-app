import { useEffect, useRef, useState } from 'react';
import { setThemeColor } from '@/shared/lib/themeColor';
import {
  ARC_RADIUS,
  describeSky,
  moonPhase,
  moonPhaseName,
  preparePublicAstridSkyMoon,
  PUBLIC_ASTRID_SKY_DEFAULT_INTENSITY,
  PUBLIC_ASTRID_SKY_PIXEL,
  renderPublicAstridSky,
  skyState,
  sunTimes,
  SKY_RADIUS,
  type PublicAstridSkyTheme,
} from './publicAstridSkyRender';
import {
  locationForTimeZone,
  PUBLIC_ASTRID_REVIEW_PLACES,
  visitorLocation,
  zonedHours,
  type PublicAstridLocation,
} from './publicAstridLocation';
import './PublicAstridSky.css';

const REVEAL_MS = 1800;
const CLOCK_TICK_MS = 60_000;
/** Star twinkle steps this often. */
const AMBIENT_TICK_MS = 450;
/** The easter-egg day: a beat for the mink to turn, the 24 hours, then a beat to settle. */
export const PUBLIC_ASTRID_SKY_REPLAY_TURN_MS = 500;
const REPLAY_DAY_MS = 9000;
export const PUBLIC_ASTRID_SKY_REPLAY_SETTLE_MS = 500;
export const PUBLIC_ASTRID_SKY_REPLAY_MS = PUBLIC_ASTRID_SKY_REPLAY_TURN_MS + REPLAY_DAY_MS + PUBLIC_ASTRID_SKY_REPLAY_SETTLE_MS;
/** Scrubbing a whole day in review mode takes this long. */
const PLAY_DAY_MS = 24_000;
/** Parallax: each layer is drawn this much larger on every side, so shifting it never shows an edge. */
const PARALLAX_MARGIN = 24;
/** How far each layer may shift sideways as the pointer crosses the page: the far sky least, near clouds
 *  most. Sideways only: vertical shifts read as the clouds bobbing up and down rather than as depth. */
const PARALLAX_DEPTH = { sky: 3, stars: 3, far: 6, near: 12 } as const;
/** Upward drift per layer (px) once the page has scrolled SCROLL_DRIFT_SPAN or more: enough for the sky to
 *  feel deep as you scroll without the sun or moon leaving its place. Stays inside PARALLAX_MARGIN. */
const SCROLL_DEPTH = { sky: 6, stars: 6, far: 12, near: 20 } as const;
const SCROLL_DRIFT_SPAN = 1400;
/** How far through its scroll drift the page is, from 0 at the top to -1. */
const scrollDrift = () => -Math.min(window.scrollY, SCROLL_DRIFT_SPAN) / SCROLL_DRIFT_SPAN;
/**
 * Home and Vision & Issues each draw a sky, and moving between them swaps one for the other mid-transition.
 * They share where the clouds were placed and how far the pointer parallax had eased, so the incoming sky
 * picks up exactly where the outgoing one was rather than jumping.
 */
const sharedSky: { cloudHours: number | null; parallaxX: number; revealed: boolean } = { cloudHours: null, parallaxX: 0, revealed: false };
type SkyLayer = keyof typeof PARALLAX_DEPTH;
const SKY_LAYERS: SkyLayer[] = ['sky', 'stars', 'far', 'near'];

export interface PublicAstridSkySettings {
  enabled: boolean;
  /** Clock override for review, in local hours; null follows the real clock. */
  hours: number | null;
  dayOffset: number;
  /** Per theme, since the same opacity reads much stronger on the dark page. */
  intensity: Record<PublicAstridSkyTheme, number>;
  /** Let the sky show through the stage frame between the editor windows. */
  openFrame: boolean;
  /** 'rise': the sun and moon only climb and sink. 'arc': they also drift east to west across the day. */
  path: 'rise' | 'arc';
  /** Sun and moon radius as a share of the viewport height, kept separately for each path. */
  size: Record<'rise' | 'arc', number>;
  /** How much higher (positive) or lower (negative) the track sits, per path, as a share of the screen. */
  lift: Record<'rise' | 'arc', number>;
  /** The moon's size relative to the sun's. */
  moonScale: number;
  /** Review only: show the sky for another place (an IANA time zone). Null is the visitor's own sky. */
  location: string | null;
  /** Small pixel details elsewhere on the page, each switchable in review. */
  details: { pixelMono: boolean; pixelBeta: boolean; pixelIcons: boolean };
}

export const DEFAULT_PUBLIC_ASTRID_SKY_SETTINGS: PublicAstridSkySettings = {
  enabled: true,
  hours: null,
  dayOffset: 0,
  intensity: PUBLIC_ASTRID_SKY_DEFAULT_INTENSITY,
  openFrame: true,
  path: 'arc',
  size: { rise: SKY_RADIUS, arc: ARC_RADIUS },
  // Tuned in review: the arc track sits 8% higher, and the moon is a little smaller than the sun.
  lift: { rise: 0, arc: 0.08 },
  moonScale: 0.6,
  location: null,
  details: { pixelMono: true, pixelBeta: true, pixelIcons: true },
};

/** Review controls appear only when the URL asks for them, e.g. /home?sky-review. */
export function wantsPublicAstridSkyReview(): boolean {
  return typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('sky-review');
}

export function skyDate(settings: PublicAstridSkySettings, now: number): Date {
  return new Date(now + settings.dayOffset * 864e5);
}

/** The place whose sky is shown: the visitor's own, or one picked in review. */
export function skyLocation(settings: PublicAstridSkySettings, at: Date): PublicAstridLocation {
  return settings.location ? locationForTimeZone(settings.location, at) : visitorLocation(at);
}

/** Wall-clock hours at that place (or the review's time override). */
function skyHours(settings: PublicAstridSkySettings, at: Date, location: PublicAstridLocation): number {
  return settings.hours ?? zonedHours(at, location.timeZone);
}

function useClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

interface PublicAstridSkyProps {
  settings: PublicAstridSkySettings;
  /** Reports how dark the sky being shown is (0 day → 1 night), including review overrides and replays. */
  onDarkness: (darkness: number) => void;
  reducedMotion: boolean;
  /** performance.now() when the easter-egg day started, or null. */
  replayStartedAt: number | null;
  onReplayEnd: () => void;
  /** The page's reading text (a CSS selector). The sky quiets behind it so it stays crisp: the moon's
   *  craters and seas smooth out, its rim softens a little, and the stars and clouds thin. */
  quietBehind?: string;
}

/**
 * Where the page's text sits, on the sky's own art-pixel grid, so the sky can quiet itself behind it in
 * flat steps like the rest of its pixel art (no blur, no masks). Each pixel holds a level: QUIET_LEVELS
 * over the text and a pixel around it, then one less for each further pixel out, down to 0.
 */
const QUIET_LEVELS = 3;

/** One box per line of the matched elements' text, so the quiet follows the words, not their blocks. */
function textLineBoxes(selector: string): DOMRect[] {
  const boxes: DOMRect[] = [];
  const range = document.createRange();
  // Where line boxes can't be measured (older engines, test environments), the whole element stands in.
  if (typeof range.getClientRects !== 'function') {
    for (const element of document.querySelectorAll(selector)) boxes.push(element.getBoundingClientRect());
    return boxes;
  }
  for (const element of document.querySelectorAll(selector)) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent?.trim()) continue;
      range.selectNodeContents(node);
      for (const box of range.getClientRects()) boxes.push(box);
    }
  }
  return boxes;
}

export function quietField(boxes: readonly DOMRectReadOnly[], columns: number, rows: number): Uint8Array {
  const field = new Uint8Array(columns * rows);
  // Viewport px to art pixels on the sky canvases, which start PARALLAX_MARGIN above and left of the window.
  const toArt = (px: number) => (px + PARALLAX_MARGIN) / PUBLIC_ASTRID_SKY_PIXEL;
  for (const box of boxes) {
    if (!box.width || !box.height) continue;
    // The text's own pixels and one more all round.
    const x0 = Math.max(0, Math.floor(toArt(box.left)) - 1);
    const x1 = Math.min(columns - 1, Math.ceil(toArt(box.right)));
    const y0 = Math.max(0, Math.floor(toArt(box.top)) - 1);
    const y1 = Math.min(rows - 1, Math.ceil(toArt(box.bottom)));
    for (let y = y0; y <= y1; y++) field.fill(QUIET_LEVELS, y * columns + x0, y * columns + x1 + 1);
  }
  // Each further ring steps down one level (square rings, as pixel art steps).
  for (let level = QUIET_LEVELS - 1; level > 0; level--) {
    const next = field.slice();
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < columns; x++) {
        if (field[y * columns + x]) continue;
        search: for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= columns || ny >= rows) continue;
            if (field[ny * columns + nx] === level + 1) { next[y * columns + x] = level; break search; }
          }
        }
      }
    }
    field.set(next);
  }
  return field;
}

/**
 * Follows the page's text as it scrolls over the fixed sky, reflows or rises into place, and hands back
 * its quiet field whenever it moves by a whole art pixel.
 */
function useQuietField(selector: string | undefined, columns: number, rows: number, active: boolean): Uint8Array | null {
  const [field, setField] = useState<Uint8Array | null>(null);
  useEffect(() => {
    if (!selector || !active) { setField(null); return undefined; }
    let frame = 0;
    let last = '';
    let lastBoxes = '';
    const update = () => {
      frame = 0;
      const boxes = textLineBoxes(selector);
      const boxKey = boxes.map((box) => [box.left, box.top, box.width, box.height].map((value) => Math.round(value)).join(',')).join(';');
      if (boxKey === lastBoxes) return;
      lastBoxes = boxKey;
      const next = quietField(boxes, columns, rows);
      // Cheap identity for the field: only re-render the sky when it actually changed.
      let key = '';
      for (let i = 0; i < next.length; i += 1) if (next[i]) key += `${i}:${next[i]},`;
      if (key === last) return;
      last = key;
      setField(next);
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    const resizes = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    resizes?.observe(document.body);
    // Text rising into place moves without a scroll or a resize.
    const settle = window.setInterval(schedule, 400);
    // Phones have no ongoing panel morph. Once the entrance has settled, scroll/resize and
    // animation completion events cover geometry changes without polling text layout forever.
    const stopSettling = window.matchMedia('(max-width: 640px)').matches
      ? window.setTimeout(() => window.clearInterval(settle), 1600)
      : undefined;
    document.addEventListener('animationend', schedule);
    document.addEventListener('transitionend', schedule);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      resizes?.disconnect();
      window.clearInterval(settle);
      window.clearTimeout(stopSettling);
      document.removeEventListener('animationend', schedule);
      document.removeEventListener('transitionend', schedule);
    };
  }, [selector, columns, rows, active]);
  return field;
}

/** Share of the replay spent speeding up at the start and slowing down at the end. */
const REPLAY_EASE = 0.12;

/** Hours added to the clock at `elapsed` ms into the replay. The day runs at an even pace, easing only
 *  at the ends, so no part of it (the night especially) rushes past. */
export function replayOffsetHours(elapsed: number): number {
  const t = Math.max(0, Math.min(1, (elapsed - PUBLIC_ASTRID_SKY_REPLAY_TURN_MS) / REPLAY_DAY_MS));
  const e = REPLAY_EASE;
  const cruise = 1 / (1 - e);
  let distance: number;
  if (t < e) distance = (cruise * t * t) / (2 * e);
  else if (t > 1 - e) distance = 1 - (cruise * (1 - t) ** 2) / (2 * e);
  else distance = cruise * (t - e / 2);
  return 24 * distance;
}

/** A huge pixel sun or moon far behind the page, following the visitor's clock. Decorative only. Drawn as
 *  three layers (sun, moon and stars; far clouds; near clouds) that drift apart a little with the
 *  pointer, for depth. */
/** Hands the page's paper colour to the document root, so what shows past the page's edges when you
 *  overscroll follows the sky too (see the :root rule in PublicAstridSite.css), and to the browser's
 *  theme colour, so its chrome does as well. */
export function setRootPaper(paper: string) {
  document.documentElement.style.setProperty('--astrid-root-paper', paper);
  setThemeColor(paper);
}

/**
 * Applies a page's dusk colours as one synchronous update. The sky and paper remain live, but the reading
 * palette changes atomically with the dusk boundary; a whole-page View Transition would blend two readable
 * endpoints into an unreadable dark-on-dark frame.
 */
export function applyPageDusk(apply: () => void) {
  apply();
}

export function PublicAstridSky({ settings, onDarkness, reducedMotion, replayStartedAt, onReplayEnd, quietBehind }: PublicAstridSkyProps) {
  const canvasRefs = useRef<Record<SkyLayer, HTMLCanvasElement | null>>({ sky: null, stars: null, far: null, near: null });
  const now = useClock();
  const [tick, setTick] = useState(0);
  // Clouds hold still while you read: placed from the clock when the page opens, moving only in a replay.
  // Coming back to the tab moves them to where the time now puts them, while nobody is watching.
  const [cloudHours, setCloudHours] = useState(() => {
    sharedSky.cloudHours ??= zonedHours(new Date(), visitorLocation().timeZone);
    return sharedSky.cloudHours;
  });
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'hidden') return;
      sharedSky.cloudHours = zonedHours(new Date(), visitorLocation().timeZone);
      setCloudHours(sharedSky.cloudHours);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
  const [replayElapsed, setReplayElapsed] = useState<number | null>(null);
  const onReplayEndRef = useRef(onReplayEnd);
  onReplayEndRef.current = onReplayEnd;
  const onDarknessRef = useRef(onDarkness);
  onDarknessRef.current = onDarkness;

  // Ambient micro-motion: stepped star twinkle. Off for reduced motion.
  useEffect(() => {
    if (reducedMotion || !settings.enabled) return;
    const timer = window.setInterval(() => {
      // Keep the painted sky on phones; four full canvas renders per twinkle compete with touch
      // interactions. Clock changes and the explicitly requested replay still repaint normally.
      if (document.hidden || window.matchMedia('(max-width: 640px)').matches) return;
      setTick((value) => value + 1);
    }, AMBIENT_TICK_MS);
    return () => window.clearInterval(timer);
  }, [reducedMotion, settings.enabled]);

  // Parallax: the layers ease towards an offset set by the pointer (mouse only) and, more gently, by how
  // far the page has scrolled, the near clouds moving most. Off for reduced motion.
  useEffect(() => {
    if (reducedMotion || !settings.enabled) return;
    const target = { x: sharedSky.parallaxX, y: scrollDrift() };
    const current = { ...target };
    let frame = 0;
    const apply = () => {
      for (const layer of SKY_LAYERS) {
        const canvas = canvasRefs.current[layer];
        if (canvas) canvas.style.transform = `translate3d(${current.x * PARALLAX_DEPTH[layer]}px, ${current.y * SCROLL_DEPTH[layer]}px, 0)`;
      }
    };
    const step = () => {
      current.x += (target.x - current.x) * 0.06;
      current.y += (target.y - current.y) * 0.1;
      sharedSky.parallaxX = current.x;
      apply();
      const moving = Math.abs(target.x - current.x) > 0.001 || Math.abs(target.y - current.y) > 0.001;
      frame = moving ? window.requestAnimationFrame(step) : 0;
    };
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      target.x = -((event.clientX / window.innerWidth) * 2 - 1);
      if (!frame) frame = window.requestAnimationFrame(step);
    };
    const onScroll = () => {
      if (window.matchMedia('(max-width: 640px)').matches) return;
      target.y = scrollDrift();
      if (!frame) frame = window.requestAnimationFrame(step);
    };
    apply();
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('scroll', onScroll);
      window.cancelAnimationFrame(frame);
    };
  }, [reducedMotion, settings.enabled]);

  // The easter-egg day runs on animation frames, then hands the clock back to real time.
  useEffect(() => {
    if (replayStartedAt === null) {
      setReplayElapsed(null);
      return;
    }
    let frame = 0;
    const step = (time: number) => {
      const elapsed = time - replayStartedAt;
      if (elapsed >= PUBLIC_ASTRID_SKY_REPLAY_MS) {
        setReplayElapsed(null);
        onReplayEndRef.current();
        return;
      }
      setReplayElapsed(elapsed);
      frame = window.requestAnimationFrame(step);
    };
    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, [replayStartedAt]);
  const [reveal, setReveal] = useState(reducedMotion || sharedSky.revealed ? 1 : 0);
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));

  useEffect(() => {
    const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const columns = Math.ceil((viewport.width + 2 * PARALLAX_MARGIN) / PUBLIC_ASTRID_SKY_PIXEL);
  const rows = Math.ceil((viewport.height + 2 * PARALLAX_MARGIN) / PUBLIC_ASTRID_SKY_PIXEL);
  const quiet = useQuietField(quietBehind, columns, rows, settings.enabled);

  // Warm the moon texture while the page is idle, so a replay never stalls on it.
  useEffect(() => {
    if (!settings.enabled) return;
    const phase = moonPhase(new Date());
    const idle = window.requestIdleCallback ?? ((callback: () => void) => window.setTimeout(callback, 400));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const handle = idle(() => preparePublicAstridSkyMoon(rows, phase, settings.size[settings.path], settings.moonScale));
    return () => cancel(handle);
  }, [rows, settings.enabled, settings.path, settings.size, settings.moonScale]);

  // The body rises into place once, on the first paint of the visit; a sky drawn later (moving between
  // home and Vision & Issues) starts already in place.
  useEffect(() => {
    if (reducedMotion || sharedSky.revealed) {
      sharedSky.revealed = true;
      setReveal(1);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const step = (time: number) => {
      const progress = Math.min(1, (time - start) / REVEAL_MS);
      setReveal(1 - (1 - progress) ** 3);
      if (progress < 1) frame = window.requestAnimationFrame(step);
      else sharedSky.revealed = true;
    };
    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, [reducedMotion]);

  const date = skyDate(settings, now);
  const replayOffset = replayElapsed === null ? 0 : replayOffsetHours(replayElapsed);
  const location = skyLocation(settings, date);
  const hours = (skyHours(settings, date, location) + replayOffset) % 24;
  const state = skyState(hours, sunTimes(date, location));
  const darkness = state.night;

  // The page's colours follow the sky being shown, even with the sky drawing turned off.
  useEffect(() => {
    onDarknessRef.current(darkness);
  }, [darkness]);

  useEffect(() => {
    if (!settings.enabled) return;
    for (const layer of SKY_LAYERS) {
      const canvas = canvasRefs.current[layer];
      if (!canvas) continue;
      const pixels = renderPublicAstridSky({
        columns,
        rows,
        state: { ...state, hours: settings.hours === null && settings.location === null ? (cloudHours + replayOffset) % 24 : hours },
        phase: moonPhase(date),
        // Strength is set for day and night; through twilight it moves between the two.
        intensity: settings.intensity.light + (settings.intensity.dark - settings.intensity.light) * darkness,
        reveal,
        tick,
        path: settings.path,
        size: settings.size[settings.path],
        lift: settings.lift[settings.path],
        moonScale: settings.moonScale,
        layer,
        quiet: quiet ?? undefined,
      });
      canvas.width = columns;
      canvas.height = rows;
      const context = canvas.getContext('2d');
      if (!context) continue;
      const image = context.createImageData(columns, rows);
      image.data.set(pixels);
      context.putImageData(image, 0, 0);
    }
    // `state` and `date` are derived from the values below on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, now, reveal, columns, rows, tick, replayElapsed, cloudHours, quiet]);

  if (!settings.enabled) return null;
  const renderLayer = (layer: SkyLayer) => (
    <canvas
      key={layer}
      ref={(node) => { canvasRefs.current[layer] = node; }}
      data-layer={layer}
      style={{
        left: -PARALLAX_MARGIN,
        top: -PARALLAX_MARGIN,
        width: columns * PUBLIC_ASTRID_SKY_PIXEL,
        height: rows * PUBLIC_ASTRID_SKY_PIXEL,
      }}
    />
  );
  return (
    <div className="astrid-sky" aria-hidden="true">
      {SKY_LAYERS.map(renderLayer)}
    </div>
  );
}

/** Jump-to moments in review, from the chosen place's own sunrise and sunset. */
function keyTimes({ sunrise, sunset }: { sunrise: number; sunset: number }): ReadonlyArray<readonly [string, number]> {
  const wrap = (hours: number) => ((hours % 24) + 24) % 24;
  const noon = (sunrise + sunset) / 2;
  return [
    ['Dawn', wrap(sunrise + 0.4)], ['Morning', wrap((sunrise + noon) / 2)], ['Midday', wrap(noon)],
    ['Afternoon', wrap((noon + sunset) / 2)], ['Sunset', wrap(sunset - 0.1)], ['Night', wrap(sunset + 4.5)],
  ];
}

const formatHours = (value: number) => {
  const hours = ((value % 24) + 24) % 24;
  const whole = Math.floor(hours);
  const minutes = Math.floor((hours % 1) * 60);
  return `${String(whole).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

interface PublicAstridSkyReviewProps {
  theme: PublicAstridSkyTheme;
  settings: PublicAstridSkySettings;
  onChange: (next: PublicAstridSkySettings) => void;
}

/** Floating review panel for scrubbing the sky through a day. Only rendered with ?sky-review. */
export function PublicAstridSkyReview({ theme, settings, onChange }: PublicAstridSkyReviewProps) {
  const now = useClock();
  const [open, setOpen] = useState(true);
  const [playing, setPlaying] = useState(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const date = skyDate(settings, now);
  const location = skyLocation(settings, date);
  const hours = skyHours(settings, date, location);
  const phase = moonPhase(date);
  const times = sunTimes(date, location);
  const ownZone = visitorLocation(date);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const step = (time: number) => {
      const current = settingsRef.current;
      const from = current.hours ?? zonedHours(new Date(), skyLocation(current, new Date()).timeZone);
      onChange({ ...current, hours: (from + ((time - last) / PLAY_DAY_MS) * 24) % 24 });
      last = time;
      frame = window.requestAnimationFrame(step);
    };
    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, [playing, onChange]);

  const set = (patch: Partial<PublicAstridSkySettings>) => onChange({ ...settings, ...patch });

  if (!open) {
    return (
      <button type="button" className="astrid-sky-review-pill" onClick={() => setOpen(true)}>
        Sky · {formatHours(hours)}
      </button>
    );
  }

  return (
    <aside className="astrid-sky-review" aria-label="Sky review controls">
      <header>
        <strong>Sky review</strong>
        <button type="button" className="astrid-sky-review-close" aria-label="Hide sky controls" onClick={() => setOpen(false)}>×</button>
      </header>
      <p className="astrid-sky-review-status">
        {formatHours(hours)} · {settings.enabled ? describeSky(skyState(hours, times), phase) : 'Sky off'}
      </p>
      <label className="astrid-sky-review-place">
        <span>Place</span>
        <select value={settings.location ?? ''} onChange={(event) => set({ location: event.target.value || null, hours: null })}>
          <option value="">Your sky ({ownZone.name})</option>
          {PUBLIC_ASTRID_REVIEW_PLACES.filter((zone) => zone !== ownZone.timeZone).map((zone) => (
            <option key={zone} value={zone}>{locationForTimeZone(zone, date).name}</option>
          ))}
        </select>
      </label>
      <p className="astrid-sky-review-sun">
        Sunrise {formatHours(times.sunrise)} · Sunset {formatHours(times.sunset)} ({location.name})
      </p>
      <div className="astrid-sky-review-buttons">
        <button type="button" aria-pressed={settings.enabled} onClick={() => set({ enabled: !settings.enabled })}>
          {settings.enabled ? 'Sky on' : 'Sky off'}
        </button>
        <button type="button" aria-pressed={settings.openFrame} onClick={() => set({ openFrame: !settings.openFrame })}>
          Open frame
        </button>
        <button type="button" aria-pressed={settings.path === 'arc'} onClick={() => set({ path: settings.path === 'arc' ? 'rise' : 'arc' })}>
          Arc path
        </button>
        {([['pixelMono', 'Pixel mono'], ['pixelBeta', 'Pixel beta'], ['pixelIcons', 'Pixel icons']] as const).map(([key, label]) => (
          <button key={key} type="button" aria-pressed={settings.details[key]} onClick={() => set({ details: { ...settings.details, [key]: !settings.details[key] } })}>
            {label}
          </button>
        ))}
        <button type="button" aria-pressed={playing} onClick={() => setPlaying(!playing)}>
          {playing ? 'Pause' : 'Play day'}
        </button>
        <button
          type="button"
          onClick={() => {
            setPlaying(false);
            onChange({ ...settings, hours: null, dayOffset: 0 });
          }}
        >
          Now
        </button>
      </div>
      <label>
        <span>Time</span>
        <input
          type="range" min={0} max={24} step={0.05} value={hours}
          onChange={(event) => { setPlaying(false); set({ hours: Number(event.target.value) }); }}
        />
        <output>{formatHours(hours)}</output>
      </label>
      <label>
        <span>Date</span>
        <input type="range" min={0} max={29} step={1} value={settings.dayOffset} onChange={(event) => set({ dayOffset: Number(event.target.value) })} />
        <output>{settings.dayOffset ? `+${settings.dayOffset}d` : 'Today'}</output>
      </label>
      <label>
        <span>Strength</span>
        <input
          type="range" min={0.1} max={1} step={0.05} value={settings.intensity[theme]}
          onChange={(event) => set({ intensity: { ...settings.intensity, [theme]: Number(event.target.value) } })}
        />
        <output title={theme === 'light' ? 'Light (day) palette' : 'Dark (night) palette'}>{Math.round(settings.intensity[theme] * 100)}%</output>
      </label>
      <label>
        <span>Size</span>
        <input
          type="range" min={0.08} max={1.6} step={0.02} value={settings.size[settings.path]}
          onChange={(event) => set({ size: { ...settings.size, [settings.path]: Number(event.target.value) } })}
        />
        <output>{Math.round(settings.size[settings.path] * 200)}%</output>
      </label>
      <label>
        <span>Height</span>
        <input
          type="range" min={-0.6} max={0.6} step={0.02} value={settings.lift[settings.path]}
          onChange={(event) => set({ lift: { ...settings.lift, [settings.path]: Number(event.target.value) } })}
        />
        <output>{settings.lift[settings.path] > 0 ? '+' : ''}{Math.round(settings.lift[settings.path] * 100)}%</output>
      </label>
      <label>
        <span>Moon size</span>
        <input type="range" min={0.5} max={2} step={0.05} value={settings.moonScale} onChange={(event) => set({ moonScale: Number(event.target.value) })} />
        <output>{settings.moonScale.toFixed(2)}×</output>
      </label>
      <p className="astrid-sky-review-phase">{moonPhaseName(phase)}</p>
      <div className="astrid-sky-review-times">
        {keyTimes(times).map(([name, time]) => (
          <button
            key={name}
            type="button"
            aria-pressed={Math.abs(hours - time) < 0.05}
            onClick={() => { setPlaying(false); set({ hours: time }); }}
          >
            {name}
            <small>{formatHours(time)}</small>
          </button>
        ))}
      </div>
    </aside>
  );
}
