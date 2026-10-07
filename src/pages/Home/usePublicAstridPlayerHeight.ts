import { useEffect, type RefObject } from 'react';

/** Keep in step with the App player width in PublicAstridShell.css. */
const PLAYER_WIDTH = 0.7;

export function readPublicAstridPlayerHeight(stage: HTMLElement, phone: boolean): string {
  const surfaces = stage.querySelector<HTMLElement>('.astrid-editor-surfaces');
  return surfaces && !phone ? `${surfaces.clientWidth * PLAYER_WIDTH * 9 / 16}px` : '';
}

/** Concrete stage measurement: bursts share one read → compute → write, with no idle polling. */
export function usePublicAstridPlayerHeight(stageRef: RefObject<HTMLDivElement>, active: boolean) {
  useEffect(() => {
    const stage = stageRef.current;
    if (!active || !stage) return undefined;
    let alive = true;
    let frame = 0;
    let surfaces: HTMLElement | null = null;
    const phone = window.matchMedia('(max-width: 640px)');
    const schedule = () => {
      if (alive && !frame) frame = window.requestAnimationFrame(measure);
    };
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    function measure() {
      if (!alive) return;
      frame = 0;
      const nextSurfaces = stage!.querySelector<HTMLElement>('.astrid-editor-surfaces');
      if (nextSurfaces !== surfaces) {
        resizeObserver?.disconnect();
        surfaces = nextSurfaces;
        if (surfaces) resizeObserver?.observe(surfaces);
      }
      const height = readPublicAstridPlayerHeight(stage!, phone.matches);
      if (stage!.style.getPropertyValue('--astrid-player-height') === height) return;
      if (height) stage!.style.setProperty('--astrid-player-height', height);
      else stage!.style.removeProperty('--astrid-player-height');
    }
    const mutationObserver = new MutationObserver(schedule);
    mutationObserver.observe(stage, { childList: true, subtree: true });
    window.addEventListener('resize', schedule);
    phone.addEventListener('change', schedule);
    schedule();
    return () => {
      alive = false;
      window.cancelAnimationFrame(frame);
      mutationObserver.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener('resize', schedule);
      phone.removeEventListener('change', schedule);
    };
  }, [active, stageRef]);
}
