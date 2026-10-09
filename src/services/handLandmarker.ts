import { FilesetResolver, HandLandmarker, NormalizedLandmark } from '@mediapipe/tasks-vision';

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
  public modelName: string | null = null;
  public loadError: string | null = null;

  public async initialize(): Promise<boolean> {
    if (this.handLandmarker) return true;
    if (this.isInitializing) return false;

    this.isInitializing = true;
    this.loadError = null;

    try {
      // 1. Load WASM files from https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
      );

      // 2. Try GPU delegate first
      try {
        this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: 1,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        this.modelName = 'MediaPipe HandLandmarker (GPU)';
        this.isInitializing = false;
        return true;
      } catch (gpuError: unknown) {
        console.warn('GPU delegate failed, falling back to CPU:', gpuError);

        // Fallback to CPU delegate
        this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numHands: 1,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        this.modelName = 'MediaPipe HandLandmarker (CPU)';
        this.isInitializing = false;
        return true;
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('MediaPipe HandLandmarker initialization failed:', err);
      this.loadError = errorMsg;
      this.modelName = null;
      this.isInitializing = false;
      return false;
    }
  }

  public detectForVideo(video: HTMLVideoElement, timestamp: number): NormalizedLandmark[] | null {
    if (!this.handLandmarker) return null;
    if (video.videoWidth === 0 || video.videoHeight === 0) return null;

    try {
      const results = this.handLandmarker.detectForVideo(video, timestamp);
      if (results && results.landmarks && results.landmarks.length > 0) {
        return results.landmarks[0];
      }
    } catch (err) {
      console.warn('detectForVideo error:', err);
    }

    return null;
  }

  public detectForVideoWithHandedness(
    video: HTMLVideoElement,
    timestamp: number
  ): { landmarks: NormalizedLandmark[]; isLeftHand: boolean } | null {
    if (!this.handLandmarker) return null;
    if (video.videoWidth === 0 || video.videoHeight === 0) return null;

    try {
      const results = this.handLandmarker.detectForVideo(video, timestamp);
      if (results && results.landmarks && results.landmarks.length > 0) {
        const lm = results.landmarks[0];
        let isLeft = false;
        if (results.handedness && results.handedness.length > 0) {
          const category = results.handedness[0]?.[0];
          if (category && category.categoryName.toLowerCase() === 'left') {
            isLeft = true;
          }
        }
        return { landmarks: lm, isLeftHand: isLeft };
      }
    } catch (err) {
      console.warn('detectForVideoWithHandedness error:', err);
    }

    return null;
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
 * Classify from real landmarks only using geometry.
 * A finger counts as extended when its tip is further from the wrist than its middle knuckle.
 * Gestures:
 * - all five fingers extended = HELLO
 * - closed fist = YES
 * - thumb extended only (pointing upward) = GOOD
 * - thumb + index + pinky = I LOVE YOU
 * - index + middle = PEACE
 * - index only = ONE
 * - no match = null
 */
export function classifyHandGesture(landmarks: NormalizedLandmark[] | null): string | null {
  if (!landmarks || landmarks.length < 21) return null;

  const wrist = landmarks[0];

  const dist = (p1: NormalizedLandmark, p2: NormalizedLandmark) => {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.hypot(dx, dy);
  };

  // Middle knuckle for fingers:
  // Thumb: tip is 4, middle knuckle is 3 (IP)
  // Index: tip is 8, middle knuckle is 6 (PIP)
  // Middle: tip is 12, middle knuckle is 10 (PIP)
  // Ring: tip is 16, middle knuckle is 14 (PIP)
  // Pinky: tip is 20, middle knuckle is 18 (PIP)
  const thumbExtended = dist(landmarks[4], wrist) > dist(landmarks[3], wrist);
  const indexExtended = dist(landmarks[8], wrist) > dist(landmarks[6], wrist);
  const middleExtended = dist(landmarks[12], wrist) > dist(landmarks[10], wrist);
  const ringExtended = dist(landmarks[16], wrist) > dist(landmarks[14], wrist);
  const pinkyExtended = dist(landmarks[20], wrist) > dist(landmarks[18], wrist);

  // 1. All five fingers extended = HELLO
  if (thumbExtended && indexExtended && middleExtended && ringExtended && pinkyExtended) {
    return 'HELLO';
  }

  // 2. Closed fist = YES
  if (!thumbExtended && !indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
    return 'YES';
  }
  // Also closed fist where thumb rests curled over fingers (tip not extended or below knuckle)
  if (!indexExtended && !middleExtended && !ringExtended && !pinkyExtended && landmarks[4].y >= landmarks[3].y) {
    return 'YES';
  }

  // 3. Thumb extended only (pointing upward) = GOOD
  if (thumbExtended && !indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
    // Pointing upward: thumb tip y is less than middle knuckle y and wrist y
    if (landmarks[4].y < landmarks[3].y && landmarks[4].y < wrist.y) {
      return 'GOOD';
    }
  }

  // 4. Thumb + index + pinky = I LOVE YOU
  if (thumbExtended && indexExtended && !middleExtended && !ringExtended && pinkyExtended) {
    return 'I LOVE YOU';
  }

  // 5. Index + middle = PEACE
  if (!ringExtended && !pinkyExtended && indexExtended && middleExtended) {
    return 'PEACE';
  }

  // 6. Index only = ONE
  if (!thumbExtended && indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
    return 'ONE';
  }

  // No match = show nothing
  return null;
}

/**
 * Smoothing tracker:
 * Keeps the last 10 frames.
 * Accepts a gesture only when at least 7 of 10 agree.
 * Adds to output only when it changes.
 * Stability = agreeing frames divided by 10 (never a fixed number).
 */
export class GestureSmoother {
  private history: (string | null)[] = [];
  private lastAcceptedGesture: string | null = null;

  public processFrame(rawGesture: string | null): {
    stability: number;
    acceptedGesture: string | null;
    isNewChange: boolean;
    candidateGesture: string | null;
    agreeingFrames: number;
  } {
    this.history.push(rawGesture);
    if (this.history.length > 10) {
      this.history.shift();
    }

    const counts: Record<string, number> = {};
    for (const g of this.history) {
      if (g !== null) {
        counts[g] = (counts[g] || 0) + 1;
      }
    }

    let candidateGesture: string | null = null;
    let maxCount = 0;
    for (const [g, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxCount = count;
        candidateGesture = g;
      }
    }

    // Stability is agreeing frames divided by 10 (e.g. 7/10 = 0.7)
    const stability = maxCount / 10;

    let acceptedGesture: string | null = null;
    let isNewChange = false;

    // Accept a gesture only when at least 7 of 10 agree
    if (maxCount >= 7 && candidateGesture) {
      acceptedGesture = candidateGesture;
      if (acceptedGesture !== this.lastAcceptedGesture) {
        this.lastAcceptedGesture = acceptedGesture;
        isNewChange = true;
      }
    }

    return {
      stability,
      acceptedGesture,
      isNewChange,
      candidateGesture,
      agreeingFrames: maxCount,
    };
  }

  public reset() {
    this.history = [];
    this.lastAcceptedGesture = null;
  }
}

/**
 * Draws the 21 landmarks and the hand connections on a canvas that exactly overlays the video.
 * Draws nothing when no hand is detected.
 */
export function drawHandLandmarks(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[] | null,
  width: number,
  height: number
) {
  ctx.clearRect(0, 0, width, height);

  // Draw nothing when no hand is detected
  if (!landmarks || landmarks.length < 21) {
    return;
  }

  // 1. Draw glowing skeletal bones
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#0ea5e9';
  ctx.shadowColor = '#38bdf8';
  ctx.shadowBlur = 10;

  for (const [i, j] of HAND_CONNECTIONS) {
    const p1 = landmarks[i];
    const p2 = landmarks[j];
    if (!p1 || !p2) continue;

    ctx.beginPath();
    ctx.moveTo(p1.x * width, p1.y * height);
    ctx.lineTo(p2.x * width, p2.y * height);
    ctx.stroke();
  }

  ctx.shadowBlur = 0;

  // 2. Draw 21 keypoint joints
  const tipIndices = new Set([4, 8, 12, 16, 20]);

  landmarks.forEach((p, index) => {
    const x = p.x * width;
    const y = p.y * height;
    const isTip = tipIndices.has(index);

    if (isTip) {
      // Fingertip (emerald highlight)
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, 2 * Math.PI);
      ctx.fillStyle = '#10b981';
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
