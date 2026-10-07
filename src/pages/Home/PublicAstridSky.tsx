import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  describeSky,
  moonPhaseName,
  PUBLIC_ASTRID_SKY_PIXEL,
  skyState,
} from './publicAstridSkyRender';
import {
  locationForTimeZone,
  PUBLIC_ASTRID_REVIEW_PLACES,
  visitorLocation,
} from './publicAstridLocation';
import {
  PARALLAX_DEPTH,
  PARALLAX_MARGIN,
  SCROLL_DEPTH,
  skyDate,
  type PublicAstridSkySession,
  type PublicAstridSkySettings,
} from './publicAstridSkySession';
import './PublicAstridSky.css';
import { PUBLIC_ASTRID_SKY_LAYERS as SKY_LAYERS, type PublicAstridSkyLayer as SkyLayer } from './publicAstridSkyRenderer';

/** Parallax: each layer is drawn this much larger on every side, so shifting it never shows an edge. */

export type { PublicAstridSkySettings } from './publicAstridSkySession';
export {
  DEFAULT_PUBLIC_ASTRID_SKY_SETTINGS,
  PUBLIC_ASTRID_SKY_REPLAY_MS,
  PUBLIC_ASTRID_SKY_REPLAY_SETTLE_MS,
  PUBLIC_ASTRID_SKY_REPLAY_TURN_MS,
  replayOffsetHours,
  skyDate,
  skyLocation,
} from './publicAstridSkySession';
export { quietField } from './publicAstridSkyGeometry';

/** Review controls appear only when the URL asks for them, e.g. /home?sky-review. */
export function wantsPublicAstridSkyReview(): boolean {
  return typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('sky-review');
}

interface PublicAstridSkyProps {
  session: PublicAstridSkySession;
  reducedMotion?: boolean;
  active?: boolean;
  geometryRoot?: { readonly current: HTMLElement | null };
  geometryOwner?: string;
  /** The page's reading text (a CSS selector). The sky quiets behind it so it stays crisp: the moon's
   *  craters and seas smooth out, its rim softens a little, and the stars and clouds thin. */
  quietBehind?: string;
}

/** A huge pixel sun or moon far behind the page, following the visitor's clock. Decorative only. Drawn as
 *  three layers (sun, moon and stars; far clouds; near clouds) that drift apart a little with the
 *  pointer, for depth. */
function useSkyControls(session: PublicAstridSkySession, active: boolean) {
  return useSyncExternalStore(
    active ? session.subscribeControls : () => () => {},
    session.getControlsSnapshot,
    session.getControlsSnapshot,
  );
}

function useSkyGeometry(
  session: PublicAstridSkySession,
  active: boolean,
  rootRef: { readonly current: HTMLElement | null } | undefined,
  selector: string | undefined,
  owner: string,
) {
  useLayoutEffect(() => {
    if (!active || !rootRef?.current || !selector) return undefined;
    return session.registerGeometryRoot(rootRef.current, selector, owner);
  }, [active, owner, rootRef, selector, session]);
}

export function PublicAstridSky({ session, active = true, geometryRoot, geometryOwner = 'sky', quietBehind }: PublicAstridSkyProps) {
  const canvasRefs = useRef<Record<SkyLayer, HTMLCanvasElement | null>>({ sky: null, stars: null, far: null, near: null });
  const { settings } = useSkyControls(session, active);
  useSkyGeometry(session, settings.enabled && active, geometryRoot, quietBehind, geometryOwner);

  // A single active-view pass consumes the latest values from the independent channels. Parallax
  // wakes only compositor writes; raster/geometry/resize signals coalesce without React frame renders.
  useEffect(() => {
    if (!active || !settings.enabled) return undefined;
    let alive = true;
    let frame = 0;
    let rasterDirty = true;
    let idleHandle: number | null = null;
    let moonKey = '';
    const idle = window.requestIdleCallback ?? ((callback: () => void) => window.setTimeout(callback, 400));
    const cancelIdle = window.cancelIdleCallback ?? window.clearTimeout;
    session.renderer.invalidate();
    const schedule = () => {
      if (alive && !frame) frame = window.requestAnimationFrame(paint);
    };
    const invalidate = () => { rasterDirty = true; schedule(); };
    function paint() {
      if (!alive) return;
      frame = 0;
      // Read: no DOM writes until all scene, viewport and geometry inputs have been captured.
      const snapshot = session.getSnapshot();
      if (!snapshot.visible || !snapshot.settings.enabled) return;
      const settings = snapshot.settings;
      const columns = Math.ceil((window.innerWidth + 2 * PARALLAX_MARGIN) / PUBLIC_ASTRID_SKY_PIXEL);
      const rows = Math.ceil((window.innerHeight + 2 * PARALLAX_MARGIN) / PUBLIC_ASTRID_SKY_PIXEL);
      session.setGeometryViewport(columns, rows);
      const geometry = session.getGeometrySnapshot();
      const quiet = geometry.columns === columns && geometry.rows === rows ? geometry.quiet : null;
      if (rasterDirty) session.renderer.paint({
        columns,
        rows,
        state: { ...snapshot.state, hours: snapshot.cloudHours },
        phase: snapshot.phase,
        // Strength is set for day and night; through twilight it moves between the two.
        intensity: settings.intensity.light + (settings.intensity.dark - settings.intensity.light) * snapshot.darkness,
        reveal: snapshot.reveal,
        tick: snapshot.tick,
        path: settings.path,
        size: settings.size[settings.path],
        lift: settings.lift[settings.path],
        moonScale: settings.moonScale,
        quiet: quiet ?? undefined,
      }, canvasRefs.current);
      rasterDirty = false;
      for (const layer of SKY_LAYERS) {
        const canvas = canvasRefs.current[layer];
        if (!canvas) continue;
        const width = `${columns * PUBLIC_ASTRID_SKY_PIXEL}px`;
        const height = `${rows * PUBLIC_ASTRID_SKY_PIXEL}px`;
        const transform = `translate3d(${snapshot.parallaxX * PARALLAX_DEPTH[layer]}px, ${snapshot.parallaxY * SCROLL_DEPTH[layer]}px, 0)`;
        if (canvas.style.width !== width) canvas.style.width = width;
        if (canvas.style.height !== height) canvas.style.height = height;
        if (canvas.style.transform !== transform) canvas.style.transform = transform;
      }
      const nextMoonKey = [rows, snapshot.phase, settings.size[settings.path], settings.moonScale].join('|');
      if (nextMoonKey !== moonKey) {
        moonKey = nextMoonKey;
        if (idleHandle !== null) cancelIdle(idleHandle);
        idleHandle = idle(() => {
          idleHandle = null;
          if (alive && session.getSnapshot().visible) session.renderer.prepareMoon(rows, snapshot.phase, settings.size[settings.path], settings.moonScale);
        });
      }
    }
    const cleanups = [session.subscribeRaster(invalidate), session.subscribeGeometry(invalidate), session.subscribeParallax(schedule)];
    window.addEventListener('resize', invalidate);
    schedule();
    return () => {
      alive = false;
      window.cancelAnimationFrame(frame);
      if (idleHandle !== null) cancelIdle(idleHandle);
      cleanups.forEach((cleanup) => cleanup());
      window.removeEventListener('resize', invalidate);
      session.renderer.invalidate();
    };
  }, [active, session, settings.enabled]);

  if (!settings.enabled) return null;
  const renderLayer = (layer: SkyLayer) => (
    <canvas
      key={layer}
      ref={(node) => { canvasRefs.current[layer] = node; }}
      data-layer={layer}
      style={{
        left: -PARALLAX_MARGIN,
        top: -PARALLAX_MARGIN,
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

export function usePublicAstridSkyControls(session: PublicAstridSkySession, active = true) {
  return useSkyControls(session, active);
}

interface PublicAstridSkyReviewProps {
  session: PublicAstridSkySession;
  active?: boolean;
}

/** Floating review panel for scrubbing the sky through a day. Only rendered with ?sky-review. */
export function PublicAstridSkyReview({ session, active = true }: PublicAstridSkyReviewProps) {
  const controls = useSkyControls(session, active);
  const { settings, palette, hours, location, times, phase } = controls;
  const playing = controls.reviewPlaying;
  const [open, setOpen] = useState(true);
  const date = skyDate(settings, Date.now());
  const ownZone = visitorLocation(date);
  const set = (patch: Partial<PublicAstridSkySettings>) => session.patchSettings(patch);

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
        <button type="button" aria-pressed={playing} onClick={() => (playing ? session.stopReviewDay() : session.startReviewDay())}>
          {playing ? 'Pause' : 'Play day'}
        </button>
        <button
          type="button"
          onClick={() => {
            session.setNow();
          }}
        >
          Now
        </button>
      </div>
      <label>
        <span>Time</span>
        <input
          type="range" min={0} max={24} step={0.05} value={hours}
          onChange={(event) => session.setManualHours(Number(event.target.value))}
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
          type="range" min={0.1} max={1} step={0.05} value={settings.intensity[palette.theme]}
          onChange={(event) => session.patchSettings({ intensity: { ...settings.intensity, [palette.theme]: Number(event.target.value) } })}
        />
        <output title={palette.theme === 'light' ? 'Light (day) palette' : 'Dark (night) palette'}>{Math.round(settings.intensity[palette.theme] * 100)}%</output>
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
            onClick={() => session.setManualHours(time)}
          >
            {name}
            <small>{formatHours(time)}</small>
          </button>
        ))}
      </div>
    </aside>
  );
}
