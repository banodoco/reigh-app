import { useEffect, useRef, type CSSProperties, type RefObject } from 'react';
import type { PublicAstridAudience } from './publicAstridMotion';

type CalloutSide = 'left' | 'right' | 'top' | 'bottom';

interface CalloutDefinition {
  id: string;
  title: string;
  body: string;
  /** Selector resolved inside the editor stage. */
  target: string;
  /** Point on the target's on-screen box, as fractions of its width and height. */
  at: readonly [number, number];
  /**
   * Pixels below the target's top edge, replacing `at`'s height fraction on desktop and tablet, for a
   * point that must stay on a fixed-height row however tall the target is drawn.
   */
  atTop?: number;
  /** Card edge the connector leaves from. */
  side: CalloutSide;
  /** Card edge the connector leaves from on phones, where cards hang over the stage's top/bottom edges. */
  phoneSide: CalloutSide;
  /** Card edge and target point on tablets and small laptops, where a card sits somewhere else. */
  tabletSide?: CalloutSide;
  tabletAt?: readonly [number, number];
  /** Target point on phones, when the target's layout differs enough there to need its own. */
  phoneAt?: readonly [number, number];
  /**
   * A more specific target on phones, where the cards sit above and below the conversation and can each
   * point at a different part of it. The connector waits until the conversation is mounted.
   */
  phoneTarget?: string;
  /**
   * On phones, leave the card at this fraction along its edge and swing in to the target from the side,
   * so the connector runs down the conversation's margin instead of across its messages.
   */
  phoneSwing?: number;
}

/** Phone connectors into the conversation stop at its edges when the thread is scrolled. */
const PHONE_CLAMP_SELECTOR = '.astrid-chat-surface';

const AGENT_CALLOUTS: readonly CalloutDefinition[] = [
  {
    id: 'community',
    title: 'The community’s collective intelligence',
    body: 'Shared ideas and examples inform every decision your agent makes.',
    target: '.astrid-chat-surface',
    at: [0, 0.2],
    side: 'right',
    phoneSide: 'top',
    phoneSwing: 0.9,
    // On phones: the person's request, reached along the conversation's right edge.
    phoneTarget: '.astrid-chat-surface .justify-end > .rounded-2xl',
    phoneAt: [1, 0],
  },
  {
    id: 'workflows',
    title: 'Leverages reusable agent workflows',
    body: 'Community-built plans and tools for creative work.',
    target: '.astrid-chat-surface',
    at: [0, 0.68],
    side: 'right',
    phoneSide: 'top',
    // On phones: the finished result.
    phoneTarget: '.astrid-chat-surface .astrid-example-result',
    phoneAt: [0, 0.5],
    phoneSwing: 0.1,
  },
  {
    id: 'tools',
    title: 'Integrated into many open-source tools',
    body: 'And you or others in the community can integrate anything.',
    target: '.astrid-chat-surface',
    at: [1, 0.42],
    side: 'left',
    phoneSide: 'bottom',
    // On phones: Astrid's reply.
    phoneTarget: '.astrid-chat-surface .justify-start > .rounded-2xl',
    phoneAt: [1, 0.5],
    phoneSwing: 0.9,
  },
];

const INTEGRATIONS = [
  { id: 'comfyui', name: 'ComfyUI', href: 'https://github.com/Comfy-Org/ComfyUI' },
  { id: 'wan2gp', name: 'Wan2GP', href: 'https://github.com/deepbeepmeep/Wan2GP' },
  { id: 'hyperframes', name: 'HyperFrames', href: 'https://github.com/heygen-com/hyperframes' },
  { id: 'ai-toolkit', name: 'AI Toolkit', href: 'https://github.com/ostris/ai-toolkit' },
] as const;

function IntegrationLinks() {
  return (
    <ul className="astrid-integration-logos" aria-label="Open-source integrations">
      {INTEGRATIONS.map(({ id, name, href }) => (
        <li key={id}>
          <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`${name} on GitHub`} data-integration={id}>
            <img src={`/integration-logos/${id}.webp`} alt="" decoding="async" width={32} height={32} />
            <span>{name}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

const APP_CALLOUTS: readonly CalloutDefinition[] = [
  {
    id: 'effects',
    title: 'Live vibe code effects and visuals',
    body: 'Describe a look and edit the effect’s code live, right on the clip.',
    // The Effects tab itself, reached from above.
    target: '.astrid-inspector-surface [role="tablist"].grid-cols-4 > [role="tab"]:first-child',
    at: [0.5, 0],
    // The mobile inspector has a full-width tab row beneath the clip name.
    phoneTarget: '.astrid-inspector-surface [role="tablist"].grid-cols-4 > [role="tab"]:first-child',
    phoneAt: [0.5, 0],
    side: 'bottom',
    phoneSide: 'bottom',
  },
  {
    id: 'timeline',
    title: 'Do complex editing work with your agents',
    body: 'Arrange, trim and layer clips by hand or with your agent.',
    // A fixed point on the timeline panel (where the first clip rests), not the clip itself, so the
    // connector holds still when the timeline is scrolled.
    target: '.astrid-timeline-surface',
    // The middle of the first track sits ~57px below the panel's top at every desktop and tablet size.
    at: [0.27, 0.2],
    atTop: 57,
    phoneAt: [0.52, 0.33],
    side: 'top',
    phoneSide: 'top',
  },
  {
    id: 'models',
    title: 'Your agent runs your local models',
    body: 'It figures out how to get local models to do the job and gets it running on your machine.',
    target: '[data-astrid-agent-launcher]',
    at: [0.5, 0],
    // On phones the connector comes up from below, so it ends in the middle of the launcher; on tablets
    // it rises from the label hanging below the timeline to the launcher's lower edge.
    phoneAt: [0.5, 0.5],
    tabletSide: 'top',
    tabletAt: [0.5, 1],
    side: 'bottom',
    phoneSide: 'top',
  },
];

const PARALLAX_EASE = 0.1;
const PARALLAX_TILT_X_DEG = 4;
const PARALLAX_TILT_Y_DEG = 5;
/** Keep in step with the phone and tablet breakpoints in PublicAstridShell.css. */
const PHONE_MEDIA_QUERY = '(max-width: 640px)';
const TABLET_MEDIA_QUERY = '(max-width: 1099px)';

function calloutsFor(audience: PublicAstridAudience) {
  return audience === 'agent' ? AGENT_CALLOUTS : APP_CALLOUTS;
}

interface PublicAstridCalloutsProps {
  stageRef: RefObject<HTMLDivElement>;
  audience: PublicAstridAudience;
  reducedMotion: boolean;
}

const TRACKED_PROPERTIES = ['left', 'top', 'right', 'bottom', 'width', 'height'] as const;

/** Hands an element tracked by the frame loop back to its stylesheet position. */
function releaseTracked(element: HTMLElement | null) {
  if (!element?.dataset.astridTracked) return;
  delete element.dataset.astridTracked;
  for (const property of TRACKED_PROPERTIES) element.style.removeProperty(property);
}

function cardAnchor(card: DOMRect, side: CalloutSide, target: { x: number; y: number }) {
  const inset = 16;
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
  switch (side) {
    case 'left': return { x: card.left, y: clamp(target.y, card.top + inset, card.bottom - inset) };
    case 'right': return { x: card.right, y: clamp(target.y, card.top + inset, card.bottom - inset) };
    case 'top': return { x: clamp(target.x, card.left + inset, card.right - inset), y: card.top };
    case 'bottom': return { x: clamp(target.x, card.left + inset, card.right - inset), y: card.bottom };
  }
}

/**
 * Callouts drawn flat above the tilted editor. Connectors are
 * measured from the projected on-screen boxes every frame so their end dots sit
 * on both the card and the surface they describe, including under parallax.
 */
export function PublicAstridCallouts({ stageRef, audience, reducedMotion }: PublicAstridCalloutsProps) {
  const callouts = calloutsFor(audience);
  const svgRef = useRef<SVGSVGElement>(null);
  const cardRefs = useRef(new Map<string, HTMLElement>());

  // Pointer parallax: the editor turns subtly toward the cursor. The tilt is written straight onto the
  // tilt layer's transform (not as inherited custom properties, which would restyle the whole editor
  // every frame), so it stays a cheap compositor update even mid-transition.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || reducedMotion) return undefined;
    const stageElement: HTMLDivElement = stage;
    const target = { x: 0, y: 0 };
    const current = { x: 0, y: 0 };
    let frame: number | null = null;
    function step() {
      current.x += (target.x - current.x) * PARALLAX_EASE;
      current.y += (target.y - current.y) * PARALLAX_EASE;
      const settled = Math.abs(target.x - current.x) < 0.001 && Math.abs(target.y - current.y) < 0.001;
      if (settled) {
        current.x = target.x;
        current.y = target.y;
      }
      const tilt = stageElement.querySelector<HTMLElement>('.astrid-editor-tilt');
      if (tilt) tilt.style.transform = `rotateX(${(current.y * -PARALLAX_TILT_X_DEG).toFixed(3)}deg) rotateY(${(current.x * PARALLAX_TILT_Y_DEG).toFixed(3)}deg)`;
      frame = settled ? null : window.requestAnimationFrame(step);
    }
    const schedule = () => {
      if (frame === null) frame = window.requestAnimationFrame(step);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      if (window.matchMedia(PHONE_MEDIA_QUERY).matches) return;
      const rect = stageElement.getBoundingClientRect();
      target.x = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width) * 2 - 1));
      target.y = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height) * 2 - 1));
      schedule();
    };
    const onPointerLeave = (event: PointerEvent) => {
      // Switching audience runs a page-wide View Transition whose overlay takes the pointer, firing a
      // leave while the cursor is still over the stage. Easing back to flat then (and swinging back
      // once the overlay is gone) made the switch stutter, so only a real exit flattens the tilt.
      const rect = stageElement.getBoundingClientRect();
      if (event.clientX > rect.left && event.clientX < rect.right && event.clientY > rect.top && event.clientY < rect.bottom) return;
      target.x = 0;
      target.y = 0;
      schedule();
    };
    stageElement.addEventListener('pointermove', onPointerMove);
    stageElement.addEventListener('pointerleave', onPointerLeave);
    return () => {
      stageElement.removeEventListener('pointermove', onPointerMove);
      stageElement.removeEventListener('pointerleave', onPointerLeave);
      if (frame !== null) window.cancelAnimationFrame(frame);
      stageElement.querySelector<HTMLElement>('.astrid-editor-tilt')?.style.removeProperty('transform');
    };
  }, [reducedMotion, stageRef]);

  // Connectors, plus the flat App controls that must follow tilted surfaces: the
  // transport rides the player, and the agent launcher sits on the conversation
  // once it has bundled itself into its corner circle.
  const appView = audience === 'app';
  useEffect(() => {
    const stage = stageRef.current;
    const svg = svgRef.current;
    if (!stage || !svg) return undefined;
    const stageElement: HTMLDivElement = stage;
    const svgElement: SVGSVGElement = svg;
    const trackTransport = appView;
    let frame = 0;
    const phoneQuery = window.matchMedia(PHONE_MEDIA_QUERY);
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(draw);
    };
    function draw() {
      frame = 0;
      // Phone panels settle immediately. Measuring and rewriting their SVG every idle frame forced
      // layout on the entire mounted editor even when nothing moved.
      if (!phoneQuery.matches) frame = window.requestAnimationFrame(draw);
      const stageRect = stageElement.getBoundingClientRect();
      const originX = stageRect.left + stageElement.clientLeft;
      const originY = stageRect.top + stageElement.clientTop;
      // On phones the cards hang over the stage's top and bottom edges, so connectors leave other edges.
      const phone = window.matchMedia(PHONE_MEDIA_QUERY).matches;
      const tablet = !phone && window.matchMedia(TABLET_MEDIA_QUERY).matches;

      const outlet = stageElement.querySelector<HTMLElement>('.astrid-preview-transport-outlet');
      const player = stageElement.querySelector<HTMLElement>('.astrid-player-surface');
      if (trackTransport && outlet && player) {
        const box = player.getBoundingClientRect();
        const pad = 10;
        const height = Math.min(78, box.height * 0.24);
        outlet.dataset.astridTracked = 'true';
        outlet.style.left = `${box.left - originX + pad}px`;
        outlet.style.top = `${box.bottom - originY - pad - height}px`;
        outlet.style.width = `${Math.max(0, box.width - pad * 2)}px`;
        outlet.style.height = `${height}px`;
      }

      const launcher = stageElement.querySelector<HTMLElement>('[data-astrid-agent-launcher]');
      const chat = stageElement.querySelector<HTMLElement>('.astrid-chat-surface');
      const launcherAnchor = phone ? stageElement.querySelector<HTMLElement>('.astrid-timeline-surface') : chat;
      if (appView && launcher && launcherAnchor) {
        // The mobile timeline has a fixed single-row height; use its actual edge rather than the
        // hidden chat's desktop positioning box, which can move independently on resize.
        const box = launcherAnchor.getBoundingClientRect();
        const size = launcher.offsetWidth;
        launcher.dataset.astridTracked = 'true';
        launcher.style.left = `${(phone ? box.right - size - 4 : box.left + box.width / 2 - size / 2) - originX}px`;
        launcher.style.top = `${(phone ? box.bottom - size - 4 : box.top + box.height / 2 - size / 2) - originY}px`;
        launcher.style.right = 'auto';
        launcher.style.bottom = 'auto';
      }

      for (const callout of callouts) {
        const path = svgElement.querySelector<SVGPathElement>(`path[data-callout="${callout.id}"]`);
        const dots = svgElement.querySelectorAll<SVGCircleElement>(`circle[data-callout="${callout.id}"]`);
        const card = cardRefs.current.get(callout.id);
        const target = stageElement.querySelector<HTMLElement>(phone && callout.phoneTarget ? callout.phoneTarget : callout.target);
        if (!path || dots.length !== 2) continue;
        if (!card || !target) {
          path.removeAttribute('d');
          dots.forEach((dot) => dot.setAttribute('r', '0'));
          continue;
        }
        const side = phone ? callout.phoneSide : tablet ? callout.tabletSide ?? callout.side : callout.side;
        const box = target.getBoundingClientRect();
        const [ax, ay] = phone ? callout.phoneAt ?? callout.at : tablet ? callout.tabletAt ?? callout.at : callout.at;
        const end = { x: box.left + box.width * ax, y: box.top + (!phone && callout.atTop !== undefined ? callout.atTop : box.height * ay) };
        const clampBox = phone && callout.phoneTarget ? target.closest(PHONE_CLAMP_SELECTOR)?.getBoundingClientRect() : undefined;
        if (clampBox) end.y = Math.max(clampBox.top + 56, Math.min(clampBox.bottom - 16, end.y));
        const cardBox = card.getBoundingClientRect();
        const swing = phone ? callout.phoneSwing : undefined;
        const start = swing === undefined
          ? cardAnchor(cardBox, side, end)
          : { x: cardBox.left + cardBox.width * swing, y: side === 'top' ? cardBox.top : cardBox.bottom };
        const sx = start.x - originX;
        const sy = start.y - originY;
        const ex = end.x - originX;
        const ey = end.y - originY;
        const horizontal = side === 'left' || side === 'right';
        const reach = horizontal ? Math.abs(ex - sx) * 0.5 : Math.abs(ey - sy) * 0.5;
        const direction = side === 'left' || side === 'top' ? -1 : 1;
        let c1 = horizontal ? `${sx + direction * reach} ${sy}` : `${sx} ${sy + direction * reach}`;
        let c2 = horizontal ? `${ex - direction * reach} ${ey}` : `${ex} ${ey - direction * reach}`;
        if (swing !== undefined) {
          // Down (or up) the margin, then a turn in to the target's side.
          c1 = `${sx} ${sy + direction * Math.abs(ey - sy) * 0.9}`;
          c2 = `${ex + Math.sign(sx - ex) * Math.abs(ex - sx) * 0.9} ${ey}`;
        }
        path.setAttribute('d', `M${sx.toFixed(1)} ${sy.toFixed(1)} C${c1} ${c2} ${ex.toFixed(1)} ${ey.toFixed(1)}`);
        dots[0].setAttribute('cx', sx.toFixed(1));
        dots[0].setAttribute('cy', sy.toFixed(1));
        dots[0].setAttribute('r', '4');
        dots[1].setAttribute('cx', ex.toFixed(1));
        dots[1].setAttribute('cy', ey.toFixed(1));
        dots[1].setAttribute('r', '4');
        const ping = svgElement.querySelector<SVGCircleElement>(`circle[data-callout-ping="${callout.id}"]`);
        ping?.setAttribute('cx', ex.toFixed(1));
        ping?.setAttribute('cy', ey.toFixed(1));
      }
    }
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    const observeGeometry = () => {
      resizeObserver?.observe(stageElement);
      stageElement.querySelectorAll('.astrid-surface, .astrid-callout').forEach((element) => resizeObserver?.observe(element));
      schedule();
    };
    // The lazy editor and conversation arrive after the callouts. Observe structure, never the
    // inline styles / SVG attributes written by draw(), so this cannot restart its own work.
    const mutationObserver = new MutationObserver(observeGeometry);
    mutationObserver.observe(stageElement, { childList: true, subtree: true });
    observeGeometry();
    stageElement.addEventListener('scroll', schedule, true);
    stageElement.addEventListener('animationend', schedule);
    window.addEventListener('resize', schedule);
    phoneQuery.addEventListener('change', schedule);
    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      mutationObserver.disconnect();
      stageElement.removeEventListener('scroll', schedule, true);
      stageElement.removeEventListener('animationend', schedule);
      window.removeEventListener('resize', schedule);
      phoneQuery.removeEventListener('change', schedule);
      releaseTracked(stageElement.querySelector<HTMLElement>('.astrid-preview-transport-outlet'));
      releaseTracked(stageElement.querySelector<HTMLElement>('[data-astrid-agent-launcher]'));
    };
  }, [appView, callouts, stageRef]);

  return (
    <div
      className="astrid-callouts"
      key={audience}
      data-audience={audience}
      aria-label={audience === 'agent' ? 'Example agent capabilities' : 'How the editor fits together'}
    >
      <svg ref={svgRef} className="astrid-callout-connectors" aria-hidden="true">
        {callouts.map((callout, index) => (
          <g key={callout.id} style={{ '--astrid-callout-index': index } as CSSProperties}>
            <path data-callout={callout.id} pathLength={1} />
            <circle className="astrid-callout-ping" data-callout-ping={callout.id} r="0" />
            <circle className="astrid-callout-dot-start" data-callout={callout.id} r="0" />
            <circle className="astrid-callout-dot-end" data-callout={callout.id} r="0" />
          </g>
        ))}
      </svg>
      {callouts.map((callout, index) => (
        <article
          key={callout.id}
          className="astrid-callout"
          data-callout={callout.id}
          style={{ '--astrid-callout-index': index } as CSSProperties}
          ref={(element) => {
            if (element) cardRefs.current.set(callout.id, element);
            else cardRefs.current.delete(callout.id);
          }}
        >
          <h2>{callout.id === 'workflows' ? <><span className="astrid-workflows-title-line">Leverages reusable</span>{' '}<span className="astrid-workflows-title-line">agent workflows</span></> : callout.title}</h2>
          {callout.id === 'tools' && <><p>For example:</p><IntegrationLinks /></>}
          <p>{callout.body}</p>
        </article>
      ))}
    </div>
  );
}
