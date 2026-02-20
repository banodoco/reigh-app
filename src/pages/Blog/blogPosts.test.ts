import { describe, expect, it } from 'vitest';
import { blogPosts, getPostBySlug } from './blogPosts';

describe('blogPosts data', () => {
  it('exports a sorted list of posts', () => {
    expect(Array.isArray(blogPosts)).toBe(true);

    if (blogPosts.length >= 2) {
      expect(blogPosts[0].date >= blogPosts[1].date).toBe(true);
    }
  });

  it('resolves posts by slug and returns undefined for unknown slugs', () => {
    const first = blogPosts[0];
    if (first) {
      expect(getPostBySlug(first.slug)).toEqual(first);
    }
    expect(getPostBySlug('not-a-real-post')).toBeUndefined();
  });
});
