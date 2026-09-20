import { describe, expect, it } from 'vitest';
import { findRuntimeProjectId } from './useResolvedGalleryProject';

describe('findRuntimeProjectId', () => {
  it('maps a local Astrid slug to the canonical Runtime project id', () => {
    expect(findRuntimeProjectId([
      { slug: 'astrid-intro', project_id: '61d1078d029e42a9af8540c0d5647ae3' },
      { slug: 'matrix-minkhole', project_id: '7f362daea1f048969980ef23f0cd46e6' },
    ], 'astrid-intro')).toBe('61d1078d029e42a9af8540c0d5647ae3');
  });

  it('does not turn an unknown selector into a legacy project id', () => {
    expect(findRuntimeProjectId([
      { slug: 'astrid-intro', project_id: '61d1078d029e42a9af8540c0d5647ae3' },
    ], 'missing-project')).toBeNull();
  });

  it('ignores malformed Runtime rows without a usable project id', () => {
    expect(findRuntimeProjectId([
      { slug: 'astrid-intro', project_id: '   ' },
      { slug: 'astrid-intro' },
    ], 'astrid-intro')).toBeNull();
  });
});
