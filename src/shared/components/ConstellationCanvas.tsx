import React, { useEffect, useRef } from 'react';

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

interface ShootingStar {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  length: number;
  opacity: number;
  life: number;
}

interface WanderingGroup {
  // Group center
  cx: number;
  cy: number;
  // Wandering velocity (changes smoothly over time)
  vx: number;
  vy: number;
  // Target velocity (for smooth steering)
  targetVx: number;
  targetVy: number;
  // Speed multiplier for this group (persists across direction changes)
  speed: number;
  // Particles in this group (offsets from center)
  particles: { offsetX: number; offsetY: number; size: number; phase: number }[];
  // Fade state
  opacity: number;
  targetOpacity: number;
  fadeSpeed: number;
  // Timing
  nextDirectionChange: number;
  nextFadeChange: number;
}

export const ConstellationCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starsRef = useRef<Star[]>([]);
  const wanderingGroupsRef = useRef<WanderingGroup[]>([]);
  const wanderingFadeInRef = useRef({ startTime: 0, opacity: 0 }); // For delayed fade-in
  const animationFrameRef = useRef<number>();
  const mouseRef = useRef({ x: 0, y: 0 });
  const smoothMouseRef = useRef({ x: 0, y: 0 }); // Smoothed mouse position for lerping
  const dimensionsRef = useRef({ width: 0, height: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Initial dimensions
    dimensionsRef.current = { width: window.innerWidth, height: window.innerHeight };
    mouseRef.current = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    smoothMouseRef.current = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

    // Set canvas to full viewport size
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      dimensionsRef.current = { width: canvas.width, height: canvas.height };
      initStars();
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };

    const initStars = () => {
      const starCount = Math.floor((canvas.width * canvas.height) / 8000);
      starsRef.current = [];

      // Create regular stars
      for (let i = 0; i < starCount; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        starsRef.current.push({
          x,
          y,
          baseX: x,
          baseY: y,
          size: Math.random() * 1.5 + 0.5,
          opacity: Math.random() * 0.5 + 0.3,
          twinkleSpeed: Math.random() * 0.003 + 0.001,
          twinklePhase: Math.random() * Math.PI * 2,
          vx: (Math.random() - 0.5) * 0.05, // Very slow drift
          vy: (Math.random() - 0.5) * 0.05
        });
      }

      // Add the Claude Star - positioned in upper-right quadrant
      // Slightly larger, orange-coral colored, with a gentle pulse
      const claudeX = canvas.width * 0.75 + (Math.random() - 0.5) * 100;
      const claudeY = canvas.height * 0.25 + (Math.random() - 0.5) * 100;
      starsRef.current.push({
        x: claudeX,
        y: claudeY,
        baseX: claudeX,
        baseY: claudeY,
        size: 2.5, // Noticeably larger
        opacity: 0.9, // Brighter
        twinkleSpeed: 0.0008, // Slower, more deliberate pulse
        twinklePhase: 0,
        vx: 0.01,
        vy: 0.01
      });

      // Initialize wandering groups - clusters of particles that drift together
      initWanderingGroups();
    };

    const initWanderingGroups = () => {
      wanderingGroupsRef.current = [];
      // Initialize fade-in: start after 5 seconds, fade in over 3 seconds
      wanderingFadeInRef.current = { startTime: performance.now(), opacity: 0 };
      const groupCount = 10 + Math.floor(Math.random() * 6); // 10-15 groups

      for (let i = 0; i < groupCount; i++) {
        // Random group size: 3-15 particles per group (wider range)
        const particleCount = 3 + Math.floor(Math.random() * 13);
        const spreadRadius = 20 + Math.random() * 80; // How spread out the group is

        const particles = [];
        for (let j = 0; j < particleCount; j++) {
          // Position particles in a loose cluster around center
          const angle = Math.random() * Math.PI * 2;
          const dist = Math.random() * spreadRadius;
          particles.push({
            offsetX: Math.cos(angle) * dist,
            offsetY: Math.sin(angle) * dist,
            size: 0.5 + Math.random() * 2.5, // Wider size range: 0.5-3
            phase: Math.random() * Math.PI * 2, // For subtle individual twinkle
          });
        }

        // Speed varies per group - some slow, some faster
        const speed = 0.15 + Math.random() * 0.6; // 0.15 to 0.75

        const now = performance.now();
        wanderingGroupsRef.current.push({
          cx: Math.random() * canvas.width,
          cy: Math.random() * canvas.height,
          vx: (Math.random() - 0.5) * speed,
          vy: (Math.random() - 0.5) * speed,
          targetVx: (Math.random() - 0.5) * speed,
          targetVy: (Math.random() - 0.5) * speed,
          speed,
          particles,
          opacity: Math.random() * 0.3, // Start with varying opacity
          targetOpacity: 0.15 + Math.random() * 0.25, // Subtle: 0.15-0.4
          fadeSpeed: 0.0005 + Math.random() * 0.001, // Very slow fade
          nextDirectionChange: now + 5000 + Math.random() * 10000, // Change direction every 5-15s
          nextFadeChange: now + 8000 + Math.random() * 12000, // Change fade every 8-20s
        });
      }
    };


    const drawStars = (time: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Smoothly lerp towards actual mouse position (prevents jump on first hover)
      const lerpFactor = 0.05;
      smoothMouseRef.current.x += (mouseRef.current.x - smoothMouseRef.current.x) * lerpFactor;
      smoothMouseRef.current.y += (mouseRef.current.y - smoothMouseRef.current.y) * lerpFactor;
      
      // Calculate parallax offset based on smoothed mouse position
      const parallaxX = (smoothMouseRef.current.x - dimensionsRef.current.width / 2) * 0.02;
      const parallaxY = (smoothMouseRef.current.y - dimensionsRef.current.height / 2) * 0.02;

      // Draw and update stars
      starsRef.current.forEach((star, index) => {
        const isClaudeStar = index === starsRef.current.length - 1;
        
        // Update drift position
        star.baseX += star.vx;
        star.baseY += star.vy;

        // Wrap around screen
        if (star.baseX < -50) star.baseX = canvas.width + 50;
        if (star.baseX > canvas.width + 50) star.baseX = -50;
        if (star.baseY < -50) star.baseY = canvas.height + 50;
        if (star.baseY > canvas.height + 50) star.baseY = -50;

        // Apply parallax
        // Depth effect: larger stars move more (closer)
        const depth = star.size * 0.5; 
        star.x = star.baseX - parallaxX * depth;
        star.y = star.baseY - parallaxY * depth;
        
        // Calculate pulsing opacity
        const pulseOpacity = Math.max(0, Math.min(1, star.opacity + Math.sin(time * star.twinkleSpeed + star.twinklePhase) * 0.3));

        ctx.beginPath();
        
        if (isClaudeStar) {
          // Claude Star: warm orange-coral with subtle glow
          const glowSize = star.size + Math.sin(time * star.twinkleSpeed) * 0.5;
          
          // Outer glow
          const gradient = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, glowSize * 3);
          gradient.addColorStop(0, `rgba(255, 126, 95, ${pulseOpacity})`); // Orange-coral core
          gradient.addColorStop(0.3, `rgba(255, 146, 115, ${pulseOpacity * 0.6})`);
          gradient.addColorStop(1, 'rgba(255, 166, 135, 0)');
          
          ctx.fillStyle = gradient;
          ctx.arc(star.x, star.y, glowSize * 3, 0, Math.PI * 2);
          ctx.fill();
          
          // Bright center
          ctx.beginPath();
          ctx.fillStyle = `rgba(255, 126, 95, ${pulseOpacity})`;
          ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Regular stars: soft white/blue
          ctx.fillStyle = `rgba(255, 255, 255, ${pulseOpacity})`;
          ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      // Shooting stars disabled
      // spawnShootingStar();

      // Update and draw wandering groups
      const now = performance.now();

      // Calculate master fade-in opacity (delay 5s, fade over 3s)
      const fadeDelay = 5000; // 5 seconds delay
      const fadeDuration = 3000; // 3 seconds to fade in
      const timeSinceStart = now - wanderingFadeInRef.current.startTime;
      let masterOpacity = 0;
      if (timeSinceStart >= fadeDelay) {
        const fadeProgress = Math.min(1, (timeSinceStart - fadeDelay) / fadeDuration);
        masterOpacity = fadeProgress;
      }

      // Only draw wandering groups if they've started fading in
      if (masterOpacity > 0) {
      for (const group of wanderingGroupsRef.current) {
        // Smoothly steer toward target velocity
        group.vx += (group.targetVx - group.vx) * 0.01;
        group.vy += (group.targetVy - group.vy) * 0.01;

        // Move group center
        group.cx += group.vx;
        group.cy += group.vy;

        // Wrap around screen with padding
        if (group.cx < -100) group.cx = canvas.width + 100;
        if (group.cx > canvas.width + 100) group.cx = -100;
        if (group.cy < -100) group.cy = canvas.height + 100;
        if (group.cy > canvas.height + 100) group.cy = -100;

        // Change direction periodically (using group's own speed)
        if (now > group.nextDirectionChange) {
          group.targetVx = (Math.random() - 0.5) * group.speed;
          group.targetVy = (Math.random() - 0.5) * group.speed;
          group.nextDirectionChange = now + 5000 + Math.random() * 10000;
        }

        // Smoothly fade toward target opacity
        group.opacity += (group.targetOpacity - group.opacity) * group.fadeSpeed * 16;

        // Change fade target periodically
        if (now > group.nextFadeChange) {
          // Sometimes fade out almost completely, sometimes become more visible
          group.targetOpacity = Math.random() < 0.3 ? 0.05 : (0.15 + Math.random() * 0.25);
          group.nextFadeChange = now + 8000 + Math.random() * 12000;
        }

        // Draw particles in this group
        for (const p of group.particles) {
          const px = group.cx + p.offsetX;
          const py = group.cy + p.offsetY;

          // Skip if off screen
          if (px < -50 || px > canvas.width + 50 || py < -50 || py > canvas.height + 50) continue;

          // Subtle individual twinkle
          const twinkle = 0.8 + Math.sin(time * 0.001 + p.phase) * 0.2;
          const particleOpacity = group.opacity * twinkle * masterOpacity;

          ctx.beginPath();
          ctx.fillStyle = `rgba(255, 255, 255, ${particleOpacity})`;
          ctx.arc(px, py, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      } // end if masterOpacity > 0

      animationFrameRef.current = requestAnimationFrame(drawStars);
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('mousemove', handleMouseMove);
    
    animationFrameRef.current = requestAnimationFrame(drawStars);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('mousemove', handleMouseMove);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ 
        zIndex: 3,
        mixBlendMode: 'screen',
        opacity: 0.6 
      }}
    />
  );
};
