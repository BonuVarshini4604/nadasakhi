import { PlatformModule } from './types';

export const SOUND_GUARDIAN_URL = 'https://echoalert-real-time-sound-event-webhook-monitor.ai.studio';
export const SIGN_BRIDGE_URL = 'https://sign-bridge-1.ai.studio';
export const N8N_WEBHOOK_URL = 'https://bonu.app.n8n.cloud/webhook/nadasakhi';

export const MODULES: Record<'sound-guardian' | 'sign-bridge', PlatformModule> = {
  'sound-guardian': {
    id: 'sound-guardian',
    title: 'Sound Guardian',
    tagline: 'Real-Time Danger-Sound Alerts & Acoustic Safety Monitor',
    shortDesc: 'Acoustic danger detection monitoring sirens, fire alarms, door knocks, crying, horns, and emergency audio events.',
    fullDesc: 'Sound Guardian continuously listens to environmental sounds, using acoustic AI models to detect critical hazard sounds like alarms, glass shattering, vehicle honks, and emergency sirens. Visual strobes and haptic alerts ensure deaf and hard-of-hearing users stay aware and safe.',
    url: SOUND_GUARDIAN_URL,
    features: [
      'Critical fire and smoke alarm alerts',
      'Emergency vehicle siren & horn detection',
      'Doorbell, knocking, and domestic sounds',
      'Instant visual flasher & vibration feedback',
      'Low-latency acoustic webhook notifications'
    ],
    requiresHardware: ['Microphone', 'Audio Capture']
  },
  'sign-bridge': {
    id: 'sign-bridge',
    title: 'SignBridge',
    tagline: 'Two-Way Sign-to-Text, Text-to-Sign & Live Captions',
    shortDesc: 'Neural camera-based sign language translation into spoken text/audio, text-to-sign visual animations, and real-time live captions.',
    fullDesc: 'SignBridge facilitates natural two-way communication between deaf, speech-impaired, and hearing individuals. It translates webcam sign gestures directly into text and synthetic speech, converts spoken words into live captions, and provides text-to-sign visual animations.',
    url: SIGN_BRIDGE_URL,
    features: [
      'Camera-based sign gesture to text & speech',
      'Spoken audio to live captions in real time',
      'Text-to-sign visualization & vocabulary guide',
      'High-contrast accessible display mode',
      'Bilingual conversational interface'
    ],
    requiresHardware: ['Camera (Webcam)', 'Microphone']
  }
};
