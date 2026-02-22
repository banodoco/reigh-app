import { describe, it, expect } from 'vitest';
import { MediaContainerSkeleton, UploadingMediaState } from '../MediaStates';

describe('MediaStates', () => {
  it('exports expected members', () => {
    expect(MediaContainerSkeleton).toBeDefined();
    expect(UploadingMediaState).toBeDefined();
  });
});
