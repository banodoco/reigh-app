import { describe, it, expect, vi } from 'vitest';
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: vi.fn(() => vi.fn()), useParams: vi.fn(() => ({})), useSearchParams: vi.fn(() => [new URLSearchParams(), vi.fn()]), useLocation: vi.fn(() => ({ pathname: '/', search: '', hash: '', state: null })) };
});
import { useUrlSync } from '../useUrlSync';

describe('useUrlSync', () => {
  it('exports expected members', () => {
    expect(useUrlSync).toBeDefined();
    expect(typeof useUrlSync).toBe('function');
    expect(useUrlSync.name).toBeDefined();
  });
});
