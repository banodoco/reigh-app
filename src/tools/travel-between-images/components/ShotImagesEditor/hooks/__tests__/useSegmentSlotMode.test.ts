import { describe, it, expect, vi } from 'vitest';
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: vi.fn(() => vi.fn()), useParams: vi.fn(() => ({})), useSearchParams: vi.fn(() => [new URLSearchParams(), vi.fn()]), useLocation: vi.fn(() => ({ pathname: '/', search: '', hash: '', state: null })) };
});
import { useSegmentSlotMode } from '../useSegmentSlotMode';

describe('useSegmentSlotMode', () => {
  it('exports expected hook', () => {
    expect(useSegmentSlotMode).toBeDefined();
    expect(typeof useSegmentSlotMode).toBe('function');
    expect(useSegmentSlotMode.name).toBeDefined();
  });
});
