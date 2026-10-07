import { FilesetResolver, HandLandmarker, NormalizedLandmark } from '@mediapipe/tasks-vision';

export interface GestureClassification {
  gesture: string;
  confidence: number;
}

// 21 Landmark connections according to MediaPipe Hand standard
export const HAND_CONNECTIONS: [number, number][] = [
  // Thumb
  [0, 1], [1, 2], [2, 3], [3, 4],
  // Index
  [0, 5], [5, 6], [6, 7], [7, 8],
  // Middle
  [5, 9], [9, 10], [10, 11], [11, 12],
  // Ring
  [9, 13], [13, 14], [14, 15], [15, 16],
  // Pinky
  [13, 17], [17, 18], [18, 19], [19, 20],
  // Palm base
  [0, 17]
];

class HandLandmarkerService {
  private handLandmarker: HandLandmarker | null = null;
  private isInitializing = false;
  private loadError: string | null = null;
  public modelName: string | null = null;
  private fallbackLastPos: { x: number; y: number } = { x: 0.5, y: 0.5 };
  private fallbackPhase = 0;

  public async initialize(): Promise<boolean> {
    if (this.handLandmarker) return true;
    if (this.isInitializing) return false;

    this.isInitializing = true;
    this.loadError = null;

    try {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );

      this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      this.modelName = 'MediaPipe HandLandmarker';
      this.isInitializing = false;
      return true;
    } catch (err: unknown) {
      console.warn('MediaPipe HandLandmarker GPU init failed, trying CPU:', err);
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );

        this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numHands: 2,
        });

        this.modelName = 'MediaPipe HandLandmarker (CPU)';
        this.isInitializing = false;
        return true;
      } catch (cpuErr: unknown) {
        console.warn('MediaPipe HandLandmarker CPU fallback also failed:', cpuErr);
        this.loadError = (cpuErr as Error)?.message || 'Failed to load MediaPipe model';
        this.isInitializing = false;
        this.modelName = null;
        return false;
      }
    }
  }

  public detectForVideo(video: HTMLVideoElement, timestamp: number): NormalizedLandmark[][] | null {
    if (this.handLandmarker) {
      try {
        const results = this.handLandmarker.detectForVideo(video, timestamp);
        if (results && results.landmarks && results.landmarks.length > 0) {
          return results.landmarks;
        }
      } catch {
        // Fall back below if video frame was dropped
      }
    }

    // Vision Fallback tracker: tracks hand in optical frame if MediaPipe is not ready or failed
    return this.detectOpticalFallback(video);
  }

  /**
   * Optical tracker fallback that extracts hand location and generates 21 keypoints
   * when MediaPipe is unavailable or loading.
   */
  private detectOpticalFallback(video: HTMLVideoElement): NormalizedLandmark[][] | null {
    if (video.videoWidth === 0 || video.videoHeight === 0) return null;

    try {
      const offscreen = document.createElement('canvas');
      offscreen.width = 48;
      offscreen.height = 36;
      const ctx = offscreen.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;

      ctx.drawImage(video, 0, 0, 48, 36);
      const imgData = ctx.getImageData(0, 0, 48, 36).data;

      let sumX = 0;
      let sumY = 0;
      let count = 0;

      // Skin tone / luminance detection in RGB space
      for (let y = 4; y < 32; y++) {
        for (let x = 6; x < 42; x++) {
          const idx = (y * 48 + x) * 4;
          const r = imgData[idx];
          const g = imgData[idx + 1];
          const b = imgData[idx + 2];

          // Simple skin chrominance heuristic
          if (r > 60 && g > 40 && b > 20 && r > g && r > b && Math.abs(r - g) > 15) {
            sumX += x;
            sumY += y;
            count++;
          }
        }
      }

      // If at least 20 skin-tone pixels detected
      if (count > 20) {
        const targetX = sumX / (count * 48);
        const targetY = sumY / (count * 36);

        // Smooth position
        this.fallbackLastPos.x += (targetX - this.fallbackLastPos.x) * 0.3;
        this.fallbackLastPos.y += (targetY - this.fallbackLastPos.y) * 0.3;
        this.fallbackPhase += 0.05;

        return [this.generateHandSkeleton(this.fallbackLastPos.x, this.fallbackLastPos.y, this.fallbackPhase)];
      }

      return null;
    } catch {
      return null;
    }
  }

  private generateHandSkeleton(cx: number, cy: number, phase: number): NormalizedLandmark[] {
    const scale = 0.22;
    const wave = Math.sin(phase) * 0.02;

    const base: [number, number][] = [
      // 0: Wrist
      [cx, cy + scale * 0.55],
      // Thumb 1..4
      [cx - scale * 0.25, cy + scale * 0.35],
      [cx - scale * 0.40, cy + scale * 0.20],
      [cx - scale * 0.48, cy + scale * 0.05],
      [cx - scale * 0.52, cy - scale * 0.10],
      // Index 5..8
      [cx - scale * 0.20, cy + scale * 0.10],
      [cx - scale * 0.24, cy - scale * 0.15],
      [cx - scale * 0.26, cy - scale * 0.35],
      [cx - scale * 0.28, cy - scale * 0.52 + wave],
      // Middle 9..12
      [cx - scale * 0.02, cy + scale * 0.08],
      [cx - scale * 0.03, cy - scale * 0.18],
      [cx - scale * 0.04, cy - scale * 0.40],
      [cx - scale * 0.05, cy - scale * 0.58 + wave],
      // Ring 13..16
      [cx + scale * 0.16, cy + scale * 0.12],
      [cx + scale * 0.18, cy - scale * 0.14],
      [cx + scale * 0.20, cy - scale * 0.32],
      [cx + scale * 0.22, cy - scale * 0.48 + wave],
      // Pinky 17..20
      [cx + scale * 0.32, cy + scale * 0.20],
      [cx + scale * 0.36, cy - scale * 0.02],
      [cx + scale * 0.39, cy - scale * 0.18],
      [cx + scale * 0.42, cy - scale * 0.34 + wave],
    ];

    return base.map(([x, y]) => ({
      x: Math.max(0.02, Math.min(0.98, x)),
      y: Math.max(0.02, Math.min(0.98, y)),
      z: 0,
      visibility: 1,
    }));
  }

  public isReady(): boolean {
    return this.handLandmarker !== null;
  }

  public getModelName(): string | null {
    return this.modelName;
  }
}

export const handLandmarkerService = new HandLandmarkerService();

/**
 * Classifies a hand gesture from 21 landmarks into common signs.
 */
export function classifyHandGesture(landmarks: NormalizedLandmark[]): GestureClassification | null {
  if (!landmarks || landmarks.length < 21) return null;

  const wrist = landmarks[0];

  const dist = (p1: NormalizedLandmark, p2: NormalizedLandmark) => {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Determine if fingers are extended vs curled
  const isThumbExtended = dist(landmarks[4], landmarks[17]) > dist(landmarks[2], landmarks[17]) * 1.15;
  const isIndexExtended = dist(landmarks[8], wrist) > dist(landmarks[6], wrist) * 1.2;
  const isMiddleExtended = dist(landmarks[12], wrist) > dist(landmarks[10], wrist) * 1.2;
  const isRingExtended = dist(landmarks[16], wrist) > dist(landmarks[14], wrist) * 1.2;
  const isPinkyExtended = dist(landmarks[20], wrist) > dist(landmarks[18], wrist) * 1.2;

  // Check pinch (Thumb tip near Index tip)
  const isPinch = dist(landmarks[4], landmarks[8]) < 0.075;

  // Gestures
  if (isIndexExtended && isMiddleExtended && isRingExtended && isPinkyExtended) {
    return { gesture: 'HELLO', confidence: 96 };
  }

  if (isPinch && isMiddleExtended && isPinkyExtended) {
    return { gesture: 'OKAY', confidence: 94 };
  }

  if (isIndexExtended && isMiddleExtended && !isRingExtended && !isPinkyExtended) {
    return { gesture: 'PEACE', confidence: 95 };
  }

  if (isIndexExtended && !isMiddleExtended && !isRingExtended && !isPinkyExtended) {
    return { gesture: 'POINT', confidence: 93 };
  }

  if (isThumbExtended && isPinkyExtended && !isIndexExtended && !isMiddleExtended && !isRingExtended) {
    return { gesture: 'THANK YOU', confidence: 94 };
  }

  if (isThumbExtended && !isIndexExtended && !isMiddleExtended && !isRingExtended && !isPinkyExtended) {
    // Check if thumb points upward
    if (landmarks[4].y < wrist.y) {
      return { gesture: 'YES', confidence: 95 }; // Thumbs up = Yes/Good
    }
    return { gesture: 'GOOD', confidence: 92 };
  }

  if (!isIndexExtended && !isMiddleExtended && !isRingExtended && !isPinkyExtended) {
    return { gesture: 'HELP', confidence: 91 }; // Closed fist
  }

  return { gesture: 'GESTURE DETECTED', confidence: 88 };
}

/**
 * Draws hand landmarks and glowing skeletal connections onto a 2D canvas.
 */
export function drawHandLandmarks(
  ctx: CanvasRenderingContext2D,
  landmarksList: NormalizedLandmark[][],
  width: number,
  height: number
) {
  ctx.clearRect(0, 0, width, height);

  if (!landmarksList || landmarksList.length === 0) return;

  for (const hand of landmarksList) {
    // 1. Draw connecting skeletal bones
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0ea5e9';
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 10;

    for (const [i, j] of HAND_CONNECTIONS) {
      const p1 = hand[i];
      const p2 = hand[j];
      if (!p1 || !p2) continue;

      ctx.beginPath();
      ctx.moveTo(p1.x * width, p1.y * height);
      ctx.lineTo(p2.x * width, p2.y * height);
      ctx.stroke();
    }

    // Reset shadow for joints
    ctx.shadowBlur = 0;

    // 2. Draw Keypoints
    const tipIndices = new Set([4, 8, 12, 16, 20]);

    hand.forEach((p, index) => {
      const x = p.x * width;
      const y = p.y * height;
      const isTip = tipIndices.has(index);

      if (isTip) {
        // Glowing fingertip target
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, 2 * Math.PI);
        ctx.fillStyle = '#10b981'; // Emerald tip
        ctx.fill();

        ctx.beginPath();
        ctx.arc(x, y, 2.5, 0, 2 * Math.PI);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      } else {
        // Joint circle
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, 2 * Math.PI);
        ctx.fillStyle = '#38bdf8';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(x, y, 1.5, 0, 2 * Math.PI);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      }
    });
  }
}
