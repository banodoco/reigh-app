/**
 * Shot filter constants for gallery/generations filtering.
 *
 * The shot filter can be:
 * - 'all': Show items from all shots
 * - 'no-shot': Show items not assigned to any shot
 * - A shot UUID: Show items from a specific shot
 */

export const SHOT_FILTER = {
  /** Show items from all shots */
  ALL: 'all',
  /** Show items not assigned to any shot */
  NO_SHOT: 'no-shot',
} as const;

type SpecialShotFilter = typeof SHOT_FILTER[keyof typeof SHOT_FILTER];
type ShotFilterValue = SpecialShotFilter | string; // string for shot UUIDs

/**
 * Type guard to check if a filter value is a special filter (all/no-shot) vs a shot UUID.
 */
export function isSpecialFilter(filter: string): filter is SpecialShotFilter {
  return filter === SHOT_FILTER.ALL || filter === SHOT_FILTER.NO_SHOT;
}

