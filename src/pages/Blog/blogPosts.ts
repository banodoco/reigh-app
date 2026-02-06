// Load all .md files from docs/blog/ at build time
const modules = import.meta.glob('/docs/blog/*.md', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

export interface BlogPost {
  title: string;
  slug: string;
  date: string;
  description: string;
  author: string;
  content: string;
}

function parseFrontmatter(raw: string): { meta: Record<string, string>; content: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { meta: {}, content: raw };

  const meta: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    meta[key] = value;
  }
  return { meta, content: match[2] };
}

export const blogPosts: BlogPost[] = Object.values(modules)
  .map((raw) => {
    const { meta, content } = parseFrontmatter(raw);
    if (!meta.title || !meta.slug) return null;
    return {
      title: meta.title,
      slug: meta.slug,
      date: meta.date ?? '',
      description: meta.description ?? '',
      author: meta.author ?? '',
      content,
    };
  })
  .filter((p): p is BlogPost => p !== null)
  .sort((a, b) => b.date.localeCompare(a.date));

export function getPostBySlug(slug: string): BlogPost | undefined {
  return blogPosts.find((p) => p.slug === slug);
}
