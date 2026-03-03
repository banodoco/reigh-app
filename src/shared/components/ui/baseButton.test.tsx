import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  BaseButton,
  BASE_BUTTON_CLASSNAME,
  BASE_BUTTON_VARIANTS,
  BASE_BUTTON_SIZES,
} from './baseButton';

describe('BaseButton', () => {
  it('renders default button with configured variant/size classes', () => {
    render(
      <BaseButton variant="destructive" size="sm">
        Delete
      </BaseButton>,
    );

    const button = screen.getByRole('button', { name: 'Delete' });
    expect(button.className).toContain('inline-flex');
    expect(button.className).toContain('focus-visible:ring-2');
    expect(button.className).toContain('disabled:pointer-events-none');
    expect(button.className).toContain(BASE_BUTTON_VARIANTS.destructive);
    expect(button.className).toContain(BASE_BUTTON_SIZES.sm);
  });

  it('supports asChild slot rendering', () => {
    render(
      <BaseButton asChild variant="link" size="default">
        <a href="/docs">Open docs</a>
      </BaseButton>,
    );

    const link = screen.getByRole('link', { name: 'Open docs' });
    expect(link.className).toContain(BASE_BUTTON_VARIANTS.link);
  });
});
