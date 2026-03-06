import { describe, it, expect, vi } from 'vitest';
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: vi.fn(() => vi.fn()), useParams: vi.fn(() => ({})), useSearchParams: vi.fn(() => [new URLSearchParams(), vi.fn()]), useLocation: vi.fn(() => ({ pathname: '/', search: '', hash: '', state: null })) };
});
import { useJoinClips } from '../useJoinClips';

describe('useJoinClips', () => {
  it('exports expected hook', () => {
    expect(useJoinClips).toBeDefined();
    expect(typeof useJoinClips).toBe('function');
    expect(useJoinClips.name).toBeDefined();
  });
});
