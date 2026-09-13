import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RuntimeAuthenticationError } from '@/integrations/runtime/client.ts';
import { RuntimeConnectorRecoveryBanner } from './VideoEditorPage.tsx';

describe('RuntimeConnectorRecoveryBanner', () => {
  it('shows the auth recovery action and invokes reconnect', async () => {
    const onRetry = vi.fn();

    render(
      <RuntimeConnectorRecoveryBanner
        error={new RuntimeAuthenticationError('/api/runtime')}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Workspace Runtime authentication failed');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Provide an authenticated connector credential and retry.',
    );

    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry Runtime connection' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
