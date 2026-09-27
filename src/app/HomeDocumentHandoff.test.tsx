import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { buildHomeDocumentHandoffUrl, HomeDocumentHandoff } from './HomeDocumentHandoff.tsx';

describe('HomeDocumentHandoff', () => {
  it('builds a same-origin /home replacement preserving search and hash', () => {
    expect(buildHomeDocumentHandoffUrl(
      { search: '?source=guard', hash: '#return' } as Location,
      'https://astrid.test',
    )).toBe('https://astrid.test/home?source=guard#return');
  });

  it('uses document replacement with controlled navigation', async () => {
    const replaceDocument = vi.fn();
    render(
      <MemoryRouter initialEntries={['/home?source=guard#return']}>
        <HomeDocumentHandoff replaceDocument={replaceDocument} />
      </MemoryRouter>,
    );
    await waitFor(() => expect(replaceDocument).toHaveBeenCalledWith(
      window.location.origin + '/home?source=guard#return',
    ));
  });
});
