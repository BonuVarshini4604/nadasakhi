import React, { useRef, useEffect } from 'react';
import { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { HAND_CONNECTIONS, getLandmarksForToken, ASL_LETTER_POSES } from '../services/aslPoses';

interface HandSkeletonPlayerProps {
  currentSign: string;       // Current word or phrase, e.g. "HELLO", "WATER"
  currentLetter?: string;     // Currently spelled active letter, e.g. "H"
  isPause?: boolean;          // Whether currently in a pause step
  playbackSpeed?: number;     // 0.5, 1, 1.5
  isPlaying?: boolean;        // Whether animation is active
  className?: string;
}

export const HandSkeletonPlayer: React.FC<HandSkeletonPlayerProps> = ({
  currentSign,
  currentLetter,
  isPause = false,
  playbackSpeed = 1,
  isPlaying = true,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Animation state refs
  const currentLandmarksRef = useRef<NormalizedLandmark[]>([]);
  const targetLandmarksRef = useRef<NormalizedLandmark[]>([]);
  const animFrameRef = useRef<number | null>(null);
  const breathPhaseRef = useRef<number>(0);

  // Determine active token to display
  const activeChar = isPause
    ? 'PAUSE'
    : currentLetter
    ? currentLetter.toUpperCase()
    : currentSign
    ? currentSign.toUpperCase()
    : 'REST';

  // Update target landmarks whenever activeChar changes
  useEffect(() => {
    let target = getLandmarksForToken(activeChar);

    // If activeChar is a letter in ASL_LETTER_POSES
    if (ASL_LETTER_POSES[activeChar]) {
      target = ASL_LETTER_POSES[activeChar];
    }

    targetLandmarksRef.current = target;

    // Initialize current landmarks if empty
    if (currentLandmarksRef.current.length === 0) {
      currentLandmarksRef.current = target.map((lm) => ({ ...lm }));
    }
  }, [activeChar]);

  // Main canvas rendering & interpolation loop
  useEffect(() => {
    let running = true;

    const render = () => {
      if (!running) return;

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          // Adjust canvas internal size to match displayed container
          const rect = canvas.getBoundingClientRect();
          const dpr = window.devicePixelRatio || 1;
          const displayWidth = Math.round(rect.width * dpr);
          const displayHeight = Math.round(rect.height * dpr);

          if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
            canvas.width = displayWidth || 400;
            canvas.height = displayHeight || 400;
          }

          const width = canvas.width;
          const height = canvas.height;

          // Clear canvas with deep dark background
          ctx.clearRect(0, 0, width, height);

          // Subtle radial depth gradient in center
          const radial = ctx.createRadialGradient(
            width * 0.5, height * 0.55, 10,
            width * 0.5, height * 0.55, width * 0.45
          );
          radial.addColorStop(0, 'rgba(14, 165, 233, 0.08)');
          radial.addColorStop(0.5, 'rgba(13, 22, 48, 0.4)');
          radial.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = radial;
          ctx.fillRect(0, 0, width, height);

          // Subtle tech crosshair / grid circles in background
          ctx.strokeStyle = 'rgba(14, 165, 233, 0.06)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(width * 0.5, height * 0.55, width * 0.35, 0, 2 * Math.PI);
          ctx.stroke();

          // Idle micro-breathing motion
          if (isPlaying) {
            breathPhaseRef.current += 0.03 * playbackSpeed;
          }
          const breathOffset = Math.sin(breathPhaseRef.current) * 0.005;

          // Interpolate current landmarks towards target landmarks (smooth morphing)
          const target = targetLandmarksRef.current;
          const current = currentLandmarksRef.current;
          const lerpFactor = 0.16 * playbackSpeed;

          if (target && target.length === 21 && current.length === 21) {
            for (let i = 0; i < 21; i++) {
              current[i].x += (target[i].x - current[i].x) * lerpFactor;
              current[i].y += (target[i].y - current[i].y) * lerpFactor;
              current[i].z = (current[i].z || 0) + ((target[i].z || 0) - (current[i].z || 0)) * lerpFactor;
            }
          }

          if (current.length === 21) {
            // Transform landmarks to canvas coordinates
            // Scale and center hand nicely in canvas
            const scale = Math.min(width, height) * 0.95;
            const offsetX = (width - scale) / 2;
            const offsetY = (height - scale) / 2 + breathOffset * height;

            const pts = current.map((lm) => ({
              x: offsetX + lm.x * scale,
              y: offsetY + lm.y * scale,
              z: lm.z || 0,
            }));

            // 1. Draw subtle palm polygon webbing
            ctx.beginPath();
            const palmIndices = [0, 5, 9, 13, 17];
            ctx.moveTo(pts[palmIndices[0]].x, pts[palmIndices[0]].y);
            for (let i = 1; i < palmIndices.length; i++) {
              ctx.lineTo(pts[palmIndices[i]].x, pts[palmIndices[i]].y);
            }
            ctx.closePath();
            ctx.fillStyle = 'rgba(14, 165, 233, 0.06)';
            ctx.fill();

            // 2. Draw Bones (HAND_CONNECTIONS) with cyan tech glow
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            for (const [i, j] of HAND_CONNECTIONS) {
              const p1 = pts[i];
              const p2 = pts[j];

              // Outer glow line
              ctx.lineWidth = 5 * dpr;
              ctx.strokeStyle = 'rgba(14, 165, 233, 0.35)';
              ctx.shadowColor = '#0ea5e9';
              ctx.shadowBlur = 12 * dpr;
              ctx.beginPath();
              ctx.moveTo(p1.x, p1.y);
              ctx.lineTo(p2.x, p2.y);
              ctx.stroke();

              // Inner sharp bright line
              ctx.lineWidth = 2.5 * dpr;
              ctx.strokeStyle = '#38bdf8';
              ctx.shadowBlur = 0;
              ctx.beginPath();
              ctx.moveTo(p1.x, p1.y);
              ctx.lineTo(p2.x, p2.y);
              ctx.stroke();
            }

            // 3. Draw Joints (21 Keypoints)
            const tipIndices = new Set([4, 8, 12, 16, 20]);

            pts.forEach((pt, index) => {
              const isTip = tipIndices.has(index);
              const zDepth = 1 + (pt.z || 0) * 1.5;

              if (isTip) {
                // Fingertip glowing emerald / cyan node
                const r = Math.max(3, 7 * dpr * zDepth);
                ctx.shadowColor = '#10b981';
                ctx.shadowBlur = 10 * dpr;

                // Outer halo
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, r + 2 * dpr, 0, 2 * Math.PI);
                ctx.fillStyle = 'rgba(16, 185, 129, 0.4)';
                ctx.fill();

                // Core emerald node
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, r, 0, 2 * Math.PI);
                ctx.fillStyle = '#10b981';
                ctx.fill();

                // Bright center core
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, Math.max(1.5, 2.5 * dpr), 0, 2 * Math.PI);
                ctx.fillStyle = '#ffffff';
                ctx.shadowBlur = 0;
                ctx.fill();
              } else {
                // Standard joint node
                const r = Math.max(2, 4.5 * dpr * zDepth);
                ctx.shadowColor = '#0ea5e9';
                ctx.shadowBlur = 6 * dpr;

                ctx.beginPath();
                ctx.arc(pt.x, pt.y, r, 0, 2 * Math.PI);
                ctx.fillStyle = '#38bdf8';
                ctx.fill();

                ctx.beginPath();
                ctx.arc(pt.x, pt.y, Math.max(1, 1.8 * dpr), 0, 2 * Math.PI);
                ctx.fillStyle = '#ffffff';
                ctx.shadowBlur = 0;
                ctx.fill();
              }
            });

            // 4. Subtle active letter HUD overlay in upper corner of canvas
            if (activeChar && activeChar !== 'PAUSE' && activeChar !== 'REST') {
              ctx.save();
              ctx.font = `900 ${Math.round(28 * dpr)}px system-ui, sans-serif`;
              ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
              ctx.shadowColor = '#0ea5e9';
              ctx.shadowBlur = 12 * dpr;
              ctx.fillText(activeChar, 24 * dpr, 42 * dpr);
              ctx.restore();
            }
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      running = false;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [isPlaying, playbackSpeed]);

  return (
    <div className={`relative w-full h-full flex items-center justify-center ${className}`}>
      <canvas
        ref={canvasRef}
        className="w-full h-full block object-contain pointer-events-none"
        style={{ minHeight: '280px', maxHeight: '420px' }}
      />
    </div>
  );
};
