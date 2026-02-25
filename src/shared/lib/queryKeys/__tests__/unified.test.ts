import { describe, expect, it } from 'vitest';
import {
  extractUnifiedProjectGenerationsPage,
  isUnifiedProjectGenerationsKey,
  unifiedGenerationQueryKeys,
} from '@/shared/lib/queryKeys/unified';

describe('unifiedGenerationQueryKeys helpers', () => {
  it('detects project generation keys', () => {
    const key = unifiedGenerationQueryKeys.byProject('project-1', 3, 24, '{"a":1}', false);
    expect(isUnifiedProjectGenerationsKey(key)).toBe(true);
    expect(isUnifiedProjectGenerationsKey(key, 'project-1')).toBe(true);
    expect(isUnifiedProjectGenerationsKey(key, 'project-2')).toBe(false);
  });

  it('extracts page safely', () => {
    const key = unifiedGenerationQueryKeys.byProject('project-1', 7, 24, null, false);
    expect(extractUnifiedProjectGenerationsPage(key)).toBe(7);
    expect(extractUnifiedProjectGenerationsPage(key, 'project-1')).toBe(7);
    expect(extractUnifiedProjectGenerationsPage(unifiedGenerationQueryKeys.all)).toBeNull();
  });
});
