import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { renderPublicAstridSky, skyState, sunTimes } from '@/pages/Home/publicAstridSkyRender';
import { visitorLocation } from '@/pages/Home/publicAstridLocation';
import { todayAtHour, useAppTheme } from '@/shared/hooks/core/useAppTheme';

/**
 * The app's appearance as a time on a 24-hour clock, midnight to midnight, as on the public site. By
 * default it follows the real sky where the person is (the clock shows the time now); choosing a time
 * fixes the app at the sky's brightness then.
 */
export function useTimeOfDayTheme() {
  const { setTime, followsSky, followSky, hours, darkness, darkMode } = useAppTheme();
  const setHours = (value: number) => setTime(Math.min(24, Math.max(0, value)));
  return { hours, setHours, followsSky, followSky, darkness, darkMode };
}

/** "8:00 am", "12:30 pm": a time on the clock as people say it. */
export function formatClockTime(hours: number): string {
  const total = Math.round(Math.min(24, Math.max(0, hours)) * 60) % (24 * 60);
  const hour = Math.floor(total / 60);
  const minute = total % 60;
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'am' : 'pm'}`;
}

/** The real sky where the person is, at a time today. */
function skyAtHour(hours: number) {
  const at = todayAtHour(hours);
  return { ...skyState(hours % 24, sunTimes(at, visitorLocation(at))), hours: hours % 24 };
}

type Rgb = readonly [number, number, number];
const SKY_STOPS: ReadonlyArray<readonly [number, Rgb, Rgb]> = [
  // position, sky top, sky bottom: the site's paper by day, its dusky taupe, the near-black of night
  [0, [247, 244, 237], [244, 222, 202]],
  [0.38, [236, 226, 212], [240, 196, 160]],
  [0.5, [124, 113, 101], [214, 140, 96]],
  [0.62, [44, 40, 34], [86, 66, 52]],
  [1, [14, 13, 11], [34, 31, 26]],
];
const mix = (a: Rgb, b: Rgb, t: number) => a.map((v, i) => Math.round(v + (b[i] - v) * t)) as unknown as Rgb;
const rgb = (c: Rgb) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;

function skyAt(value: number): { top: string; bottom: string } {
  for (let i = 1; i < SKY_STOPS.length; i += 1) {
    const [at, top, bottom] = SKY_STOPS[i];
    const [prevAt, prevTop, prevBottom] = SKY_STOPS[i - 1];
    if (value <= at) {
      const t = (value - prevAt) / (at - prevAt);
      return { top: rgb(mix(prevTop, top, t)), bottom: rgb(mix(prevBottom, bottom, t)) };
    }
  }
  const last = SKY_STOPS[SKY_STOPS.length - 1];
  return { top: rgb(last[1]), bottom: rgb(last[2]) };
}

/** The preview's art pixel, in CSS px. */
const PREVIEW_PIXEL = 4;
/** The sun's and moon's size against the preview's height (the moon the smaller), and a lower arc than
 *  the home page's so at their highest they stay within the frame. */
const PREVIEW_SUN_SIZE = 0.3;
const PREVIEW_MOON_SCALE = 0.62;
const PREVIEW_ARC_LIFT = -0.34;

/** Gentle hills along the bottom of the preview, as the height of the ground (in art pixels) per column:
 *  a far ridge and a nearer one. */
function hillHeights(columns: number, rows: number) {
  const far: number[] = [];
  const near: number[] = [];
  for (let x = 0; x < columns; x += 1) {
    const t = x / columns;
    far.push(Math.round(rows * (0.3 + 0.06 * Math.sin(t * 5.2 + 0.6) + 0.03 * Math.sin(t * 11 + 2))));
    near.push(Math.round(rows * (0.18 + 0.05 * Math.sin(t * 3.4 + 2.4) + 0.025 * Math.sin(t * 9 + 1))));
  }
  return { far, near };
}

const HILL_TONES = {
  // The North Star sage, by day and by night.
  far: { day: [206, 218, 190] as Rgb, night: [40, 46, 35] as Rgb },
  near: { day: [182, 198, 162] as Rgb, night: [28, 32, 25] as Rgb },
};

/**
 * A small pixel sky at a time of day, drawn by the public site's own sky renderer from the real sky where
 * the person is, so it matches the home page and makes physical sense: the sun rises and sets behind the
 * hills, a smaller moon rises after dark, twilight comes and goes, stars come out, and the clouds move
 * with the time. Nothing ever turns into anything else.
 */
export function TimeOfDaySky({ hours, className = '' }: { hours: number; className?: string }) {
  const sky = skyAtHour(hours);
  const { top, bottom } = skyAt(sky.night);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ columns: 0, rows: 0 });

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return undefined;
    const measure = () => setSize({
      columns: Math.max(1, Math.round(wrap.clientWidth / PREVIEW_PIXEL)),
      rows: Math.max(1, Math.round(wrap.clientHeight / PREVIEW_PIXEL)),
    });
    measure();
    if (typeof ResizeObserver !== 'function') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const { columns, rows } = size;
    const context = canvas?.getContext('2d');
    if (!canvas || !context || !columns || !rows) return;
    canvas.width = columns;
    canvas.height = rows;
    const state = skyAtHour(hours);
    const image = context.createImageData(columns, rows);
    image.data.set(renderPublicAstridSky({
      columns,
      rows,
      state,
      phase: 0.5,
      intensity: 0.5,
      path: 'arc',
      size: PREVIEW_SUN_SIZE,
      lift: PREVIEW_ARC_LIFT,
      moonScale: PREVIEW_MOON_SCALE,
    }));
    // The hills last, in front of everything, so the sun and moon rise and set behind them.
    const hills = hillHeights(columns, rows);
    const paint = (heights: number[], tone: Rgb) => {
      for (let x = 0; x < columns; x += 1) {
        for (let y = rows - heights[x]; y < rows; y += 1) {
          const i = (y * columns + x) * 4;
          image.data[i] = tone[0]; image.data[i + 1] = tone[1]; image.data[i + 2] = tone[2]; image.data[i + 3] = 255;
        }
      }
    };
    paint(hills.far, mix(HILL_TONES.far.day, HILL_TONES.far.night, state.night));
    paint(hills.near, mix(HILL_TONES.near.day, HILL_TONES.near.night, state.night));
    context.putImageData(image, 0, 0);
  }, [size, hours]);

  return (
    <div
      ref={wrapRef}
      className={`relative overflow-hidden rounded-xl ${className}`}
      style={{ background: `linear-gradient(${top}, ${bottom})` } as CSSProperties}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" style={{ imageRendering: 'pixelated' }} />
    </div>
  );
}

/** A 24-hour clock, midnight to midnight: 8am a third of the way along, noon in the middle. */
export function TimeOfDaySlider({ hours, onChange, label = 'Time of day' }: { hours: number; onChange: (hours: number) => void; label?: string }) {
  return (
    <div className="space-y-1">
      <input
        type="range"
        min={0}
        max={24}
        step={0.25}
        value={hours}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={label}
        aria-valuetext={formatClockTime(hours)}
        className="h-2 w-full cursor-pointer accent-primary"
      />
    </div>
  );
}

/**
 * The brightness picker as used in onboarding and settings: follow the time of day where the person is
 * (the default; the clock shows the time now and moves with it), or choose a time and keep the app as
 * bright as the sky is then.
 */
export function TimeOfDayControl({ compact = false }: { compact?: boolean }) {
  const { hours, setHours, followsSky, followSky } = useTimeOfDayTheme();
  const options = [
    { follows: true, title: 'Follow the time of day', note: 'Light by day, dark by night, like the sky where you are.', choose: followSky },
    { follows: false, title: 'Choose a level', note: 'Pick a time on the clock, and keep it as bright as the sky is then.', choose: () => setHours(hours) },
  ];
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Brightness">
        {options.map((option) => {
          const selected = followsSky === option.follows;
          return (
            <button
              key={option.title}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={option.choose}
              className={`rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${selected ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
            >
              <span className="block text-sm font-medium text-foreground">{option.title}</span>
              {!compact && <span className="mt-1 block text-xs text-muted-foreground">{option.note}</span>}
            </button>
          );
        })}
      </div>
      <TimeOfDaySky hours={hours} className={compact ? 'h-16' : 'h-36'} />
      <TimeOfDaySlider hours={hours} onChange={setHours} label={followsSky ? 'Time of day (now, where you are)' : 'Time of day'} />
    </div>
  );
}
