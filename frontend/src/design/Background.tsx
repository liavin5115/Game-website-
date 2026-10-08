/** Animated felt background with subtle ambient motion */
import { useEffect, useRef } from 'react';

export function FeltBackground({ className = '' }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };

    const particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      opacity: number;
    }> = [];

    const initParticles = () => {
      particles.length = 0;
      const count = Math.min(30, Math.floor((canvas.offsetWidth * canvas.offsetHeight) / 15000));
      for (let i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * canvas.offsetWidth,
          y: Math.random() * canvas.offsetHeight,
          vx: (Math.random() - 0.5) * 0.3,
          vy: (Math.random() - 0.5) * 0.3,
          size: Math.random() * 2 + 1,
          opacity: Math.random() * 0.03 + 0.01,
        });
      }
    };

    const animate = () => {
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);

      // Draw felt texture
      drawFeltTexture(ctx, canvas.offsetWidth, canvas.offsetHeight);

      // Draw floating particles
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0) p.x = canvas.offsetWidth;
        if (p.x > canvas.offsetWidth) p.x = 0;
        if (p.y < 0) p.y = canvas.offsetHeight;
        if (p.y > canvas.offsetHeight) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 179, 0, ${p.opacity})`;
        ctx.fill();
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    const drawFeltTexture = (
      ctx: CanvasRenderingContext2D,
      width: number,
      height: number
    ) => {
      // Base felt color
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#1e5020');
      gradient.addColorStop(0.5, '#256629');
      gradient.addColorStop(1, '#1e5020');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      // Subtle noise pattern
      ctx.globalAlpha = 0.03;
      for (let i = 0; i < width * height / 200; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? '#1a421c' : '#2d7d32';
        ctx.fillRect(
          Math.random() * width,
          Math.random() * height,
          1,
          1
        );
      }
      ctx.globalAlpha = 1;

      // Subtle vignette
      const vignette = ctx.createRadialGradient(
        width / 2, height / 2, 0,
        width / 2, height / 2, Math.max(width, height) / 1.5
      );
      vignette.addColorStop(0, 'rgba(0,0,0,0)');
      vignette.addColorStop(1, 'rgba(0,0,0,0.3)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);
    };

    resize();
    initParticles();
    animate();

    window.addEventListener('resize', resize);

    return () => {
      window.removeEventListener('resize', resize);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`fixed inset-0 w-full h-full pointer-events-none ${className}`}
      aria-hidden="true"
    />
  );
}

/** Simpler CSS-only background for better performance */
export function FeltBackgroundCSS({ className = '' }: { className?: string }) {
  return (
    <div
      className={`
        fixed inset-0 pointer-events-none
        bg-gradient-to-br from-[#1e5020] via-[#256629] to-[#1e5020]
        ${className}
      `}
      aria-hidden="true"
    >
      {/* Subtle pattern overlay */}
      <div className="absolute inset-0 opacity-[0.02] bg-[url('data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noise%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22 numOctaves=%224%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noise)%22/%3E%3C/svg%3E')]"></div>

      {/* Vignette */}
      <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-black/30"></div>

      {/* Subtle gold accent lines */}
      <div className="absolute inset-0 bg-[linear-gradient(135deg,transparent_49%,rgba(255,179,0,0.03)_50%,transparent_51%)] bg-[size:60px_60px]"></div>
    </div>
  );
}