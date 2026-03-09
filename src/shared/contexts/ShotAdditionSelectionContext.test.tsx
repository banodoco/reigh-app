// @vitest-environment jsdom

import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  ShotAdditionSelectionProvider,
  useShotAdditionSelectionOptional,
} from './ShotAdditionSelectionContext';

function SelectionConsumer() {
  const context = useShotAdditionSelectionOptional();
  return (
    <div>
      <span>{context?.selectedShotId ?? 'none'}</span>
      <button
        type="button"
        onClick={() => context?.selectShotForAddition('shot-2')}
      >
        select
      </button>
      <button
        type="button"
        onClick={() => context?.clearSelectedShotForAddition()}
      >
        clear
      </button>
    </div>
  );
}

describe('ShotAdditionSelectionContext', () => {
  it('returns null outside the provider', () => {
    render(<SelectionConsumer />);
    expect(screen.getByText('none')).toBeTruthy();
  });

  it('stores and clears the selected shot id inside the provider', () => {
    const { container } = render(
      <ShotAdditionSelectionProvider>
        <SelectionConsumer />
      </ShotAdditionSelectionProvider>,
    );
    const scope = within(container);

    fireEvent.click(scope.getByText('select'));
    expect(scope.getByText('shot-2')).toBeTruthy();

    fireEvent.click(scope.getByText('clear'));
    expect(scope.getByText('none')).toBeTruthy();
  });
});
