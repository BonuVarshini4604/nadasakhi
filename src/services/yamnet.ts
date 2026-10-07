import * as tf from '@tensorflow/tfjs';
import { SoundPriority } from '../types';

/**
 * TensorFlow Hub YAMNet model URL (TFJS GraphModel format).
 * Official TF.js YAMNet hosted on tfhub.
 */
export const YAMNET_TFJS_URL = 'https://tfhub.dev/google/tfjs-model/yamnet/tfjs/1';

/**
 * Official CSV URL for class names mapping:
 * https://raw.githubusercontent.com/tensorflow/models/master/research/audioset/yamnet/yamnet_class_map.csv
 */
export const YAMNET_CLASS_MAP_CSV_URL =
  'https://raw.githubusercontent.com/tensorflow/models/master/research/audioset/yamnet/yamnet_class_map.csv';

export interface SoundCategoryMapping {
  displayName: string;
  priority: SoundPriority;
}

/**
 * User request Category Mapping:
 * Critical: Smoke detector / smoke alarm, Fire alarm, Alarm, Siren, Glass / Shatter, Explosion
 * Medium: Baby cry / infant cry, Knock, Car horn
 * Low: Doorbell / Ding-dong, Dog / Bark
 */
export const SOUND_CLASS_MAPPING: Record<string, SoundCategoryMapping> = {
  // Critical
  'Smoke detector, smoke alarm': { displayName: 'Smoke Alarm', priority: 'critical' },
  'Fire alarm': { displayName: 'Fire Alarm', priority: 'critical' },
  'Alarm': { displayName: 'Alarm', priority: 'critical' },
  'Siren': { displayName: 'Siren', priority: 'critical' },
  'Glass': { displayName: 'Glass Breaking', priority: 'critical' },
  'Shatter': { displayName: 'Glass Breaking', priority: 'critical' },
  'Explosion': { displayName: 'Explosion', priority: 'critical' },

  // Medium
  'Baby cry, infant cry': { displayName: 'Baby Cry', priority: 'medium' },
  'Crying, sobbing': { displayName: 'Baby Cry', priority: 'medium' },
  'Knock': { displayName: 'Knock', priority: 'medium' },
  'Car horn, honking': { displayName: 'Car Horn', priority: 'medium' },
  'Vehicle horn, car horn, honking': { displayName: 'Car Horn', priority: 'medium' },

  // Low
  'Doorbell': { displayName: 'Doorbell', priority: 'low' },
  'Ding-dong': { displayName: 'Doorbell', priority: 'low' },
  'Chime': { displayName: 'Doorbell', priority: 'low' },
  'Dog': { displayName: 'Dog Bark', priority: 'low' },
  'Bark': { displayName: 'Dog Bark', priority: 'low' },
  'Bow-wow': { displayName: 'Dog Bark', priority: 'low' },
  'Yip': { displayName: 'Dog Bark', priority: 'low' },
};

/**
 * Fallback built-in list of YAMNet classes in case GitHub raw CSV fails to download.
 */
export const FALLBACK_KEY_CLASSES: { index: number; name: string }[] = [
  { index: 392, name: 'Smoke detector, smoke alarm' },
  { index: 391, name: 'Fire alarm' },
  { index: 388, name: 'Alarm' },
  { index: 394, name: 'Siren' },
  { index: 438, name: 'Glass' },
  { index: 439, name: 'Shatter' },
  { index: 426, name: 'Explosion' },
  { index: 20, name: 'Baby cry, infant cry' },
  { index: 19, name: 'Crying, sobbing' },
  { index: 334, name: 'Knock' },
  { index: 322, name: 'Vehicle horn, car horn, honking' },
  { index: 323, name: 'Car horn, honking' },
  { index: 390, name: 'Doorbell' },
  { index: 389, name: 'Ding-dong' },
  { index: 70, name: 'Dog' },
  { index: 71, name: 'Bark' },
];

export interface PredictionResult {
  className: string;
  mapped: SoundCategoryMapping | null;
  score: number; // 0 to 1
}

export class YamnetAudioClassifier {
  private model: tf.GraphModel | null = null;
  private classNames: string[] = [];
  private isLoading = false;
  private isLoaded = false;
  private loadError: string | null = null;

  async loadModel(): Promise<boolean> {
    if (this.isLoaded && this.model) return true;
    if (this.isLoading) return false;

    this.isLoading = true;
    this.loadError = null;

    try {
      // 1. Initialize tf backend
      await tf.ready();

      // 2. Load class names map from official CSV
      try {
        const response = await fetch(YAMNET_CLASS_MAP_CSV_URL);
        if (response.ok) {
          const csvText = await response.text();
          this.parseClassMapCsv(csvText);
        }
      } catch (e) {
        console.warn('Could not fetch yamnet_class_map.csv, using built-in classes:', e);
      }

      // If CSV failed or empty, populate with fallback
      if (this.classNames.length === 0) {
        this.populateFallbackClasses();
      }

      // 3. Load YAMNet TFJS model from TensorFlow Hub
      this.model = await tf.loadGraphModel(YAMNET_TFJS_URL, { fromTFHub: true });
      this.isLoaded = true;
      this.isLoading = false;
      return true;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn('YAMNet model load failed, falling back to loudness detector:', errMsg);
      this.loadError = errMsg;
      this.isLoading = false;
      this.isLoaded = false;
      return false;
    }
  }

  hasLoaded(): boolean {
    return this.isLoaded && this.model !== null;
  }

  getError(): string | null {
    return this.loadError;
  }

  private parseClassMapCsv(csv: string) {
    const lines = csv.split('\n');
    const names: string[] = [];
    // Format: index,mid,display_name
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const parts = line.split(',');
      if (parts.length >= 3) {
        const idx = parseInt(parts[0], 10);
        // Display name may be surrounded by quotes or have commas
        const namePart = parts.slice(2).join(',').replace(/^"|"$/g, '').trim();
        if (!isNaN(idx)) {
          names[idx] = namePart;
        }
      }
    }
    this.classNames = names;
  }

  private populateFallbackClasses() {
    this.classNames = new Array(521).fill('Unclassified Sound');
    for (const item of FALLBACK_KEY_CLASSES) {
      this.classNames[item.index] = item.name;
    }
  }

  /**
   * Runs classification on 16 kHz mono audio buffer (approx. 1 second = 15600 samples).
   */
  async classify(audio16k: Float32Array): Promise<PredictionResult | null> {
    if (!this.model) return null;

    try {
      let scoresData: Float32Array | Int32Array | Uint8Array;

      tf.tidy(() => {
        // YAMNet expects float32 1D waveform normalized between [-1.0, 1.0]
        const inputTensor = tf.tensor1d(audio16k, 'float32');

        // Execute model. YAMNet outputs [scores, embeddings, mel_spectrogram]
        const output = this.model!.predict(inputTensor);

        let scoresTensor: tf.Tensor;
        if (Array.isArray(output)) {
          scoresTensor = output[0] as tf.Tensor;
        } else if (output instanceof tf.Tensor) {
          scoresTensor = output;
        } else {
          return;
        }

        // Mean across all output frames in this 1-second segment
        // scores shape is [N, 521]
        const meanScores = scoresTensor.mean(0);
        scoresData = meanScores.dataSync();
      });

      // @ts-expect-error scoresData is assigned synchronously in tidy
      if (!scoresData || scoresData.length === 0) return null;

      let maxScore = 0;
      let bestIndex = -1;

      // Find top class among mapped categories or overall top
      for (let i = 0; i < scoresData.length; i++) {
        const score = scoresData[i];
        if (score > maxScore) {
          maxScore = score;
          bestIndex = i;
        }
      }

      // Also check if any of our mapped target sounds has high score (> 0.4)
      let matchedTarget: { className: string; mapped: SoundCategoryMapping; score: number } | null = null;
      let highestTargetScore = 0;

      for (let i = 0; i < scoresData.length; i++) {
        const score = scoresData[i];
        const name = this.classNames[i] || '';
        const mapping = this.findMapping(name);
        if (mapping && score > 0.45 && score > highestTargetScore) {
          highestTargetScore = score;
          matchedTarget = { className: name, mapped: mapping, score };
        }
      }

      if (matchedTarget) {
        return {
          className: matchedTarget.className,
          mapped: matchedTarget.mapped,
          score: Math.min(0.99, Math.round(matchedTarget.score * 100) / 100),
        };
      }

      const topName = this.classNames[bestIndex] || `Sound #${bestIndex}`;
      const mapping = this.findMapping(topName);

      return {
        className: topName,
        mapped: mapping,
        score: Math.min(0.99, Math.round(maxScore * 100) / 100),
      };
    } catch (err) {
      console.warn('Error during YAMNet inference:', err);
      return null;
    }
  }

  findMapping(className: string): SoundCategoryMapping | null {
    if (!className) return null;
    const lower = className.toLowerCase();

    // Exact or partial check against known sound names
    for (const [key, mapping] of Object.entries(SOUND_CLASS_MAPPING)) {
      if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) {
        return mapping;
      }
    }

    if (lower.includes('smoke') || lower.includes('fire alarm')) {
      return { displayName: 'Smoke Alarm', priority: 'critical' };
    }
    if (lower.includes('glass') || lower.includes('shatter')) {
      return { displayName: 'Glass Breaking', priority: 'critical' };
    }
    if (lower.includes('siren') || lower.includes('emergency vehicle')) {
      return { displayName: 'Siren', priority: 'critical' };
    }
    if (lower.includes('explosion') || lower.includes('gunshot') || lower.includes('blast')) {
      return { displayName: 'Explosion', priority: 'critical' };
    }
    if (lower.includes('baby') || lower.includes('infant cry')) {
      return { displayName: 'Baby Cry', priority: 'medium' };
    }
    if (lower.includes('knock') || lower.includes('door knock')) {
      return { displayName: 'Knock', priority: 'medium' };
    }
    if (lower.includes('horn') || lower.includes('honk')) {
      return { displayName: 'Car Horn', priority: 'medium' };
    }
    if (lower.includes('doorbell') || lower.includes('ding-dong') || lower.includes('chime')) {
      return { displayName: 'Doorbell', priority: 'low' };
    }
    if (lower.includes('dog') || lower.includes('bark') || lower.includes('howl')) {
      return { displayName: 'Dog Bark', priority: 'low' };
    }

    return null;
  }
}

export const yamnetClassifier = new YamnetAudioClassifier();
