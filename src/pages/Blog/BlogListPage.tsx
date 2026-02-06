import { Link } from 'react-router-dom';
import { blogPosts } from './blogPosts';

export default function BlogListPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          &larr; Home
        </Link>
        <h1 className="mt-6 text-3xl font-bold tracking-tight">Blog</h1>
        <div className="mt-10 space-y-10">
          {blogPosts.map((post) => (
            <article key={post.slug}>
              <Link to={`/blog/${post.slug}`} className="group block">
                <h2 className="text-xl font-semibold group-hover:underline">{post.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {post.date && <time>{post.date}</time>}
                  {post.date && post.author && ' · '}
                  {post.author}
                </p>
                {post.description && (
                  <p className="mt-2 text-muted-foreground">{post.description}</p>
                )}
              </Link>
            </article>
          ))}
          {blogPosts.length === 0 && (
            <p className="text-muted-foreground">No posts yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
