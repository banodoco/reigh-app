import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowUpRight, ChevronDown } from 'lucide-react';
import { PublicAstridSocialLinks } from './PublicAstridSocialLinks.tsx';
import { applyPageDusk, DEFAULT_PUBLIC_ASTRID_SKY_SETTINGS, PublicAstridSky, PublicAstridSkyReview, setRootPaper, wantsPublicAstridSkyReview } from './PublicAstridSky.tsx';
import { pageDusk, skyDarknessAt, themeForDarkness } from './publicAstridSkyRender';
import { followInPage, REPOSITORY_URL } from './publicAstridLinks';
import { NORTH_STAR_ART, NorthStarMink, type NorthStarArt } from './PublicAstridNorthStarArt.tsx';
import './PublicAstridVision.css';

interface VisionStatus {
  text: ReactNode;
  /** True when this part of the anchor already holds today; otherwise it is an open issue. */
  holds?: boolean;
  next?: string;
}

interface VisionAnchor {
  title: string;
  vision: string;
  today: readonly VisionStatus[];
}

const HIVEMIND_URL = 'https://github.com/banodoco/hivemind';

/**
 * Each North Star goal, with a mink acting it out. The moving details (the brush and the sun's rays, the
 * sparks, the thought, the block and the paws holding it, the star) are separate sprites layered on the art-pixel grid.
 */
const PRINCIPLES: readonly { title: string; body: string; art: NorthStarArt }[] = [
  {
    title: 'A fully open toolset built for artistic ambition',
    body: 'Everything here serves one goal: helping you realise the most ambitious creative and artistic work you can imagine, with agents and local models.',
    art: NORTH_STAR_ART.art,
  },
  {
    title: 'Making the community’s collective intelligence actionable',
    body: 'To do this, we want to bring the deep technology ecosystem together with the tools that turn it into creative potential, and offer them in as accessible and wide-reaching a form as possible.',
    art: NORTH_STAR_ART.knowledge,
  },
  {
    title: 'A toolset designed to be reshaped as you use it',
    body: 'These tools should be infinitely adaptable, from the interface to the agents to how the work is executed, and you should be able to reshape them as you work, with as little friction as possible.',
    art: NORTH_STAR_ART.adapt,
  },
  {
    title: 'A community that pushes itself artistically',
    body: 'We want to cultivate a group of people who genuinely want to push open models, and themselves, beyond their current limits.',
    art: NORTH_STAR_ART.community,
  },
];

const VISION_ANCHORS: readonly VisionAnchor[] = [
  {
    title: 'Your agent knows what the ecosystem knows',
    vision: 'Your agent draws on the techniques, workflows and hard-won lessons of the people pushing these models furthest, and what you learn flows back to everyone.',
    today: [
      { text: 'Built from Discord messages and scraped material.', next: 'Extending to all public information.' },
      {
        text: (
          <>
            Anyone can add workflows, knowledge and guides via{' '}
            <a href={HIVEMIND_URL} target="_blank" rel="noreferrer">banodoco/hivemind</a>.
          </>
        ),
        holds: true,
        next: 'We want this far deeper.',
      },
    ],
  },
  {
    title: 'The tool is never the bottleneck',
    vision: 'Knowledge turns into results fast, as reusable workflows. The tool gets out of your way: well engineered, instantly responsive, and fixed in minutes, with agents, when something breaks.',
    today: [
      { text: 'Agents still spend too long working out how to apply what they know.' },
      { text: 'The editor isn’t that responsive yet, and fixes don’t land in minutes.' },
    ],
  },
  {
    title: 'Shape the workspace as you create',
    vision: 'Every part of the workspace reshapes itself around your project, and everything is extendable, by you and by your agents.',
    today: [
      { text: 'Only the video editor adapts, and not yet properly.' },
      { text: 'Only parts of it are open to extensions and agents.' },
    ],
  },
  {
    title: 'Anyone can build and share tools',
    vision: 'Fork any tool, build new ones for any purpose and any modality, and share a whole tool as easily as sharing a link. Every tool works for anyone.',
    today: [
      { text: 'You can already fork locally.', holds: true },
      { text: 'One public tool so far, for video only, and no sharing by link yet.' },
    ],
  },
  {
    title: 'Everything can run on your machine',
    vision: 'Every single thing runs locally, as efficiently as your hardware allows, with no intermediary and zero setup: we handle absolutely everything.',
    today: [
      { text: '100% local today.', holds: true },
      { text: 'Local agents can’t yet handle complex video editing.', next: 'Expected within six months.' },
      { text: 'Generic workflows on every machine.', next: 'Adapting them to yours.' },
    ],
  },
  {
    title: 'Open models, not local-only',
    vision: 'When you reach the limits of your machine, your agent can farm intensive work out to the cloud as you work.',
    today: [
      { text: 'Not yet: everything runs on your machine alone.' },
    ],
  },
  {
    title: 'Built in the open',
    vision: 'Astrid is open source, and so is the thinking behind it, this page included.',
    today: [
      { text: 'Every change pushed in public since day one.', holds: true },
    ],
  },
  {
    title: 'A carefully cultivated community',
    vision: 'We want to cultivate a community of people who genuinely care about what they create, and who want to push themselves.',
    today: [
      { text: 'We currently have zero users.' },
    ],
  },
];

/** Where each juggled item sits on the 65 x 100 art-pixel juggler, in art pixels. */
const JUGGLED_ITEMS = [
  { name: 'reel', x: 20, y: 1 },
  { name: 'chip', x: 1, y: 20 },
  { name: 'brush', x: 49, y: 19 },
] as const;

/**
 * The juggling mink, with the three items as separate sprites so they can drift above its paws. The mink
 * is a strip of hand-finished keyframes: it lifts its head and paws, settles, then dips them, and the items
 * rise and sink a beat behind, as if held up by magic.
 */
function Juggler() {
  return (
    <div className="astrid-vision-juggler" aria-hidden="true">
      <span className="astrid-vision-juggler-mink" />
      {JUGGLED_ITEMS.map((item) => (
        <img
          key={item.name}
          className="astrid-vision-juggled"
          data-item={item.name}
          src={`/astrid-juggler-${item.name}.png`}
          alt=""
          style={{ '--x': item.x, '--y': item.y } as CSSProperties}
        />
      ))}
    </div>
  );
}

/** The mink at its workbench; the sparks are a looping sprite sheet anchored to the soldering iron's tip. */
function Tinkerer() {
  return (
    <div className="astrid-vision-tinkerer" aria-hidden="true" data-reveal style={{ '--reveal-delay': '180ms' } as CSSProperties}>
      <img src="/astrid-mink-tinkering.png" alt="" />
      <span className="astrid-vision-sparks" />
    </div>
  );
}

/**
 * The old saying, struck through, and the idea Astrid is built on beneath it. Each part rises in with the
 * page's shared reveal, a beat apart as in the other sections; the strike draws across once the quote
 * is in place.
 */
function ToolsShift() {
  return (
    <figure className="astrid-vision-shift">
      <blockquote className="astrid-vision-shift-old" data-reveal>
        <p><span>“We shape our tools, and thereafter our tools shape&nbsp;us.”</span></p>
      </blockquote>
      {/* The mink comes before the supporting line so, on a phone, that line can wrap around him. */}
      <div className="astrid-vision-shift-grow">
        <p className="astrid-vision-shift-new" data-reveal style={{ '--reveal-delay': '90ms' } as CSSProperties}>Together with our AI, we grow into our tools as we use&nbsp;them.</p>
        <Tinkerer />
        <p className="astrid-vision-shift-support" data-reveal style={{ '--reveal-delay': '180ms' } as CSSProperties}>
          Every part of a tool should be shaped as you work, around the project in front of you.
        </p>
      </div>
    </figure>
  );
}

/** Where the beta is rough today, concretely, and what anyone can do about each. */
const OPEN_ISSUES: readonly { area: string; title: string; body: string; help: string }[] = [
  {
    area: 'Platforms',
    title: 'Tested on very few machines',
    body: 'The agent has mostly been run on Linux, and the app only on macOS.',
    help: 'Run it on Windows or another setup and tell us what breaks.',
  },
  {
    area: 'Models',
    title: 'Only MiniMax is properly tested locally',
    body: 'Other local models may well work, but we haven’t put them through their paces yet.',
    help: 'Point Astrid at the model you use and report how it goes.',
  },
  {
    area: 'Projects',
    title: 'No project taken all the way to the end',
    body: 'Plenty works in principle, but we haven’t yet carried a real project from first idea to finished piece.',
    help: 'Make something real with it, start to finish, and show us where it got in the way.',
  },
  {
    area: 'Packs',
    title: 'Few packs built on the pack system',
    body: 'Packs are designed to be very flexible, but only a handful exist so far to prove it.',
    help: 'Build a pack for a tool or workflow you rely on.',
  },
];

/**
 * A compact tracker: one line per issue, its area and title, opening in place to what it means and how to
 * help. Collapsed by default so the list stays short however many issues it holds.
 */
function OpenIssues() {
  return (
    <section className="astrid-vision-issues" aria-labelledby="astrid-vision-issues-title">
      <div className="astrid-vision-issues-head" data-reveal>
        <div>
          <p className="astrid-vision-eyebrow">Open issues</p>
          <h2 id="astrid-vision-issues-title">What’s rough right now, and how you can help</h2>
        </div>
        <p>The anchor points are where we’re heading; these are the concrete gaps in today’s beta.</p>
      </div>
      <ul className="astrid-vision-issues-list" data-reveal>
        {OPEN_ISSUES.map((issue) => (
          <li key={issue.title}>
            <details>
              <summary>
                <span className="astrid-vision-issues-area">{issue.area}</span>
                <span className="astrid-vision-issues-title">{issue.title}</span>
                <ChevronDown className="astrid-vision-issues-chevron" size={16} strokeWidth={1.8} aria-hidden="true" />
              </summary>
              <div className="astrid-vision-issues-detail">
                <p>{issue.body}</p>
                <p className="astrid-vision-issues-help"><span>How you can help</span> {issue.help}</p>
              </div>
            </details>
          </li>
        ))}
      </ul>
      <p className="astrid-vision-issues-more" data-reveal>
        Hit something that isn’t listed?{' '}
        <a href={`${REPOSITORY_URL}/issues`} target="_blank" rel="noreferrer">
          Open an issue on GitHub
          <ArrowUpRight size={14} strokeWidth={2} aria-hidden="true" />
        </a>
      </p>
    </section>
  );
}

/**
 * Rises each [data-reveal] element into place the first time it scrolls into view, with the same motion
 * as the home page's entrance. Until then the CSS holds it just below its place, transparent.
 */
function useScrollReveal() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const targets = [...(ref.current?.querySelectorAll<HTMLElement>('[data-reveal]') ?? [])];
    const show = (element: Element) => element.setAttribute('data-shown', 'true');
    if (typeof IntersectionObserver !== 'function') { targets.forEach(show); return; }
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        show(entry.target);
        observer.unobserve(entry.target);
      }
    }, { rootMargin: '0px 0px -8% 0px' });
    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, []);
  return ref;
}

/** Keep in step with the phone breakpoint in PublicAstridVision.css. */
const PHONE_MEDIA_QUERY = '(max-width: 640px)';

function useIsPhone() {
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(PHONE_MEDIA_QUERY).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia(PHONE_MEDIA_QUERY);
    const update = () => setPhone(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return phone;
}

/**
 * One anchor point. On a phone the eight rows would be a long scroll, so each folds down to its title and
 * opens on a tap; wider screens show every row in full.
 */
function AnchorPoint({ anchor, index, phone }: { anchor: VisionAnchor; index: number; phone: boolean }) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const holds = anchor.today.every((status) => status.holds);
  const expanded = !phone || open;
  return (
    <li className="astrid-vision-part" data-reveal data-open={expanded || undefined}>
      <span className="astrid-vision-part-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
      <h3>
        {phone ? (
          <button type="button" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((value) => !value)}>
            <span>{anchor.title}</span>
            <ChevronDown aria-hidden="true" size={18} strokeWidth={1.75} />
          </button>
        ) : anchor.title}
      </h3>
      <div className="astrid-vision-part-body" id={bodyId} hidden={!expanded || undefined}>
        <div className="astrid-vision-part-vision">
          <p className="astrid-vision-label">What it means</p>
          <p>{anchor.vision}</p>
        </div>
        <div className="astrid-vision-part-issue" data-holds={holds || undefined}>
          <p className="astrid-vision-label">Where we are</p>
          <ul>
            {anchor.today.map((status, statusIndex) => (
              <li key={statusIndex} data-holds={status.holds || undefined}>
                <p>{status.text}</p>
                {status.next && <p className="astrid-vision-next">{status.next}</p>}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </li>
  );
}

/** The Vision & Issues page: the manifesto, then each part of the vision set against where it stands today. */
/** The page's twilight values as the CSS custom properties its dusk rules read (as on the home page). */
function duskProperties(darkness: number): Record<string, string> {
  const dusk = pageDusk(darkness);
  return {
    '--astrid-paper': dusk.paper,
    '--astrid-dusk': String(dusk.dusk),
    '--astrid-dusk-ink': String(dusk.ink),
    '--astrid-dusk-firm': String(dusk.firm),
  };
}

const ignoreSkyReplayEnd = () => {};
/** The reading text the clouds thin out behind. */
const VISION_QUIET_TEXT = '.astrid-vision-hero-copy, .astrid-vision-section-head, .astrid-vision-parts-head, .astrid-vision-part h3, .astrid-vision-part-vision, .astrid-vision-issues-head, .astrid-vision-issues-list, .astrid-vision-issues-more, .astrid-vision-shift';

export function PublicAstridVision({ onGoHome }: { onGoHome?: () => void } = {}) {
  const pageRef = useScrollReveal();
  // The same sky as the home page, so the two read as one place at any time of day.
  const [initialDusk] = useState(() => duskProperties(skyDarknessAt(new Date())));
  const [reducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  // With ?sky-review, the same sky controls as the home page, to check the sky behind this page's text.
  const [skyReview] = useState(wantsPublicAstridSkyReview);
  const [sky, setSky] = useState(DEFAULT_PUBLIC_ASTRID_SKY_SETTINGS);
  const [skyTheme, setSkyTheme] = useState(() => themeForDarkness(skyDarknessAt(new Date())));
  const lastSkyDarknessRef = useRef<number | null>(null);
  const onSkyDarkness = useCallback((darkness: number) => {
    const previous = lastSkyDarknessRef.current;
    lastSkyDarknessRef.current = darkness;
    setSkyTheme(themeForDarkness(darkness));
    applyPageDusk(pageRef.current, previous, darkness, () => {
      for (const [name, value] of Object.entries(duskProperties(darkness))) pageRef.current?.style.setProperty(name, value);
      setRootPaper(pageDusk(darkness).paper);
    });
  }, [pageRef]);
  const phone = useIsPhone();
  // A tap plays a card's mink once, for touch screens where there is no hover.
  const [playing, setPlaying] = useState<number | null>(null);
  const playTimer = useRef<number>();
  const play = (index: number) => {
    window.clearTimeout(playTimer.current);
    setPlaying(index);
    playTimer.current = window.setTimeout(() => setPlaying(null), 3000);
  };
  useEffect(() => () => window.clearTimeout(playTimer.current), []);
  // On a phone there is no hover, so the card crossing the middle of the screen plays as you scroll past.
  const principlesRef = useRef<HTMLOListElement>(null);
  const [centred, setCentred] = useState<number | null>(null);
  useEffect(() => {
    const list = principlesRef.current;
    if (!phone || !list || typeof IntersectionObserver !== 'function') { setCentred(null); return undefined; }
    const cards = Array.from(list.children);
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const index = cards.indexOf(entry.target);
        if (entry.isIntersecting) setCentred(index);
        else setCentred((current) => (current === index ? null : current));
      }
    }, { rootMargin: '-45% 0px -45% 0px' });
    cards.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [phone]);
  return (
    <main className="astrid-vision" ref={pageRef} data-dusk style={initialDusk as CSSProperties}>
      <PublicAstridSky
        settings={sky}
        onDarkness={onSkyDarkness}
        reducedMotion={reducedMotion}
        replayStartedAt={null}
        onReplayEnd={ignoreSkyReplayEnd}
        quietBehind={VISION_QUIET_TEXT}
      />
      {skyReview && <PublicAstridSkyReview theme={skyTheme} settings={sky} onChange={setSky} />}
      <header className="astrid-vision-bar">
        <a className="astrid-vision-brand" href="/home" aria-label="Astrid home" onClick={(event) => followInPage(event, onGoHome)}>
          <img src="/astrid-mink-provisional.webp" alt="" />
          <span>Astrid</span>
        </a>
      </header>

      <section className="astrid-vision-manifesto" aria-labelledby="astrid-vision-title">
        <div className="astrid-vision-hero">
          <div className="astrid-vision-hero-copy">
            <p className="astrid-vision-eyebrow">Vision &amp; Issues</p>
            <h1 id="astrid-vision-title">
              A local-first <span className="astrid-vision-nowrap">tool + agent</span> to unlock the <span className="astrid-vision-nowrap">open-source</span> community’s <em>artistic</em> potential.
            </h1>
            <p className="astrid-vision-lead">
              We want to help everyone use <em>local models</em> and <em>agents</em> to realise their most ambitious creative ideas, and to push the whole open-source movement forward together.
            </p>
          </div>
          <Juggler />
        </div>

      </section>

      <section className="astrid-vision-north-star" aria-labelledby="astrid-vision-north-star-title">
        <div className="astrid-vision-section-head" data-reveal>
          <p className="astrid-vision-eyebrow">Our North Star</p>
          <h2 id="astrid-vision-north-star-title">What we are building towards</h2>
        </div>
        <ol className="astrid-vision-principles" ref={principlesRef}>
          {PRINCIPLES.map((principle, index) => (
            <li
              key={principle.title}
              data-ns-host
              data-reveal
              data-play={playing === index || centred === index || undefined}
              style={{ '--reveal-delay': `${(index % 2) * 90}ms` } as CSSProperties}
              onClick={() => play(index)}
            >
              <h3>{principle.title}</h3>
              <p>{principle.body}</p>
              <NorthStarMink art={principle.art} />
            </li>
          ))}
        </ol>
      </section>
      <section className="astrid-vision-parts" aria-labelledby="astrid-vision-parts-title">
        <div className="astrid-vision-parts-head" data-reveal>
          <div>
            <p className="astrid-vision-eyebrow">Anchor points</p>
            <h2 id="astrid-vision-parts-title">How we get there, and where we are</h2>
          </div>
          <p>The principles that get us to the North Star, and an honest account of where each one stands right now.</p>
        </div>
        <ol>
          {VISION_ANCHORS.map((anchor, index) => (
            <AnchorPoint key={anchor.title} anchor={anchor} index={index} phone={phone} />
          ))}
        </ol>
      </section>

      <div className="astrid-vision-mobile-juggler" aria-hidden="true" data-reveal>
        <Juggler />
      </div>

      <OpenIssues />

      <ToolsShift />

      <footer className="astrid-vision-footer">
        {/* The page ends on a rule, with the social links centred beneath it. */}
        <div className="astrid-vision-end" />
        <PublicAstridSocialLinks className="astrid-vision-social" />
      </footer>
    </main>
  );
}
