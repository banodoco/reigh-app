import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SocialIcons } from './SocialIcons';

describe('SocialIcons', () => {
  it('renders GitHub and Discord external links', () => {
    render(<SocialIcons />);

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', 'http://github.com/peteromallet/reigh');
    expect(links[1]).toHaveAttribute('href', 'https://discord.gg/D5K2c6kfhy');
    expect(links[0]).toHaveAttribute('target', '_blank');
    expect(links[1]).toHaveAttribute('target', '_blank');
  });
});
