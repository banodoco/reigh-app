import { describe, expect, it } from 'vitest';
import { cropFilename } from '@/shared/lib/stringFormatting';

describe('cropFilename boundary behavior', () => {
  it('returns empty string for zero max length', () => {
    expect(cropFilename('filename.png', 0)).toBe('');
  });

  it('returns empty string for negative max length', () => {
    expect(cropFilename('filename.png', -10)).toBe('');
  });
});
