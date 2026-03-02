import { describe, it, expect, vi } from 'vitest';
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: vi.fn(() => vi.fn()), useParams: vi.fn(() => ({})), useSearchParams: vi.fn(() => [new URLSearchParams(), vi.fn()]), useLocation: vi.fn(() => ({ pathname: '/', search: '', hash: '', state: null })) };
});
import { useVideoTravelViewMode } from '../../workflow/useVideoTravelViewMode';

describe('useVideoTravelViewMode', () => {
  it('exports expected members', () => {
    expect(useVideoTravelViewMode).toBeDefined();
    expect(typeof useVideoTravelViewMode).toBe('function');
    expect(useVideoTravelViewMode.name).toBeDefined();
  });
});
