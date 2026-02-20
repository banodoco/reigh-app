import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  Select,
  SelectTrigger,
  SelectValue,
  selectContentVariants,
  selectItemVariants,
  selectTriggerVariants,
} from './select';

describe('Select', () => {
  it('renders trigger and placeholder text', () => {
    render(
      <Select defaultValue="">
        <SelectTrigger data-testid="trigger">
          <SelectValue placeholder="Choose option" />
        </SelectTrigger>
      </Select>,
    );

    const trigger = screen.getByTestId('trigger');
    expect(trigger.tagName.toLowerCase()).toBe('button');
    expect(trigger).toHaveAttribute('data-placeholder');
  });

  it('exposes stable variant class builders', () => {
    expect(selectTriggerVariants({ variant: 'retro-dark' })).toContain('border-2');
    expect(selectContentVariants({ variant: 'zinc' })).toContain('bg-zinc-800');
    expect(selectItemVariants({ variant: 'default' })).toContain('data-[highlighted]:bg-accent');
  });
});
