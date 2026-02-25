import { describe, expect, it } from 'vitest';

import {
  freshnessQueryKeys,
  isSegmentChildrenQueryKey,
  parseFreshnessQueryKey,
  serializeFreshnessQueryKey,
} from '../queryKeyContract';

describe('queryKeyContract', () => {
  it('round-trips serialized query keys', () => {
    const key = freshnessQueryKeys.tasksPaginated('project-1');
    const serialized = serializeFreshnessQueryKey(key);
    const parsed = parseFreshnessQueryKey(serialized);

    expect(parsed).toEqual(key);
  });

  it('returns original string when payload is not valid JSON', () => {
    const malformed = '{"bad": ';
    expect(parseFreshnessQueryKey(malformed)).toBe(malformed);
  });

  it('recognizes segment-children query keys', () => {
    expect(isSegmentChildrenQueryKey(freshnessQueryKeys.segmentChildrenPrefix)).toBe(true);
    expect(isSegmentChildrenQueryKey(freshnessQueryKeys.tasksPaginated('project-1'))).toBe(false);
  });
});
