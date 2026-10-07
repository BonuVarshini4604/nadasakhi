export type TabType = 'listen' | 'captions' | 'history' | 'sounds' | 'home' | 'sound-guardian' | 'sign-bridge';

export type TextScale = 'normal' | 'large' | 'xlarge';

export type SoundPriority = 'critical' | 'medium' | 'low';

export type CaptionLanguageCode = 'en-IN' | 'hi-IN' | 'te-IN';

export interface DetectedSound {
  id: string;
  name: string;
  priority: SoundPriority;
  time: string; // ISO string
  displayTime: string;
  matchPercent: number;
  icon?: string;
}

export interface PlatformModule {
  id: string;
  title: string;
  tagline: string;
  shortDesc: string;
  fullDesc: string;
  url?: string;
  features: string[];
  requiresHardware: string[];
}
