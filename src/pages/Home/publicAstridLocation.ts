/**
 * Where the visitor probably is, without asking: their browser's time zone names a place (Europe/London
 * means about London), which is close enough for the sun, moon and twilight to match their own sky.
 * Nothing leaves the browser and there is no permission prompt.
 */

export interface PublicAstridLocation {
  /** IANA time zone, e.g. "Europe/London". */
  timeZone: string;
  name: string;
  latitude: number;
  longitude: number;
}

/** Representative coordinates for common time zones: the zone's namesake city. */
const ZONES: Record<string, readonly [string, number, number]> = {
  'Europe/London': ['London', 51.51, -0.13], 'Europe/Dublin': ['Dublin', 53.35, -6.26], 'Europe/Lisbon': ['Lisbon', 38.72, -9.14],
  'Europe/Madrid': ['Madrid', 40.42, -3.7], 'Europe/Paris': ['Paris', 48.86, 2.35], 'Europe/Brussels': ['Brussels', 50.85, 4.35],
  'Europe/Amsterdam': ['Amsterdam', 52.37, 4.9], 'Europe/Berlin': ['Berlin', 52.52, 13.4], 'Europe/Zurich': ['Zurich', 47.38, 8.54],
  'Europe/Rome': ['Rome', 41.9, 12.5], 'Europe/Vienna': ['Vienna', 48.21, 16.37], 'Europe/Prague': ['Prague', 50.08, 14.44],
  'Europe/Warsaw': ['Warsaw', 52.23, 21.01], 'Europe/Copenhagen': ['Copenhagen', 55.68, 12.57], 'Europe/Stockholm': ['Stockholm', 59.33, 18.07],
  'Europe/Oslo': ['Oslo', 59.91, 10.75], 'Europe/Helsinki': ['Helsinki', 60.17, 24.94], 'Europe/Athens': ['Athens', 37.98, 23.73],
  'Europe/Bucharest': ['Bucharest', 44.43, 26.1], 'Europe/Istanbul': ['Istanbul', 41.01, 28.98], 'Europe/Kyiv': ['Kyiv', 50.45, 30.52],
  'Europe/Kiev': ['Kyiv', 50.45, 30.52], 'Europe/Moscow': ['Moscow', 55.76, 37.62], 'Atlantic/Reykjavik': ['Reykjavík', 64.15, -21.94],
  'America/New_York': ['New York', 40.71, -74.01], 'America/Toronto': ['Toronto', 43.65, -79.38], 'America/Chicago': ['Chicago', 41.88, -87.63],
  'America/Denver': ['Denver', 39.74, -104.99], 'America/Phoenix': ['Phoenix', 33.45, -112.07], 'America/Los_Angeles': ['Los Angeles', 34.05, -118.24],
  'America/Vancouver': ['Vancouver', 49.28, -123.12], 'America/Anchorage': ['Anchorage', 61.22, -149.9], 'Pacific/Honolulu': ['Honolulu', 21.31, -157.86],
  'America/Halifax': ['Halifax', 44.65, -63.57], 'America/St_Johns': ["St John's", 47.56, -52.71], 'America/Mexico_City': ['Mexico City', 19.43, -99.13],
  'America/Bogota': ['Bogotá', 4.71, -74.07], 'America/Lima': ['Lima', -12.05, -77.04], 'America/Santiago': ['Santiago', -33.45, -70.67],
  'America/Sao_Paulo': ['São Paulo', -23.55, -46.63], 'America/Argentina/Buenos_Aires': ['Buenos Aires', -34.6, -58.38],
  'America/Buenos_Aires': ['Buenos Aires', -34.6, -58.38], 'America/Caracas': ['Caracas', 10.48, -66.9],
  'Africa/Lagos': ['Lagos', 6.52, 3.38], 'Africa/Cairo': ['Cairo', 30.04, 31.24], 'Africa/Nairobi': ['Nairobi', -1.29, 36.82],
  'Africa/Johannesburg': ['Johannesburg', -26.2, 28.05], 'Africa/Casablanca': ['Casablanca', 33.57, -7.59], 'Africa/Accra': ['Accra', 5.6, -0.19],
  'Asia/Dubai': ['Dubai', 25.2, 55.27], 'Asia/Tehran': ['Tehran', 35.69, 51.39], 'Asia/Karachi': ['Karachi', 24.86, 67.0],
  'Asia/Kolkata': ['Mumbai', 19.08, 72.88], 'Asia/Calcutta': ['Mumbai', 19.08, 72.88], 'Asia/Dhaka': ['Dhaka', 23.81, 90.41],
  'Asia/Bangkok': ['Bangkok', 13.76, 100.5], 'Asia/Jakarta': ['Jakarta', -6.21, 106.85], 'Asia/Singapore': ['Singapore', 1.35, 103.82],
  'Asia/Kuala_Lumpur': ['Kuala Lumpur', 3.14, 101.69], 'Asia/Ho_Chi_Minh': ['Ho Chi Minh City', 10.82, 106.63], 'Asia/Manila': ['Manila', 14.6, 120.98],
  'Asia/Hong_Kong': ['Hong Kong', 22.32, 114.17], 'Asia/Shanghai': ['Shanghai', 31.23, 121.47], 'Asia/Taipei': ['Taipei', 25.03, 121.57],
  'Asia/Seoul': ['Seoul', 37.57, 126.98], 'Asia/Tokyo': ['Tokyo', 35.68, 139.69], 'Asia/Jerusalem': ['Jerusalem', 31.77, 35.21],
  'Asia/Riyadh': ['Riyadh', 24.71, 46.68], 'Asia/Tashkent': ['Tashkent', 41.3, 69.24], 'Asia/Kathmandu': ['Kathmandu', 27.72, 85.32],
  'Australia/Perth': ['Perth', -31.95, 115.86], 'Australia/Adelaide': ['Adelaide', -34.93, 138.6], 'Australia/Darwin': ['Darwin', -12.46, 130.84],
  'Australia/Brisbane': ['Brisbane', -27.47, 153.03], 'Australia/Sydney': ['Sydney', -33.87, 151.21], 'Australia/Melbourne': ['Melbourne', -37.81, 144.96],
  'Australia/Hobart': ['Hobart', -42.88, 147.33], 'Pacific/Auckland': ['Auckland', -36.85, 174.76], 'Pacific/Fiji': ['Suva', -18.14, 178.44],
};

/** Places offered in the sky review panel, for previewing other skies. */
export const PUBLIC_ASTRID_REVIEW_PLACES: readonly string[] = [
  'Europe/London', 'Europe/Madrid', 'Europe/Oslo', 'Atlantic/Reykjavik', 'America/New_York', 'America/Los_Angeles',
  'America/Sao_Paulo', 'Africa/Nairobi', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland',
];

/** Hours ahead of UTC in `timeZone` at `at` (e.g. 1 for London in summer). */
export function utcOffsetHours(at: Date, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
    }).formatToParts(at);
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
    const wall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
    return Math.round((wall - Math.floor(at.getTime() / 1000) * 1000) / 60_000) / 60;
  } catch {
    return -at.getTimezoneOffset() / 60;
  }
}

/** Wall-clock hours in `timeZone` at `at`, e.g. 18.5 for half past six in the evening there. */
export function zonedHours(at: Date, timeZone: string): number {
  const utcHours = at.getUTCHours() + at.getUTCMinutes() / 60 + at.getUTCSeconds() / 3600;
  return (((utcHours + utcOffsetHours(at, timeZone)) % 24) + 24) % 24;
}

/** Southern-hemisphere zones not in the table, so their seasons still come out the right way round. */
const SOUTHERN = /^(Australia|Antarctica)\/|^Pacific\/(Auckland|Chatham|Fiji|Tongatapu|Apia|Noumea|Efate|Port_Moresby)|^America\/(Argentina|Santiago|Sao_Paulo|Montevideo|Asuncion|La_Paz|Lima)|^Africa\/(Johannesburg|Maputo|Harare|Lusaka|Windhoek|Gaborone|Maseru|Mbabane|Luanda|Kinshasa|Dar_es_Salaam)|^Indian\/(Mauritius|Reunion|Antananarivo)/;

export function locationForTimeZone(timeZone: string, at = new Date()): PublicAstridLocation {
  const known = ZONES[timeZone];
  if (known) return { timeZone, name: known[0], latitude: known[1], longitude: known[2] };
  // Unknown zone: the UTC offset gives the longitude well enough; the region guesses the hemisphere.
  const city = timeZone.split('/').pop()?.replace(/_/g, ' ') ?? timeZone;
  return { timeZone, name: city, latitude: SOUTHERN.test(timeZone) ? -30 : 40, longitude: utcOffsetHours(at, timeZone) * 15 };
}

export function visitorTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function visitorLocation(at = new Date()): PublicAstridLocation {
  return locationForTimeZone(visitorTimeZone(), at);
}
