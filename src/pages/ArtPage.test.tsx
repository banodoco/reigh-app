import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ArtPage from './ArtPage';
import { artPieces } from './art/artPieces';

describe('ArtPage', () => {
  it('renders gallery and scrolls to top on mount', () => {
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);

    render(<ArtPage />);

    expect(scrollToSpy).toHaveBeenCalledWith(0, 0);
    expect(screen.getByText('Community Art Gallery')).toBeInTheDocument();
    expect(screen.getAllByText('Click to play')).toHaveLength(artPieces.length);
  });
});
