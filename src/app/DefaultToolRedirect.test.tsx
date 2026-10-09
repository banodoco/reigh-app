import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { useUserUIStateMock } = vi.hoisted(() => ({ useUserUIStateMock: vi.fn() }));

vi.mock('@/shared/hooks/useUserUIState', () => ({ useUserUIState: useUserUIStateMock }));
vi.mock('@/shared/components/ReighLoading', () => ({ ReighLoading: () => <div data-testid="loading" /> }));

import { DefaultToolRedirect } from './DefaultToolRedirect';

function CurrentPath() {
  const location = useLocation();
  return <output data-testid="current-path">{location.pathname}{location.search}</output>;
}

describe('DefaultToolRedirect', () => {
  beforeEach(() => {
    useUserUIStateMock.mockReset();
    vi.stubEnv('VITE_APP_ENV', 'local');
  });

  it('resolves a saved hidden Tool preference to Video Editor and leaves the preference intact', async () => {
    const savedPreference = { toolId: 'travel-between-images' };
    useUserUIStateMock.mockReturnValue({ value: savedPreference, isLoading: false });
    render(<MemoryRouter initialEntries={['/tools']}>
      <DefaultToolRedirect />
      <CurrentPath />
    </MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('current-path')).toHaveTextContent('/tools/video-editor'));
    expect(savedPreference.toolId).toBe('travel-between-images');
  });
});
