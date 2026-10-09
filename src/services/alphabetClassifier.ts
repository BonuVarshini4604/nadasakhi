import { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { ASL_LETTER_POSES } from './aslPoses';

export interface SamplePoint {
  letter: string;
  features: number[]; // 63 numbers
  timestamp?: number;
}

export interface AccuracyReport {
  overallAccuracy: number; // 0..100
  totalTestSamples: number;
  letterAccuracies: Record<string, { correct: number; total: number; percentage: number }>;
}

export const LETTERS_LIST = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J',
  'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T',
  'U', 'V', 'W', 'X', 'Y', 'Z'
];

export const MOTION_LETTERS = new Set(['J', 'Z']);

const STORAGE_KEY = 'sign_bridge_letter_samples_v1';

/**
 * Extracts normalized 63-dimensional feature vector from 21 hand landmarks:
 * 1. Subtract the wrist position (landmarks[0])
 * 2. Divide by the Euclidean distance from wrist (0) to middle-finger knuckle (landmark 9, MCP)
 * 3. If hand is left hand, mirror x so both hands give the same features.
 * 4. Flatten x, y, z into 63 numbers.
 */
export function extractHandFeatures(
  landmarks: NormalizedLandmark[],
  isLeftHand: boolean = false
): number[] | null {
  if (!landmarks || landmarks.length < 21) return null;

  const wrist = landmarks[0];
  const middleMcp = landmarks[9];

  // Euclidean distance from wrist to middle knuckle
  const dx = middleMcp.x - wrist.x;
  const dy = middleMcp.y - wrist.y;
  const dz = (middleMcp.z || 0) - (wrist.z || 0);
  const scale = Math.hypot(dx, dy, dz);

  // Avoid division by zero
  const safeScale = scale > 0.00001 ? scale : 1.0;

  const features: number[] = new Array(63);

  for (let i = 0; i < 21; i++) {
    const lm = landmarks[i];
    let relX = (lm.x - wrist.x) / safeScale;
    const relY = (lm.y - wrist.y) / safeScale;
    const relZ = ((lm.z || 0) - (wrist.z || 0)) / safeScale;

    // If the hand is a left hand, mirror x so both hands give the same features
    if (isLeftHand) {
      relX = -relX;
    }

    features[i * 3] = relX;
    features[i * 3 + 1] = relY;
    features[i * 3 + 2] = relZ;
  }

  return features;
}

/**
 * Computes Euclidean distance between two 63-dim feature vectors
 */
export function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < 63; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/**
 * Seed initial baseline samples from existing standard ASL poses (A..Z)
 * so the user can immediately try letter recognition even before recording custom samples.
 */
export function generateSeedSamples(): SamplePoint[] {
  const seeds: SamplePoint[] = [];
  for (const letter of LETTERS_LIST) {
    if (MOTION_LETTERS.has(letter)) continue;
    const pose = ASL_LETTER_POSES[letter];
    if (pose) {
      const feat = extractHandFeatures(pose, false);
      if (feat) {
        // Add 5 slight variations of baseline pose to make k-NN robust
        seeds.push({ letter, features: feat, timestamp: Date.now() });
        for (let v = 0; v < 4; v++) {
          const jitter = feat.map((val, idx) => {
            // subtle jitter on z or fingertip positions
            const factor = ((idx % 3 === 0 ? 0.01 : 0.008) * (v - 1.5));
            return val + factor;
          });
          seeds.push({ letter, features: jitter, timestamp: Date.now() });
        }
      }
    }
  }
  return seeds;
}

/**
 * k-Nearest-Neighbours Classifier (k = 5, Euclidean distance)
 * Returns the winning letter and confidence (share of 5 nearest neighbours voting for it).
 */
export function classifyKnn(
  queryFeatures: number[],
  trainingData: SamplePoint[],
  k: number = 5
): { letter: string; confidence: number; nearestCount: number } | null {
  if (trainingData.length === 0) return null;

  const actualK = Math.min(k, trainingData.length);
  if (actualK <= 0) return null;

  // Calculate distance to every training sample
  const distances = trainingData.map((sample) => ({
    letter: sample.letter,
    distance: euclideanDistance(queryFeatures, sample.features),
  }));

  // Sort ascending by distance
  distances.sort((a, b) => a.distance - b.distance);

  // Take top k
  const topK = distances.slice(0, actualK);

  // Count votes
  const votes: Record<string, number> = {};
  for (const item of topK) {
    votes[item.letter] = (votes[item.letter] || 0) + 1;
  }

  let bestLetter = '';
  let maxVotes = 0;
  for (const [letter, count] of Object.entries(votes)) {
    if (count > maxVotes) {
      maxVotes = count;
      bestLetter = letter;
    }
  }

  const confidence = maxVotes / actualK;

  return {
    letter: bestLetter,
    confidence,
    nearestCount: actualK,
  };
}

/**
 * Held-out test accuracy:
 * Holds out every 5th sample (indices 4, 9, 14, ...) of each letter,
 * classifies it against the remaining 4/5 samples,
 * and computes overall and per-letter accuracy percentages.
 */
export function evaluateHeldOutAccuracy(samples: SamplePoint[], k: number = 5): AccuracyReport | null {
  if (samples.length < 5) return null;

  // Group samples by letter
  const byLetter: Record<string, SamplePoint[]> = {};
  for (const s of samples) {
    if (!byLetter[s.letter]) byLetter[s.letter] = [];
    byLetter[s.letter].push(s);
  }

  const trainSet: SamplePoint[] = [];
  const testSet: SamplePoint[] = [];

  for (const letter of Object.keys(byLetter)) {
    const list = byLetter[letter];
    list.forEach((item, index) => {
      // Every 5th sample (index % 5 === 4) is held out for testing
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

  let totalCorrect = 0;
  const letterStats: Record<string, { correct: number; total: number; percentage: number }> = {};

  for (const testSample of testSet) {
    const l = testSample.letter;
    if (!letterStats[l]) {
      letterStats[l] = { correct: 0, total: 0, percentage: 0 };
    }
    letterStats[l].total++;

    const pred = classifyKnn(testSample.features, trainSet, k);
    if (pred && pred.letter === l) {
      letterStats[l].correct++;
      totalCorrect++;
    }
  }

  for (const l of Object.keys(letterStats)) {
    const stat = letterStats[l];
    stat.percentage = stat.total > 0 ? Math.round((stat.correct / stat.total) * 100) : 0;
  }

  const overallAccuracy = Math.round((totalCorrect / testSet.length) * 1000) / 10;

  return {
    overallAccuracy,
    totalTestSamples: testSet.length,
    letterAccuracies: letterStats,
  };
}

/**
 * Storage helpers with fallback to memory
 */
let inMemorySamples: SamplePoint[] | null = null;

export function loadStoredSamples(): SamplePoint[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length > 0) {
        inMemorySamples = parsed;
        return parsed;
      }
    }
  } catch (err) {
    console.warn('localStorage read error, falling back to memory:', err);
  }

  if (inMemorySamples && inMemorySamples.length > 0) {
    return inMemorySamples;
  }

  // Generate seed baseline if empty
  const seeds = generateSeedSamples();
  saveStoredSamples(seeds);
  return seeds;
}

export function saveStoredSamples(samples: SamplePoint[]): boolean {
  inMemorySamples = samples;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(samples));
    return true;
  } catch (err) {
    console.warn('localStorage save failed (blocked or full), stored in memory:', err);
    return false;
  }
}

/**
 * Smoother specifically for Letters mode according to rules:
 * - Accept a letter only when confidence >= 0.6 AND at least 7 of last 10 frames agree
 * - Held for 0.8 seconds (800ms)
 * - Add the letter to output only when it changes
 * - Allow the same letter twice only after the hand leaves the frame or a 1.5-second (1500ms) pause
 */
export class LetterSmoother {
  private history: (string | null)[] = [];
  private currentHeldLetter: string | null = null;
  private heldStartTime: number = 0;
  private lastConfirmedLetter: string | null = null;
  private lastConfirmedTime: number = 0;
  private handWasAbsent: boolean = true;

  public processFrame(
    rawResult: { letter: string; confidence: number } | null,
    now: number
  ): {
    stability: number;
    candidateLetter: string | null;
    confirmedLetter: string | null;
    isNewConfirmed: boolean;
    confidence: number;
    heldProgress: number; // 0..1
  } {
    if (!rawResult || rawResult.confidence < 0.6) {
      this.history.push(null);
      if (this.history.length > 10) this.history.shift();

      if (!rawResult) {
        this.handWasAbsent = true;
      }

      this.currentHeldLetter = null;
      this.heldStartTime = 0;

      // Count nulls/candidates
      const counts: Record<string, number> = {};
      for (const item of this.history) {
        if (item) counts[item] = (counts[item] || 0) + 1;
      }
      let maxCount = 0;
      let cand: string | null = null;
      for (const [l, c] of Object.entries(counts)) {
        if (c > maxCount) {
          maxCount = c;
          cand = l;
        }
      }

      return {
        stability: maxCount / 10,
        candidateLetter: cand,
        confirmedLetter: null,
        isNewConfirmed: false,
        confidence: rawResult ? rawResult.confidence : 0,
        heldProgress: 0,
      };
    }

    // Hand is present
    this.history.push(rawResult.letter);
    if (this.history.length > 10) this.history.shift();

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

    const stability = maxCount / 10;
    const agreeSeven = maxCount >= 7 && topLetter !== null;

    let confirmedLetter: string | null = null;
    let isNewConfirmed = false;
    let heldProgress = 0;

    if (agreeSeven && topLetter) {
      if (this.currentHeldLetter === topLetter) {
        const heldDuration = now - this.heldStartTime;
        heldProgress = Math.min(1, heldDuration / 800);

        // Held for 0.8 seconds (800 ms)
        if (heldDuration >= 800) {
          // Rule: Add the letter to output only when it changes,
          // and allow the same letter twice only after the hand leaves the frame or a 1.5-second pause.
          const isSameAsLast = topLetter === this.lastConfirmedLetter;
          const timeSinceLast = now - this.lastConfirmedTime;
          const canRepeat = this.handWasAbsent || timeSinceLast >= 1500;

          if (!isSameAsLast || canRepeat) {
            confirmedLetter = topLetter;
            isNewConfirmed = true;
            this.lastConfirmedLetter = topLetter;
            this.lastConfirmedTime = now;
            this.handWasAbsent = false;
            // Reset held timer so it doesn't trigger on every frame
            this.heldStartTime = now;
          }
        }
      } else {
        // New candidate starting hold
        this.currentHeldLetter = topLetter;
        this.heldStartTime = now;
        heldProgress = 0;
      }
    } else {
      this.currentHeldLetter = null;
      this.heldStartTime = 0;
      heldProgress = 0;
    }

    return {
      stability,
      candidateLetter: topLetter,
      confirmedLetter,
      isNewConfirmed,
      confidence: rawResult.confidence,
      heldProgress,
    };
  }

  public reset() {
    this.history = [];
    this.currentHeldLetter = null;
    this.heldStartTime = 0;
    this.lastConfirmedLetter = null;
    this.lastConfirmedTime = 0;
    this.handWasAbsent = true;
  }
}
