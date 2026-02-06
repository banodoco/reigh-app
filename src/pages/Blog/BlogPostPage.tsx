import { useParams, Link } from 'react-router-dom';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getPostBySlug } from './blogPosts';
import type { Components } from 'react-markdown';

const components: Components = {
  h1: ({ children }) => (
    <h1 className="text-3xl font-bold tracking-tight mt-10 mb-4">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-2xl font-semibold mt-8 mb-3">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-xl font-semibold mt-6 mb-2">{children}</h3>
  ),
  p: ({ children }) => (
    <p className="my-4 leading-7">{children}</p>
  ),
  a: ({ href, children }) => (
    <a href={href} className="text-blue-500 hover:underline" target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  ul: ({ children }) => (
    <ul className="my-4 ml-6 list-disc space-y-1">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-4 ml-6 list-decimal space-y-1">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="leading-7">{children}</li>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-4 border-l-4 border-border pl-4 text-muted-foreground italic">
      {children}
    </blockquote>
  ),
  code: ({ className, children }) => {
    // Inline code vs code block: react-markdown wraps fenced blocks in <pre><code>
    // className is set for fenced blocks (e.g., "language-css")
    const isBlock = className || (typeof children === 'string' && children.includes('\n'));
    if (isBlock) {
      return (
        <code className="block text-sm">{children}</code>
      );
    }
    return (
      <code className="rounded bg-muted px-1.5 py-0.5 text-sm font-mono">{children}</code>
    );
  },
  pre: ({ children }) => (
    <pre className="my-4 overflow-x-auto rounded-lg bg-muted p-4 text-sm">{children}</pre>
  ),
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-border px-3 py-2 text-left font-semibold bg-muted">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border border-border px-3 py-2">{children}</td>
  ),
  hr: () => <hr className="my-8 border-border" />,
  img: ({ src, alt }) => (
    <img src={src} alt={alt ?? ''} className="my-4 max-w-full rounded-lg" />
  ),
};

export default function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const post = slug ? getPostBySlug(slug) : undefined;

  if (!post) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-2xl px-6 py-16">
          <Link to="/blog" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            &larr; All posts
          </Link>
          <h1 className="mt-6 text-2xl font-bold">Post not found</h1>
          <p className="mt-2 text-muted-foreground">
            The post you're looking for doesn't exist.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <Link to="/blog" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          &larr; All posts
        </Link>
        <header className="mt-6 mb-8">
          <p className="text-sm text-muted-foreground">
            {post.date && <time>{post.date}</time>}
            {post.date && post.author && ' · '}
            {post.author}
          </p>
        </header>
        <article>
          <Markdown remarkPlugins={[remarkGfm]} components={components}>
            {post.content}
          </Markdown>
        </article>
      </div>
    </div>
  );
}
