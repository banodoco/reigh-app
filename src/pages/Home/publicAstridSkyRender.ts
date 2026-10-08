import { utcOffsetHours, visitorLocation, zonedHours, type PublicAstridLocation } from './publicAstridLocation';

/**
 * The public page's pixel sky: a huge pixel-art sun by day or moon by night, far behind the editor
 * stage, with stars and clouds. It follows the visitor's own sky: their local time, and sunrise, sunset
 * and twilight worked out for where their time zone places them. The page's colours follow how dark that
 * sky is. Everything here is pure so the renderer can be tested and previewed at any place and hour.
 */

/** The page's light or dark palette, set by how dark the visitor's sky is (not by App/Agent). */
export type PublicAstridSkyTheme = 'light' | 'dark';

export type PublicAstridSkyBody = 'sun' | 'moon' | 'none';

export interface PublicAstridSkyState {
  body: PublicAstridSkyBody;
  /** 0 on the horizon, 1 at the top of the track. */
  altitude: number;
  /** 0 at rise, 0.5 at the top, 1 at set: how far along today's track the body is. */
  progress: number;
  rising: boolean;
  /** Local clock time, which drifts the clouds. */
  hours: number;
  /** 0→1 strength of the stars and clouds from the clock alone; the renderer then turns them up
   *  wherever the sun or moon leaves the sky empty. */
  stars: number;
  clouds: number;
  /** How dark the sky is: 0 by day, 1 at night, easing through twilight. Sets the page's colours and
   *  darkens the clouds after dusk. */
  night: number;
}

export interface PublicAstridSunTimes {
  sunrise: number;
  sunset: number;
  /** How high the sun gets today, 0–1 (1 = overhead): a low winter sun takes a lower arc. */
  peak?: number;
}

/** Art pixels are drawn at this many CSS pixels, so the sky stays chunky at any viewport size. */
export const PUBLIC_ASTRID_SKY_PIXEL = 6;
/** The pale App page needs a lighter touch than the dark Agent page for the sky to feel equally present. */
export const PUBLIC_ASTRID_SKY_DEFAULT_INTENSITY: Record<PublicAstridSkyTheme, number> = { light: 0.3, dark: 0.45 };
/** The sky is empty this long either side of night, so the sun has set before the moon rises. */
const MOON_TWILIGHT_HOURS = 0.75;
/** On the arc path the sun's radius as a share of the viewport height: a disc 236% of the screen height,
 *  tuned in review. */
export const ARC_RADIUS = 1.18;
/** Height of the arc's top, as a share of the viewport height: high enough to clear the editor. */
const ARC_PEAK = 0.07;
/** Sun and moon radius as a share of the viewport height. */
export const SKY_RADIUS = 1.25;
const SYNODIC_MONTH_DAYS = 29.530588853;
const REFERENCE_NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14);
const DAY_MS = 864e5;

/** Moon phase as a fraction of the cycle: 0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter. */
export function moonPhase(at: Date): number {
  const days = (at.getTime() - REFERENCE_NEW_MOON_MS) / DAY_MS;
  return (((days % SYNODIC_MONTH_DAYS) + SYNODIC_MONTH_DAYS) % SYNODIC_MONTH_DAYS) / SYNODIC_MONTH_DAYS;
}

const MOON_PHASE_NAMES = [
  'New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous',
  'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent',
] as const;

export function moonPhaseName(phase: number): string {
  return MOON_PHASE_NAMES[Math.round(phase * 8) % 8];
}

/** Local clock time in hours, e.g. 18.5 for half past six in the evening. */
/** Shadows and the browser's own control colours cannot blend, so they change at mid-twilight. Everything
 *  else on the page blends gradually (see pageDusk). */
export function themeForDarkness(darkness: number): PublicAstridSkyTheme {
  return darkness < DUSK_SWITCH.at ? 'light' : 'dark';
}

/**
 * The page's colours skip the middle of twilight. However quickly a gradual blend runs, it has to pass
 * through a mid-tone where text and page are the same colour (about ten real minutes of muddy taupe). So
 * the page dims gently until `hold`, keeps that look until `at`, then switches straight to how it looks at
 * `resume` and carries on from there; the page crossfades that one switch (see PublicAstridSite's dusk
 * crossfade). The sky itself still darkens continuously.
 */
export const DUSK_SWITCH = { hold: 0.42, at: 0.46, resume: 0.52 } as const;

/** The darkness the page's colours are drawn for, which skips the middle of twilight (see DUSK_SWITCH). */
export function pageDarkness(darkness: number): number {
  return darkness < DUSK_SWITCH.at ? Math.min(darkness, DUSK_SWITCH.hold) : Math.max(darkness, DUSK_SWITCH.resume);
}

/** Page colour stops through twilight: day cream, a dusky taupe at mid-twilight, the near-black of night. */
const PAPER_STOPS: readonly Rgb[] = [[247, 244, 237], [124, 113, 101], [14, 13, 11]];
/** Text and icons switch with the paper at mid-twilight. Blending them independently would create a
 *  muddy dark-on-dark interval while the paper has already moved to its night state. */
const INK_CENTRE = 0.46;
/** Panels are always lighter than the page, so they start turning a little earlier and the page a little
 *  later: that way both pass their mid-tone together, and every piece of text turns at the same moment. */
const PANEL_CENTRE = 0.43;
const PAPER_CENTRE = 0.475;

/** The page's dusk values for a given sky darkness: its background colour, how far surfaces have
 *  shifted to their night colours, and how far text has. */
/** How sharply the page's surfaces pass through their mid-tones. They drift slowly through early dusk,
 *  turn quickly around the moment the text changes, then settle slowly into night, so text is never
 *  long on a surface close to its own tone. Real light falls fastest around civil dusk too. */
const DUSK_STEEPNESS = 26;
const logistic = (x: number) => 1 / (1 + Math.exp(-x));
/** Surface progress (0 day → 1 night) for a given sky darkness, eased around the text's change. */
export function surfaceDusk(darkness: number, centre = PANEL_CENTRE): number {
  const at = (x: number) => logistic(DUSK_STEEPNESS * (x - centre));
  return clamp01((at(darkness) - at(0)) / (at(1) - at(0)));
}

/** Near the change, surfaces are close to mid-tone, where only near-full-contrast text stays readable.
 *  Secondary (muted) text firms up towards full ink over this span of darkness either side of it. */
const FIRM_SPAN = 0.2;

export function pageDusk(skyDarkness: number): { paper: string; dusk: number; ink: number; inkPage: number; firm: number } {
  const darkness = pageDarkness(skyDarkness);
  const d = surfaceDusk(darkness);
  const p = surfaceDusk(darkness, PAPER_CENTRE);
  const [a, b] = p < 0.5 ? [PAPER_STOPS[0], PAPER_STOPS[1]] : [PAPER_STOPS[1], PAPER_STOPS[2]];
  const [r, g, bl] = mix(a, b, p < 0.5 ? p / 0.5 : (p - 0.5) / 0.5).map(Math.round);
  const near = clamp01(1 - Math.abs(clamp01(darkness) - INK_CENTRE) / FIRM_SPAN);
  // Paper and ink must cross together. The sky and paper may keep changing live, but the reading palette
  // is a two-state contract: dark ink on light paper before the switch, light ink on dark paper after it.
  const ink = skyDarkness < DUSK_SWITCH.at ? 0 : 1;
  return {
    paper: `rgb(${r}, ${g}, ${bl})`,
    dusk: d,
    ink,
    inkPage: ink,
    firm: near * near * (3 - 2 * near),
  };
}

/**
 * Astrid's palette as the app's design tokens, by day and by night, as the "H S% L%" triples its CSS
 * reads through hsl(). One source for the public site's editor and the app itself: warm paper and ink,
 * the orange accent, and the North Star cards' four tints (peach, sand, sage, slate) for the app's
 * pastel accents. Text tokens follow the same atomic reading-palette switch; the rest follow the whole of
 * twilight.
 */
const DUSK_TOKENS: ReadonlyArray<readonly [string, string, string, 'ink' | 'surface']> = [
  ['--background', '40 33% 97%', '30 11% 7%', 'surface'],
  ['--foreground', '32 14% 14%', '40 30% 93%', 'ink'],
  ['--card', '48 100% 99%', '33 11% 17%', 'surface'],
  ['--card-foreground', '32 14% 14%', '40 30% 93%', 'ink'],
  ['--popover', '48 100% 99%', '33 11% 17%', 'surface'],
  ['--popover-foreground', '32 14% 14%', '40 30% 93%', 'ink'],
  ['--primary', '20 70% 41%', '22 84% 53%', 'surface'],
  ['--primary-foreground', '40 33% 97%', '30 11% 7%', 'ink'],
  ['--secondary', '38 28% 92%', '33 9% 19%', 'surface'],
  ['--secondary-foreground', '32 14% 20%', '40 20% 88%', 'ink'],
  ['--muted', '38 22% 94%', '33 9% 18%', 'surface'],
  ['--muted-foreground', '34 9% 41%', '37 10% 66%', 'ink'],
  ['--accent', '28 76% 93%', '22 40% 21%', 'surface'],
  ['--accent-foreground', '24 55% 25%', '30 70% 84%', 'ink'],
  ['--border', '38 18% 84%', '33 10% 27%', 'surface'],
  ['--input', '38 18% 84%', '33 10% 27%', 'surface'],
  ['--ring', '20 70% 41%', '22 84% 53%', 'surface'],
  ['--destructive', '0 62% 46%', '0 60% 52%', 'surface'],
  ['--destructive-foreground', '0 0% 100%', '0 0% 100%', 'ink'],
  // Sidebar: a step off the page, like the site's panels.
  ['--sidebar-background', '38 28% 95%', '33 11% 10%', 'surface'],
  ['--sidebar-foreground', '32 14% 14%', '40 30% 93%', 'ink'],
  ['--sidebar-primary', '20 70% 41%', '22 84% 53%', 'surface'],
  ['--sidebar-primary-foreground', '40 33% 97%', '30 11% 7%', 'ink'],
  ['--sidebar-accent', '28 76% 93%', '22 40% 21%', 'surface'],
  ['--sidebar-accent-foreground', '24 55% 25%', '30 70% 84%', 'ink'],
  ['--sidebar-border', '38 18% 84%', '33 10% 27%', 'surface'],
  ['--sidebar-ring', '20 70% 41%', '22 84% 53%', 'surface'],
  // Icons: the accent, the North Star cards' inks, and quiet greys.
  ['--icon-primary', '20 70% 41%', '22 84% 60%', 'ink'],
  ['--icon-secondary', '38 62% 33%', '39 60% 64%', 'ink'],
  ['--icon-muted', '34 9% 52%', '37 8% 55%', 'ink'],
  ['--icon-interactive', '24 55% 35%', '30 70% 80%', 'ink'],
  ['--icon-success', '96 28% 33%', '96 33% 66%', 'ink'],
  ['--icon-warning', '38 62% 33%', '39 60% 64%', 'ink'],
  ['--icon-danger', '0 62% 46%', '0 60% 58%', 'ink'],
  // The retro buttons, as the site's quiet paper buttons.
  ['--retro', '38 28% 92%', '33 9% 19%', 'surface'],
  ['--retro-hover', '38 22% 86%', '33 9% 23%', 'surface'],
  ['--retro-border', '34 12% 60%', '37 8% 40%', 'surface'],
  ['--retro-foreground', '32 14% 20%', '40 20% 88%', 'ink'],
  ['--retro-shadow', '34 12% 60%', '30 11% 4%', 'surface'],
  ['--hero-retro-bg', '38 28% 92%', '33 9% 19%', 'surface'],
  ['--hero-retro-border', '34 12% 60%', '37 8% 40%', 'surface'],
  ['--hero-retro-text', '32 14% 20%', '40 20% 88%', 'ink'],
  ['--hero-retro-light', '40 33% 97%', '33 11% 14%', 'surface'],
  // The pastels, as the North Star tints: pink as peach, yellow as sand, mint as sage, lavender as slate.
  ['--wes-pink', '25 79% 92%', '20 26% 18%', 'surface'],
  ['--wes-pink-dark', '25 60% 84%', '20 26% 24%', 'surface'],
  ['--wes-soft-pink', '25 79% 92%', '20 26% 18%', 'surface'],
  ['--wes-soft-pink-dark', '25 60% 84%', '20 26% 24%', 'surface'],
  ['--wes-yellow', '41 56% 90%', '39 22% 17%', 'surface'],
  ['--wes-yellow-dark', '41 45% 80%', '39 22% 24%', 'surface'],
  ['--wes-pale-yellow', '41 56% 90%', '39 22% 17%', 'surface'],
  ['--wes-pale-yellow-dark', '41 45% 80%', '39 22% 24%', 'surface'],
  ['--wes-mint', '90 26% 90%', '96 17% 17%', 'surface'],
  ['--wes-mint-dark', '90 20% 78%', '96 17% 24%', 'surface'],
  ['--wes-mint-green', '90 26% 90%', '96 17% 17%', 'surface'],
  ['--wes-mint-green-dark', '90 20% 78%', '96 17% 24%', 'surface'],
  ['--wes-lavender', '210 25% 91%', '210 17% 18%', 'surface'],
  ['--wes-lavender-dark', '210 18% 80%', '210 17% 25%', 'surface'],
  ['--wes-dusty-lavender', '210 25% 91%', '210 17% 18%', 'surface'],
  ['--wes-dusty-lavender-dark', '210 18% 80%', '210 17% 25%', 'surface'],
  ['--wes-cream', '40 33% 95%', '33 11% 12%', 'surface'],
  ['--wes-pastel-cream', '40 33% 95%', '33 11% 12%', 'surface'],
  ['--wes-salmon', '20 75% 86%', '20 30% 28%', 'surface'],
  ['--wes-coral-salmon', '20 75% 86%', '20 30% 28%', 'surface'],
  ['--wes-coral', '18 70% 80%', '20 60% 50%', 'surface'],
  ['--wes-warm-coral', '18 70% 80%', '20 60% 50%', 'surface'],
  ['--wes-sage', '90 15% 78%', '96 12% 30%', 'surface'],
  ['--wes-sage-green', '90 15% 78%', '96 12% 30%', 'surface'],
  ['--wes-dusty-blue', '210 20% 80%', '210 14% 32%', 'surface'],
  ['--wes-teal', '200 20% 70%', '200 15% 40%', 'surface'],
  ['--wes-muted-teal', '200 20% 70%', '200 15% 40%', 'surface'],
  ['--wes-mustard', '39 60% 64%', '39 55% 55%', 'surface'],
  ['--wes-vintage-mustard', '39 60% 64%', '39 55% 55%', 'surface'],
  ['--wes-vintage-gold', '38 50% 78%', '38 55% 50%', 'surface'],
  ['--wes-burgundy', '20 70% 35%', '22 80% 60%', 'ink'],
  ['--wes-dark-orange', '20 70% 35%', '22 80% 60%', 'ink'],
  ['--wes-forest', '96 28% 28%', '96 30% 62%', 'ink'],
  ['--wes-forest-green', '96 28% 28%', '96 30% 62%', 'ink'],
];

type Lab = [number, number, number];
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
function hslToRgb(h: number, s: number, l: number): Lab {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0), f(8), f(4)];
}
function rgbToHsl([r, g, b]: Lab): Lab {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}
function rgbToOklab([r, g, b]: Lab): Lab {
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function oklabToRgb([L, A, B]: Lab): Lab {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const clamp = (c: number) => Math.max(0, Math.min(1, fromLinear(c)));
  return [clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)];
}
const parseHsl = (value: string): Lab => {
  const [h, s, l] = value.replace(/%/g, '').split(/\s+/).map(Number);
  return [h, s / 100, l / 100];
};

/** Blends two "H S% L%" tokens through OKLab, so the in-between shades are greys rather than the
 *  saturated yellows a straight HSL blend passes through. */
export function blendHslToken(day: string, night: string, t: number): string {
  if (t <= 0) return day;
  if (t >= 1) return night;
  const a = rgbToOklab(hslToRgb(...parseHsl(day)));
  const b = rgbToOklab(hslToRgb(...parseHsl(night)));
  const [h, s, l] = rgbToHsl(oklabToRgb([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]));
  return `${h.toFixed(1)} ${(s * 100).toFixed(1)}% ${(l * 100).toFixed(1)}%`;
}

/** The editor's design tokens for a given sky darkness. */
const FIRMING_TOKENS = new Set(['--muted-foreground', '--secondary-foreground', '--accent-foreground']);

export function duskTokens(darkness: number): Record<string, string> {
  const { dusk, ink, firm } = pageDusk(darkness);
  const foreground = DUSK_TOKENS.find(([name]) => name === '--foreground')!;
  return Object.fromEntries(DUSK_TOKENS.map(([name, day, night, kind]) => {
    let value = blendHslToken(day, night, kind === 'ink' ? ink : dusk);
    if (FIRMING_TOKENS.has(name)) value = blendHslToken(value, blendHslToken(foreground[1], foreground[2], ink), firm);
    return [name, value];
  }));
}

/** The page background for a given sky darkness, as a CSS colour. */
export function pagePaperFor(darkness: number): string {
  return pageDusk(darkness).paper;
}

/** How dark the sky is right now for this visitor: 0 by day, 1 at night, easing through twilight. */
export function skyDarknessAt(at: Date, location: PublicAstridLocation = visitorLocation(at)): number {
  return skyState(zonedHours(at, location.timeZone), sunTimes(at, location)).night;
}

export function localHours(at: Date): number {
  return at.getHours() + at.getMinutes() / 60 + at.getSeconds() / 3600;
}

/**
 * Approximate local sunrise and sunset from the date alone: solar declination at an assumed latitude,
 * centred on local noon (shifted an hour while daylight saving is in effect).
 */
/**
 * Local sunrise and sunset (in the location's own wall-clock hours) from NOAA's solar equations: solar
 * declination and the equation of time for the date, at the location's latitude and longitude. Accurate
 * to about a minute away from the poles; inside the polar circles it returns all-day or no-day.
 */
export function sunTimes(at: Date, location: PublicAstridLocation): PublicAstridSunTimes {
  const startOfYear = Date.UTC(at.getUTCFullYear(), 0, 1);
  const dayOfYear = Math.floor((at.getTime() - startOfYear) / DAY_MS) + 1;
  const g = ((2 * Math.PI) / 365) * (dayOfYear - 1);
  const equationOfTime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const declination = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g)
    + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const latitude = (location.latitude * Math.PI) / 180;
  // Solar noon in the location's wall-clock hours.
  const noon = (720 - 4 * location.longitude - equationOfTime) / 60 + utcOffsetHours(at, location.timeZone);
  const peakElevation = 90 - Math.abs(location.latitude - (declination * 180) / Math.PI);
  const peak = clamp01(Math.sin((Math.max(0, peakElevation) * Math.PI) / 180));
  // 90.833°: the sun's upper edge on the horizon, allowing for refraction.
  const cosHourAngle = Math.cos((90.833 * Math.PI) / 180) / (Math.cos(latitude) * Math.cos(declination)) - Math.tan(latitude) * Math.tan(declination);
  if (cosHourAngle >= 1) return { sunrise: noon, sunset: noon, peak };
  if (cosHourAngle <= -1) return { sunrise: noon - 12.01, sunset: noon + 12.01, peak };
  const halfDay = (Math.acos(cosHourAngle) * 180) / Math.PI / 15;
  return { sunrise: noon - halfDay, sunset: noon + halfDay, peak };
}

/** Which body is up at `hours`, and how high along its track. */
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const wrapHours = (value: number) => ((value % 24) + 24) % 24;

/** Stars come out quickly after sunset, so the empty twilight sky fills, and thin out over the small
 *  hours, gone just before sunrise. */
const STARS_FADE_IN_HOURS = 0.67;
const STARS_FADE_OUT_HOURS = 2.5;
/** Twilight, as at mid-latitudes: the light starts to go this long before sunset, and full darkness
 *  arrives this long after it (civil, nautical then astronomical twilight). Mirrored around sunrise.
 *  Halfway (where the page changes palette) falls about 35 minutes after sunset. */
const DIMMING_BEFORE_SUNSET_HOURS = 0.75;
const DARK_AFTER_SUNSET_HOURS = 1.9;
/** Stars start to show this long after sunset, once the sky has dimmed enough. */
const STARS_FIRST_SHOW_HOURS = 0.33;

export function skyState(hours: number, { sunrise, sunset, peak = 1 }: PublicAstridSunTimes): PublicAstridSkyState {
  const day = hours > sunrise && hours < sunset;
  const stars = day ? 0 : clamp01((wrapHours(hours - sunset) - STARS_FIRST_SHOW_HOURS) / STARS_FADE_IN_HOURS) * clamp01(wrapHours(sunrise - hours) / STARS_FADE_OUT_HOURS);
  // Hours since the nearer sunrise or sunset: positive by day, negative at night.
  const intoDay = day ? Math.min(hours - sunrise, sunset - hours) : -Math.min(wrapHours(hours - sunset), wrapHours(sunrise - hours));
  const ambient = { hours, stars, clouds: 1, night: clamp01((DIMMING_BEFORE_SUNSET_HOURS - intoDay) / (DIMMING_BEFORE_SUNSET_HOURS + DARK_AFTER_SUNSET_HOURS)) };
  if (day) {
    const progress = (hours - sunrise) / (sunset - sunrise);
    // A low winter (or high-latitude) sun takes a lower arc; the tropics' sun climbs to the top.
    return { body: 'sun', altitude: Math.sin(Math.PI * progress) * (0.35 + 0.65 * peak), progress, rising: progress < 0.5, ...ambient };
  }
  const moonrise = sunset + MOON_TWILIGHT_HOURS;
  const nightLength = 24 - (moonrise - (sunrise - MOON_TWILIGHT_HOURS));
  const progress = wrapHours(hours - moonrise) / nightLength;
  if (nightLength > 0 && progress <= 1) {
    return { body: 'moon', altitude: Math.sin(Math.PI * progress), progress, rising: progress < 0.5, ...ambient };
  }
  return { body: 'none', altitude: 0, progress: 0, rising: false, ...ambient };
}

type Rgb = readonly [number, number, number];

interface SkyPalette {
  sunLow: Rgb;
  sunHigh: Rgb;
  /** Moon tones, light to dark: highlight, lit surface, limb shading, crater wall shadow, seas, unlit side. */
  moonHighlight: Rgb;
  moonLit: Rgb;
  moonLimb: Rgb;
  moonCraterShadow: Rgb;
  moonMare: Rgb;
  moonShadow: Rgb;
  star: Rgb;
  /** Cloud tones: sunlit top, body, shaded underside. */
  cloudLight: Rgb;
  cloudBody: Rgb;
  cloudShade: Rgb;
  /** The same clouds at night, in darker tones. */
  nightCloudLight: Rgb;
  nightCloudBody: Rgb;
  nightCloudShade: Rgb;
}

/** Flat tones only: the sky follows the pixel-mink rules (square pixels, no gradients or glow). */
const PALETTES: Record<PublicAstridSkyTheme, SkyPalette> = {
  light: {
    sunLow: [235, 161, 114],
    sunHigh: [244, 210, 182],
    moonHighlight: [236, 230, 220],
    moonLit: [226, 218, 205],
    moonLimb: [218, 209, 195],
    moonCraterShadow: [205, 195, 180],
    moonMare: [210, 201, 187],
    moonShadow: [238, 234, 227],
    // Warm ink: present on the cream page without reading as dark spots.
    star: [150, 136, 117],
    // A shade darker than the cream page, so clouds read over plain paper as well as over the sun.
    cloudLight: [250, 247, 241],
    cloudBody: [239, 233, 223],
    cloudShade: [226, 217, 203],
    nightCloudLight: [233, 228, 219],
    nightCloudBody: [228, 222, 212],
    nightCloudShade: [216, 209, 197],
  },
  dark: {
    sunLow: [100, 41, 26],
    sunHigh: [75, 44, 32],
    moonHighlight: [84, 79, 73],
    moonLit: [70, 66, 61],
    moonLimb: [63, 60, 55],
    moonCraterShadow: [50, 47, 44],
    moonMare: [57, 54, 50],
    moonShadow: [28, 26, 24],
    star: [226, 211, 190],
    cloudLight: [58, 51, 43],
    cloudBody: [42, 37, 31],
    cloudShade: [29, 26, 22],
    // Lifted clear of the night sky (near-black) so the clouds still read as soft shapes at night.
    nightCloudLight: [58, 53, 47],
    nightCloudBody: [43, 40, 36],
    nightCloudShade: [33, 31, 28],
  },
};

/** The sky's colours blend from the day palette to the night one as the sky darkens, like the page. */
function blendPalette(darkness: number): SkyPalette {
  const day = PALETTES.light;
  const night = PALETTES.dark;
  const out = {} as Record<keyof SkyPalette, Rgb>;
  for (const key of Object.keys(day) as Array<keyof SkyPalette>) out[key] = mix(day[key], night[key], darkness);
  return out as SkyPalette;
}

/** Moon tones, in the order the pre-drawn moon texture refers to them. */
const MOON_TONES = ['moonHighlight', 'moonLit', 'moonLimb', 'moonCraterShadow', 'moonMare', 'moonShadow'] as const;
/** A stand-in palette whose moon tones are numbered markers, so the moon can be drawn once as tone slots
 *  and coloured with whatever the blended palette is at draw time. */
const MOON_MARKERS = Object.fromEntries(MOON_TONES.map((tone, i) => [tone, [i + 1, 0, 0]])) as unknown as SkyPalette;

/** Lunar seas, roughly where they sit on the real near side (x right, y down, radius 1). */
const MARIA: ReadonlyArray<readonly [number, number, number]> = [
  [-0.36, -0.44, 0.27], [0.14, -0.4, 0.17], [0.31, -0.06, 0.2], [0.67, -0.3, 0.11],
  [-0.63, 0.02, 0.31], [-0.17, 0.44, 0.17], [0.55, 0.22, 0.13], [-0.03, 0.12, 0.1],
];

/** Named craters at roughly their real positions: Tycho, Copernicus, Kepler, Plato, Aristarchus,
 *  Langrenus, Petavius, Clavius, Grimaldi, Theophilus, Albategnius, Ptolemaeus and a few small ones. */
const CRATERS: ReadonlyArray<readonly [number, number, number]> = [
  [-0.12, 0.7, 0.07], [-0.33, -0.03, 0.075], [-0.56, -0.07, 0.045], [-0.15, -0.73, 0.055],
  [-0.68, -0.29, 0.035], [0.79, 0.14, 0.06], [0.68, 0.43, 0.065], [-0.07, 0.86, 0.075],
  [-0.86, 0.04, 0.055], [0.33, 0.3, 0.055], [0.03, 0.36, 0.06], [-0.06, 0.24, 0.065],
  [0.46, -0.56, 0.035], [0.21, 0.6, 0.045], [-0.42, 0.52, 0.04], [0.56, -0.1, 0.03],
  [-0.3, 0.3, 0.03], [0.1, -0.15, 0.025],
];

function hash(i: number, j: number): number {
  let n = (i * 374761393 + j * 668265263) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise, so sea coastlines wander like real ones instead of speckling. */
function noise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const top = hash(ix, iy) + (hash(ix + 1, iy) - hash(ix, iy)) * sx;
  const bottom = hash(ix, iy + 1) + (hash(ix + 1, iy + 1) - hash(ix, iy + 1)) * sx;
  return top + (bottom - top) * sy;
}

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

export interface PublicAstridSkyRenderInput {
  /** Grid size in art pixels. */
  columns: number;
  rows: number;
  state: PublicAstridSkyState;
  phase: number;
  intensity: number;
  /** 0→1 entrance; the body rises into place and fades in on first paint. */
  reveal?: number;
  /** Animation step: advances the star twinkle. */
  tick?: number;
  /** 'rise': the body only climbs and sinks. 'arc': it also drifts east to west, rising lower left and
   *  setting lower right, like the real sky seen facing south. */
  path?: 'rise' | 'arc';
  /** Sun and moon radius as a share of the viewport height; defaults per path. */
  size?: number;
  /** Lifts the whole track up (positive) or down (negative), as a share of the viewport height. */
  lift?: number;
  /** Which depth layer to paint: the sun or moon; the stars; the far clouds; the near clouds; or everything. */
  layer?: 'all' | 'sky' | 'stars' | 'far' | 'near';
  /** Optional visibility controls for the live Brightness preview. Defaults keep the complete sky. */
  showSun?: boolean;
  showMoon?: boolean;
  showEnvironment?: boolean;
  /** Per pixel, how far to quiet the sky behind the page's text: 0 (not at all) to QUIET_LEVELS. */
  quiet?: Uint8Array;
  /** The moon's size relative to the sun's (1 = the same, as in the real sky). */
  moonScale?: number;
}

function moonPixel(nx: number, ny: number, distance: number, outline: number, phase: number, palette: SkyPalette): Rgb {
  if (distance > 1 - outline) return palette.moonLimb;
  const waxing = phase < 0.5;
  const limb = Math.sqrt(Math.max(0, 1 - ny * ny));
  const terminatorX = (waxing ? 1 : -1) * Math.cos(2 * Math.PI * phase) * limb;
  const towardSun = waxing ? nx - terminatorX : terminatorX - nx;
  if (towardSun <= 0) return palette.moonShadow;

  // Sunlight comes from the lit side; crater walls facing it light up, the opposite walls fall into shadow.
  const lightX = waxing ? 1 : -1;
  for (const [cx, cy, r] of CRATERS) {
    const dx = nx - cx;
    const dy = ny - cy;
    const d = Math.hypot(dx, dy);
    if (d > r) continue;
    const facing = (dx * lightX + dy * 0.35) / r;
    if (d > r * 0.72) return facing > 0.15 ? palette.moonHighlight : facing < -0.15 ? palette.moonCraterShadow : palette.moonLit;
    return facing > 0.35 ? palette.moonCraterShadow : palette.moonMare;
  }

  const wobble = 0.82 + 0.36 * noise(nx * 6 + 11, ny * 6 + 3);
  const inMare = MARIA.some(([mx, my, mr]) => Math.hypot(nx - mx, ny - my) < mr * wobble);
  // Volume: one stepped band along the rim and another along the terminator.
  const nearEdge = distance > 0.9 || towardSun < 0.1;
  if (inMare) return nearEdge ? palette.moonCraterShadow : palette.moonMare;
  return nearEdge ? palette.moonLimb : palette.moonLit;
}

/** Clouds sit on a loop just over one viewport wide (so few are ever off-screen), spaced evenly and
 *  alternating high and low. With twelve, the open strip left of the editor always holds at least one
 *  whole high cloud and one whole low cloud, whatever the time. Each entry is a base height (fraction
 *  of the viewport) and a size. */
const CLOUD_LOOP = 1.26;
const CLOUDS: ReadonlyArray<readonly [number, number]> = [
  [0.1, 1.0], [0.72, 0.85], [0.3, 0.8], [0.86, 1.0], [0.18, 0.75], [0.62, 0.9],
  [0.34, 0.85], [0.8, 0.8], [0.08, 0.9], [0.68, 1.0], [0.26, 0.75], [0.9, 0.85],
];
/** Puffs of one cumulus in cloud units (dx, dy, radius); odd clouds are mirrored for variety. */
const PUFFS: ReadonlyArray<readonly [number, number, number]> = [
  [-1.6, -0.3, 0.95], [-0.5, -0.6, 1.35], [0.8, -0.3, 1.15], [1.8, -0.2, 0.8],
];
/** Peak opacity of the stars and clouds, independent of the sun or moon's intensity. */
const AMBIENT_OPACITY: Record<PublicAstridSkyTheme, number> = { light: 0.85, dark: 0.6 };

interface CloudShape {
  x: number;
  base: number;
  unit: number;
  mirror: number;
}

/** Two cloud layers for parallax depth. Far clouds are smaller, fainter, sit in the gaps between the near
 *  ones and drift at half the speed; each layer is drawn to its own canvas so it can shift by its own
 *  amount as the pointer moves. */
interface CloudLayer {
  clouds: ReadonlyArray<readonly [number, number]>;
  scale: number;
  /** Whole trips round the loop per day, so the clouds are back where they started at midnight and the
   *  clock wrapping from 24:00 to 00:00 never makes them jump. */
  loopsPerDay: number;
  /** Offset around the loop, as a share of one cloud spacing, so far clouds fall between near ones. */
  phase: number;
  opacity: number;
}
const NEAR_CLOUDS: CloudLayer = { clouds: CLOUDS, scale: 1, loopsPerDay: 2, phase: 0, opacity: 1 };
const FAR_CLOUDS: CloudLayer = {
  clouds: [[0.2, 0.9], [0.5, 1], [0.12, 0.8], [0.74, 1], [0.38, 0.9], [0.58, 0.85], [0.06, 1], [0.84, 0.9]],
  scale: 0.5,
  loopsPerDay: 1,
  phase: 0.5,
  opacity: 0.55,
};

function cloudShapes(columns: number, rows: number, hours: number, layer: CloudLayer = NEAR_CLOUDS): CloudShape[] {
  const span = columns * CLOUD_LOOP;
  const spacing = span / layer.clouds.length;
  return layer.clouds.map(([fy, size], i) => ({
    x: (((i + layer.phase) * spacing + (hours / 24) * layer.loopsPerDay * span) % span) - columns * (CLOUD_LOOP - 1) / 2,
    base: fy * rows,
    unit: size * layer.scale * rows * 0.06,
    mirror: i % 2 ? -1 : 1,
  }));
}

/** Share of the viewport the disc covers, sampled coarsely. */
function discCoverage(columns: number, rows: number, centreX: number, centreY: number, radius: number): number {
  let inside = 0;
  let total = 0;
  for (let y = 0; y < rows; y += 3) {
    for (let x = 0; x < columns; x += 3) {
      total++;
      if (Math.hypot(x - centreX, y - centreY) < radius) inside++;
    }
  }
  return total ? inside / total : 0;
}

/**
 * The moon's face only changes with phase, size and side, so it is drawn once into a disc-sized
 * texture and then copied into place each frame. Per-pixel craters and seas are far too slow to
 * recompute on every animation frame.
 */
interface MoonTexture {
  key: string;
  size: number;
  /** Per pixel: 0 outside the disc, otherwise 1 + an index into MOON_TONES. */
  tones: Uint8Array;
  /** Per pixel, which surface feature it belongs to: 0 none (plain surface, rim, shadow), 1 + a crater's
   *  index into CRATERS, or MARE_FEATURE + a sea's index into MARIA. */
  features: Uint8Array;
}
const MARE_FEATURE = 1 + CRATERS.length;

/** The crater or sea a lit pixel of the moon belongs to, matching moonPixel's choices. */
function moonFeature(nx: number, ny: number, distance: number, outline: number, phase: number): number {
  if (distance > 1 - outline) return 0;
  const waxing = phase < 0.5;
  const limb = Math.sqrt(Math.max(0, 1 - ny * ny));
  const terminatorX = (waxing ? 1 : -1) * Math.cos(2 * Math.PI * phase) * limb;
  if ((waxing ? nx - terminatorX : terminatorX - nx) <= 0) return 0;
  const crater = CRATERS.findIndex(([cx, cy, r]) => Math.hypot(nx - cx, ny - cy) <= r);
  if (crater >= 0) return 1 + crater;
  const wobble = 0.82 + 0.36 * noise(nx * 6 + 11, ny * 6 + 3);
  const mare = MARIA.findIndex(([mx, my, mr]) => Math.hypot(nx - mx, ny - my) < mr * wobble);
  return mare >= 0 ? MARE_FEATURE + mare : 0;
}
/** One current texture/field/scratch mask, owned by the Site's renderer, never a module singleton. */
export interface PublicAstridSkyRasterCache {
  moon: MoonTexture | null;
  stars: { key: string; stars: Star[] } | null;
  mask: Uint8Array | null;
  featureQuiet: Float32Array;
  featureSize: Float32Array;
}

export function createPublicAstridSkyRasterCache(): PublicAstridSkyRasterCache {
  return { moon: null, stars: null, mask: null, featureQuiet: new Float32Array(MARE_FEATURE + MARIA.length), featureSize: new Float32Array(MARE_FEATURE + MARIA.length) };
}

function moonTexture(radius: number, phase: number, cache: PublicAstridSkyRasterCache): MoonTexture {
  const size = Math.ceil(radius) * 2;
  const key = `${size}|${phase.toFixed(3)}`;
  if (cache.moon?.key === key) return cache.moon;
  const half = size / 2;
  const outline = 1.5 / radius;
  const tones = new Uint8Array(size * size);
  const features = new Uint8Array(size * size);
  for (let ty = 0; ty < size; ty++) {
    for (let tx = 0; tx < size; tx++) {
      const nx = (tx + 0.5 - half) / radius;
      const ny = (ty + 0.5 - half) / radius;
      const distance = Math.hypot(nx, ny);
      if (distance >= 1) continue;
      tones[ty * size + tx] = moonPixel(nx, ny, distance, outline, phase, MOON_MARKERS)[0];
      features[ty * size + tx] = moonFeature(nx, ny, distance, outline, phase);
    }
  }
  cache.moon = { key, size, tones, features };
  return cache.moon;
}

/**
 * Behind the page's text the sky quiets itself, in the same flat steps as the rest of its pixel art. The
 * page marks each pixel 0 to QUIET_LEVELS by how close it is to the text (each level a third of the way).
 * Only things fade, each evenly across its whole shape, so nothing is sliced along the text's edge and no
 * shape of the text ever shows in the sky. How far a crater, sea or cloud fades follows how much of it
 * is behind the text: one mostly behind a heading softens a lot, one that only brushes the text barely
 * changes, and it eases in and out as the page scrolls or the sky moves rather than switching. Nothing
 * fades all the way, so no part of the moon or sky ever goes missing. Stars fade one by one.
 * The moon itself (its surface tone, rim and shadow line) is always drawn exactly as it is.
 */
const QUIET_LEVELS = 3;
/** The most a crater or sea gives way to the plain surface, and a cloud or star thins. */
const QUIET_FEATURE_FADE = 0.75;
const QUIET_CLOUD_THIN = 0.6;
const QUIET_STAR_THIN = 0.7;
/** A thing fades fully (to the limits above) once this share of it, weighted by quiet, is behind text. */
const QUIET_FULL_SHARE = 0.5;
/** How far a thing fades, from how much of it is behind the text (summed quiet over its pixel count).
 *  Stepped finely so the sky only redraws a thing when its share has really moved. */
const quietShare = (sum: number, count: number) => (count ? Math.round(Math.min(1, sum / count / QUIET_FULL_SHARE) * 12) / 12 : 0);

/** Builds the moon texture ahead of time (it takes ~100ms on large screens), so the first moon frame of
 *  a replay doesn't stutter. */
export function preparePublicAstridSkyMoon(rows: number, phase: number, size: number, moonScale = 1, cache = createPublicAstridSkyRasterCache()): void {
  moonTexture(size * rows * moonScale, phase, cache);
}

/** Star shapes, smallest to largest, as [dx, dy, weight] pixel offsets. Bigger stars are drawn as
 *  pixel-art sparkles with tapering arms rather than bigger squares, which read as spots. */
type StarShape = ReadonlyArray<readonly [number, number, number]>;
const DOT: StarShape = [[0, 0, 1]];
const PLUS: StarShape = [[0, 0, 1], [1, 0, 0.45], [-1, 0, 0.45], [0, 1, 0.45], [0, -1, 0.45]];
const SPARKLE: StarShape = [
  [0, 0, 1], [1, 0, 0.7], [-1, 0, 0.7], [0, 1, 0.7], [0, -1, 0.7],
  [2, 0, 0.35], [-2, 0, 0.35], [0, 2, 0.35], [0, -2, 0.35],
  [1, 1, 0.18], [-1, 1, 0.18], [1, -1, 0.18], [-1, -1, 0.18],
];

/** Star field for one viewport size: computed once, then drawn from the list each frame. */
interface Star {
  x: number;
  y: number;
  brightness: number;
  shape: StarShape;
  /** Twinklers step through TWINKLE_LEVELS from this offset; others hold steady. */
  twinkleOffset: number | null;
}

/** Distance from the Milky Way, a soft band running from the lower left to the upper right. */
function milkyWayDistance(x: number, y: number, columns: number, rows: number): number {
  const u = x / columns;
  const v = y / rows;
  // Line through (0.05, 0.95) and (1, 0.05); distance measured in screen fractions.
  const nx = 0.9;
  const ny = 0.95;
  const length = Math.hypot(nx, ny);
  return Math.abs((u - 0.05) * ny + (v - 0.95) * nx) / length;
}

function starField(columns: number, rows: number, cache: PublicAstridSkyRasterCache): Star[] {
  const key = `${columns}x${rows}`;
  if (cache.stars?.key === key) return cache.stars.stars;
  const stars: Star[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const field = hash(x * 3 + 1, y * 5 + 2) < 0.0016;
      // The Milky Way: many tiny, dim stars thickening towards a soft centre line, with a wandering edge.
      const band = milkyWayDistance(x, y, columns, rows) * (0.75 + 0.5 * noise(x / 14, y / 14));
      const inBand = hash(x + 57, y * 7 + 3) < 0.016 * Math.exp(-((band / 0.075) ** 2));
      if (!field && !inBand) continue;
      // Mostly faint, a few bright: a natural spread rather than a uniform field of dots.
      const brightness = inBand && !field ? 0.3 + 0.25 * hash(y, x) : 0.3 + 0.7 * hash(y, x) ** 2;
      const rank = hash(x + 101, y + 37);
      const shape = !field ? DOT : brightness > 0.8 && rank < 0.45 ? SPARKLE : brightness > 0.5 && rank < 0.4 ? PLUS : DOT;
      stars.push({
        x,
        y,
        brightness,
        shape,
        twinkleOffset: field && hash(x + 911, y + 433) < 0.25 ? Math.floor(hash(y + 17, x + 5) * TWINKLE_LEVELS.length * 3) : null,
      });
    }
  }
  cache.stars = { key, stars };
  return stars;
}

/** About one star in eight twinkles on its own slow cycle, stepping between a few flat levels rather
 *  than fading, so it reads as pixel animation. */
const TWINKLE_LEVELS = [1, 1, 1, 1, 0.75, 0.45, 0.75, 1, 1, 1, 1, 1] as const;
/** How much darkening it takes a star to go from invisible to fully out. */
const STAR_EMERGE = 0.25;

/**
 * Paints the sky into an RGBA buffer, one entry per art pixel. Pixels outside the sky stay
 * transparent so the page background (and the Agent dot grid) shows through untouched.
 */
export function renderPublicAstridSky(input: PublicAstridSkyRenderInput, output?: Uint8ClampedArray, cache = createPublicAstridSkyRasterCache()): Uint8ClampedArray {
  const { columns, rows, state, phase, intensity } = input;
  const reveal = input.reveal ?? 1;
  const tick = input.tick ?? 0;
  const out = output?.length === columns * rows * 4 ? output : new Uint8ClampedArray(columns * rows * 4);
  out.fill(0);
  if (intensity <= 0) return out;

  const palette = blendPalette(state.night);
  const arc = input.path === 'arc';
  // Scaled by altitude so the body still starts and ends below the horizon.
  const lift = input.lift ?? 0;
  // 'rise': bigger than the viewport, so it fills the page and reads as sky rather than an ornament.
  // 'arc': a smaller disc that travels the sky east to west, like the real thing seen facing south.
  const radius = (input.size ?? (arc ? ARC_RADIUS : SKY_RADIUS)) * rows * (state.body === 'moon' ? input.moonScale ?? 1 : 1);
  const bodyVisible = state.body === 'sun' ? input.showSun !== false : state.body === 'moon' ? input.showMoon !== false : false;
  // On the horizon the disc sits wholly below the viewport, so it rises up from the bottom edge and
  // sinks back out of view instead of vanishing. Positions are whole art pixels so edges never shimmer.
  const below = rows + radius;
  let centreX: number;
  let centreY: number;
  if (state.body === 'none') {
    centreX = Math.round(0.6 * columns);
    centreY = Math.round(below + radius);
  } else if (arc) {
    // Rises lower left, climbs the open left side, crosses above the editor at its top, sets on the right.
    const angle = Math.PI * state.progress;
    centreX = Math.round((0.5 - 0.55 * Math.cos(angle)) * columns);
    centreY = Math.round(below - (below - ARC_PEAK * rows) * Math.sin(angle) + (1 - reveal) * 0.22 * rows - lift * rows * Math.sin(angle));
  } else {
    // The sun climbs until it is mostly cropped off the top; the moon peaks lower so its face stays legible.
    const top = state.body === 'moon' ? 0.55 * rows : -0.6 * rows;
    centreX = Math.round(0.6 * columns);
    centreY = Math.round(below + (top - below) * Math.max(0, state.altitude) + (1 - reveal) * 0.22 * rows - lift * rows * Math.max(0, state.altitude));
  }
  // The travelling disc covers far less of the page, so it can carry twice the strength and still sit back.
  const alpha = Math.round(255 * Math.min(1, intensity * (arc ? 2 : 1)) * reveal);
  // Stars and clouds keep their own opacity: tied to the body's, they vanish on the faint App side.
  const ambientAlpha = Math.round(255 * (AMBIENT_OPACITY.light + (AMBIENT_OPACITY.dark - AMBIENT_OPACITY.light) * state.night) * reveal);

  // Stars and clouds fill whatever the sun or moon leaves empty, so a low moon still has a full sky.
  const empty = 1 - (bodyVisible ? discCoverage(columns, rows, centreX, centreY, radius) : 0);
  const starStrength = state.stars * (0.3 + 0.7 * empty) * (0.85 + 0.15 * state.night);
  const cloudStrength = state.clouds * (0.35 + 0.65 * empty);

  const layer = input.layer ?? 'all';
  const quietAt = (x: number, y: number) => (input.quiet ? input.quiet[y * columns + x] / QUIET_LEVELS : 0);
  const cloudOpacity = ambientAlpha * Math.min(1, 1.6 * cloudStrength);
  const toneAt = (dayTone: Rgb, nightTone: Rgb) => mix(dayTone, nightTone, state.night);
  const paintClouds = (cloudLayer: CloudLayer, paint: (x: number, y: number, tone: Rgb, share: number, quiet: number) => void) => {
    for (const cloud of cloudShapes(columns, rows, state.hours, cloudLayer)) {
      const u = cloud.unit;
      const bottom = cloud.base + 0.12 * u;
      const inside = (x: number, y: number) => {
        // A flat middle whose ends curve up, so the underside is a soft rounded base, not a ruled line.
        const fromCentre = Math.max(0, Math.abs(x + 0.5 - cloud.x) - 1.1 * u) / u;
        if (y + 0.5 > bottom - 0.9 * u * fromCentre * fromCentre) return false;
        return PUFFS.some(([dx, dy, r]) => {
          const ox = (x + 0.5 - (cloud.x + dx * u * cloud.mirror)) / (r * u);
          const oy = (y + 0.5 - (cloud.base + dy * u)) / (r * u);
          return ox * ox + oy * oy <= 1;
        });
      };
      const rim = Math.max(1, Math.round(0.3 * u));
      const y0 = Math.max(0, Math.floor(cloud.base - 2.2 * u));
      const y1 = Math.min(rows - 1, Math.floor(bottom));
      const x0 = Math.max(0, Math.floor(cloud.x - 3 * u));
      const x1 = Math.min(columns - 1, Math.ceil(cloud.x + 3 * u));
      // A cloud thins evenly across its shape, by how much of it is behind the text.
      let quiet = 0;
      if (input.quiet) {
        let sum = 0;
        let count = 0;
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) if (inside(x, y)) { sum += quietAt(x, y); count += 1; }
        }
        quiet = quietShare(sum, count);
      }
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (!inside(x, y)) continue;
          // The same shape and shading by day and night; only the tones darken after dusk.
          const underside = !inside(x, y + 1);
          const top = !inside(x, y - rim);
          const dayTone = underside ? palette.cloudShade : top ? palette.cloudLight : palette.cloudBody;
          const nightTone = underside ? palette.nightCloudShade : top ? palette.nightCloudLight : palette.nightCloudBody;
          paint(x, y, toneAt(dayTone, nightTone), cloudLayer.opacity, quiet);
        }
      }
    }
  };
  // Stars are left out wherever a cloud passes, so on their own canvas they still sit behind the clouds.
  let cloudMask: Uint8Array | null = null;
  const scratchMask = () => {
    if (cache.mask?.length !== columns * rows) cache.mask = new Uint8Array(columns * rows);
    cache.mask.fill(0);
    return cache.mask;
  };
  if (layer === 'stars' && cloudStrength > 0 && starStrength > 0) {
    const mask = scratchMask();
    const mark = (x: number, y: number) => { if (x >= 0 && y >= 0 && x < columns && y < rows) mask[y * columns + x] = 1; };
    paintClouds(FAR_CLOUDS, mark);
    paintClouds(NEAR_CLOUDS, mark);
    cloudMask = mask;
  }
  const clouded = (x: number, y: number) => cloudMask !== null && x >= 0 && y >= 0 && x < columns && y < rows && cloudMask[y * columns + x] === 1;
  // Near clouds are in front: a far cloud is left out wherever a near one covers it, so where the two
  // cross they read as one cloud in front of another rather than a see-through outline of the far one.
  let nearMask: Uint8Array | null = null;
  if (layer === 'far' && cloudStrength > 0) {
    const mask = scratchMask();
    paintClouds(NEAR_CLOUDS, (x, y) => { if (x >= 0 && y >= 0 && x < columns && y < rows) mask[y * columns + x] = 1; });
    nearMask = mask;
  }

  const write = (x: number, y: number, color: Rgb, opacity: number) => {
    if (x < 0 || y < 0 || x >= columns || y >= rows) return;
    const index = (y * columns + x) * 4;
    out[index] = color[0];
    out[index + 1] = color[1];
    out[index + 2] = color[2];
    out[index + 3] = Math.round(opacity);
  };
  const inDisc = (x: number, y: number) => bodyVisible && Math.hypot(x + 0.5 - centreX, y + 0.5 - centreY) < radius;

  // 1. The sun or moon, only over the rows and columns it can touch.
  const paintsSky = layer === 'all' || layer === 'sky';
  if (paintsSky && bodyVisible) {
    const x0 = Math.max(0, Math.floor(centreX - radius));
    const x1 = Math.min(columns, Math.ceil(centreX + radius));
    const y0 = Math.max(0, Math.floor(centreY - radius));
    const y1 = Math.min(rows, Math.ceil(centreY + radius));
    if (state.body === 'sun') {
      const sunCore = mix(palette.sunLow, palette.sunHigh, Math.min(1, state.altitude * 1.3));
      const sunHeart = mix(sunCore, palette.sunHigh, 0.35);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const distance = Math.hypot(x + 0.5 - centreX, y + 0.5 - centreY) / radius;
          if (distance >= 1) continue;
          // Stepped flat bands: a slightly paler heart, the core, then two fading rings.
          if (distance < 0.5) write(x, y, sunHeart, alpha);
          else if (distance < 0.8) write(x, y, sunCore, alpha);
          else if (distance < 0.9) write(x, y, sunCore, alpha * 0.6);
          else write(x, y, sunCore, alpha * 0.3);
        }
      }
    } else {
      const texture = moonTexture(radius, phase, cache);
      const offset = texture.size / 2;
      // Each feature fades evenly across its shape, by how much of it is behind the text.
      const { featureQuiet, featureSize } = cache;
      featureQuiet.fill(0);
      featureSize.fill(0);
      if (input.quiet) {
        for (let y = y0; y < y1; y++) {
          const ty = y - centreY + offset;
          if (ty < 0 || ty >= texture.size) continue;
          for (let x = x0; x < x1; x++) {
            const tx = x - centreX + offset;
            if (tx < 0 || tx >= texture.size) continue;
            const feature = texture.features[ty * texture.size + tx];
            if (!feature) continue;
            featureQuiet[feature] += quietAt(x, y);
            featureSize[feature] += 1;
          }
        }
        for (let i = 0; i < featureQuiet.length; i++) featureQuiet[i] = QUIET_FEATURE_FADE * quietShare(featureQuiet[i], featureSize[i]);
      }
      for (let y = y0; y < y1; y++) {
        const ty = y - centreY + offset;
        if (ty < 0 || ty >= texture.size) continue;
        for (let x = x0; x < x1; x++) {
          const tx = x - centreX + offset;
          if (tx < 0 || tx >= texture.size) continue;
          const index = ty * texture.size + tx;
          const tone = texture.tones[index];
          if (!tone) continue;
          // A crater or sea fades as a whole into the plain lit surface; everything else is as drawn.
          const feature = texture.features[index];
          const detail = palette[MOON_TONES[tone - 1]];
          write(x, y, feature ? mix(detail, palette.moonLit, featureQuiet[feature]) : detail, alpha);
        }
      }
    }
  }

  // 2. Stars, behind the moon. Over the hero copy they shrink to dimmer single pixels, so they reach across
  //    the whole sky without competing with the headline. Dimmer stars drop out first as the field
  //    fades, so it thins out rather than just turning grey.
  if (input.showEnvironment !== false && (layer === 'all' || layer === 'stars') && starStrength > 0) {
    const threshold = 1 - starStrength * 1.1;
    const fade = Math.min(1, starStrength * 1.5);
    const glow = 0.95 - 0.25 * state.night;
    for (const star of starField(columns, rows, cache)) {
      const overCopy = star.x < columns * 0.27 && star.y > rows * 0.1;
      const level = star.twinkleOffset === null ? 1 : TWINKLE_LEVELS[(tick + star.twinkleOffset) % TWINKLE_LEVELS.length];
      // Each star fades in as the sky darkens past its own brightness (and out again towards dawn), rather
      // than switching on at full strength. Twinkling only dims a star that is already out.
      const emerged = clamp01((star.brightness - threshold) / STAR_EMERGE);
      if (emerged <= 0) continue;
      const weight = Math.min(1, star.brightness * level * fade * glow) * emerged * (overCopy ? 0.55 : 1);
      // A star fades as a whole, by its centre's quiet.
      const starQuiet = star.x >= 0 && star.y >= 0 && star.x < columns && star.y < rows ? quietAt(star.x, star.y) : 0;
      for (const [dx, dy, share] of overCopy ? DOT : star.shape) {
        const sx = star.x + dx;
        const sy = star.y + dy;
        if (sx < 0 || sy < 0 || sx >= columns || sy >= rows || inDisc(sx, sy) || clouded(sx, sy)) continue;
        write(sx, sy, palette.star, ambientAlpha * weight * share * (1 - QUIET_STAR_THIN * starQuiet));
      }
    }
  }

  // 3. Clouds last, far layer then near, in front of the sun and moon. Shading follows each cloud's own
  //    outline, so the base never reads as a slab: a lit rim along the top and a shaded rim along the
  //    underside. After dusk the same clouds simply turn darker.
  if (input.showEnvironment !== false && cloudStrength > 0) {
    const paintCloud = (x: number, y: number, tone: Rgb, share: number, quiet: number) => write(x, y, tone, cloudOpacity * share * (1 - QUIET_CLOUD_THIN * quiet));
    if (layer === 'all' || layer === 'far') {
      paintClouds(FAR_CLOUDS, (x, y, tone, share, quiet) => { if (!nearMask?.[y * columns + x]) paintCloud(x, y, tone, share, quiet); });
    }
    if (layer === 'all' || layer === 'near') paintClouds(NEAR_CLOUDS, paintCloud);
  }
  return out;
}

export function describeSky(state: PublicAstridSkyState, phase: number): string {
  if (state.body === 'none') return 'Twilight: the sky is empty between sun and moon';
  if (state.body === 'moon') return `${moonPhaseName(phase)} ${state.rising ? 'rising' : 'setting'}`;
  const where = state.altitude > 0.85 ? 'high overhead' : state.altitude < 0.3 ? 'on the horizon' : state.rising ? 'climbing' : 'sinking';
  return `Sun ${where}`;
}
