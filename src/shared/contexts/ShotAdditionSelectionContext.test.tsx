import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  ShotAdditionSelectionProvider,
  useShotAdditionSelection,
  useShotAdditionSelectionOptional,
} from './ShotAdditionSelectionContext';

function Consumer() {
  const context = useShotAdditionSelection();
  return (
    <div>
      <span data-testid="selected-shot-id">{context.selectedShotId ?? 'none'}</span>
      <button type="button" onClick={() => context.selectShotForAddition('shot-42')}>
        select
      </button>
      <button type="button" onClick={context.clearSelectedShotForAddition}>
        clear
      </button>
    </div>
  );
}

function OptionalConsumer() {
  const context = useShotAdditionSelectionOptional();
  return <span data-testid="optional-selected">{context?.selectedShotId ?? 'none'}</span>;
}

describe('ShotAdditionSelectionContext', () => {
  it('throws when required hook is used outside provider', () => {
    expect(() => render(<Consumer />)).toThrow(
      'useShotAdditionSelection must be used within ShotAdditionSelectionProvider',
    );
  });

  it('supports selecting and clearing shot id within provider', () => {
    render(
      <ShotAdditionSelectionProvider>
        <Consumer />
        <OptionalConsumer />
      </ShotAdditionSelectionProvider>,
    );

    expect(screen.getByTestId('selected-shot-id').textContent).toBe('none');
    expect(screen.getByTestId('optional-selected').textContent).toBe('none');

    fireEvent.click(screen.getByRole('button', { name: 'select' }));
    expect(screen.getByTestId('selected-shot-id').textContent).toBe('shot-42');
    expect(screen.getByTestId('optional-selected').textContent).toBe('shot-42');

    fireEvent.click(screen.getByRole('button', { name: 'clear' }));
    expect(screen.getByTestId('selected-shot-id').textContent).toBe('none');
  });
});
