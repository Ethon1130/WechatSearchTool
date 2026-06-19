'use client';

import { useEffect, useRef } from 'react';

type BackgroundCanvasProps = {
  enabled?: boolean;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hue: number;
  alpha: number;
  phase: number;
  pulse: number;
};

const COUNT_DESKTOP = 118;
const COUNT_MOBILE = 44;
const FRAME_INTERVAL_MS = 1000 / 30;
const LINK_DISTANCE_DESKTOP = 132;
const LINK_DISTANCE_MOBILE = 104;

export function BackgroundCanvas({ enabled = true }: BackgroundCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);
  const runningRef = useRef<boolean>(false);
  const particlesRef = useRef<Particle[]>([]);
  const sizeRef = useRef<{ w: number; h: number; dpr: number }>({ w: 0, h: 0, dpr: 1 });

  useEffect(() => {
    if (!enabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const motionMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sizeMQ = window.matchMedia('(max-width: 760px)');

    const hues: number[] = [174, 230, 54, 168];

    const seedParticles = () => {
      const { w, h } = sizeRef.current;
      const count = sizeMQ.matches ? COUNT_MOBILE : COUNT_DESKTOP;
      const next: Particle[] = [];
      for (let i = 0; i < count; i += 1) {
        const depth = Math.random();
        next.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.14,
          vy: (Math.random() - 0.5) * 0.1 - 0.018,
          radius: 0.45 + depth * 1.2,
          hue: hues[Math.floor(Math.random() * hues.length)] ?? 174,
          alpha: 0.18 + depth * 0.34,
          phase: Math.random() * Math.PI * 2,
          pulse: 0.55 + Math.random() * 0.65,
        });
      }
      particlesRef.current = next;
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(window.innerWidth, 1);
      const h = Math.max(window.innerHeight, 1);
      sizeRef.current = { w, h, dpr };
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seedParticles();
    };

    const draw = () => {
      const { w, h } = sizeRef.current;
      ctx.clearRect(0, 0, w, h);
      const list = particlesRef.current;
      const maxDistance = sizeMQ.matches ? LINK_DISTANCE_MOBILE : LINK_DISTANCE_DESKTOP;

      ctx.lineWidth = 1;
      for (let i = 0; i < list.length; i += 1) {
        const a = list[i]!;
        for (let j = i + 1; j < list.length; j += 1) {
          const b = list[j]!;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const distance = Math.hypot(dx, dy);
          if (distance > maxDistance) continue;

          const strength = (1 - distance / maxDistance) * 0.16;
          ctx.beginPath();
          ctx.strokeStyle = `oklch(50% 0.055 ${a.hue} / ${strength.toFixed(3)})`;
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      for (let i = 0; i < list.length; i += 1) {
        const p = list[i]!;
        const shimmer = 0.72 + Math.sin(p.phase) * 0.28;
        const alpha = p.alpha * shimmer;
        ctx.beginPath();
        ctx.fillStyle = `oklch(63% 0.065 ${p.hue} / ${alpha.toFixed(3)})`;
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      const sweepY = ((lastTickRef.current / 110) % (h + 180)) - 90;
      const sweep = ctx.createLinearGradient(0, sweepY - 44, 0, sweepY + 44);
      sweep.addColorStop(0, 'oklch(60% 0.075 174 / 0)');
      sweep.addColorStop(0.5, 'oklch(58% 0.08 174 / 0.07)');
      sweep.addColorStop(1, 'oklch(60% 0.075 174 / 0)');
      ctx.fillStyle = sweep;
      ctx.fillRect(0, sweepY - 44, w, 88);
    };

    const step = (now: number) => {
      if (!runningRef.current) {
        rafRef.current = null;
        return;
      }
      if (lastTickRef.current === 0) lastTickRef.current = now;
      const delta = now - lastTickRef.current;
      if (delta < FRAME_INTERVAL_MS) {
        rafRef.current = window.requestAnimationFrame(step);
        return;
      }
      lastTickRef.current = now - (delta % FRAME_INTERVAL_MS);

      const list = particlesRef.current;
      const { w, h } = sizeRef.current;
      for (let i = 0; i < list.length; i += 1) {
        const p = list[i]!;
        p.x += p.vx;
        p.y += p.vy;
        p.phase += 0.012 * p.pulse;
        if (p.x < -8) p.x = w + 8;
        else if (p.x > w + 8) p.x = -8;
        if (p.y < -8) p.y = h + 8;
        else if (p.y > h + 8) p.y = -8;
      }

      draw();
      rafRef.current = window.requestAnimationFrame(step);
    };

    const start = () => {
      if (runningRef.current) return;
      if (motionMQ.matches) {
        draw();
        return;
      }
      runningRef.current = true;
      lastTickRef.current = 0;
      rafRef.current = window.requestAnimationFrame(step);
    };

    const stop = () => {
      runningRef.current = false;
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };

    resize();
    draw();
    start();

    let resizeTimer: number | null = null;
    const onResize = () => {
      if (resizeTimer !== null) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        resize();
        if (!runningRef.current) draw();
      }, 160);
    };
    window.addEventListener('resize', onResize, { passive: true });

    const onMotion = () => {
      if (motionMQ.matches) {
        stop();
        draw();
      } else {
        start();
      }
    };
    motionMQ.addEventListener('change', onMotion);

    return () => {
      stop();
      window.removeEventListener('resize', onResize);
      motionMQ.removeEventListener('change', onMotion);
      if (resizeTimer !== null) window.clearTimeout(resizeTimer);
    };
  }, [enabled]);

  if (!enabled) return null;

  return <canvas ref={canvasRef} aria-hidden="true" className="bg-canvas" />;
}
