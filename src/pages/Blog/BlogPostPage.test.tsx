import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BlogPostPage from './BlogPostPage';

const { getPostBySlugMock, slugState } = vi.hoisted(() => ({
  getPostBySlugMock: vi.fn(),
  slugState: { slug: 'post-1' as string | undefined },
}));

vi.mock('react-router-dom', () => ({
  useParams: () => ({ slug: slugState.slug }),
  Link: ({ to, children, className }: { to: string; children: React.ReactNode; className?: string }) => (
    <a href={to} className={className}>{children}</a>
  ),
}));

vi.mock('./blogPosts', () => ({
  getPostBySlug: getPostBySlugMock,
}));

vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => <div data-testid="markdown">{children}</div>,
}));

vi.mock('remark-gfm', () => ({
  default: () => null,
}));

describe('BlogPostPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    slugState.slug = 'post-1';
  });

  it('renders not-found state when post is missing', () => {
    getPostBySlugMock.mockReturnValue(undefined);

    render(<BlogPostPage />);

    expect(screen.getByText('Post not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /All posts/i })).toHaveAttribute('href', '/blog');
  });

  it('renders markdown content for a found post', () => {
    getPostBySlugMock.mockReturnValue({
      slug: 'post-1',
      date: '2026-02-18',
      author: 'Reigh Team',
      content: '# Markdown Title',
    });

    render(<BlogPostPage />);

    expect(screen.getByTestId('markdown')).toHaveTextContent('# Markdown Title');
    expect(screen.getByText('2026-02-18')).toBeInTheDocument();
  });
});
