import { Component, createRef, type MutableRefObject, type ReactNode } from 'react';

export const CALLOUT_MOVE_MS = 720;
export interface CalloutMove {
  started: number;
  boxes: DOMRect[];
  curves: number[][];
}
interface Props {
  audience: string;
  reducedMotion: boolean;
  active: boolean;
  move: MutableRefObject<CalloutMove | null>;
  children: ReactNode;
}
interface Snapshot { boxes: DOMRect[]; curves: number[][]; content: HTMLElement[][] }

/** Capture before React changes audience attributes/layout; a layout-effect cleanup is too late.
 * Persistent slots let interrupted switches start from the actual currently painted geometry. */
export class PublicAstridCalloutLayout extends Component<Props> {
  private root = createRef<HTMLDivElement>();
  private animations: Animation[] = [];

  getSnapshotBeforeUpdate(previous: Props): Snapshot | null {
    if (previous.audience === this.props.audience || !this.props.active || this.props.reducedMotion) return null;
    const root = this.root.current!;
    const origin = root.getBoundingClientRect();
    const cards = [...root.querySelectorAll<HTMLElement>('article')];
    return {
      boxes: cards.map(card => card.getBoundingClientRect()),
      curves: [...root.querySelectorAll('path')].map(path =>
        (path.getAttribute('d')?.match(/-?\d+(?:\.\d+)?/g) ?? []).map((value, index) => Number(value) + (index % 2 ? origin.top : origin.left))),
      // Preserve the currently painted text blend too, including an interrupted crossfade.
      content: cards.map(card => [...card.querySelectorAll<HTMLElement>(':scope > .astrid-callout-content, :scope > .astrid-callout-outgoing')].map(layer => {
        const clone = layer.cloneNode(true) as HTMLElement;
        const style = getComputedStyle(layer);
        Object.assign(clone.style, { opacity: style.opacity, translate: style.translate, width: style.width, position: 'absolute', inset: '0 auto auto 0' });
        return clone;
      })),
    };
  }

  private stop = () => {
    this.animations.forEach(animation => animation.cancel());
    this.animations = [];
    this.props.move.current = null;
    this.root.current?.querySelectorAll('[data-layout-moving]').forEach(card => card.removeAttribute('data-layout-moving'));
    this.root.current?.querySelectorAll('.astrid-callout-outgoing').forEach(layer => layer.remove());
    this.root.current?.querySelectorAll<HTMLElement>('article > .astrid-callout-content').forEach(layer => layer.style.removeProperty('width'));
  };

  componentDidUpdate(previous: Props, _state: unknown, snapshot: Snapshot | null) {
    if (!this.props.active || this.props.reducedMotion) { this.stop(); return; }
    if (previous.audience === this.props.audience || !snapshot) return;
    this.stop();
    const root = this.root.current!;
    const cards = [...root.querySelectorAll<HTMLElement>('article')];
    if (!cards.every(card => typeof card.animate === 'function')) return;
    const origin = root.getBoundingClientRect();
    const destinations = cards.map(card => card.getBoundingClientRect());
    this.props.move.current = { started: performance.now(), boxes: snapshot.boxes, curves: snapshot.curves };
    // A mobile audience change can shift the stage origin. Rebase the captured SVG before paint;
    // waiting for the measurement RAF leaves one frame with detached endpoints.
    root.querySelectorAll('path').forEach((path, index) => {
      const curve = snapshot.curves[index].map((value, coordinate) => value - (coordinate % 2 ? origin.top : origin.left));
      if (curve.length !== 8) return;
      path.setAttribute('d', `M${curve[0]} ${curve[1]} C${curve.slice(2).join(' ')}`);
      path.setAttribute('data-connector-target', 'transition');
      const dots = path.parentElement!.querySelectorAll('circle[data-callout]');
      dots.forEach((dot, i) => {
        dot.setAttribute('cx', String(curve[i ? 6 : 0]));
        dot.setAttribute('cy', String(curve[i ? 7 : 1]));
      });
    });
    this.animations = cards.flatMap((card, index) => {
      const from = snapshot.boxes[index];
      const to = destinations[index];
      const content = card.querySelector<HTMLElement>(':scope > .astrid-callout-content')!;
      const padding = getComputedStyle(card);
      content.style.width = `${content.getBoundingClientRect().width}px`;
      const outgoing = document.createElement('div');
      outgoing.className = 'astrid-callout-outgoing';
      outgoing.setAttribute('aria-hidden', 'true');
      outgoing.setAttribute('inert', '');
      Object.assign(outgoing.style, { position: 'absolute', top: padding.paddingTop, left: padding.paddingLeft, pointerEvents: 'none' });
      outgoing.append(...snapshot.content[index]);
      card.append(outgoing);
      const frame = (box: DOMRect) => ({
        left: `${box.left - origin.left}px`, top: `${box.top - origin.top}px`,
        width: `${box.width}px`, height: `${box.height}px`, right: 'auto', bottom: 'auto',
      });
      card.dataset.layoutMoving = 'true';
      const animation = card.animate([frame(from), frame(to)], {
        duration: CALLOUT_MOVE_MS, easing: 'cubic-bezier(.4, 0, .2, 1)',
      });
      animation.onfinish = () => {
        card.removeAttribute('data-layout-moving');
        content.style.removeProperty('width');
        outgoing.remove();
      };
      const fadeIn = content.animate([{opacity: 0, translate: '0 4px'}, {opacity: 1, translate: '0 0'}], {duration: CALLOUT_MOVE_MS, easing: 'linear'});
      const fadeOut = outgoing.animate([{opacity: 1, translate: '0 0'}, {opacity: 0, translate: '0 -4px'}], {duration: CALLOUT_MOVE_MS, easing: 'linear', fill: 'forwards'});
      return [animation, fadeIn, fadeOut];
    });
  }

  componentWillUnmount() { this.stop(); }

  render() {
    return <div ref={this.root} className="astrid-callouts" data-audience={this.props.audience}
      aria-label={this.props.audience === 'agent' ? 'Example agent capabilities' : 'How the editor fits together'}>
      {this.props.children}
    </div>;
  }
}
