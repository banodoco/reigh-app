import fs from "fs";
import path from "path";
import {
  PUBLIC_ASTRID_SHARE_PAGES,
  PUBLIC_ASTRID_SITE_ORIGIN,
  type PublicAstridSharePageName,
} from "../../src/pages/Home/publicAstridShare";

const START = "<!-- share-meta:start -->";
const END = "<!-- share-meta:end -->";
const BLOCK = /<!-- share-meta:start -->[\s\S]*?<!-- share-meta:end -->/;

const escapeAttr = (value: string) => value
  .replace(/&/g, "&amp;")
  .replace(/"/g, "&quot;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;");

/** The title, description, canonical link and Open Graph / X card tags for one public page. */
export function shareMetaTags(page: PublicAstridSharePageName, origin: string): string {
  const meta = PUBLIC_ASTRID_SHARE_PAGES[page];
  const url = new URL(meta.path, origin).href;
  const image = new URL(meta.image, origin).href;
  const property = (name: string, content: string) => `<meta property="${name}" content="${escapeAttr(content)}" />`;
  const name = (key: string, content: string) => `<meta name="${key}" content="${escapeAttr(content)}" />`;
  return [
    START,
    `<title>${escapeAttr(meta.title)}</title>`,
    name("description", meta.description),
    `<link rel="canonical" href="${escapeAttr(url)}" />`,
    property("og:site_name", "Astrid"),
    property("og:type", "website"),
    property("og:locale", "en_US"),
    property("og:url", url),
    property("og:title", meta.shareTitle),
    property("og:description", meta.description),
    property("og:image", image),
    property("og:image:type", "image/png"),
    property("og:image:width", "1200"),
    property("og:image:height", "630"),
    property("og:image:alt", meta.imageAlt),
    name("twitter:card", "summary_large_image"),
    name("twitter:title", meta.shareTitle),
    name("twitter:description", meta.description),
    name("twitter:image", image),
    name("twitter:image:alt", meta.imageAlt),
    END,
  ].join("\n    ");
}

export function withShareMeta(html: string, page: PublicAstridSharePageName, origin: string): string {
  if (!BLOCK.test(html)) throw new Error(`index.html is missing its ${START} … ${END} block`);
  return html.replace(BLOCK, shareMetaTags(page, origin));
}

const pageForUrl = (url: string | undefined): PublicAstridSharePageName =>
  url?.split(/[?#]/)[0] === PUBLIC_ASTRID_SHARE_PAGES.vision.path ? "vision" : "home";

/**
 * Link previews come from the HTML alone, so each public page gets its own: the dev server fills the block
 * for the page asked for, and the build writes vision.html beside index.html (vite preview serves it for
 * /vision; every other path falls back to index.html and the home card).
 */
export const createShareMetaPlugin = (origin = PUBLIC_ASTRID_SITE_ORIGIN) => ({
  name: "astrid-share-meta",
  transformIndexHtml(html: string, ctx?: { originalUrl?: string; server?: unknown }) {
    // Other HTML entries (the process harness) carry no card.
    if (!BLOCK.test(html)) return html;
    return withShareMeta(html, ctx?.server ? pageForUrl(ctx.originalUrl) : "home", origin);
  },
  writeBundle(options: { dir?: string }) {
    if (!options.dir) return;
    const index = path.join(options.dir, "index.html");
    if (!fs.existsSync(index)) return;
    const vision = withShareMeta(fs.readFileSync(index, "utf8"), "vision", origin);
    fs.writeFileSync(path.join(options.dir, "vision.html"), vision);
  },
});
