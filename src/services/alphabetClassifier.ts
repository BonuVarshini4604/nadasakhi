import { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { ASL_LETTER_POSES, REST_POSE } from './aslPoses';

export interface SamplePoint {
  letter: string;
  features: number[]; // 82 numbers for new normalized features (or 63 for legacy)
  timestamp?: number;
}

// 16 2D points normalized to [0, 1] relative to hand coordinate system
export interface MotionSample {
  letter: 'J' | 'Z';
  path: [number, number][]; // exactly 16 normalized points
  timestamp?: number;
}

export interface StoredTrainingData {
  stillSamples: SamplePoint[];
  motionSamples: MotionSample[];
}

export interface ConfusedPair {
  actual: string;
  predicted: string;
  count: number;
}

export interface AccuracyReport {
  overallAccuracy: number; // 0..100
  totalTestSamples: number;
  letterAccuracies: Record<string, { correct: number; total: number; percentage: number }>;
  confusedPairs: ConfusedPair[];
}

export interface OverlappingPair {
  letterA: string;
  letterB: string;
  avgInterDist: number;
  avgIntraA: number;
  avgIntraB: number;
  warningMessage: string;
}

export interface LetterThresholdInfo {
  threshold: number;
  meanDist: number;
  stdDist: number;
  sampleCount: number;
}

export interface ClassificationResult {
  letter: string; // The recognized letter, '?', or 'NEUTRAL'
  candidateLetter: string; // The winning letter before threshold rejection
  confidence: number; // 0..1 (weighted vote proportion)
  distance: number; // distance to nearest sample of winning letter
  threshold: number; // calculated threshold for this letter
  isUncertain: boolean; // true if distance > threshold or confidence < 0.7
  isNeutral: boolean; // true if winning class is NEUTRAL
  nearestNeighbors: { letter: string; distance: number; weight: number }[];
}

export const LETTERS_LIST = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J',
  'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T',
  'U', 'V', 'W', 'X', 'Y', 'Z'
];

export const MOTION_LETTERS = new Set(['J', 'Z']);

export const NEUTRAL_LABEL = 'NEUTRAL';

// All classes trainable for still recognition (A..Y except J, plus NEUTRAL)
export const STILL_CLASSES = [
  ...LETTERS_LIST.filter((l) => !MOTION_LETTERS.has(l)),
  NEUTRAL_LABEL
];

const STORAGE_KEY = 'sign_bridge_letter_samples_v3';
const LEGACY_STORAGE_KEY_V2 = 'sign_bridge_letter_samples_v2';
const LEGACY_STORAGE_KEY_V1 = 'sign_bridge_letter_samples_v1';

/**
 * Triplet definitions for finger joint angles (15 angles across 5 fingers)
 */
const FINGER_JOINT_TRIPLETS: [number, number, number][] = [
  // Thumb: CMC, MCP, IP
  [0, 1, 2], [1, 2, 3], [2, 3, 4],
  // Index: MCP, PIP, DIP
  [0, 5, 6], [5, 6, 7], [6, 7, 8],
  // Middle: MCP, PIP, DIP
  [0, 9, 10], [9, 10, 11], [10, 11, 12],
  // Ring: MCP, PIP, DIP
  [0, 13, 14], [13, 14, 15], [14, 15, 16],
  // Pinky: MCP, PIP, DIP
  [0, 17, 18], [17, 18, 19], [18, 19, 20]
];

/**
 * 2. BETTER FEATURES:
 * - wrist-relative (subtract wrist landmark 0)
 * - size-normalised (divide by wrist-to-middle-knuckle distance)
 * - left-hand mirroring (mirror x for left hands so both hands give same features)
 * - rotation normalisation (rotate in 2D so wrist-to-middle-knuckle vector points straight up)
 * - angle at every finger joint (15 angles between consecutive bone vectors)
 * - distance from each fingertip (8, 12, 16, 20) to thumb tip (4)
 * - combined into one 82-dimensional vector with sensible weights:
 *     coordinates (63): weight 1.0
 *     joint angles (15): weight 0.8
 *     fingertip-to-thumb distances (4): weight 1.5
 */
export function extractHandFeatures(
  landmarks: NormalizedLandmark[],
  isLeftHand: boolean = false
): number[] | null {
  if (!landmarks || landmarks.length < 21) return null;

  const wrist = landmarks[0];
  const middleMcp = landmarks[9];

  // 1. Mirrored coordinates relative to wrist
  const relPoints: [number, number, number][] = new Array(21);
  for (let i = 0; i < 21; i++) {
    const lm = landmarks[i];
    let rx = lm.x - wrist.x;
    if (isLeftHand) {
      rx = -rx; // Mirror x for left hands
    }
    const ry = lm.y - wrist.y;
    const rz = (lm.z || 0) - (wrist.z || 0);
    relPoints[i] = [rx, ry, rz];
  }

  // 2. Scale normalisation (distance from wrist 0 to middle MCP 9)
  const [mX, mY, mZ] = relPoints[9];
  const scale = Math.hypot(mX, mY, mZ);
  const safeScale = scale > 0.0001 ? scale : 1.0;

  for (let i = 0; i < 21; i++) {
    relPoints[i][0] /= safeScale;
    relPoints[i][1] /= safeScale;
    relPoints[i][2] /= safeScale;
  }

  // 3. Rotation normalisation:
  // Rotate so the wrist-to-middle-knuckle vector points straight up.
  // In screen coordinates, straight up is angle -PI/2 (or -90 deg, negative y).
  const scaledMx = relPoints[9][0];
  const scaledMy = relPoints[9][1];
  const currentAngle = Math.atan2(scaledMy, scaledMx);
  // Target angle is -Math.PI / 2
  const rotAngle = -Math.PI / 2 - currentAngle;
  const cosA = Math.cos(rotAngle);
  const sinA = Math.sin(rotAngle);

  const rotPoints: [number, number, number][] = new Array(21);
  for (let i = 0; i < 21; i++) {
    const [px, py, pz] = relPoints[i];
    const rrx = px * cosA - py * sinA;
    const rry = px * sinA + py * cosA;
    rotPoints[i] = [rrx, rry, pz];
  }

  // Combined feature array: 63 (coords) + 15 (angles) + 4 (thumb distances) = 82
  const features: number[] = new Array(82);

  // (a) Normalized coordinates (weight 1.0)
  for (let i = 0; i < 21; i++) {
    features[i * 3] = rotPoints[i][0];
    features[i * 3 + 1] = rotPoints[i][1];
    features[i * 3 + 2] = rotPoints[i][2];
  }

  // (b) Angle at every finger joint (15 angles, weight 0.8)
  const angleWeight = 0.8;
  for (let j = 0; j < FINGER_JOINT_TRIPLETS.length; j++) {
    const [a, b, c] = FINGER_JOINT_TRIPLETS[j];
    const pA = rotPoints[a];
    const pB = rotPoints[b];
    const pC = rotPoints[c];

    // Bone vector 1: B - A
    const uX = pB[0] - pA[0];
    const uY = pB[1] - pA[1];
    const uZ = pB[2] - pA[2];

    // Bone vector 2: C - B
    const vX = pC[0] - pB[0];
    const vY = pC[1] - pB[1];
    const vZ = pC[2] - pB[2];

    const dot = uX * vX + uY * vY + uZ * vZ;
    const magU = Math.hypot(uX, uY, uZ);
    const magV = Math.hypot(vX, vY, vZ);
    const cosAngle = Math.max(-1, Math.min(1, dot / (magU * magV + 1e-7)));
    const angleRad = Math.acos(cosAngle);

    features[63 + j] = angleRad * angleWeight;
  }

  // (c) Distance from each fingertip to thumb tip (4 distances, weight 1.5)
  // Thumb tip: 4. Fingertips: 8 (index), 12 (middle), 16 (ring), 20 (pinky)
  const thumbTip = rotPoints[4];
  const tipIndices = [8, 12, 16, 20];
  const thumbDistWeight = 1.5;

  for (let t = 0; t < tipIndices.length; t++) {
    const tip = rotPoints[tipIndices[t]];
    const d = Math.hypot(
      tip[0] - thumbTip[0],
      tip[1] - thumbTip[1],
      tip[2] - thumbTip[2]
    );
    features[78 + t] = d * thumbDistWeight;
  }

  return features;
}

/**
 * Euclidean distance supporting backward compatibility with legacy 63-feature vectors.
 */
export function euclideanDistance(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 9999;
  let sum = 0;
  for (let i = 0; i < len; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  // If comparing a legacy 63-feature sample with an 82-feature query, scale up to match distance space
  const maxLen = Math.max(a.length, b.length);
  const scale = maxLen > len ? Math.sqrt(maxLen / len) : 1.0;
  return Math.sqrt(sum) * scale;
}

/**
 * 1. Calculate per-letter thresholds from training samples:
 * mean nearest-neighbour distance within that letter plus 2 standard deviations.
 */
export function calculateLetterThresholds(
  samples: SamplePoint[]
): Record<string, LetterThresholdInfo> {
  const byLetter: Record<string, SamplePoint[]> = {};
  for (const s of samples) {
    if (MOTION_LETTERS.has(s.letter)) continue;
    if (!byLetter[s.letter]) byLetter[s.letter] = [];
    byLetter[s.letter].push(s);
  }

  const results: Record<string, LetterThresholdInfo> = {};
  const allNearestDistances: number[] = [];

  for (const [, list] of Object.entries(byLetter)) {
    if (list.length >= 2) {
      for (let i = 0; i < list.length; i++) {
        let minDist = Infinity;
        for (let j = 0; j < list.length; j++) {
          if (i === j) continue;
          const d = euclideanDistance(list[i].features, list[j].features);
          if (d < minDist) minDist = d;
        }
        if (minDist < Infinity) allNearestDistances.push(minDist);
      }
    }
  }

  const globalMean = allNearestDistances.length > 0 
    ? allNearestDistances.reduce((a, b) => a + b, 0) / allNearestDistances.length 
    : 0.65;
  const globalStd = allNearestDistances.length > 0
    ? Math.sqrt(allNearestDistances.reduce((a, b) => a + (b - globalMean) ** 2, 0) / allNearestDistances.length)
    : 0.15;
  const fallbackThreshold = Math.max(0.60, globalMean + 2 * globalStd);

  for (const [letter, list] of Object.entries(byLetter)) {
    if (list.length < 2) {
      results[letter] = {
        threshold: fallbackThreshold,
        meanDist: globalMean,
        stdDist: globalStd,
        sampleCount: list.length,
      };
      continue;
    }

    const nnDists: number[] = [];
    for (let i = 0; i < list.length; i++) {
      let minDist = Infinity;
      for (let j = 0; j < list.length; j++) {
        if (i === j) continue;
        const d = euclideanDistance(list[i].features, list[j].features);
        if (d < minDist) minDist = d;
      }
      nnDists.push(minDist);
    }

    const mean = nnDists.reduce((a, b) => a + b, 0) / nnDists.length;
    const variance = nnDists.reduce((a, b) => a + (b - mean) ** 2, 0) / nnDists.length;
    const std = Math.sqrt(variance);
    // Mean nearest-neighbour distance within that letter plus 2 standard deviations
    const threshold = Math.max(0.50, mean + 2 * std);

    results[letter] = {
      threshold,
      meanDist: mean,
      stdDist: std,
      sampleCount: list.length,
    };
  }

  return results;
}

/**
 * 3. WEIGHTED VOTING & REJECT UNCERTAIN GUESSES:
 * k = 5 with votes weighted by 1 / distance.
 * Compute distance to nearest sample of the winning letter.
 * If distance > per-letter threshold OR confidence < 0.7:
 * show "?" and mark uncertain (add nothing to word).
 * If NEUTRAL class wins:
 * mark neutral (show "Ready" and add nothing).
 */
export function classifyKnn(
  queryFeatures: number[],
  trainingData: SamplePoint[],
  k: number = 5,
  cachedThresholds?: Record<string, LetterThresholdInfo>
): ClassificationResult | null {
  const validData = trainingData.filter((s) => !MOTION_LETTERS.has(s.letter));
  if (validData.length === 0) return null;

  const actualK = Math.min(k, validData.length);
  if (actualK <= 0) return null;

  const distances = validData.map((sample) => ({
    letter: sample.letter,
    distance: euclideanDistance(queryFeatures, sample.features),
  }));

  distances.sort((a, b) => a.distance - b.distance);
  const topK = distances.slice(0, actualK);

  // Weighted voting by 1 / (distance + 1e-5)
  const votes: Record<string, number> = {};
  let totalWeight = 0;

  const neighborsWithWeights = topK.map((item) => {
    const weight = 1 / (item.distance + 1e-5);
    votes[item.letter] = (votes[item.letter] || 0) + weight;
    totalWeight += weight;
    return { letter: item.letter, distance: item.distance, weight };
  });

  let winningLetter = '';
  let maxWeight = 0;
  for (const [letter, w] of Object.entries(votes)) {
    if (w > maxWeight) {
      maxWeight = w;
      winningLetter = letter;
    }
  }

  const confidence = totalWeight > 0 ? maxWeight / totalWeight : 0;

  // Distance to the nearest sample of the winning letter
  let minDistToWinningLetter = Infinity;
  for (const sample of validData) {
    if (sample.letter === winningLetter) {
      const d = euclideanDistance(queryFeatures, sample.features);
      if (d < minDistToWinningLetter) {
        minDistToWinningLetter = d;
      }
    }
  }
  if (minDistToWinningLetter === Infinity) {
    minDistToWinningLetter = topK[0]?.distance || 1.0;
  }

  // Get or compute per-letter threshold
  const thresholds = cachedThresholds || calculateLetterThresholds(trainingData);
  const letterThreshInfo = thresholds[winningLetter];
  const threshold = letterThreshInfo ? letterThreshInfo.threshold : 0.85;

  const isNeutral = winningLetter === NEUTRAL_LABEL;
  // If distance > threshold OR confidence < 0.7: show "?" and mark uncertain
  const isUncertain = minDistToWinningLetter > threshold || confidence < 0.7;

  let displayLetter = winningLetter;
  if (isUncertain) {
    displayLetter = '?';
  } else if (isNeutral) {
    displayLetter = NEUTRAL_LABEL;
  }

  return {
    letter: displayLetter,
    candidateLetter: winningLetter,
    confidence,
    distance: minDistToWinningLetter,
    threshold,
    isUncertain,
    isNeutral,
    nearestNeighbors: neighborsWithWeights,
  };
}

/**
 * 6. TRAINING QUALITY CHECKS:
 * Overlap detector: Finds pairs of letters whose inter-class average distance
 * is below or close to their intra-class average distance.
 */
export function detectOverlappingLetters(
  samples: SamplePoint[]
): OverlappingPair[] {
  const stillSamples = samples.filter((s) => !MOTION_LETTERS.has(s.letter));
  const byLetter: Record<string, SamplePoint[]> = {};
  for (const s of stillSamples) {
    if (!byLetter[s.letter]) byLetter[s.letter] = [];
    byLetter[s.letter].push(s);
  }

  const letters = Object.keys(byLetter).filter((l) => byLetter[l].length >= 3);
  const intraDist: Record<string, number> = {};

  // Compute intra-class avg distance
  for (const l of letters) {
    const list = byLetter[l];
    let sum = 0;
    let count = 0;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        sum += euclideanDistance(list[i].features, list[j].features);
        count++;
      }
    }
    intraDist[l] = count > 0 ? sum / count : 0.4;
  }

  const overlaps: OverlappingPair[] = [];

  for (let i = 0; i < letters.length; i++) {
    for (let j = i + 1; j < letters.length; j++) {
      const lA = letters[i];
      const lB = letters[j];
      const listA = byLetter[lA];
      const listB = byLetter[lB];

      let sum = 0;
      let count = 0;
      for (const sA of listA) {
        for (const sB of listB) {
          sum += euclideanDistance(sA.features, sB.features);
          count++;
        }
      }
      const interAvg = count > 0 ? sum / count : 1.0;
      const benchmark = Math.max(intraDist[lA], intraDist[lB]) * 1.15;

      if (interAvg < benchmark) {
        overlaps.push({
          letterA: lA,
          letterB: lB,
          avgInterDist: Math.round(interAvg * 100) / 100,
          avgIntraA: Math.round(intraDist[lA] * 100) / 100,
          avgIntraB: Math.round(intraDist[lB] * 100) / 100,
          warningMessage: `High overlap between ${lA === NEUTRAL_LABEL ? 'Neutral' : lA} and ${lB === NEUTRAL_LABEL ? 'Neutral' : lB} (avg distance: ${interAvg.toFixed(2)}). Record distinct hand angles.`
        });
      }
    }
  }

  return overlaps;
}

/**
 * 7. LIVE FEEDBACK while recording:
 * Checks if the hand is fully in view, properly sized, and steady.
 * Red if cut off by frame, too small, or blurry/moving.
 */
export function checkHandQuality(
  landmarks: NormalizedLandmark[] | null,
  prevLandmarks: NormalizedLandmark[] | null
): {
  isGood: boolean;
  ringColor: 'green' | 'red';
  reason: string;
  movement: number;
  isStill: boolean;
  scale: number;
} {
  if (!landmarks || landmarks.length < 21) {
    return {
      isGood: false,
      ringColor: 'red',
      reason: 'No hand detected',
      movement: 0,
      isStill: false,
      scale: 0,
    };
  }

  // 1. Fully in view: check if any landmark touches edge
  const edgeMargin = 0.04;
  for (let i = 0; i < 21; i++) {
    const lm = landmarks[i];
    if (
      lm.x < edgeMargin || lm.x > 1 - edgeMargin ||
      lm.y < edgeMargin || lm.y > 1 - edgeMargin
    ) {
      return {
        isGood: false,
        ringColor: 'red',
        reason: 'Hand is cut off by frame edge (move hand inward)',
        movement: 0,
        isStill: false,
        scale: 0,
      };
    }
  }

  // 2. Hand size check (distance from wrist 0 to middle MCP 9)
  const wrist = landmarks[0];
  const middleMcp = landmarks[9];
  const scale = Math.hypot(middleMcp.x - wrist.x, middleMcp.y - wrist.y);

  if (scale < 0.11) {
    return {
      isGood: false,
      ringColor: 'red',
      reason: 'Hand too small / too far (move closer to camera)',
      movement: 0,
      isStill: false,
      scale,
    };
  }

  if (scale > 0.82) {
    return {
      isGood: false,
      ringColor: 'red',
      reason: 'Hand too close to camera (move slightly back)',
      movement: 0,
      isStill: false,
      scale,
    };
  }

  // 3. Movement / Stillness check
  // Average displacement of 5 fingertips (4, 8, 12, 16, 20)
  let movement = 0;
  if (prevLandmarks && prevLandmarks.length >= 21) {
    const tipIndices = [4, 8, 12, 16, 20];
    let sumDisp = 0;
    for (const idx of tipIndices) {
      const p1 = landmarks[idx];
      const p2 = prevLandmarks[idx];
      sumDisp += Math.hypot(p1.x - p2.x, p1.y - p2.y);
    }
    movement = sumDisp / tipIndices.length;
  }

  const isStill = movement <= 0.032;

  if (!isStill) {
    return {
      isGood: false,
      ringColor: 'red',
      reason: 'Hand is moving / blurry (hold hand steady)',
      movement,
      isStill: false,
      scale,
    };
  }

  return {
    isGood: true,
    ringColor: 'green',
    reason: 'Hand is in view & steady',
    movement,
    isStill: true,
    scale,
  };
}

/**
 * Normalises and resamples a raw 2D point path to exactly 16 points.
 */
export function resampleAndNormalizePath(
  rawPoints: [number, number][],
  targetCount: number = 16
): [number, number][] {
  if (rawPoints.length === 0) {
    return Array.from({ length: targetCount }, () => [0, 0]);
  }
  if (rawPoints.length === 1) {
    return Array.from({ length: targetCount }, () => [rawPoints[0][0], rawPoints[0][1]]);
  }

  const cumLengths: number[] = [0];
  let totalLength = 0;
  for (let i = 1; i < rawPoints.length; i++) {
    const d = Math.hypot(
      rawPoints[i][0] - rawPoints[i - 1][0],
      rawPoints[i][1] - rawPoints[i - 1][1]
    );
    totalLength += d;
    cumLengths.push(totalLength);
  }

  const resampled: [number, number][] = [];

  if (totalLength <= 0.00001) {
    for (let i = 0; i < targetCount; i++) {
      resampled.push([rawPoints[0][0], rawPoints[0][1]]);
    }
  } else {
    for (let i = 0; i < targetCount; i++) {
      const targetDist = (i / (targetCount - 1)) * totalLength;

      let segIdx = 0;
      while (segIdx < cumLengths.length - 2 && cumLengths[segIdx + 1] < targetDist) {
        segIdx++;
      }

      const p0 = rawPoints[segIdx];
      const p1 = rawPoints[segIdx + 1] || p0;
      const segSpan = cumLengths[segIdx + 1] - cumLengths[segIdx];
      const t = segSpan > 0.00001 ? (targetDist - cumLengths[segIdx]) / segSpan : 0;

      const rx = p0[0] + (p1[0] - p0[0]) * t;
      const ry = p0[1] + (p1[1] - p0[1]) * t;
      resampled.push([rx, ry]);
    }
  }

  return resampled;
}

export function motionPathDistance(p1: [number, number][], p2: [number, number][]): number {
  if (!p1 || !p2 || p1.length === 0 || p2.length === 0) return 9999;
  const n = Math.min(p1.length, p2.length);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const dx = p1[i][0] - p2[i][0];
    const dy = p1[i][1] - p2[i][1];
    sum += Math.hypot(dx, dy);
  }
  return sum / n;
}

export function calculateMotionThreshold(samples: MotionSample[], letter: 'J' | 'Z'): number {
  const letterSamples = samples.filter((s) => s.letter === letter);
  if (letterSamples.length < 2) return 0.65;

  let totalDist = 0;
  let count = 0;
  for (let i = 0; i < letterSamples.length; i++) {
    for (let j = i + 1; j < letterSamples.length; j++) {
      totalDist += motionPathDistance(letterSamples[i].path, letterSamples[j].path);
      count++;
    }
  }

  if (count === 0) return 0.65;
  const avg = totalDist / count;
  return Math.min(0.9, Math.max(0.4, avg * 1.4));
}

export function matchMotionSample(
  candidatePath: [number, number][],
  trainingMotions: MotionSample[]
): { letter: 'J' | 'Z'; distance: number; threshold: number } | null {
  if (trainingMotions.length === 0 || candidatePath.length < 16) return null;

  let bestMatch: { letter: 'J' | 'Z'; distance: number; threshold: number } | null = null;

  for (const letter of (['J', 'Z'] as const)) {
    const subset = trainingMotions.filter((m) => m.letter === letter);
    if (subset.length === 0) continue;

    let minD = 9999;
    for (const s of subset) {
      const d = motionPathDistance(candidatePath, s.path);
      if (d < minD) minD = d;
    }

    const thresh = calculateMotionThreshold(trainingMotions, letter);
    if (minD < thresh) {
      if (!bestMatch || minD < bestMatch.distance) {
        bestMatch = { letter, distance: minD, threshold: thresh };
      }
    }
  }

  return bestMatch;
}

export function generateSeedMotionSamples(): MotionSample[] {
  const seeds: MotionSample[] = [];

  const jPathBase: [number, number][] = [];
  for (let i = 0; i < 16; i++) {
    const t = i / 15;
    if (t < 0.6) {
      jPathBase.push([0.2, (t / 0.6) * 0.8]);
    } else {
      const angle = ((t - 0.6) / 0.4) * Math.PI;
      const x = 0.2 - Math.sin(angle) * 0.35;
      const y = 0.8 - Math.cos(angle) * 0.2 + 0.2;
      jPathBase.push([x, y]);
    }
  }
  seeds.push({ letter: 'J', path: resampleAndNormalizePath(jPathBase), timestamp: Date.now() });

  for (let v = 1; v <= 7; v++) {
    const jittered = jPathBase.map(([x, y]) => [
      x + (Math.sin(v) * 0.03),
      y + (Math.cos(v) * 0.03)
    ] as [number, number]);
    seeds.push({ letter: 'J', path: resampleAndNormalizePath(jittered), timestamp: Date.now() });
  }

  const zPathBase: [number, number][] = [];
  for (let i = 0; i < 16; i++) {
    const t = i / 15;
    if (t < 0.33) {
      zPathBase.push([(t / 0.33) * 0.8, -0.6]);
    } else if (t < 0.66) {
      const p = (t - 0.33) / 0.33;
      zPathBase.push([0.8 * (1 - p), -0.6 + p * 0.9]);
    } else {
      const p = (t - 0.66) / 0.34;
      zPathBase.push([p * 0.8, 0.3]);
    }
  }
  seeds.push({ letter: 'Z', path: resampleAndNormalizePath(zPathBase), timestamp: Date.now() });

  for (let v = 1; v <= 7; v++) {
    const jittered = zPathBase.map(([x, y]) => [
      x + (Math.sin(v * 1.5) * 0.03),
      y + (Math.cos(v * 1.5) * 0.03)
    ] as [number, number]);
    seeds.push({ letter: 'Z', path: resampleAndNormalizePath(jittered), timestamp: Date.now() });
  }

  return seeds;
}

/**
 * Seed initial baseline samples for still letters (A to Y except J) plus NEUTRAL class
 */
export function generateSeedStillSamples(): SamplePoint[] {
  const seeds: SamplePoint[] = [];

  for (const letter of LETTERS_LIST) {
    if (MOTION_LETTERS.has(letter)) continue;
    const pose = ASL_LETTER_POSES[letter];
    if (pose) {
      const feat = extractHandFeatures(pose, false);
      if (feat) {
        seeds.push({ letter, features: feat, timestamp: Date.now() });
        for (let v = 0; v < 4; v++) {
          const jitter = feat.map((val, idx) => {
            const factor = ((idx % 3 === 0 ? 0.008 : 0.006) * (v - 1.5));
            return val + factor;
          });
          seeds.push({ letter, features: jitter, timestamp: Date.now() });
        }
      }
    }
  }

  // 5. NEUTRAL CLASS seeds: relaxed open hand, hand mid-transition, hand at rest
  if (REST_POSE) {
    const neutralFeat = extractHandFeatures(REST_POSE, false);
    if (neutralFeat) {
      seeds.push({ letter: NEUTRAL_LABEL, features: neutralFeat, timestamp: Date.now() });
      for (let v = 0; v < 6; v++) {
        const jitter = neutralFeat.map((val, idx) => {
          const factor = ((idx % 2 === 0 ? 0.012 : -0.01) * (v - 2.5));
          return val + factor;
        });
        seeds.push({ letter: NEUTRAL_LABEL, features: jitter, timestamp: Date.now() });
      }
    }
  }

  return seeds;
}

/**
 * 6. Test Accuracy with 5-fold holdout:
 * Holds out every 5th sample, tests with remaining samples using weighted k-NN,
 * records confusion pairs and per-letter stats.
 */
export function evaluateHeldOutAccuracy(
  samples: SamplePoint[],
  k: number = 5
): AccuracyReport | null {
  const stillSamples = samples.filter((s) => !MOTION_LETTERS.has(s.letter));
  if (stillSamples.length < 5) return null;

  const byLetter: Record<string, SamplePoint[]> = {};
  for (const s of stillSamples) {
    if (!byLetter[s.letter]) byLetter[s.letter] = [];
    byLetter[s.letter].push(s);
  }

  const trainSet: SamplePoint[] = [];
  const testSet: SamplePoint[] = [];

  for (const letter of Object.keys(byLetter)) {
    const list = byLetter[letter];
    list.forEach((item, index) => {
      if ((index + 1) % 5 === 0) {
        testSet.push(item);
      } else {
        trainSet.push(item);
      }
    });
  }

  if (testSet.length === 0 || trainSet.length === 0) {
    return null;
  }

  const trainThresholds = calculateLetterThresholds(trainSet);

  let totalCorrect = 0;
  const letterStats: Record<string, { correct: number; total: number; percentage: number }> = {};
  const confusionMap: Record<string, number> = {};

  for (const testSample of testSet) {
    const actual = testSample.letter;
    if (!letterStats[actual]) {
      letterStats[actual] = { correct: 0, total: 0, percentage: 0 };
    }
    letterStats[actual].total++;

    const pred = classifyKnn(testSample.features, trainSet, k, trainThresholds);
    const predictedLetter = pred?.candidateLetter || '?';

    if (predictedLetter === actual && !pred?.isUncertain) {
      letterStats[actual].correct++;
      totalCorrect++;
    } else {
      const predName = predictedLetter === NEUTRAL_LABEL ? 'Neutral' : predictedLetter;
      const actualName = actual === NEUTRAL_LABEL ? 'Neutral' : actual;
      const key = `${actualName} is confused with ${predName}`;
      confusionMap[key] = (confusionMap[key] || 0) + 1;
    }
  }

  for (const l of Object.keys(letterStats)) {
    const stat = letterStats[l];
    stat.percentage = stat.total > 0 ? Math.round((stat.correct / stat.total) * 100) : 0;
  }

  const confusedPairs: ConfusedPair[] = Object.entries(confusionMap)
    .map(([key, count]) => {
      const parts = key.split(' is confused with ');
      return { actual: parts[0] || key, predicted: parts[1] || '?', count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const overallAccuracy = Math.round((totalCorrect / testSet.length) * 1000) / 10;

  return {
    overallAccuracy,
    totalTestSamples: testSet.length,
    letterAccuracies: letterStats,
    confusedPairs,
  };
}

let inMemoryData: StoredTrainingData | null = null;

export function loadStoredData(): StoredTrainingData {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      const parsed = JSON.parse(data);
      if (parsed && Array.isArray(parsed.stillSamples)) {
        inMemoryData = parsed;
        return parsed;
      }
    }

    // Check legacy v2 storage
    const legacyV2 = localStorage.getItem(LEGACY_STORAGE_KEY_V2);
    if (legacyV2) {
      const parsed = JSON.parse(legacyV2);
      if (parsed && Array.isArray(parsed.stillSamples)) {
        inMemoryData = parsed;
        saveStoredData(parsed);
        return parsed;
      }
    }

    // Check legacy v1 storage
    const legacyV1 = localStorage.getItem(LEGACY_STORAGE_KEY_V1);
    if (legacyV1) {
      const parsedLegacy = JSON.parse(legacyV1);
      if (Array.isArray(parsedLegacy) && parsedLegacy.length > 0) {
        const migrated: StoredTrainingData = {
          stillSamples: parsedLegacy,
          motionSamples: generateSeedMotionSamples(),
        };
        saveStoredData(migrated);
        return migrated;
      }
    }
  } catch (err) {
    console.warn('localStorage read error, falling back to memory:', err);
  }

  if (inMemoryData) {
    return inMemoryData;
  }

  const initial: StoredTrainingData = {
    stillSamples: generateSeedStillSamples(),
    motionSamples: generateSeedMotionSamples(),
  };
  saveStoredData(initial);
  return initial;
}

export function saveStoredData(data: StoredTrainingData): boolean {
  inMemoryData = data;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (err) {
    console.warn('localStorage save failed (blocked or full), stored in memory:', err);
    return false;
  }
}

/**
 * 9. Retrain from scratch: resets all samples to fresh baseline seeds
 */
export function retrainFromScratch(): StoredTrainingData {
  const fresh: StoredTrainingData = {
    stillSamples: generateSeedStillSamples(),
    motionSamples: generateSeedMotionSamples(),
  };
  saveStoredData(fresh);
  return fresh;
}

/**
 * 4. STRICT CONFIRMATION:
 * - Accept a letter only when 9 of the last 12 frames agree,
 * - confidence is at least 0.7,
 * - hand has been still for 0.8 seconds (ignore frames while hand is moving between signs).
 * - After adding a letter, require hand to drop out of frame or change to different letter,
 *   or wait 1.5 seconds for a repeated letter.
 * - If NEUTRAL class wins, show "Ready" and add nothing.
 * - If uncertain ("?"), show "?" and add nothing.
 */
export class LetterSmoother {
  private history: (string | null)[] = []; // buffer of last 12 frames
  private currentHeldLetter: string | null = null;
  private heldStartTime: number = 0;
  private lastConfirmedLetter: string | null = null;
  private lastConfirmedTime: number = 0;
  private handWasAbsent: boolean = true;
  private stillStartTime: number = 0;

  public processFrame(
    classification: ClassificationResult | null,
    isHandStill: boolean,
    now: number
  ): {
    stability: number;
    candidateLetter: string | null;
    displayLetter: string;
    confirmedLetter: string | null;
    isNewConfirmed: boolean;
    confidence: number;
    distance: number;
    threshold: number;
    heldProgress: number; // 0..1
    isStill: boolean;
  } {
    if (!classification) {
      this.history.push(null);
      if (this.history.length > 12) this.history.shift();

      this.handWasAbsent = true;
      this.currentHeldLetter = null;
      this.heldStartTime = 0;
      this.stillStartTime = 0;

      return {
        stability: 0,
        candidateLetter: null,
        displayLetter: 'No hand detected',
        confirmedLetter: null,
        isNewConfirmed: false,
        confidence: 0,
        distance: 0,
        threshold: 0,
        heldProgress: 0,
        isStill: false,
      };
    }

    // Hand is present
    const rawChar = classification.letter; // '?', 'NEUTRAL', or 'A'..'Y'
    this.history.push(rawChar);
    if (this.history.length > 12) this.history.shift();

    // Stillness timer tracking
    if (isHandStill) {
      if (this.stillStartTime === 0) {
        this.stillStartTime = now;
      }
    } else {
      // Hand is moving between signs -> reset stillness and hold timer
      this.stillStartTime = 0;
      this.heldStartTime = 0;
    }

    const stillDuration = this.stillStartTime > 0 ? now - this.stillStartTime : 0;
    const isStillEnough = isHandStill && stillDuration >= 800; // still for 0.8s

    // Count votes in last 12 frames
    const counts: Record<string, number> = {};
    for (const item of this.history) {
      if (item) counts[item] = (counts[item] || 0) + 1;
    }

    let topLetter: string | null = null;
    let maxCount = 0;
    for (const [l, c] of Object.entries(counts)) {
      if (c > maxCount) {
        maxCount = c;
        topLetter = l;
      }
    }

    const stability = maxCount / 12;
    // 9 of the last 12 frames must agree
    const agreeNine = maxCount >= 9 && topLetter !== null;

    let confirmedLetter: string | null = null;
    let isNewConfirmed = false;
    let heldProgress = Math.min(1, stillDuration / 800);

    // If NEUTRAL class won, show "Ready" and add nothing
    if (topLetter === NEUTRAL_LABEL) {
      this.currentHeldLetter = null;
      this.heldStartTime = 0;
      return {
        stability,
        candidateLetter: NEUTRAL_LABEL,
        displayLetter: 'Ready',
        confirmedLetter: null,
        isNewConfirmed: false,
        confidence: classification.confidence,
        distance: classification.distance,
        threshold: classification.threshold,
        heldProgress: 0,
        isStill: isHandStill,
      };
    }

    // If uncertain ("?"), show "?" and add nothing
    if (topLetter === '?') {
      this.currentHeldLetter = null;
      this.heldStartTime = 0;
      return {
        stability,
        candidateLetter: classification.candidateLetter,
        displayLetter: '?',
        confirmedLetter: null,
        isNewConfirmed: false,
        confidence: classification.confidence,
        distance: classification.distance,
        threshold: classification.threshold,
        heldProgress: 0,
        isStill: isHandStill,
      };
    }

    // Valid real letter candidate
    if (agreeNine && topLetter && classification.confidence >= 0.7 && isHandStill) {
      if (this.currentHeldLetter === topLetter) {
        if (isStillEnough) {
          const isSameAsLast = topLetter === this.lastConfirmedLetter;
          const timeSinceLast = now - this.lastConfirmedTime;
          const canRepeat = this.handWasAbsent || timeSinceLast >= 1500;

          if (!isSameAsLast || canRepeat) {
            confirmedLetter = topLetter;
            isNewConfirmed = true;
            this.lastConfirmedLetter = topLetter;
            this.lastConfirmedTime = now;
            this.handWasAbsent = false;
            // Reset hold so we require transition or 1.5s
            this.heldStartTime = now;
            this.stillStartTime = now;
          }
        }
      } else {
        this.currentHeldLetter = topLetter;
        this.heldStartTime = now;
      }
    } else {
      this.currentHeldLetter = null;
      this.heldStartTime = 0;
    }

    return {
      stability,
      candidateLetter: topLetter || classification.candidateLetter,
      displayLetter: topLetter || classification.letter,
      confirmedLetter,
      isNewConfirmed,
      confidence: classification.confidence,
      distance: classification.distance,
      threshold: classification.threshold,
      heldProgress,
      isStill: isHandStill,
    };
  }

  public confirmMotionLetter(letter: string, now: number): boolean {
    const isSameAsLast = letter === this.lastConfirmedLetter;
    const timeSinceLast = now - this.lastConfirmedTime;
    const canRepeat = this.handWasAbsent || timeSinceLast >= 1500;

    if (!isSameAsLast || canRepeat) {
      this.lastConfirmedLetter = letter;
      this.lastConfirmedTime = now;
      this.handWasAbsent = false;
      return true;
    }
    return false;
  }

  public reset() {
    this.history = [];
    this.currentHeldLetter = null;
    this.heldStartTime = 0;
    this.lastConfirmedLetter = null;
    this.lastConfirmedTime = 0;
    this.handWasAbsent = true;
    this.stillStartTime = 0;
  }
}
