import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { useUserUIStateMock } = vi.hoisted(() => ({ useUserUIStateMock: vi.fn() }));

vi.mock('@/shared/hooks/useUserUIState', () => ({ useUserUIState: useUserUIStateMock }));
vi.mock('@/shared/components/AstridLoading', () => ({ AstridLoading: () => <div data-testid="loading" /> }));

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

  it('preserves a saved working legacy preference', async () => {
    const savedPreference = { toolId: 'travel-between-images' };
    useUserUIStateMock.mockReturnValue({ value: savedPreference, isLoading: false });
    render(<MemoryRouter initialEntries={['/tools']}>
      <DefaultToolRedirect />
      <CurrentPath />
    </MemoryRouter>);

    await waitFor(() => expect(screen.getByTestId('current-path'))
      .toHaveTextContent('/tools/travel-between-images'));
    expect(savedPreference.toolId).toBe('travel-between-images');
  });

  it('uses Video Editor only as the fallback for an unavailable preference', async () => {
    useUserUIStateMock.mockReturnValue({ value: { toolId: 'missing-tool' }, isLoading: false });
    render(<MemoryRouter initialEntries={['/tools']}>
      <DefaultToolRedirect />
      <CurrentPath />
    </MemoryRouter>);

    await waitFor(() => expect(screen.getByTestId('current-path'))
      .toHaveTextContent('/tools/video-editor'));
  });
});
