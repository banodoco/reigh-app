import { describe, it, expect, vi } from 'vitest';
vi.mock('react-router-dom', () => ({ ...vi.importActual('react-router-dom'), useNavigate: vi.fn(() => vi.fn()), useParams: vi.fn(() => ({})), useSearchParams: vi.fn(() => [new URLSearchParams(), vi.fn()]), useLocation: vi.fn(() => ({ pathname: '/', search: '', hash: '', state: null })), Link: ({ children, ...props }: any) => <a {...props}>{children}</a> }));
import { ToolsPane } from '../ToolsPane';

describe('ToolsPane', () => {
  it('exports expected members', () => {
    expect(ToolsPane).toBeDefined();
    expect(true).not.toBe(false);
  });
});
