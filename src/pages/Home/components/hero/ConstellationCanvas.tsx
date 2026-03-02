import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

interface Star {
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  size: number;
  opacity: number;
  twinkleSpeed: number;
  twinklePhase: number;
  vx: number;
  vy: number;
}

interface WanderingGroup {
  cx: number;
  cy: number;
  vx: number;
  vy: number;
  targetVx: number;
  targetVy: number;
  speed: number;
  particles: { offsetX: number; offsetY: number; size: number; phase: number }[];
  opacity: number;
  targetOpacity: number;
  fadeSpeed: number;
  nextDirectionChange: number;
  nextFadeChange: number;
}

const STAR_AREA_PER_STAR = 8000;
const WANDERING_FADE_DELAY_MS = 5000;
const WANDERING_FADE_DURATION_MS = 3000;
const DIRECTION_CHANGE_MIN_MS = 5000;
const DIRECTION_CHANGE_RANGE_MS = 10000;
const FADE_CHANGE_MIN_MS = 8000;
const FADE_CHANGE_RANGE_MS = 12000;

function wrapPosition(position: number, max: number, padding: number): number {
  if (position < -padding) {
    return max + padding;
  }

  if (position > max + padding) {
    return -padding;
  }

  return position;
}

function createRegularStar(width: number, height: number): Star {
  const x = Math.random() * width;
  const y = Math.random() * height;

  return {
    x,
    y,
    baseX: x,
    baseY: y,
    size: Math.random() * 1.5 + 0.5,
    opacity: Math.random() * 0.5 + 0.3,
    twinkleSpeed: Math.random() * 0.003 + 0.001,
    twinklePhase: Math.random() * Math.PI * 2,
    vx: (Math.random() - 0.5) * 0.05,
    vy: (Math.random() - 0.5) * 0.05,
  };
}

function createClaudeStar(width: number, height: number): Star {
  const claudeX = width * 0.75 + (Math.random() - 0.5) * 100;
  const claudeY = height * 0.25 + (Math.random() - 0.5) * 100;

  return {
    x: claudeX,
    y: claudeY,
    baseX: claudeX,
    baseY: claudeY,
    size: 2.5,
    opacity: 0.9,
    twinkleSpeed: 0.0008,
    twinklePhase: 0,
    vx: 0.01,
    vy: 0.01,
  };
}

function createWanderingGroups(width: number, height: number, now: number): WanderingGroup[] {
  const groups: WanderingGroup[] = [];
  const groupCount = 10 + Math.floor(Math.random() * 6);

  for (let i = 0; i < groupCount; i++) {
    const particleCount = 3 + Math.floor(Math.random() * 13);
    const spreadRadius = 20 + Math.random() * 80;

    const particles = Array.from({ length: particleCount }, () => {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * spreadRadius;

      return {
        offsetX: Math.cos(angle) * distance,
        offsetY: Math.sin(angle) * distance,
        size: 0.5 + Math.random() * 2.5,
        phase: Math.random() * Math.PI * 2,
      };
    });

    const speed = 0.15 + Math.random() * 0.6;

    groups.push({
      cx: Math.random() * width,
      cy: Math.random() * height,
      vx: (Math.random() - 0.5) * speed,
      vy: (Math.random() - 0.5) * speed,
      targetVx: (Math.random() - 0.5) * speed,
      targetVy: (Math.random() - 0.5) * speed,
      speed,
      particles,
      opacity: Math.random() * 0.3,
      targetOpacity: 0.15 + Math.random() * 0.25,
      fadeSpeed: 0.0005 + Math.random() * 0.001,
      nextDirectionChange:
        now + DIRECTION_CHANGE_MIN_MS + Math.random() * DIRECTION_CHANGE_RANGE_MS,
      nextFadeChange: now + FADE_CHANGE_MIN_MS + Math.random() * FADE_CHANGE_RANGE_MS,
    });
  }

  return groups;
}

function initializeStars(width: number, height: number): Star[] {
  const starCount = Math.floor((width * height) / STAR_AREA_PER_STAR);
  const stars = Array.from({ length: starCount }, () => createRegularStar(width, height));
  stars.push(createClaudeStar(width, height));
  return stars;
}

function drawStar(
  ctx: CanvasRenderingContext2D,
  star: Star,
  pulseOpacity: number,
  isClaudeStar: boolean
): void {
  ctx.beginPath();

  if (isClaudeStar) {
    const glowSize = star.size + Math.sin(performance.now() * star.twinkleSpeed) * 0.5;
    const gradient = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, glowSize * 3);
    gradient.addColorStop(0, `rgba(255, 126, 95, ${pulseOpacity})`);
    gradient.addColorStop(0.3, `rgba(255, 146, 115, ${pulseOpacity * 0.6})`);
    gradient.addColorStop(1, 'rgba(255, 166, 135, 0)');

    ctx.fillStyle = gradient;
    ctx.arc(star.x, star.y, glowSize * 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.fillStyle = `rgba(255, 126, 95, ${pulseOpacity})`;
    ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  ctx.fillStyle = `rgba(255, 255, 255, ${pulseOpacity})`;
  ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
  ctx.fill();
}

function updateAndDrawStars(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  stars: Star[],
  parallaxX: number,
  parallaxY: number,
  time: number
): void {
  stars.forEach((star, index) => {
    const isClaudeStar = index === stars.length - 1;

    star.baseX = wrapPosition(star.baseX + star.vx, canvas.width, 50);
    star.baseY = wrapPosition(star.baseY + star.vy, canvas.height, 50);

    const depth = star.size * 0.5;
    star.x = star.baseX - parallaxX * depth;
    star.y = star.baseY - parallaxY * depth;

    const pulseOpacity = Math.max(
      0,
      Math.min(1, star.opacity + Math.sin(time * star.twinkleSpeed + star.twinklePhase) * 0.3)
    );

    drawStar(ctx, star, pulseOpacity, isClaudeStar);
  });
}

function calculateWanderingMasterOpacity(startTime: number, now: number): number {
  const timeSinceStart = now - startTime;
  if (timeSinceStart < WANDERING_FADE_DELAY_MS) {
    return 0;
  }

  return Math.min(1, (timeSinceStart - WANDERING_FADE_DELAY_MS) / WANDERING_FADE_DURATION_MS);
}

function updateAndDrawWanderingGroups(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  groups: WanderingGroup[],
  now: number,
  time: number,
  masterOpacity: number
): void {
  for (const group of groups) {
    group.vx += (group.targetVx - group.vx) * 0.01;
    group.vy += (group.targetVy - group.vy) * 0.01;

    group.cx = wrapPosition(group.cx + group.vx, canvas.width, 100);
    group.cy = wrapPosition(group.cy + group.vy, canvas.height, 100);

    if (now > group.nextDirectionChange) {
      group.targetVx = (Math.random() - 0.5) * group.speed;
      group.targetVy = (Math.random() - 0.5) * group.speed;
      group.nextDirectionChange =
        now + DIRECTION_CHANGE_MIN_MS + Math.random() * DIRECTION_CHANGE_RANGE_MS;
    }

    group.opacity += (group.targetOpacity - group.opacity) * group.fadeSpeed * 16;

    if (now > group.nextFadeChange) {
      group.targetOpacity = Math.random() < 0.3 ? 0.05 : 0.15 + Math.random() * 0.25;
      group.nextFadeChange = now + FADE_CHANGE_MIN_MS + Math.random() * FADE_CHANGE_RANGE_MS;
    }

    for (const particle of group.particles) {
      const particleX = group.cx + particle.offsetX;
      const particleY = group.cy + particle.offsetY;

      if (
        particleX < -50 ||
        particleX > canvas.width + 50 ||
        particleY < -50 ||
        particleY > canvas.height + 50
      ) {
        continue;
      }

      const twinkle = 0.8 + Math.sin(time * 0.001 + particle.phase) * 0.2;
      const particleOpacity = group.opacity * twinkle * masterOpacity;

      ctx.beginPath();
      ctx.fillStyle = `rgba(255, 255, 255, ${particleOpacity})`;
      ctx.arc(particleX, particleY, particle.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function useConstellationAnimation(canvasRef: RefObject<HTMLCanvasElement>): void {
  const starsRef = useRef<Star[]>([]);
  const wanderingGroupsRef = useRef<WanderingGroup[]>([]);
  const wanderingFadeInRef = useRef({ startTime: 0 });
  const animationFrameRef = useRef<number>();
  const mouseRef = useRef({ x: 0, y: 0 });
  const smoothMouseRef = useRef({ x: 0, y: 0 });
  const dimensionsRef = useRef({ width: 0, height: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    const initializeScene = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;

      dimensionsRef.current = { width: canvas.width, height: canvas.height };
      mouseRef.current = { x: canvas.width / 2, y: canvas.height / 2 };
      smoothMouseRef.current = { x: canvas.width / 2, y: canvas.height / 2 };

      starsRef.current = initializeStars(canvas.width, canvas.height);
      wanderingGroupsRef.current = createWanderingGroups(
        canvas.width,
        canvas.height,
        performance.now()
      );
      wanderingFadeInRef.current = { startTime: performance.now() };
    };

    const handleMouseMove = (event: MouseEvent) => {
      mouseRef.current = { x: event.clientX, y: event.clientY };
    };

    const drawFrame = (time: number) => {
      context.clearRect(0, 0, canvas.width, canvas.height);

      const lerpFactor = 0.05;
      smoothMouseRef.current.x += (mouseRef.current.x - smoothMouseRef.current.x) * lerpFactor;
      smoothMouseRef.current.y += (mouseRef.current.y - smoothMouseRef.current.y) * lerpFactor;

      const parallaxX =
        (smoothMouseRef.current.x - dimensionsRef.current.width / 2) * 0.02;
      const parallaxY =
        (smoothMouseRef.current.y - dimensionsRef.current.height / 2) * 0.02;

      updateAndDrawStars(
        context,
        canvas,
        starsRef.current,
        parallaxX,
        parallaxY,
        time
      );

      const now = performance.now();
      const masterOpacity = calculateWanderingMasterOpacity(
        wanderingFadeInRef.current.startTime,
        now
      );

      if (masterOpacity > 0) {
        updateAndDrawWanderingGroups(
          context,
          canvas,
          wanderingGroupsRef.current,
          now,
          time,
          masterOpacity
        );
      }

      animationFrameRef.current = requestAnimationFrame(drawFrame);
    };

    initializeScene();

    window.addEventListener('resize', initializeScene);
    window.addEventListener('mousemove', handleMouseMove);
    animationFrameRef.current = requestAnimationFrame(drawFrame);

    return () => {
      window.removeEventListener('resize', initializeScene);
      window.removeEventListener('mousemove', handleMouseMove);

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [canvasRef]);
}

export const ConstellationCanvas = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useConstellationAnimation(canvasRef);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{
        zIndex: 3,
        mixBlendMode: 'screen',
        opacity: 0.6,
      }}
    />
  );
};
