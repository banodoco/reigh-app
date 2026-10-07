import { useEffect, useRef, type CSSProperties, type RefObject } from 'react';
import type { PublicAstridAudience } from './publicAstridMotion';
import { readPublicAstridPlayerHeight } from './usePublicAstridPlayerHeight';

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
    phoneAt: [1, 0.5],
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
    // The public preview contains hidden Outline/Inspector tablists before the
    // visible inspector tabs. Geometry resolution below skips zero-sized tabs.
    target: '.astrid-inspector-surface [role="tablist"].grid-cols-4 > [role="tab"]',
    at: [0.5, 0],
    // The mobile inspector has a full-width tab row beneath the clip name.
    phoneTarget: '.astrid-inspector-surface [role="tablist"].grid-cols-4 > [role="tab"]',
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
  active?: boolean;
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

function resolveVisibleTarget(stage: HTMLElement, selector: string) {
  for (const element of stage.querySelectorAll<HTMLElement>(selector)) {
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return { element, rect };
  }
  return null;
}

/**
 * Callouts drawn flat above the tilted editor. Connectors are
 * measured from the projected on-screen boxes every frame so their end dots sit
 * on both the card and the surface they describe, including under parallax.
 */
export function PublicAstridCallouts({ stageRef, audience, reducedMotion, active = true }: PublicAstridCalloutsProps) {
  const callouts = calloutsFor(audience);
  const svgRef = useRef<SVGSVGElement>(null);
  const cardRefs = useRef(new Map<string, HTMLElement>());

  // Connectors, plus the flat App controls that must follow tilted surfaces: the
  // transport rides the player, and the agent launcher sits on the conversation
  // once it has bundled itself into its corner circle.
  const appView = audience === 'app';
  useEffect(() => {
    const stage = stageRef.current;
    const svg = svgRef.current;
    if (!active || !stage || !svg) return undefined;
    const stageElement: HTMLDivElement = stage;
    const svgElement: SVGSVGElement = svg;
    const trackTransport = appView;
    let frame = 0;
    let alive = true;
    let pointer: { x: number; y: number; leaving: boolean } | null = null;
    const targetTilt = { x: 0, y: 0 };
    const currentTilt = { x: 0, y: 0 };
    const phoneQuery = window.matchMedia(PHONE_MEDIA_QUERY);
    const tabletQuery = window.matchMedia(TABLET_MEDIA_QUERY);
    const schedule = () => {
      if (alive && !frame) frame = window.requestAnimationFrame(draw);
    };
    function draw() {
      if (!alive) return;
      frame = 0;
      // Read every projected box before touching styles/SVG. Writes cannot force a later read in this
      // pass. One final pass after a tilt write measures the projection at its settled transform.
      const writes: Array<() => void> = [];
      let trackedChanged = false;
      const setStyle = (element: HTMLElement, name: string, value: string) => {
        if (element.style.getPropertyValue(name) === value) return;
        trackedChanged = true;
        writes.push(() => element.style.setProperty(name, value));
      };
      const setAttribute = (element: Element, name: string, value: string) => writes.push(() => {
        if (element.getAttribute(name) !== value) element.setAttribute(name, value);
      });
      const stageRect = stageElement.getBoundingClientRect();
      const originX = stageRect.left + stageElement.clientLeft;
      const originY = stageRect.top + stageElement.clientTop;
      // On phones the cards hang over the stage's top and bottom edges, so connectors leave other edges.
      const phone = phoneQuery.matches;
      const tablet = !phone && tabletQuery.matches;
      setStyle(stageElement, '--astrid-player-height', readPublicAstridPlayerHeight(stageElement, phone));
      const tilt = stageElement.querySelector<HTMLElement>('.astrid-editor-tilt');
      if (pointer) {
        if (pointer.leaving) {
          // A View Transition overlay can take the pointer while it is still over the stage.
          if (!(pointer.x > stageRect.left && pointer.x < stageRect.right && pointer.y > stageRect.top && pointer.y < stageRect.bottom)) {
            targetTilt.x = 0;
            targetTilt.y = 0;
          }
        } else if (stageRect.width && stageRect.height) {
          targetTilt.x = Math.max(-1, Math.min(1, ((pointer.x - stageRect.left) / stageRect.width) * 2 - 1));
          targetTilt.y = Math.max(-1, Math.min(1, ((pointer.y - stageRect.top) / stageRect.height) * 2 - 1));
        }
        pointer = null;
      }
      if (phone || reducedMotion) { targetTilt.x = 0; targetTilt.y = 0; }
      currentTilt.x += (targetTilt.x - currentTilt.x) * PARALLAX_EASE;
      currentTilt.y += (targetTilt.y - currentTilt.y) * PARALLAX_EASE;
      const settled = Math.abs(targetTilt.x - currentTilt.x) < 0.001 && Math.abs(targetTilt.y - currentTilt.y) < 0.001;
      if (settled) { currentTilt.x = targetTilt.x; currentTilt.y = targetTilt.y; }
      const transform = reducedMotion || phone ? '' : `rotateX(${(currentTilt.y * -PARALLAX_TILT_X_DEG).toFixed(3)}deg) rotateY(${(currentTilt.x * PARALLAX_TILT_Y_DEG).toFixed(3)}deg)`;
      const tiltChanged = !!tilt && tilt.style.transform !== transform;
      if (tiltChanged) setStyle(tilt!, 'transform', transform);

      const outlet = stageElement.querySelector<HTMLElement>('.astrid-preview-transport-outlet');
      const player = stageElement.querySelector<HTMLElement>('.astrid-player-surface');
      if (trackTransport && outlet && player) {
        const box = player.getBoundingClientRect();
        const pad = 10;
        const height = Math.min(78, box.height * 0.24);
        setAttribute(outlet, 'data-astrid-tracked', 'true');
        setStyle(outlet, 'left', `${box.left - originX + pad}px`);
        setStyle(outlet, 'top', `${box.bottom - originY - pad - height}px`);
        setStyle(outlet, 'width', `${Math.max(0, box.width - pad * 2)}px`);
        setStyle(outlet, 'height', `${height}px`);
      }

      const launcher = stageElement.querySelector<HTMLElement>('[data-astrid-agent-launcher]');
      const chat = stageElement.querySelector<HTMLElement>('.astrid-chat-surface');
      const launcherAnchor = phone ? stageElement.querySelector<HTMLElement>('.astrid-timeline-surface') : chat;
      if (appView && launcher && launcherAnchor) {
        // The mobile timeline has a fixed single-row height; use its actual edge rather than the
        // hidden chat's desktop positioning box, which can move independently on resize.
        const box = launcherAnchor.getBoundingClientRect();
        const size = launcher.offsetWidth;
        const left = phone ? box.right - size - 4 : box.left + box.width / 2 - size / 2;
        const top = phone ? box.bottom - size - 4 : box.top + box.height / 2 - size / 2;
        setAttribute(launcher, 'data-astrid-tracked', 'true');
        setStyle(launcher, 'left', `${left - originX}px`);
        setStyle(launcher, 'top', `${top - originY}px`);
        setStyle(launcher, 'right', 'auto');
        setStyle(launcher, 'bottom', 'auto');
      }

      for (const callout of callouts) {
        const path = svgElement.querySelector<SVGPathElement>(`path[data-callout="${callout.id}"]`);
        const dots = svgElement.querySelectorAll<SVGCircleElement>(`circle[data-callout="${callout.id}"]`);
        const card = cardRefs.current.get(callout.id);
        const resolvedTarget = resolveVisibleTarget(
          stageElement,
          phone && callout.phoneTarget ? callout.phoneTarget : callout.target,
        );
        const target = resolvedTarget?.element;
        if (!path || dots.length !== 2) continue;
        if (!card || !target) {
          writes.push(() => path.removeAttribute('d'));
          dots.forEach((dot) => setAttribute(dot, 'r', '0'));
          continue;
        }
        const side = phone ? callout.phoneSide : tablet ? callout.tabletSide ?? callout.side : callout.side;
        const box = resolvedTarget.rect;
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
        setAttribute(path, 'd', `M${sx.toFixed(1)} ${sy.toFixed(1)} C${c1} ${c2} ${ex.toFixed(1)} ${ey.toFixed(1)}`);
        setAttribute(dots[0], 'cx', sx.toFixed(1));
        setAttribute(dots[0], 'cy', sy.toFixed(1));
        setAttribute(dots[0], 'r', '4');
        setAttribute(dots[1], 'cx', ex.toFixed(1));
        setAttribute(dots[1], 'cy', ey.toFixed(1));
        setAttribute(dots[1], 'r', '4');
        const ping = svgElement.querySelector<SVGCircleElement>(`circle[data-callout-ping="${callout.id}"]`);
        if (ping) { setAttribute(ping, 'cx', ex.toFixed(1)); setAttribute(ping, 'cy', ey.toFixed(1)); }
      }
      // Follow only finite geometry animations, including their delays. Decorative infinite pulses
      // and opacity-only animations cannot keep the measurement loop alive.
      const moving = !reducedMotion && (stageElement.getAnimations?.({ subtree: true }) ?? []).some((animation) => {
        if (animation.playState !== 'running' && !animation.pending) return false;
        const effect = animation.effect;
        return typeof KeyframeEffect !== 'undefined' && effect instanceof KeyframeEffect && effect.target instanceof HTMLElement
          && effect.getTiming().iterations !== Infinity
          && effect.getKeyframes().some((keyframe) => ['transform', 'translate', 'scale', 'rotate', ...TRACKED_PROPERTIES].some((property) => keyframe[property] !== undefined));
      });
      writes.forEach((write) => write());
      if (trackedChanged || !settled || moving) schedule();
    }
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    const observeGeometry = () => {
      if (!alive) return;
      resizeObserver?.disconnect();
      resizeObserver?.observe(stageElement);
      stageElement.querySelectorAll('.astrid-editor-surfaces, .astrid-surface, .astrid-callout').forEach((element) => resizeObserver?.observe(element));
      schedule();
    };
    // The lazy editor and conversation arrive after the callouts. Observe structure, never the
    // inline styles / SVG attributes written by draw(), so this cannot restart its own work.
    const mutationObserver = new MutationObserver(observeGeometry);
    mutationObserver.observe(stageElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-revealed', 'data-audience'] });
    observeGeometry();
    const onPointerMove = (event: PointerEvent) => {
      if (reducedMotion || phoneQuery.matches || event.pointerType !== 'mouse') return;
      pointer = { x: event.clientX, y: event.clientY, leaving: false };
      schedule();
    };
    const onPointerLeave = (event: PointerEvent) => {
      if (reducedMotion || phoneQuery.matches) return;
      pointer = { x: event.clientX, y: event.clientY, leaving: true };
      schedule();
    };
    stageElement.addEventListener('pointermove', onPointerMove);
    stageElement.addEventListener('pointerleave', onPointerLeave);
    stageElement.addEventListener('scroll', schedule, true);
    window.addEventListener('scroll', schedule, { passive: true });
    stageElement.addEventListener('animationstart', schedule);
    stageElement.addEventListener('animationend', schedule);
    stageElement.addEventListener('animationcancel', schedule);
    stageElement.addEventListener('transitionrun', schedule);
    stageElement.addEventListener('transitionend', schedule);
    stageElement.addEventListener('transitioncancel', schedule);
    window.addEventListener('resize', schedule);
    phoneQuery.addEventListener('change', schedule);
    tabletQuery.addEventListener('change', schedule);
    return () => {
      alive = false;
      window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      mutationObserver.disconnect();
      stageElement.removeEventListener('pointermove', onPointerMove);
      stageElement.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('scroll', schedule);
      stageElement.removeEventListener('scroll', schedule, true);
      stageElement.removeEventListener('animationstart', schedule);
      stageElement.removeEventListener('animationend', schedule);
      stageElement.removeEventListener('animationcancel', schedule);
      stageElement.removeEventListener('transitionrun', schedule);
      stageElement.removeEventListener('transitionend', schedule);
      stageElement.removeEventListener('transitioncancel', schedule);
      window.removeEventListener('resize', schedule);
      phoneQuery.removeEventListener('change', schedule);
      tabletQuery.removeEventListener('change', schedule);
      stageElement.querySelector<HTMLElement>('.astrid-editor-tilt')?.style.removeProperty('transform');
      releaseTracked(stageElement.querySelector<HTMLElement>('.astrid-preview-transport-outlet'));
      releaseTracked(stageElement.querySelector<HTMLElement>('[data-astrid-agent-launcher]'));
    };
  }, [active, appView, callouts, reducedMotion, stageRef]);

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
