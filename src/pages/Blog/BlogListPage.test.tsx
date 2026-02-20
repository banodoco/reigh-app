import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BlogListPage from './BlogListPage';

const { blogPostsMock } = vi.hoisted(() => ({
  blogPostsMock: [
    {
      slug: 'hello-world',
      title: 'Hello World',
      date: '2026-02-18',
      author: 'Reigh Team',
      description: 'Launch post',
      content: '# Hello',
    },
  ],
}));

vi.mock('react-router-dom', () => ({
  Link: ({ to, children, className }: { to: string; children: React.ReactNode; className?: string }) => (
    <a href={to} className={className}>{children}</a>
  ),
}));

vi.mock('./blogPosts', () => ({
  blogPosts: blogPostsMock,
}));

describe('BlogListPage', () => {
  it('renders post links from blog metadata', () => {
    render(<BlogListPage />);

    expect(screen.getByText('Blog')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Hello World/i })).toHaveAttribute('href', '/blog/hello-world');
    expect(screen.getByText('Launch post')).toBeInTheDocument();
  });
});
