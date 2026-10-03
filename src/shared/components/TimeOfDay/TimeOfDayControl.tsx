import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Moon, Sun } from 'lucide-react';
import { DUSK_SWITCH, renderPublicAstridSky } from '@/pages/Home/publicAstridSkyRender';
import { useAppTheme } from '@/shared/hooks/core/useAppTheme';

/**
 * The app's appearance as a time of day: 0 is midday, 1 is midnight, as on the public site. By default it
 * follows the real sky where the person is; picking a moment here fixes it there instead. The app's
 * palette crosses from day to night at dusk, and the little sky above the slider moves continuously so
 * the choice feels like picking a moment rather than a mode.
 */
export const TIME_OF_DAY_DUSK = DUSK_SWITCH.at;

export function useTimeOfDayTheme() {
  const { setTime, followsSky, followSky, darkness, darkMode } = useAppTheme();
  const setTimeOfDay = (value: number) => setTime(Math.min(1, Math.max(0, value)));
  return { timeOfDay: darkness, setTimeOfDay, followsSky, followSky, darkMode };
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
/** The clock the preview's clouds are placed by: midday at the slider's start, midnight at its end, so
 *  they move with the chosen time as the home page's clouds move with the day. */
const previewCloudHours = (darkness: number) => (12 + 12 * darkness) % 24;
/** The sun's and moon's size against the preview's height; the moon is the smaller. */
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
 * A small pixel sky for the chosen time, drawn by the public site's own sky renderer so it matches the
 * home page: by day the sun sinks across the sky and sets behind the hills on the right; past dusk a
 * smaller moon rises from behind the hills on the left and climbs; stars come out, and the clouds move
 * with the time, as on the home page.
 * The sun and moon are never on show together, and one never turns into the other.
 */
export function TimeOfDaySky({ value, className = '' }: { value: number; className?: string }) {
  const { top, bottom } = skyAt(value);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
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
    if (!canvas || !columns || !rows) return undefined;
    const context = canvas.getContext('2d');
    if (!context) return undefined;
    canvas.width = columns;
    canvas.height = rows;
    const hills = hillHeights(columns, rows);
    const draw = () => {
      const darkness = valueRef.current;
      const day = darkness < TIME_OF_DAY_DUSK;
      // By day the sun runs from its height (midday) to its setting (dusk); by night the moon from its
      // rising (dusk) to its height (midnight). At dusk both are below the hills.
      const progress = day ? 0.5 + 0.5 * (darkness / TIME_OF_DAY_DUSK) : 0.5 * ((darkness - TIME_OF_DAY_DUSK) / (1 - TIME_OF_DAY_DUSK));
      const pixels = renderPublicAstridSky({
        columns,
        rows,
        state: {
          body: day ? 'sun' : 'moon',
          altitude: Math.sin(Math.PI * progress),
          progress,
          rising: !day,
          hours: previewCloudHours(darkness),
          stars: Math.min(1, Math.max(0, (darkness - 0.55) / 0.3)),
          clouds: 1,
          night: darkness,
        },
        phase: 0.5,
        intensity: 0.5,
        path: 'arc',
        size: PREVIEW_SUN_SIZE,
        // A lower arc than the home page's, so at midday and midnight the sun and moon stay within the frame.
        lift: PREVIEW_ARC_LIFT,
        moonScale: PREVIEW_MOON_SCALE,
      });
      const image = context.createImageData(columns, rows);
      image.data.set(pixels);
      // The hills last, in front of everything, so the sun and moon set and rise behind them.
      const paint = (heights: number[], tone: Rgb) => {
        for (let x = 0; x < columns; x += 1) {
          for (let y = rows - heights[x]; y < rows; y += 1) {
            const i = (y * columns + x) * 4;
            image.data[i] = tone[0]; image.data[i + 1] = tone[1]; image.data[i + 2] = tone[2]; image.data[i + 3] = 255;
          }
        }
      };
      paint(hills.far, mix(HILL_TONES.far.day, HILL_TONES.far.night, darkness));
      paint(hills.near, mix(HILL_TONES.near.day, HILL_TONES.near.night, darkness));
      context.putImageData(image, 0, 0);
    };
    draw();
    canvas.addEventListener('astrid-sky-redraw', draw);
    return () => canvas.removeEventListener('astrid-sky-redraw', draw);
  }, [size]);

  // The sky is redrawn whenever the time changes.
  useEffect(() => {
    canvasRef.current?.dispatchEvent(new Event('astrid-sky-redraw'));
  }, [value]);

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

export function TimeOfDaySlider({ value, onChange, label = 'Time of day' }: { value: number; onChange: (value: number) => void; label?: string }) {
  return (
    <div className="flex items-center gap-3">
      <Sun className="h-5 w-5 shrink-0 text-primary" aria-hidden />
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={label}
        aria-valuetext={value < TIME_OF_DAY_DUSK ? 'Day (light)' : 'Night (dark)'}
        className="h-2 w-full cursor-pointer accent-primary"
      />
      <Moon className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
    </div>
  );
}

/**
 * The time-of-day picker as used in onboarding and settings: follow the real sky (the default), or choose a
 * moment. The sky preview and slider show the sky as it is now while following it; dragging the slider
 * picks a moment.
 */
export function TimeOfDayControl({ compact = false }: { compact?: boolean }) {
  const { timeOfDay, setTimeOfDay, followsSky, followSky } = useTimeOfDayTheme();
  const options = [
    { follows: true, title: 'Follow the time of day', note: 'Light by day, dark by night, like the sky where you are.', choose: followSky },
    { follows: false, title: 'Choose a level', note: 'Keep it at one brightness, from midday to midnight.', choose: () => setTimeOfDay(timeOfDay) },
  ];
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Appearance">
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
      <TimeOfDaySky value={timeOfDay} className={compact ? 'h-16' : 'h-36'} />
      <TimeOfDaySlider value={timeOfDay} onChange={setTimeOfDay} label={followsSky ? 'Time of day (now, where you are)' : 'Time of day'} />
      {followsSky && (
        <p className="text-xs text-muted-foreground">
          Showing the sky where you are right now. Drag to choose a level instead.
        </p>
      )}
    </div>
  );
}
