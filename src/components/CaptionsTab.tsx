import React, { useState, useEffect, useRef } from 'react';
import { 
  Hand, 
  Type, 
  Mic, 
  MicOff, 
  BookOpen, 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Volume2, 
  Copy, 
  Check, 
  Trash2, 
  Camera, 
  CameraOff, 
  Sparkles, 
  Activity, 
  CheckCircle2, 
  AlertCircle, 
  AlertTriangle,
  RotateCw, 
  Search,
  ExternalLink,
  Languages,
  Globe,
  WifiOff,
  Send,
  Loader2,
  Maximize2,
  Eye,
  EyeOff
} from 'lucide-react';
import { SIGN_BRIDGE_URL } from '../constants';
import { translateToEnglish } from '../services/translate';
import { sendTextToSignWebhook, sendSignToTextWebhook, WebhookResult } from '../services/webhook';
import { buildOfflineSignSequence, SignSequenceItem } from '../services/signSequence';
import { 
  handLandmarkerService, 
  drawHandLandmarks, 
  classifyHandGesture,
  GestureSmoother
} from '../services/handLandmarker';
import { 
  SamplePoint,
  MotionSample,
  StoredTrainingData,
  extractHandFeatures,
  classifyKnn,
  loadStoredData,
  saveStoredData,
  LetterSmoother,
  LETTERS_LIST,
  MOTION_LETTERS,
  NEUTRAL_LABEL,
  resampleAndNormalizePath,
  matchMotionSample,
  checkHandQuality,
  calculateLetterThresholds,
  LetterThresholdInfo,
  ClassificationResult
} from '../services/alphabetClassifier';
import { LetterTrainingModal } from './LetterTrainingModal';
import { HandSkeletonPlayer } from './HandSkeletonPlayer';

export type BridgeMode = 'signbridge' | 'sign-to-text' | 'text-to-sign' | 'speech-to-text' | 'dictionary';

export type LanguageCode = 'en-IN' | 'hi-IN' | 'te-IN';

export interface LanguageOption {
  code: LanguageCode;
  label: string;
  nativeLabel: string;
  fontClass: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: 'en-IN', label: 'English India', nativeLabel: 'English (India)', fontClass: 'font-sans' },
  { code: 'hi-IN', label: 'Hindi', nativeLabel: 'हिन्दी', fontClass: 'font-devanagari' },
  { code: 'te-IN', label: 'Telugu', nativeLabel: 'తెలుగు', fontClass: 'font-telugu' },
];

interface DictionaryEntry {
  word: string;
  category: 'Greetings' | 'Emergency' | 'Daily' | 'Alphabet' | 'Numbers';
  description: string;
  symbol: string;
  handshape: string;
}

const SIGN_DICTIONARY: DictionaryEntry[] = [
  { word: 'HELLO', category: 'Greetings', description: 'Open hand near temple moves outwards with a welcoming wave', symbol: '👋', handshape: 'Open B-hand' },
  { word: 'THANK YOU', category: 'Greetings', description: 'Fingertips touch chin and move forward toward the other person', symbol: '🙏', handshape: 'Flat open palm' },
  { word: 'PLEASE', category: 'Greetings', description: 'Open hand makes gentle circular motion on the chest', symbol: '✨', handshape: 'Flat B-hand circular' },
  { word: 'HELP', category: 'Emergency', description: 'Fist with thumb up rests on open palm and lifts upward together', symbol: '🆘', handshape: 'A-hand on flat palm' },
  { word: 'EMERGENCY', category: 'Emergency', description: 'Shaking E-hand back and forth with urgent expression', symbol: '🚨', handshape: 'Shaking E-hand' },
  { word: 'DOCTOR', category: 'Emergency', description: 'M-hand or bent fingertips tap pulse point on wrist', symbol: '🩺', handshape: 'Tapping wrist' },
  { word: 'POLICE', category: 'Emergency', description: 'C-hand taps over left chest near badge position', symbol: '👮', handshape: 'C-hand badge' },
  { word: 'WATER', category: 'Daily', description: 'W-hand shape index finger taps chin twice', symbol: '💧', handshape: 'W-hand on chin' },
  { word: 'FOOD', category: 'Daily', description: 'Fingertips grouped together tap mouth twice', symbol: '🍞', handshape: 'O-hand to mouth' },
  { word: 'YES', category: 'Daily', description: 'S-hand fist nods up and down like a head nodding', symbol: '👍', handshape: 'Nodding fist' },
  { word: 'NO', category: 'Daily', description: 'Index and middle fingers snap down against thumb', symbol: '✋', handshape: 'Snapping fingers' },
  { word: 'WHERE', category: 'Daily', description: 'Index finger wiggles side to side with questioning face', symbol: '📍', handshape: 'Wiggling 1-finger' },
  { word: 'A', category: 'Alphabet', description: 'Closed fist with thumb resting alongside index finger', symbol: '✊', handshape: 'Fist thumb up' },
  { word: 'B', category: 'Alphabet', description: 'Four fingers straight up with thumb tucked across palm', symbol: '🖐️', handshape: 'Flat four fingers' },
  { word: 'C', category: 'Alphabet', description: 'Curved hand forming a C shape facing forward', symbol: '🤏', handshape: 'Curved C shape' },
  { word: 'D', category: 'Alphabet', description: 'Index finger pointing straight up, other fingers touch thumb', symbol: '☝️', handshape: 'Index up circle' },
];

const PRESET_CHIPS = [
  'HELLO', 'YES', 'GOOD', 'I LOVE YOU', 'PEACE', 'ONE'
];

const QUICK_PHRASES = [
  'I am deaf or hard of hearing',
  'Please write it down',
  'Where is the emergency exit?',
  'I need medical assistance',
  'Can you speak slowly?',
  'Thank you for your patience'
];

interface CaptionsTabProps {
  highContrast: boolean;
  initialMode?: BridgeMode;
  persistedLanguage?: LanguageCode;
  onLanguageChange?: (lang: LanguageCode) => void;
}

export const CaptionsTab: React.FC<CaptionsTabProps> = ({ 
  highContrast, 
  initialMode,
  persistedLanguage = 'en-IN',
  onLanguageChange
}) => {
  const [mode, setMode] = useState<BridgeMode>(initialMode || 'signbridge');
  const [iframeKey, setIframeKey] = useState(0);
  
  // Bridge Status State
  const [bridgeStatus, setBridgeStatus] = useState<'active' | 'syncing'>('active');

  // Sign to Text State: 'words' | 'letters' (offline) | 'type-letters'
  const [signSubMode, setSignSubMode] = useState<'words' | 'letters' | 'type-letters'>('words');
  const [isTrainingOpen, setIsTrainingOpen] = useState(false);
  const [showModelVision, setShowModelVision] = useState(false);
  
  // Stored training data (both still samples and motion samples)
  const [trainingData, setTrainingData] = useState<StoredTrainingData>(() => loadStoredData());
  const [currentLetterPrediction, setCurrentLetterPrediction] = useState<ClassificationResult | null>(null);
  const [letterWordOutput, setLetterWordOutput] = useState<string>('');

  // Cached thresholds for still letters
  const cachedThresholdsRef = useRef<Record<string, LetterThresholdInfo>>({});
  const prevDetectionLandmarksRef = useRef<import('@mediapipe/tasks-vision').NormalizedLandmark[] | null>(null);

  // Motion tracking state (for J and Z live trail and matching)
  const [motionTrailPoints, setMotionTrailPoints] = useState<[number, number][]>([]);
  const liveTrailRef = useRef<{ x: number; y: number; time: number }[]>([]);
  const liveNormMotionRef = useRef<[number, number][]>([]);
  const lastMotionMatchTimeRef = useRef<number>(0);

  const [cameraActive, setCameraActive] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [cameraError, setCameraError] = useState<{
    title: string;
    message: string;
    fixSteps: string[];
  } | null>(null);
  const [realFps, setRealFps] = useState<number>(0);
  const [activeModelName, setActiveModelName] = useState<string | null>(null);
  const [statusLine, setStatusLine] = useState<string>('No hand detected');
  const [detectedGesture, setDetectedGesture] = useState<string>('');
  const [stability, setStability] = useState<number>(0);
  const [signToTextTranscript, setSignToTextTranscript] = useState<string[]>([
    'HELLO'
  ]);

  // Webcam & Landmark Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const framesCountRef = useRef<number>(0);
  const lastFpsTimeRef = useRef<number>(0);
  const smootherRef = useRef<GestureSmoother>(new GestureSmoother());
  const letterSmootherRef = useRef<LetterSmoother>(new LetterSmoother());
  const latestLandmarksRef = useRef<import('@mediapipe/tasks-vision').NormalizedLandmark[] | null>(null);
  const latestIsLeftHandRef = useRef<boolean>(false);
  const trainingDataRef = useRef<StoredTrainingData>(trainingData);

  // Keep trainingDataRef and thresholds in sync
  useEffect(() => {
    trainingDataRef.current = trainingData;
    cachedThresholdsRef.current = calculateLetterThresholds(trainingData.stillSamples);
  }, [trainingData]);

  // Language State: default en-IN (English India), remembered while the app is open
  const [ttsLang, setTtsLang] = useState<LanguageCode>(persistedLanguage);
  const [sttLang, setSttLang] = useState<LanguageCode>(persistedLanguage);

  // Sync when persistedLanguage prop updates
  useEffect(() => {
    if (persistedLanguage && persistedLanguage !== sttLang) {
      setSttLang(persistedLanguage);
    }
  }, [persistedLanguage]);

  const handleSelectSttLanguage = (newLang: LanguageCode) => {
    setSttLang(newLang);
    onLanguageChange?.(newLang);
  };

  // Text to Sign State
  const [inputText, setInputText] = useState('HELLO THANK YOU');
  const [originalTypedText, setOriginalTypedText] = useState<string>('');
  const [translatedEnglishText, setTranslatedEnglishText] = useState<string>('');
  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  const [isSendingWebhook, setIsSendingWebhook] = useState<boolean>(false);
  const [isOfflineModeActive, setIsOfflineModeActive] = useState<boolean>(false);
  const [ttsWebhookError, setTtsWebhookError] = useState<WebhookResult | null>(null);
  const [showTtsDebugSnippet, setShowTtsDebugSnippet] = useState<boolean>(false);

  // Sign sequence: can be list of items with labels/types
  const [signSequence, setSignSequence] = useState<string[]>(['HELLO', 'THANK', 'YOU']);
  const [structuredSequence, setStructuredSequence] = useState<SignSequenceItem[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState<0.5 | 1 | 1.5>(1);

  // Speech to Text State
  const [speechListening, setSpeechListening] = useState(false);
  const [speechTranscript, setSpeechTranscript] = useState<string[]>([
    'Welcome to NādaSakhi live speech captions.',
    'Speak clearly into your microphone to transcribe speech in real time.'
  ]);
  const [speechInterim, setSpeechInterim] = useState('');
  const [fontSize, setFontSize] = useState<'large' | 'huge' | 'giant'>('huge');
  const [speechSupported, setSpeechSupported] = useState(true);

  // Dictionary State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDictEntry, setSelectedDictEntry] = useState<DictionaryEntry>(SIGN_DICTIONARY[0]);

  // Clipboard Copied Indicator
  const [copied, setCopied] = useState(false);

  // Refs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const playbackTimerRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Translates (if Hindi/Telugu), sends to webhook (10s timeout),
   * and falls back to offline mode sequence if unreachable or non-JSON.
   */
  const processAndSynthesizeSignText = async (textToProcess: string, lang: LanguageCode) => {
    const raw = textToProcess.trim();
    if (!raw) return;

    setOriginalTypedText(raw);
    setTtsWebhookError(null);

    let englishText = raw;

    // Requirement 2: In Mode 2, if the language is Hindi or Telugu, first translate the entered text to English using Gemini API
    if (lang === 'hi-IN' || lang === 'te-IN') {
      setIsTranslating(true);
      const sourceLang = lang === 'hi-IN' ? 'Hindi' : 'Telugu';
      const translationResult = await translateToEnglish(raw, sourceLang);
      setIsTranslating(false);

      if (translationResult.success && translationResult.englishText) {
        englishText = translationResult.englishText;
      } else {
        // If translation fails, send the original text
        englishText = raw;
      }
      setTranslatedEnglishText(englishText);
    } else {
      setTranslatedEnglishText(englishText);
    }

    // Step 2: Send English text to webhook:
    // fetch POST https://bonu.app.n8n.cloud/webhook/nadasakhi with body {"mode":"text_to_sign","text":"<English text>"}
    setIsSendingWebhook(true);
    const webhookRes = await sendTextToSignWebhook(englishText);
    setIsSendingWebhook(false);

    let sequenceItems: SignSequenceItem[] = [];
    let usedOfflineFallback = false;

    // Requirement 4 & 5: Check if webhook succeeded and returned JSON sequence
    if (webhookRes.success && webhookRes.isJson && webhookRes.data) {
      const data = webhookRes.data as Record<string, unknown>;
      // Look for sequence array in response
      const serverSeq = (Array.isArray(data) ? data : data.sequence || data.clipList || data.items || data.steps) as SignSequenceItem[];
      if (Array.isArray(serverSeq) && serverSeq.length > 0) {
        sequenceItems = serverSeq;
        setIsOfflineModeActive(false);
        setTtsWebhookError(null);
      } else {
        // Valid JSON returned but no sequence array, use offline fallback
        usedOfflineFallback = true;
      }
    } else {
      // Failed, timed out after 10s, or non-JSON:
      // Show friendly message ("Server unreachable, using offline mode") with "Show details" toggle
      usedOfflineFallback = true;
      setTtsWebhookError(webhookRes);
    }

    if (usedOfflineFallback) {
      setIsOfflineModeActive(true);
      sequenceItems = buildOfflineSignSequence(englishText);
    }

    setStructuredSequence(sequenceItems);

    // Map sequenceItems to labels for player
    const labels = sequenceItems.map((item) => {
      if (item.type === 'phrase') return item.label.toUpperCase();
      if (item.type === 'letter') return item.label.toUpperCase();
      return 'PAUSE';
    });

    setSignSequence(labels.length > 0 ? labels : ['HELLO']);
    setCurrentStepIndex(0);
    setIsPlaying(true);
  };

  // Expand structured sequence into animated steps:
  // - Spells phrase labels letter-by-letter (~950ms per letter)
  // - Plays individual letter items (~950ms)
  // - Holds hand pose during pause items
  const expandedSteps = React.useMemo(() => {
    const steps: {
      parentIndex: number;
      type: 'phrase' | 'letter' | 'pause';
      phraseLabel: string;
      activeLetter: string;
      durationMs: number;
      isPause: boolean;
    }[] = [];

    structuredSequence.forEach((item, parentIdx) => {
      if (item.type === 'letter') {
        const char = item.label.toUpperCase();
        steps.push({
          parentIndex: parentIdx,
          type: 'letter',
          phraseLabel: char,
          activeLetter: char,
          durationMs: 950,
          isPause: false,
        });
      } else if (item.type === 'pause') {
        steps.push({
          parentIndex: parentIdx,
          type: 'pause',
          phraseLabel: 'PAUSE',
          activeLetter: 'PAUSE',
          durationMs: item.ms || 400,
          isPause: true,
        });
      } else if (item.type === 'phrase') {
        const phraseText = item.label.toUpperCase();
        const letters = phraseText.replace(/[^A-Z]/g, '').split('');
        if (letters.length > 0) {
          letters.forEach((char) => {
            steps.push({
              parentIndex: parentIdx,
              type: 'phrase',
              phraseLabel: phraseText,
              activeLetter: char,
              durationMs: 950,
              isPause: false,
            });
          });
        } else {
          steps.push({
            parentIndex: parentIdx,
            type: 'phrase',
            phraseLabel: phraseText,
            activeLetter: phraseText.charAt(0) || 'REST',
            durationMs: 950,
            isPause: false,
          });
        }
      }
    });

    if (steps.length === 0) {
      return [
        {
          parentIndex: 0,
          type: 'phrase' as const,
          phraseLabel: 'HELLO',
          activeLetter: 'H',
          durationMs: 950,
          isPause: false,
        },
      ];
    }

    return steps;
  }, [structuredSequence]);

  // Initial sequence generation or sync on mount
  useEffect(() => {
    if (structuredSequence.length === 0) {
      const initial = buildOfflineSignSequence(inputText);
      setStructuredSequence(initial);
      setOriginalTypedText(inputText);
      setTranslatedEnglishText(inputText);
    }
  }, []);

  // Sequence Player Timer: 900-1000ms per letter, holds during pause items
  useEffect(() => {
    if (!isPlaying || expandedSteps.length === 0) {
      if (playbackTimerRef.current) clearTimeout(playbackTimerRef.current);
      return;
    }

    const currentStep = expandedSteps[currentStepIndex] || expandedSteps[0];
    const durationMs = currentStep.isPause
      ? Math.max(250, currentStep.durationMs / playbackSpeed)
      : Math.max(450, (currentStep.durationMs || 950) / playbackSpeed);

    playbackTimerRef.current = setTimeout(() => {
      setCurrentStepIndex((prev) => (prev + 1) % expandedSteps.length);
    }, durationMs);

    return () => {
      if (playbackTimerRef.current) clearTimeout(playbackTimerRef.current);
    };
  }, [isPlaying, expandedSteps, playbackSpeed, currentStepIndex]);

  // Web Speech API Initialization with dynamic sttLang (en-IN, hi-IN, te-IN)
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSpeechSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = sttLang; // Use selected language: en-IN, hi-IN, te-IN

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          const finalWord = event.results[i][0].transcript.trim();
          if (finalWord) {
            setSpeechTranscript((prev) => [...prev, finalWord]);
          }
          interim = '';
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      setSpeechInterim(interim);
    };

    recognition.onerror = () => {
      setSpeechListening(false);
    };

    recognition.onend = () => {
      if (recognitionRef.current?.shouldBeListening) {
        try {
          recognition.start();
        } catch (_) {}
      } else {
        setSpeechListening(false);
      }
    };

    recognitionRef.current = recognition;

    // If already listening when language changes, restart with new language
    if (speechListening) {
      try {
        recognition.stop();
        recognition.shouldBeListening = true;
        recognition.start();
      } catch (_) {}
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.shouldBeListening = false;
        try {
          recognitionRef.current.stop();
        } catch (_) {}
      }
    };
  }, [sttLang]);

  const toggleSpeech = () => {
    if (!speechSupported) {
      const demoPhrases = [
        "Welcome to the customer desk, how can I help?",
        "Please step up to window number 3.",
        "Your appointment is confirmed with Dr. Sharma.",
        "Take the elevator to the second floor."
      ];
      setSpeechTranscript((prev) => [...prev, demoPhrases[Math.floor(Math.random() * demoPhrases.length)]]);
      return;
    }

    if (speechListening) {
      if (recognitionRef.current) {
        recognitionRef.current.shouldBeListening = false;
        try {
          recognitionRef.current.stop();
        } catch (_) {}
      }
      setSpeechListening(false);
      setSpeechInterim('');
    } else {
      if (recognitionRef.current) {
        recognitionRef.current.shouldBeListening = true;
        try {
          recognitionRef.current.start();
          setSpeechListening(true);
        } catch (_) {}
      }
    }
  };

  const startWebcam = async () => {
    setCameraError(null);
    setCameraStarting(true);
    smootherRef.current.reset();
    setStatusLine('Loading hand model...');

    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30 },
        },
      });

      streamRef.current = stream;
      setCameraActive(true);
      setCameraStarting(false);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current
            ?.play()
            .then(async () => {
              setIsStreaming(true);
              if (!handLandmarkerService.isReady()) {
                setIsModelLoading(true);
                const loaded = await handLandmarkerService.initialize();
                setIsModelLoading(false);
                if (loaded) {
                  setActiveModelName(handLandmarkerService.getModelName());
                } else {
                  setCameraError({
                    title: 'Model Loading Failed',
                    message: handLandmarkerService.loadError || 'Failed to load MediaPipe HandLandmarker model',
                    fixSteps: [
                      'Open this page once with internet to load the hand model.',
                      'Check your internet connection to reach storage.googleapis.com and jsdelivr.net.',
                      'Verify hardware acceleration is enabled in your browser settings.',
                      'Click "Retry Camera" below once connected.'
                    ],
                  });
                }
              } else {
                setActiveModelName(handLandmarkerService.getModelName());
              }
            })
            .catch((playErr) => {
              console.error('Video play error:', playErr);
            });
        };
      }
    } catch (err: unknown) {
      setCameraStarting(false);
      setCameraActive(false);
      setIsStreaming(false);
      setIsModelLoading(false);

      const error = err as Error;
      const errorName = error.name || '';
      console.warn('Camera access error:', errorName, error.message);

      if (errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError') {
        setCameraError({
          title: 'Camera Permission Denied',
          message: 'Permission to access the camera was blocked by your browser or device settings.',
          fixSteps: [
            'Click the camera or lock icon in the browser address bar at the top.',
            'Change the camera permission setting to "Allow".',
            'Click "Retry Camera" below, or reload the page.'
          ],
        });
      } else if (errorName === 'NotFoundError' || errorName === 'DevicesNotFoundError') {
        setCameraError({
          title: 'No Camera Detected',
          message: 'No video input hardware was found on your computer or device.',
          fixSteps: [
            'Check that an external webcam is securely plugged into your computer.',
            'Verify your computer\'s built-in webcam is enabled and not switched off by a physical privacy shutter or keyboard hotkey.',
            'Click "Retry Camera" below once your camera is ready.'
          ],
        });
      } else if (errorName === 'NotReadableError' || errorName === 'TrackStartError') {
        setCameraError({
          title: 'Camera In Use',
          message: 'Your webcam is already in use by another application or browser tab.',
          fixSteps: [
            'Close any other video conferencing apps (Zoom, Teams, Google Meet, FaceTime).',
            'Close other browser tabs that may be accessing the webcam.',
            'Click "Retry Camera" below.'
          ],
        });
      } else {
        setCameraError({
          title: 'Unable to Access Camera',
          message: error.message || 'An unexpected error occurred while requesting camera access.',
          fixSteps: [
            'Ensure your browser has permission to access your webcam.',
            'Refresh the page or click "Retry Camera" below.'
          ],
        });
      }
    }
  };

  const stopWebcam = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setIsStreaming(false);
    setIsModelLoading(false);
    setRealFps(0);
    setActiveModelName(null);
    setStatusLine('No hand detected');
    setStability(0);
    setDetectedGesture('');
    smootherRef.current.reset();
    letterSmootherRef.current.reset();
    latestLandmarksRef.current = null;
    setCurrentLetterPrediction(null);
    liveTrailRef.current = [];
    liveNormMotionRef.current = [];
    setMotionTrailPoints([]);
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  };

  // Turn off webcam if navigating away from sign-to-text mode
  useEffect(() => {
    if (mode !== 'sign-to-text' && cameraActive) {
      stopWebcam();
    }
  }, [mode]);

  // Physical keyboard listener for Type letters or Letters mode (Item 9)
  useEffect(() => {
    if (mode !== 'sign-to-text') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input or textarea
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      if (e.key === 'Backspace') {
        e.preventDefault();
        setLetterWordOutput((prev) => prev.slice(0, -1));
      } else if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        setLetterWordOutput((prev) => prev + ' ');
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        const char = e.key.toUpperCase();
        setLetterWordOutput((prev) => prev + char);
        setSignToTextTranscript((prev) => [...prev, char]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [mode, signSubMode]);

  // Clean up media stream and animation frames on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, []);

  // Live video frame processing loop: measures real FPS, tracks hand landmarks, and classifies gestures
  useEffect(() => {
    if (!isStreaming) return;

    let running = true;
    lastFpsTimeRef.current = performance.now();
    framesCountRef.current = 0;

    const renderLoop = () => {
      if (!running) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && canvas && video.readyState >= 2) {
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth || 640;
          canvas.height = video.videoHeight || 480;
        }

        const now = performance.now();
        framesCountRef.current++;

        const elapsed = now - lastFpsTimeRef.current;
        if (elapsed >= 1000) {
          const currentFps = Math.round((framesCountRef.current * 1000) / elapsed);
          setRealFps(currentFps);
          framesCountRef.current = 0;
          lastFpsTimeRef.current = now;
        }

        const ctx = canvas.getContext('2d');

        if (!handLandmarkerService.isReady()) {
          if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
          setStatusLine('Loading hand model...');
          setStability(0);
          setDetectedGesture('');
        } else {
          if (handLandmarkerService.getModelName() && !activeModelName) {
            setActiveModelName(handLandmarkerService.getModelName());
          }

          // detectForVideoWithHandedness on each animation frame
          const detection = handLandmarkerService.detectForVideoWithHandedness(video, now);
          const landmarks = detection ? detection.landmarks : null;
          const isLeftHand = detection ? detection.isLeftHand : false;

          latestLandmarksRef.current = landmarks;
          latestIsLeftHandRef.current = isLeftHand;

          // Track motion trail and fingertip positions if in letters mode
          let activeTrailPoints: [number, number][] | undefined = undefined;

          if (landmarks && signSubMode === 'letters') {
            const wrist = landmarks[0];
            const middleMcp = landmarks[9];
            const scale = Math.hypot(
              middleMcp.x - wrist.x,
              middleMcp.y - wrist.y,
              (middleMcp.z || 0) - (wrist.z || 0)
            ) || 1.0;

            // Use index tip (8) for trail rendering
            const indexTip = landmarks[8];
            liveTrailRef.current.push({ x: indexTip.x, y: indexTip.y, time: now });
            // Keep points from last 1.5 seconds
            liveTrailRef.current = liveTrailRef.current.filter((pt) => now - pt.time <= 1500);

            let relX = (indexTip.x - wrist.x) / scale;
            const relY = (indexTip.y - wrist.y) / scale;
            if (isLeftHand) relX = -relX;

            liveNormMotionRef.current.push([relX, relY]);
            if (liveNormMotionRef.current.length > 50) {
              liveNormMotionRef.current.shift();
            }

            if (liveTrailRef.current.length > 2) {
              activeTrailPoints = liveTrailRef.current.map((pt) => [pt.x, pt.y]);
            }
          } else {
            liveTrailRef.current = [];
            liveNormMotionRef.current = [];
          }

          // Compute live quality of hand (for green/red ring and stillness)
          const quality = checkHandQuality(landmarks, prevDetectionLandmarksRef.current);
          prevDetectionLandmarksRef.current = landmarks;
          const isHandStill = quality.isStill;

          let knnRes: ClassificationResult | null = null;
          if (landmarks && signSubMode === 'letters') {
            const features = extractHandFeatures(landmarks, isLeftHand);
            const currentStillSamples = trainingDataRef.current.stillSamples;
            if (features && currentStillSamples.length > 0) {
              knnRes = classifyKnn(features, currentStillSamples, 5, cachedThresholdsRef.current);
            }
          }

          // Draw landmarks and motion trail on mirrored canvas. Draws nothing when no hand is detected.
          if (ctx) {
            drawHandLandmarks(ctx, landmarks, canvas.width, canvas.height, {
              motionTrail: activeTrailPoints,
              showModelVision,
              modelVisionInfo: knnRes ? {
                nearestLetter: knnRes.candidateLetter,
                distance: knnRes.distance,
                threshold: knnRes.threshold,
                confidence: knnRes.confidence,
                isStill: isHandStill,
              } : undefined,
              qualityRing: signSubMode === 'letters' && landmarks ? {
                ringColor: quality.ringColor,
                reason: quality.reason,
              } : undefined,
            });
          }

          if (!landmarks) {
            if (signSubMode === 'words') {
              smootherRef.current.processFrame(null);
            } else {
              letterSmootherRef.current.processFrame(null, false, now);
              setCurrentLetterPrediction(null);
            }
            setStatusLine('No hand detected');
            setStability(0);
            setDetectedGesture('');
          } else if (signSubMode === 'words') {
            // MODE: Words (6 still gestures from geometry)
            const rawGesture = classifyHandGesture(landmarks);
            const res = smootherRef.current.processFrame(rawGesture);

            setStability(res.stability);

            if (res.acceptedGesture) {
              // At least 7 of 10 agree
              setStatusLine(res.acceptedGesture);
              setDetectedGesture(res.acceptedGesture);

              if (res.isNewChange) {
                const gestureToAdd = res.acceptedGesture;
                setSignToTextTranscript((prev) => {
                  const updated = [...prev, gestureToAdd];
                  // Send webhook call
                  sendSignToTextWebhook(updated).catch((err) => {
                    console.warn('sign_to_text webhook notice:', err);
                  });
                  return updated;
                });
              }
            } else {
              // Hand detected, but fewer than 7 of 10 agree
              setStatusLine('Hold steady...');
              setDetectedGesture(res.candidateGesture || '');
            }
          } else if (signSubMode === 'letters') {
            // MODE: Letters (offline)
            // Check for motion match (J or Z) if we have enough points in the motion window
            let motionMatched: { letter: 'J' | 'Z'; distance: number; threshold: number } | null = null;
            const currentMotions = trainingDataRef.current.motionSamples;

            if (
              currentMotions.length > 0 &&
              liveNormMotionRef.current.length >= 16 &&
              now - lastMotionMatchTimeRef.current >= 1500
            ) {
              const resampledCand = resampleAndNormalizePath(liveNormMotionRef.current, 16);
              motionMatched = matchMotionSample(resampledCand, currentMotions);
            }

            if (motionMatched) {
              const matchedChar = motionMatched.letter;
              const confirmed = letterSmootherRef.current.confirmMotionLetter(matchedChar, now);
              if (confirmed) {
                lastMotionMatchTimeRef.current = now;
                liveTrailRef.current = [];
                liveNormMotionRef.current = [];
                setStatusLine(`${matchedChar} (motion)`);
                setDetectedGesture(matchedChar);
                setStability(1.0);
                setLetterWordOutput((prev) => prev + matchedChar);
                setSignToTextTranscript((prev) => {
                  const updated = [...prev, matchedChar];
                  return updated;
                });
              }
            } else {
              setCurrentLetterPrediction(knnRes);

              // 4. Strict letter confirmation:
              // - 9 of 12 agree, confidence >= 0.7, still for 0.8s
              // - ignores moving frames
              // - if NEUTRAL class wins, shows "Ready" and adds nothing
              // - if uncertain ("?"), shows "?" and adds nothing
              const res = letterSmootherRef.current.processFrame(knnRes, isHandStill, now);

              setStability(res.stability);
              setDetectedGesture(res.displayLetter);

              if (res.displayLetter === 'Ready') {
                setStatusLine('Ready (hand at rest)');
              } else if (res.displayLetter === '?') {
                setStatusLine('? (Uncertain sign)');
              } else if (res.candidateLetter && res.stability >= 0.75 && res.confidence >= 0.7) {
                const pct = Math.round(res.confidence * 100);
                setStatusLine(`${res.candidateLetter} (${pct}%)`);
              } else if (res.candidateLetter) {
                setStatusLine('Hold steady...');
              } else {
                setStatusLine('Hold steady...');
              }

              if (res.isNewConfirmed && res.confirmedLetter) {
                const newLetter = res.confirmedLetter;
                setLetterWordOutput((prev) => prev + newLetter);

                setSignToTextTranscript((prev) => {
                  const updated = [...prev, newLetter];
                  return updated;
                });
              }
            }
          }
        }
      }

      animationFrameRef.current = requestAnimationFrame(renderLoop);
    };

    animationFrameRef.current = requestAnimationFrame(renderLoop);

    return () => {
      running = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isStreaming, signSubMode, showModelVision]);

  const simulateDetectGesture = (word: string) => {
    setStatusLine(word);
    setDetectedGesture(word);
    setStability(1.0);
    setSignToTextTranscript((prev) => {
      const updated = [...prev, word];
      sendSignToTextWebhook(updated).catch(() => {});
      return updated;
    });
  };

  const currentStep = expandedSteps[currentStepIndex] || expandedSteps[0];
  const currentWord = currentStep?.phraseLabel || 'HELLO';
  const progressPercent = expandedSteps.length > 0 
    ? Math.round(((currentStepIndex + 1) / expandedSteps.length) * 100) 
    : 100;

  const filteredDict = SIGN_DICTIONARY.filter((d) =>
    d.word.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div
      className={`w-full select-none bg-[#050b1a] text-[#f8fafc] ${
        mode === 'signbridge'
          ? 'flex-1 min-h-0 flex flex-col h-full w-full p-2 sm:p-3 md:p-4 overflow-hidden'
          : 'max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 space-y-6 overflow-y-auto flex-1 min-h-0 pb-6 md:pb-8'
      }`}
    >
      {/* 1. Bridge Status Indicator & Header */}
      <div className="p-2.5 sm:p-3.5 md:p-4 rounded-2xl bg-[#0d1630] border border-[#1a274c] flex items-center justify-between gap-3 shrink-0 shadow-lg">
        <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-[#050b1a] border border-[#1a274c] flex items-center justify-center text-[#0ea5e9] shadow-[0_0_15px_rgba(14,165,233,0.3)] shrink-0">
            <Hand className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.5]" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-sm sm:text-lg md:text-xl font-black tracking-tight text-[#f8fafc] truncate">
                SignBridge Intelligence
              </h1>
              {/* Bridge Status Indicator */}
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-black uppercase tracking-wider bg-emerald-950/80 text-emerald-400 border border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.2)] shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                Bridge Status: Active
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-[#94a3b8] font-medium truncate hidden sm:block">
              Bidirectional neural translation · Sign to Text, Text to Sign & Live Captions
            </p>
          </div>
        </div>

        {/* Action Controls: Open in new tab link & Reload */}
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={SIGN_BRIDGE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-bold bg-[#050b1a] border border-[#1a274c] hover:border-[#0ea5e9] text-[#cbd5e1] hover:text-[#f8fafc] flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 shadow-xs"
          >
            <span>Open in new tab</span>
            <ExternalLink className="w-3.5 h-3.5 text-[#0ea5e9]" />
          </a>

          {mode === 'signbridge' && (
            <button
              onClick={() => setIframeKey((k) => k + 1)}
              title="Reload SignBridge workspace"
              aria-label="Reload SignBridge workspace"
              className="p-1.5 sm:p-2 rounded-xl bg-[#050b1a] border border-[#1a274c] hover:border-[#0ea5e9] text-[#94a3b8] hover:text-[#f8fafc] transition-colors cursor-pointer"
            >
              <RotateCw className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#0ea5e9]" />
            </button>
          )}
        </div>
      </div>

      {/* 2. Mode Switcher (SignBridge View, Live Captions, Sign to Text, Text to Sign, Dictionary) */}
      <div className="flex items-center gap-1.5 sm:gap-2 p-1.5 bg-[#0d1630] rounded-2xl border border-[#1a274c] overflow-x-auto shrink-0 scrollbar-none mt-2 sm:mt-2.5">
        {[
          { id: 'signbridge' as BridgeMode, label: 'SignBridge View', icon: Sparkles },
          { id: 'speech-to-text' as BridgeMode, label: 'Live Captions', icon: Mic },
          { id: 'sign-to-text' as BridgeMode, label: 'Sign to Text', icon: Camera },
          { id: 'text-to-sign' as BridgeMode, label: 'Text to Sign', icon: Hand },
          { id: 'dictionary' as BridgeMode, label: 'Dictionary', icon: BookOpen },
        ].map((m) => {
          const isActive = mode === m.id;
          const Icon = m.icon;
          return (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`py-1.5 sm:py-2 px-3 sm:px-4 rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-1.5 sm:gap-2 shrink-0 transition-all cursor-pointer ${
                isActive
                  ? 'bg-[#0ea5e9] text-white shadow-[0_0_20px_rgba(14,165,233,0.45)]'
                  : 'text-[#94a3b8] hover:text-[#f8fafc] hover:bg-[#131e3d]'
              }`}
            >
              <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span>{m.label}</span>
            </button>
          );
        })}
      </div>

      {/* 3. Mobile-only large "Open full screen" button above the iframe on phones */}
      {mode === 'signbridge' && (
        <a
          href="https://sign-bridge-1.ai.studio"
          target="_blank"
          rel="noopener noreferrer"
          className="md:hidden shrink-0 mt-2 sm:mt-2.5 w-full min-h-[48px] py-3.5 px-4 rounded-2xl font-black text-sm bg-gradient-to-r from-[#0ea5e9] to-[#0284c7] hover:from-sky-400 hover:to-sky-500 text-white shadow-[0_0_20px_rgba(14,165,233,0.35)] flex items-center justify-center gap-2.5 transition-all cursor-pointer border border-sky-400/40 active:scale-[0.99]"
        >
          <Maximize2 className="w-4 h-4 stroke-[2.5]" />
          <span>Open full screen</span>
          <ExternalLink className="w-3.5 h-3.5 opacity-90" />
        </a>
      )}

      {/* MODE 0: SIGNBRIDGE VIEW (Fills all remaining height: flex: 1, min-height: 0, width: 100%, height: 100%, no border) */}
      {mode === 'signbridge' && (
        <div className="w-full flex-1 min-h-0 flex flex-col mt-2 sm:mt-2.5 overflow-hidden rounded-2xl md:rounded-3xl border-0">
          <iframe
            key={iframeKey}
            src="https://sign-bridge-1.ai.studio"
            title="SignBridge AI Workspace"
            allow="camera; microphone; autoplay; fullscreen"
            className="w-full h-full flex-1 min-h-0 border-0 block bg-[#050b1a]"
            style={{ width: '100%', height: '100%', border: 'none' }}
          />
        </div>
      )}

      {/* MODE 1: SIGN TO TEXT */}
      {mode === 'sign-to-text' && (
        <div className="space-y-4">
          {/* 1. MODE SWITCH: above the camera, three options: Words, Letters (offline), and Type letters + Offline badge */}
          <div className="flex items-center justify-between flex-wrap gap-2.5 p-3 rounded-2xl bg-[#0d1630] border border-[#1a274c]">
            <div className="flex items-center gap-1.5 p-1 bg-[#050b1a] rounded-xl border border-[#1a274c] overflow-x-auto scrollbar-none">
              <button
                type="button"
                onClick={() => {
                  setSignSubMode('words');
                  smootherRef.current.reset();
                  letterSmootherRef.current.reset();
                  liveTrailRef.current = [];
                  liveNormMotionRef.current = [];
                  setStatusLine(isStreaming ? 'Hold steady...' : 'No hand detected');
                }}
                className={`px-3.5 sm:px-4 py-2 rounded-lg text-xs font-black transition-all cursor-pointer whitespace-nowrap ${
                  signSubMode === 'words'
                    ? 'bg-[#0ea5e9] text-white shadow-[0_0_15px_rgba(14,165,233,0.4)]'
                    : 'text-[#94a3b8] hover:text-white'
                }`}
              >
                Words
              </button>
              <button
                type="button"
                onClick={() => {
                  setSignSubMode('letters');
                  smootherRef.current.reset();
                  letterSmootherRef.current.reset();
                  liveTrailRef.current = [];
                  liveNormMotionRef.current = [];
                  setStatusLine(isStreaming ? 'Hold steady...' : 'No hand detected');
                }}
                className={`px-3.5 sm:px-4 py-2 rounded-lg text-xs font-black transition-all cursor-pointer whitespace-nowrap ${
                  signSubMode === 'letters'
                    ? 'bg-[#0ea5e9] text-white shadow-[0_0_15px_rgba(14,165,233,0.4)]'
                    : 'text-[#94a3b8] hover:text-white'
                }`}
              >
                Letters (offline)
              </button>
              <button
                type="button"
                onClick={() => {
                  setSignSubMode('type-letters');
                  setStatusLine('Keyboard ready');
                }}
                className={`px-3.5 sm:px-4 py-2 rounded-lg text-xs font-black transition-all cursor-pointer whitespace-nowrap ${
                  signSubMode === 'type-letters'
                    ? 'bg-[#0ea5e9] text-white shadow-[0_0_15px_rgba(14,165,233,0.4)]'
                    : 'text-[#94a3b8] hover:text-white'
                }`}
              >
                Type letters
              </button>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Requirement 10: Offline status badge */}
              {(signSubMode === 'letters' || signSubMode === 'type-letters') && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-[11px] font-bold text-emerald-300">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Offline mode: recognition runs on this device</span>
                </div>
              )}

              {signSubMode === 'letters' && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowModelVision((v) => !v)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition-all cursor-pointer shadow-xs ${
                      showModelVision
                        ? 'bg-amber-500/20 text-amber-300 border-amber-400/60 shadow-[0_0_12px_rgba(245,158,11,0.3)]'
                        : 'bg-[#050b1a] text-[#94a3b8] hover:text-white border-[#1a274c] hover:border-amber-400/40'
                    }`}
                    title="Toggle diagnostic overlay: joint numbers, nearest training neighbor distance and threshold"
                  >
                    <Eye className="w-3.5 h-3.5 text-amber-400" />
                    <span>Show what model sees</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-950/80 border border-amber-500/30 text-amber-300">
                      {showModelVision ? 'ON' : 'OFF'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsTrainingOpen(true)}
                    className="px-3.5 py-2 rounded-xl text-xs font-black bg-[#050b1a] hover:bg-[#131e3d] text-[#0ea5e9] hover:text-white border border-[#1a274c] hover:border-[#0ea5e9] flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-[#0ea5e9]" />
                    <span>Teach letters</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 bg-sky-950/70 border border-sky-500/30 rounded text-sky-300">
                      {trainingData.stillSamples.length + trainingData.motionSamples.length}
                    </span>
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Camera / Hand Tracker Box (or Keyboard info when in Type letters) */}
            <div className="lg:col-span-7 space-y-4">
              <div className="relative w-full rounded-3xl bg-black border border-sky-400/40 shadow-[0_0_30px_rgba(14,165,233,0.25)] min-h-[360px] sm:min-h-[440px] flex flex-col items-center justify-center overflow-hidden">
                {/* Corner cyan tech brackets */}
                <div className="absolute top-4 left-4 w-6 h-6 border-t-2 border-l-2 border-[#0ea5e9] rounded-tl-lg pointer-events-none z-20" />
                <div className="absolute top-4 right-4 w-6 h-6 border-t-2 border-r-2 border-[#0ea5e9] rounded-tr-lg pointer-events-none z-20" />
                <div className="absolute bottom-16 left-4 w-6 h-6 border-b-2 border-l-2 border-[#0ea5e9] rounded-bl-lg pointer-events-none z-20" />
                <div className="absolute bottom-16 right-4 w-6 h-6 border-b-2 border-r-2 border-[#0ea5e9] rounded-br-lg pointer-events-none z-20" />

                {/* Live Video Element: Mirrored, fills the box, autoplay, muted, playsInline */}
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  className={`absolute inset-0 w-full h-full object-cover -scale-x-100 transition-opacity duration-300 ${
                    isStreaming ? 'opacity-100' : 'opacity-0 pointer-events-none'
                  }`}
                />

                {/* Hand Landmarks Canvas Overlay on top of video */}
                <canvas
                  ref={canvasRef}
                  className={`absolute inset-0 w-full h-full object-cover -scale-x-100 pointer-events-none z-10 transition-opacity duration-300 ${
                    isStreaming ? 'opacity-100' : 'opacity-0'
                  }`}
                />

                {/* Floating Top HUD when streaming: Status line ("No hand detected", "Hold steady...", or recognised sign) and stability */}
                {isStreaming && (
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1.5 max-w-[92%]">
                    <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-[#050b1a]/90 backdrop-blur-md border border-sky-400/50 shadow-[0_0_20px_rgba(14,165,233,0.3)] text-xs font-bold text-white">
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${
                          statusLine === 'No hand detected'
                            ? 'bg-slate-400'
                            : statusLine === 'Hold steady...' || isModelLoading
                            ? 'bg-amber-400 animate-pulse'
                            : 'bg-emerald-400 animate-pulse'
                        }`}
                      />
                      <span className="tracking-wide uppercase font-black">
                        {isModelLoading ? 'Loading hand model...' : statusLine}
                      </span>
                      {stability > 0 && (
                        <span className="font-mono text-emerald-400 font-extrabold text-[11px] bg-emerald-950/70 px-2 py-0.5 rounded border border-emerald-500/30">
                          Stability: {stability.toFixed(1)}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Camera Error Message: Permission denied or no camera found */}
                {cameraError && (
                  <div className="relative z-20 w-[92%] max-w-md p-5 rounded-2xl bg-[#1e0a14]/95 backdrop-blur-md border border-rose-500/70 shadow-[0_0_35px_rgba(244,63,94,0.35)] text-left space-y-3.5 my-6">
                    <div className="flex items-start gap-3">
                      <div className="p-2.5 rounded-xl bg-rose-950 text-rose-300 border border-rose-500/50 shrink-0">
                        <AlertTriangle className="w-5 h-5 text-rose-400" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-black text-rose-100 uppercase tracking-wide">
                          {cameraError.title}
                        </h4>
                        <p className="text-xs text-rose-200/90 mt-1 font-medium leading-relaxed">
                          {cameraError.message}
                        </p>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-black/60 border border-rose-900/60 space-y-2 text-xs text-rose-200/90">
                      <p className="font-extrabold text-rose-300 uppercase tracking-wider text-[10px]">
                        How to fix:
                      </p>
                      <ol className="list-decimal list-inside space-y-1.5 text-[11px] leading-relaxed text-rose-100/90">
                        {cameraError.fixSteps.map((step, idx) => (
                          <li key={idx}>{step}</li>
                        ))}
                      </ol>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={startWebcam}
                        className="px-4 py-2 rounded-xl text-xs font-black bg-rose-600 hover:bg-rose-500 text-white flex items-center gap-1.5 transition-colors cursor-pointer shadow-md"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                        <span>Retry Camera</span>
                      </button>
                      <button
                        onClick={() => setCameraError(null)}
                        className="px-3.5 py-2 rounded-xl text-xs font-bold bg-[#050b1a] hover:bg-[#131e3d] text-[#94a3b8] hover:text-white border border-[#1a274c] transition-colors cursor-pointer"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}

                {/* Hand emoji shown ONLY when camera is NOT playing and no error */}
                {!isStreaming && !cameraError && (
                  <div className="relative z-10 flex flex-col items-center justify-center text-center space-y-4 p-6">
                    <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-full bg-[#0d1630]/90 border border-sky-400/50 flex items-center justify-center shadow-[0_0_35px_rgba(14,165,233,0.3)]">
                      <span className="text-5xl sm:text-7xl">✋</span>
                    </div>

                    <div className="space-y-1">
                      <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#0d1630] border border-[#1a274c] text-xs font-bold text-[#0ea5e9]">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>
                          {signSubMode === 'letters'
                            ? 'Offline k-NN Letters (A–Z) & Motion Trails'
                            : signSubMode === 'type-letters'
                            ? 'Direct Keyboard Input & Speller'
                            : 'Neural Hand Landmarker 21 Keypoints'}
                        </span>
                      </div>
                      <h3 className="text-xl sm:text-2xl font-black text-white">
                        {signSubMode === 'type-letters'
                          ? 'Type letters directly below'
                          : signSubMode === 'letters'
                          ? 'Waiting for letter sign'
                          : 'Waiting for gesture'}
                      </h3>
                      <p className="text-xs text-[#94a3b8] max-w-xs font-medium">
                        {signSubMode === 'type-letters'
                          ? 'Use the on-screen keyboard below or press keys on your physical keyboard.'
                          : 'Press "Start Webcam" below to enable live video and real-time hand recognition.'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Camera toggle bar & real FPS / Model info */}
                <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between z-20 bg-[#050b1a]/85 backdrop-blur-md px-3.5 py-2 rounded-2xl border border-[#1a274c]">
                  <button
                    onClick={cameraActive ? stopWebcam : startWebcam}
                    disabled={cameraStarting}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 border transition-all cursor-pointer ${
                      cameraActive
                        ? 'bg-rose-950/80 text-rose-300 border-rose-500/50 hover:bg-rose-900/90'
                        : 'bg-[#0d1630] text-[#0ea5e9] hover:text-white border-sky-500/40 hover:bg-[#131e3d]'
                    } disabled:opacity-50`}
                  >
                    {cameraStarting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0ea5e9]" />
                        <span>Starting Camera...</span>
                      </>
                    ) : cameraActive ? (
                      <>
                        <CameraOff className="w-3.5 h-3.5 text-rose-400" />
                        <span>Stop Webcam</span>
                      </>
                    ) : (
                      <>
                        <Camera className="w-3.5 h-3.5 text-[#0ea5e9]" />
                        <span>Start Webcam</span>
                      </>
                    )}
                  </button>

                  {/* Real frame rate and model name */}
                  <div className="text-[11px] font-mono text-[#94a3b8] flex items-center gap-1.5 flex-wrap justify-end">
                    {isStreaming ? (
                      <>
                        <span className="text-emerald-400 font-bold">FPS: {realFps}</span>
                        {activeModelName ? (
                          <>
                            <span className="text-slate-600">·</span>
                            <span className="text-sky-300 font-medium">Model: {activeModelName}</span>
                          </>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-slate-400">Camera: Inactive</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Requirement 11: Honesty Note under the camera */}
              {signSubMode === 'words' ? (
                <div className="p-4 rounded-2xl bg-[#0d1630] border border-[#1a274c] space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-sky-400">
                    <Sparkles className="w-4 h-4 text-sky-400 shrink-0" />
                    <span>Prototype: recognises 6 still gestures</span>
                  </div>
                  <p className="text-[11px] text-[#94a3b8] leading-relaxed">
                    HELLO (all 5 fingers extended) · YES (closed fist) · GOOD (thumb up only) · I LOVE YOU (thumb + index + pinky) · PEACE (index + middle) · ONE (index only).
                  </p>
                </div>
              ) : signSubMode === 'letters' ? (
                <div className="p-4 rounded-2xl bg-[#0d1630] border border-[#1a274c] space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-sky-400">
                    <Sparkles className="w-4 h-4 text-sky-400 shrink-0" />
                    <span>Alphabet Recognition (A–Z)</span>
                  </div>
                  <p className="text-[11px] text-[#94a3b8] leading-relaxed">
                    Prototype: runs 100% offline in browser with no backend or API calls. Recognises still letters A-Y using k-NN and motion letters J and Z using fingertip trajectory matching. Letters are learned from the user&apos;s own recorded samples.
                  </p>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-[#0d1630] border border-[#1a274c] space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-sky-400">
                    <Type className="w-4 h-4 text-sky-400 shrink-0" />
                    <span>Type Letters Backup Mode</span>
                  </div>
                  <p className="text-[11px] text-[#94a3b8] leading-relaxed">
                    Tap the on-screen keyboard below or type using your physical keyboard. All letters are placed into the same output box.
                  </p>
                </div>
              )}

              {/* Preset Chips (Words mode) OR Keyboard (Type letters mode) OR Quick Keys (Letters mode) */}
              {signSubMode === 'words' ? (
                <div className="p-5 rounded-3xl bg-[#0d1630] border border-[#1a274c] space-y-2.5">
                  <p className="text-xs font-extrabold uppercase tracking-wider text-[#94a3b8]">
                    Quick Preset Chips (Click to test gesture recognition)
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {PRESET_CHIPS.map((chip) => (
                      <button
                        key={chip}
                        onClick={() => simulateDetectGesture(chip)}
                        className="px-3.5 py-2 rounded-xl text-xs font-black bg-[#050b1a] hover:bg-[#131e3d] text-[#f8fafc] border border-[#1a274c] hover:border-[#0ea5e9] transition-all cursor-pointer"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                /* Requirement 9: On-screen A to Z keyboard with Space and Backspace */
                <div className="p-5 rounded-3xl bg-[#0d1630] border border-[#1a274c] space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-extrabold uppercase tracking-wider text-[#94a3b8]">
                      {signSubMode === 'type-letters'
                        ? 'On-Screen A to Z Keyboard (Physical keyboard also supported)'
                        : 'Alphabet Quick Test Keys (Click to test or spell)'}
                    </p>
                    {signSubMode === 'letters' && (
                      <button
                        type="button"
                        onClick={() => setIsTrainingOpen(true)}
                        className="text-xs font-bold text-[#0ea5e9] hover:underline"
                      >
                        Open Training Grid →
                      </button>
                    )}
                  </div>

                  {/* A to Z grid keyboard */}
                  <div className="grid grid-cols-7 sm:grid-cols-9 md:grid-cols-13 gap-1.5 sm:gap-2">
                    {LETTERS_LIST.map((char) => {
                      const isMotion = MOTION_LETTERS.has(char);
                      return (
                        <button
                          key={char}
                          type="button"
                          onClick={() => {
                            setLetterWordOutput((prev) => prev + char);
                            setSignToTextTranscript((prev) => [...prev, char]);
                          }}
                          title={`Add letter ${char}${isMotion ? ' (motion letter)' : ''}`}
                          className="h-10 rounded-xl text-sm font-black transition-all cursor-pointer border bg-[#050b1a] hover:bg-[#131e3d] text-[#f8fafc] border-[#1a274c] hover:border-[#0ea5e9] flex items-center justify-center active:scale-95 shadow-xs"
                        >
                          {char}
                        </button>
                      );
                    })}
                  </div>

                  {/* Space & Backspace buttons for the keyboard */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setLetterWordOutput((prev) => prev + ' ')}
                      className="flex-1 py-3 px-4 rounded-xl text-xs font-extrabold bg-[#050b1a] hover:bg-[#131e3d] text-[#f8fafc] border border-[#1a274c] hover:border-[#0ea5e9] transition-all cursor-pointer shadow-xs"
                    >
                      Space
                    </button>
                    <button
                      type="button"
                      onClick={() => setLetterWordOutput((prev) => prev.slice(0, -1))}
                      disabled={letterWordOutput.length === 0}
                      className="py-3 px-6 rounded-xl text-xs font-extrabold bg-[#050b1a] hover:bg-[#131e3d] text-[#f8fafc] border border-[#1a274c] hover:border-rose-400 transition-all cursor-pointer disabled:opacity-40 shadow-xs"
                    >
                      Backspace
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Live Transcript and Output */}
            <div className="lg:col-span-5 space-y-4">
              {/* Output for Letters mode or Type letters mode */}
              {(signSubMode === 'letters' || signSubMode === 'type-letters') && (
                <div className="p-5 sm:p-6 rounded-3xl bg-[#0d1630] border border-[#1a274c] space-y-4 shadow-lg">
                  <div className="flex items-center justify-between pb-3 border-b border-[#1a274c]">
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#94a3b8]">
                      {signSubMode === 'letters' ? 'Active Letter Detection' : 'Current Selected Letter'}
                    </h3>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/70 border border-emerald-500/30 px-2 py-0.5 rounded font-bold">
                        Stability: {stability.toFixed(1)}
                      </span>
                    </div>
                  </div>

                  {/* Large Current Letter Display with stability (Requirements 1, 4, 5) */}
                  <div className="flex items-center justify-center py-4 bg-[#050b1a] rounded-2xl border border-[#1a274c]">
                    <div className="flex flex-col items-center">
                      <span className={`text-6xl sm:text-7xl font-black tracking-widest font-mono ${
                        (currentLetterPrediction?.isNeutral || detectedGesture === 'Ready')
                          ? 'text-purple-400 text-4xl sm:text-5xl'
                          : (currentLetterPrediction?.isUncertain || detectedGesture === '?')
                          ? 'text-amber-400'
                          : 'text-white'
                      }`}>
                        {(currentLetterPrediction?.isNeutral || detectedGesture === 'Ready')
                          ? 'READY'
                          : (currentLetterPrediction?.isUncertain || detectedGesture === '?')
                          ? '?'
                          : (currentLetterPrediction?.letter || (detectedGesture.length === 1 ? detectedGesture : '—'))}
                      </span>
                      <span className="text-xs text-[#94a3b8] mt-2 font-medium text-center px-4">
                        {(currentLetterPrediction?.isNeutral || detectedGesture === 'Ready')
                          ? 'Hand at rest / Neutral transition (ready for next sign)'
                          : (currentLetterPrediction?.isUncertain || detectedGesture === '?')
                          ? `Uncertain sign (dist ${currentLetterPrediction ? currentLetterPrediction.distance.toFixed(2) : ''} > threshold ${currentLetterPrediction ? currentLetterPrediction.threshold.toFixed(2) : ''} or conf < 70%)`
                          : currentLetterPrediction
                          ? `Confidence: ${Math.round(currentLetterPrediction.confidence * 100)}% · Dist: ${currentLetterPrediction.distance.toFixed(2)}`
                          : isStreaming
                          ? 'Hold sign steady for 0.8s (or draw J/Z motion)'
                          : signSubMode === 'type-letters'
                          ? 'Tap keys or use keyboard'
                          : 'Camera off'}
                      </span>
                    </div>
                  </div>

                  {/* Word Built From Confirmed Letters (Requirement 8) */}
                  <div className="space-y-2">
                    <label className="text-xs font-extrabold uppercase tracking-wider text-[#94a3b8] block">
                      Spelled Word / Phrase
                    </label>
                    <div className="p-3.5 rounded-xl bg-[#050b1a] border border-[#1a274c] min-h-[56px] flex items-center justify-between flex-wrap gap-2">
                      <span className="text-lg sm:text-xl font-mono font-bold text-sky-300 break-all">
                        {letterWordOutput || <span className="text-slate-600 italic text-sm">Spelled letters will appear here...</span>}
                      </span>
                    </div>
                  </div>

                  {/* Controls: Space, Backspace, Clear, Speak (Requirement 8) */}
                  <div className="grid grid-cols-4 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setLetterWordOutput((prev) => prev + ' ')}
                      className="py-2.5 px-3 rounded-xl text-xs font-bold bg-[#050b1a] hover:bg-[#131e3d] text-[#f8fafc] border border-[#1a274c] hover:border-[#0ea5e9] transition-all cursor-pointer"
                    >
                      Space
                    </button>
                    <button
                      type="button"
                      onClick={() => setLetterWordOutput((prev) => prev.slice(0, -1))}
                      disabled={letterWordOutput.length === 0}
                      className="py-2.5 px-3 rounded-xl text-xs font-bold bg-[#050b1a] hover:bg-[#131e3d] text-[#f8fafc] border border-[#1a274c] hover:border-rose-400 transition-all cursor-pointer disabled:opacity-40"
                    >
                      Backspace
                    </button>
                    <button
                      type="button"
                      onClick={() => setLetterWordOutput('')}
                      disabled={letterWordOutput.length === 0}
                      className="py-2.5 px-3 rounded-xl text-xs font-bold bg-[#050b1a] hover:bg-[#131e3d] text-rose-400 border border-[#1a274c] hover:border-rose-500/50 transition-all cursor-pointer disabled:opacity-40"
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!letterWordOutput.trim()) return;
                        const speech = new SpeechSynthesisUtterance(letterWordOutput);
                        window.speechSynthesis?.speak(speech);
                      }}
                      disabled={letterWordOutput.trim().length === 0}
                      className="py-2.5 px-3 rounded-xl text-xs font-black bg-[#0ea5e9] hover:bg-sky-400 text-white flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-40"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                      <span>Speak</span>
                    </button>
                  </div>
                </div>
              )}

              {/* General Live Transcript and Output */}
              <div className="p-6 rounded-3xl bg-[#0d1630] border border-[#1a274c] space-y-4 shadow-lg">
                <div className="flex items-center justify-between pb-3 border-b border-[#1a274c]">
                  <h3 className="text-sm font-black uppercase tracking-wider text-[#f8fafc]">
                    Translated Spoken Output
                  </h3>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        const textToCopy = (signSubMode === 'letters' || signSubMode === 'type-letters') && letterWordOutput
                          ? letterWordOutput
                          : signToTextTranscript.join(' ');
                        navigator.clipboard?.writeText(textToCopy);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                      title="Copy transcript"
                      className="p-1.5 rounded-lg bg-[#050b1a] border border-[#1a274c] text-[#94a3b8] hover:text-white cursor-pointer"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => {
                        setSignToTextTranscript([]);
                        setLetterWordOutput('');
                      }}
                      title="Clear transcript"
                      className="p-1.5 rounded-lg bg-[#050b1a] border border-[#1a274c] text-[#94a3b8] hover:text-rose-400 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-[#050b1a] border border-[#1a274c] min-h-[180px] max-h-[260px] overflow-y-auto space-y-2">
                  {signToTextTranscript.length === 0 ? (
                    <p className="text-xs text-[#94a3b8] italic">
                      {signSubMode === 'type-letters'
                        ? 'Type letters using the keyboard below or your physical keyboard.'
                        : signSubMode === 'letters'
                        ? 'No letters recognized yet. Show hand in camera or use keyboard.'
                        : 'No gestures recognized yet. Make a sign or click preset chips.'}
                    </p>
                  ) : (
                    signToTextTranscript.map((t, idx) => (
                      <p key={idx} className="text-base sm:text-lg font-bold text-[#f8fafc]">
                        {t}
                      </p>
                    ))
                  )}
                </div>

                {/* Text-to-Speech synthesis trigger */}
                <button
                  onClick={() => {
                    const textToSpeak = (signSubMode === 'letters' || signSubMode === 'type-letters') && letterWordOutput
                      ? letterWordOutput
                      : signToTextTranscript.join(' ');
                    const speech = new SpeechSynthesisUtterance(textToSpeak);
                    window.speechSynthesis?.speak(speech);
                  }}
                  disabled={signToTextTranscript.length === 0 && letterWordOutput.length === 0}
                  className="w-full py-3.5 px-4 rounded-2xl font-black text-sm bg-[#0ea5e9] hover:bg-sky-400 text-white flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Volume2 className="w-4 h-4" />
                  <span>Speak Output Aloud</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODE 2: TEXT TO SIGN */}
      {mode === 'text-to-sign' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Input text with language dropdown, translation preview, controls */}
          <div className="lg:col-span-6 space-y-5">
            {/* Input Field with Language Dropdown next to it */}
            <div className="p-6 rounded-3xl bg-[#0d1630] border border-[#1a274c] space-y-3.5 shadow-lg">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <label htmlFor="tts-input" className="text-xs font-extrabold uppercase tracking-wider text-[#94a3b8] block">
                  Type text to synthesize into sign sequence
                </label>

                {/* Language Dropdown next to input */}
                <div className="flex items-center gap-1.5 bg-[#050b1a] px-2.5 py-1.5 rounded-xl border border-[#1a274c]">
                  <Languages className="w-3.5 h-3.5 text-[#0ea5e9] shrink-0" />
                  <select
                    id="tts-language-select"
                    aria-label="Select input language"
                    value={ttsLang}
                    onChange={(e) => {
                      const newLang = e.target.value as LanguageCode;
                      setTtsLang(newLang);
                    }}
                    className="bg-transparent text-xs font-bold text-[#f8fafc] focus:outline-none cursor-pointer pr-1"
                  >
                    {SUPPORTED_LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code} className="bg-[#0d1630] text-[#f8fafc]">
                        {l.label} ({l.nativeLabel})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="relative">
                <textarea
                  id="tts-input"
                  rows={3}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={
                    ttsLang === 'hi-IN'
                      ? 'यहाँ हिन्दी में लिखें... (उदा: मुझे डॉक्टर की ज़रूरत है)'
                      : ttsLang === 'te-IN'
                      ? 'ఇక్కడ తెలుగులో టైప్ చేయండి... (ఉదా: నాకు డాక్టర్ కావాలి)'
                      : 'Type words to translate into animated hand sign poses...'
                  }
                  className={`w-full px-4 py-3.5 rounded-2xl text-base font-bold bg-[#050b1a] border border-[#1a274c] text-[#f8fafc] focus:outline-none focus:border-[#0ea5e9] focus:ring-1 focus:ring-[#0ea5e9] placeholder-[#94a3b8]/50 resize-none ${
                    ttsLang === 'hi-IN' ? 'font-devanagari' : ttsLang === 'te-IN' ? 'font-telugu' : 'font-sans'
                  }`}
                />
              </div>

              {/* Synthesize / Translate Action Button */}
              <div className="flex items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-2">
                  {isOfflineModeActive && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-950/80 text-amber-400 border border-amber-500/40 shadow-xs">
                      <WifiOff className="w-3 h-3 text-amber-400" />
                      Offline mode
                    </span>
                  )}
                  {isTranslating && (
                    <span className="inline-flex items-center gap-1.5 text-xs text-[#0ea5e9] font-bold animate-pulse">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Translating via Gemini...
                    </span>
                  )}
                  {isSendingWebhook && (
                    <span className="inline-flex items-center gap-1.5 text-xs text-[#94a3b8] font-bold animate-pulse">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Connecting webhook...
                    </span>
                  )}
                </div>

                <button
                  onClick={() => processAndSynthesizeSignText(inputText, ttsLang)}
                  disabled={isTranslating || isSendingWebhook || !inputText.trim()}
                  className="px-4 py-2.5 rounded-xl font-black text-xs sm:text-sm bg-[#0ea5e9] hover:bg-sky-400 text-white flex items-center gap-2 transition-all cursor-pointer shadow-[0_0_15px_rgba(14,165,233,0.3)] disabled:opacity-50 shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{ttsLang !== 'en-IN' ? 'Translate & Sign' : 'Synthesize Sign'}</span>
                </button>
              </div>

              {/* Requirement 2: Show both lines "You typed: <original>" and "Signing: <English>" when language is Hindi or Telugu */}
              {originalTypedText && (
                <div className="p-3.5 rounded-2xl bg-[#050b1a] border border-[#1a274c] space-y-1.5 text-xs">
                  <div className="flex items-start gap-2">
                    <span className="text-[#94a3b8] font-extrabold uppercase shrink-0 text-[11px]">You typed:</span>
                    <span className={`text-[#f8fafc] font-bold break-words ${
                      ttsLang === 'hi-IN' ? 'font-devanagari' : ttsLang === 'te-IN' ? 'font-telugu' : 'font-sans'
                    }`}>
                      {originalTypedText}
                    </span>
                  </div>
                  {(ttsLang === 'hi-IN' || ttsLang === 'te-IN' || translatedEnglishText) && (
                    <div className="flex items-start gap-2 pt-1 border-t border-[#1a274c]/60">
                      <span className="text-[#0ea5e9] font-extrabold uppercase shrink-0 text-[11px]">Signing:</span>
                      <span className="text-white font-black break-words font-sans">
                        {translatedEnglishText || originalTypedText}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Reliability Failure / Offline Fallback Notice (Requirement 4) */}
              {ttsWebhookError && (
                <div
                  role="alert"
                  className="p-3.5 rounded-2xl border border-amber-500/40 bg-[#050b1a] text-amber-200 text-xs space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                      <span className="font-bold text-white">Server unreachable, using offline mode</span>
                    </div>
                    <button
                      onClick={() => setShowTtsDebugSnippet(!showTtsDebugSnippet)}
                      className="px-2 py-1 rounded-lg text-[11px] font-bold bg-[#0d1630] border border-[#1a274c] text-[#94a3b8] hover:text-[#f8fafc] cursor-pointer"
                    >
                      {showTtsDebugSnippet ? 'Hide details' : 'Show details'}
                    </button>
                  </div>
                  {showTtsDebugSnippet && (
                    <div className="pt-2 border-t border-[#1a274c] space-y-1">
                      <p className="text-[10px] text-[#94a3b8] font-mono">
                        Webhook Status: {ttsWebhookError.status || 'Timeout / Unreachable'}
                      </p>
                      <pre className="p-2 rounded-xl font-mono text-[11px] text-[#cbd5e1] bg-[#0d1630] border border-[#1a274c] whitespace-pre-wrap break-all overflow-x-auto">
                        {ttsWebhookError.snippet || '(No response text from server)'}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Quick Phrase Chips */}
            <div className="p-6 rounded-3xl bg-[#0d1630] border border-[#1a274c] space-y-3 shadow-lg">
              <p className="text-xs font-extrabold uppercase tracking-wider text-[#94a3b8]">
                Quick Phrase Chips (Counter Accessibility)
              </p>
              <div className="flex flex-wrap gap-2">
                {QUICK_PHRASES.map((phrase) => (
                  <button
                    key={phrase}
                    onClick={() => {
                      setInputText(phrase);
                      processAndSynthesizeSignText(phrase, 'en-IN');
                    }}
                    className="px-3.5 py-2 rounded-xl text-xs font-bold bg-[#050b1a] hover:bg-[#131e3d] text-[#cbd5e1] border border-[#1a274c] hover:border-[#0ea5e9] transition-all cursor-pointer text-left"
                  >
                    {phrase}
                  </button>
                ))}
              </div>
            </div>

            {/* Sequence Player Controls & Progress Bar */}
            <div className="p-6 rounded-3xl bg-[#0d1630] border border-[#1a274c] space-y-4 shadow-lg">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-wider text-[#94a3b8]">
                  Sequence Player Controls
                </span>
                <span className="text-xs font-mono font-bold text-[#0ea5e9]">
                  Step {currentStepIndex + 1} of {expandedSteps.length}
                </span>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-[#050b1a] rounded-full h-2.5 overflow-hidden border border-[#1a274c]">
                <div
                  className="bg-[#0ea5e9] h-2.5 rounded-full transition-all duration-300 shadow-[0_0_12px_#0ea5e9]"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              {/* Playback Button Controls */}
              <div className="flex items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentStepIndex((prev) => (prev > 0 ? prev - 1 : expandedSteps.length - 1))}
                    className="p-3 rounded-xl bg-[#050b1a] border border-[#1a274c] hover:border-[#0ea5e9] text-[#f8fafc] cursor-pointer transition-colors"
                    aria-label="Previous sign step"
                  >
                    <SkipBack className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="py-3 px-6 rounded-xl font-black text-sm bg-[#0ea5e9] hover:bg-sky-400 text-white flex items-center gap-2 transition-all cursor-pointer shadow-[0_0_20px_rgba(14,165,233,0.35)]"
                    aria-label={isPlaying ? 'Pause sequence' : 'Play sequence'}
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
                    <span>{isPlaying ? 'Pause' : 'Play'}</span>
                  </button>

                  <button
                    onClick={() => setCurrentStepIndex((prev) => (prev + 1) % expandedSteps.length)}
                    className="p-3 rounded-xl bg-[#050b1a] border border-[#1a274c] hover:border-[#0ea5e9] text-[#f8fafc] cursor-pointer transition-colors"
                    aria-label="Next sign step"
                  >
                    <SkipForward className="w-4 h-4" />
                  </button>
                </div>

                {/* Playback speed toggle */}
                <div className="flex items-center gap-1 bg-[#050b1a] p-1 rounded-xl border border-[#1a274c] text-xs font-bold">
                  {([0.5, 1, 1.5] as const).map((spd) => (
                    <button
                      key={spd}
                      onClick={() => setPlaybackSpeed(spd)}
                      className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                        playbackSpeed === spd
                          ? 'bg-[#0ea5e9] text-white'
                          : 'text-[#94a3b8] hover:text-white'
                      }`}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: 3D MediaPipe Animated Hand Skeleton Player Box */}
          <div className="lg:col-span-6 space-y-4">
            <div className="relative w-full rounded-3xl bg-black border border-sky-400/40 shadow-[0_0_35px_rgba(14,165,233,0.25)] min-h-[440px] sm:min-h-[520px] flex flex-col items-center justify-between p-6 overflow-hidden">
              {/* Corner cyan tech brackets */}
              <div className="absolute top-4 left-4 w-6 h-6 border-t-2 border-l-2 border-[#0ea5e9] rounded-tl-lg pointer-events-none" />
              <div className="absolute top-4 right-4 w-6 h-6 border-t-2 border-r-2 border-[#0ea5e9] rounded-tr-lg pointer-events-none" />
              <div className="absolute bottom-4 left-4 w-6 h-6 border-b-2 border-l-2 border-[#0ea5e9] rounded-bl-lg pointer-events-none" />
              <div className="absolute bottom-4 right-4 w-6 h-6 border-b-2 border-r-2 border-[#0ea5e9] rounded-br-lg pointer-events-none" />

              {/* Step indicator top banner */}
              <div className="w-full flex items-center justify-between z-10">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[#0ea5e9] bg-[#0d1630]/90 px-3 py-1 rounded-full border border-sky-500/30">
                    SignBridge 3D Hand Skeleton
                  </span>
                  {isOfflineModeActive && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-amber-300 bg-amber-950/80 px-2 py-0.5 rounded-full border border-amber-500/40">
                      <WifiOff className="w-2.5 h-2.5" />
                      Offline mode
                    </span>
                  )}
                </div>
                <span className="text-xs font-mono font-bold text-[#94a3b8]">
                  Frame: {currentStepIndex + 1}/{expandedSteps.length}
                </span>
              </div>

              {/* Animated Hand Skeleton Player Canvas */}
              <div className="w-full flex-1 flex flex-col items-center justify-center my-auto z-10 py-1">
                <div className="relative w-full max-w-[320px] sm:max-w-[380px] aspect-square rounded-3xl bg-[#050b1a]/90 border border-sky-400/40 shadow-[0_0_35px_rgba(14,165,233,0.25)] flex items-center justify-center overflow-hidden p-2">
                  <HandSkeletonPlayer
                    currentSign={currentStep?.phraseLabel || 'HELLO'}
                    currentLetter={currentStep?.activeLetter || 'H'}
                    isPause={currentStep?.isPause || false}
                    playbackSpeed={playbackSpeed}
                    isPlaying={isPlaying}
                  />

                  {/* Active letter HUD tag in top corner */}
                  {!currentStep?.isPause && currentStep?.activeLetter && (
                    <div className="absolute top-3 right-3 px-3 py-1 rounded-xl bg-[#0d1630]/90 border border-sky-400/60 text-white font-mono font-black text-base sm:text-lg shadow-[0_0_15px_rgba(14,165,233,0.3)]">
                      {currentStep.activeLetter}
                    </div>
                  )}
                </div>

                {/* Real Current Sign Label */}
                <div className="text-center space-y-1.5 mt-3">
                  <p className="text-xs uppercase tracking-widest text-[#0ea5e9] font-black">
                    Current sign
                  </p>
                  <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center justify-center gap-2">
                    {currentStep?.isPause ? (
                      <span className="text-amber-400 font-mono">PAUSE</span>
                    ) : (
                      <>
                        <span>{currentStep?.phraseLabel}</span>
                        {currentStep?.type === 'phrase' && currentStep?.activeLetter && (
                          <span className="text-sm font-mono font-bold text-sky-400 bg-[#0d1630] px-2.5 py-0.5 rounded-lg border border-[#1a274c]">
                            Letter: {currentStep.activeLetter}
                          </span>
                        )}
                      </>
                    )}
                  </h2>
                  <p className="text-xs text-[#94a3b8] max-w-sm mx-auto font-medium">
                    {currentStep?.isPause
                      ? 'Holding rest pose during inter-word pause.'
                      : currentStep?.type === 'phrase'
                      ? `Spelling letter '${currentStep.activeLetter}' of word '${currentStep.phraseLabel}' in ASL alphabet.`
                      : `ASL finger-spelling posture for letter '${currentStep?.activeLetter}'.`}
                  </p>
                </div>
              </div>

              {/* Sequence ribbon at bottom of viewer */}
              <div className="w-full z-10 flex items-center gap-1.5 overflow-x-auto py-2 scrollbar-none">
                {expandedSteps.map((step, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentStepIndex(idx)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black shrink-0 transition-all cursor-pointer ${
                      idx === currentStepIndex
                        ? 'bg-[#0ea5e9] text-white shadow-[0_0_12px_#0ea5e9]'
                        : 'bg-[#0d1630] text-[#94a3b8] border border-[#1a274c]'
                    }`}
                  >
                    {step.isPause
                      ? 'PAUSE'
                      : step.type === 'phrase'
                      ? `${step.phraseLabel} (${step.activeLetter})`
                      : step.activeLetter}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODE 3: SPEECH TO TEXT */}
      {mode === 'speech-to-text' && (
        <div className="space-y-4">
          <div className="p-4 sm:p-5 rounded-3xl bg-[#0d1630] border border-[#1a274c] flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full font-black text-xs uppercase tracking-wider ${
                  speechListening
                    ? 'bg-rose-950 text-rose-300 border border-rose-500/50'
                    : 'bg-[#050b1a] text-[#94a3b8] border border-[#1a274c]'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${speechListening ? 'bg-rose-500 animate-ping' : 'bg-[#94a3b8]'}`} />
                <span>{speechListening ? 'Live Listening Active' : 'Captions Standby'}</span>
              </div>

              {/* Language Dropdown next to speech input (Requirement 1 & 3: en-IN, hi-IN, te-IN) */}
              <div className="flex items-center gap-1.5 bg-[#050b1a] px-3 py-1.5 rounded-xl border border-[#1a274c]">
                <Globe className="w-3.5 h-3.5 text-[#0ea5e9] shrink-0" />
                <label htmlFor="stt-language-select" className="sr-only">Speech Recognition Language</label>
                <select
                  id="stt-language-select"
                  aria-label="Select speech recognition language"
                  value={sttLang}
                  onChange={(e) => {
                    const newLang = e.target.value as LanguageCode;
                    setSttLang(newLang);
                  }}
                  className="bg-transparent text-xs font-bold text-[#f8fafc] focus:outline-none cursor-pointer pr-1"
                >
                  {SUPPORTED_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code} className="bg-[#0d1630] text-[#f8fafc]">
                      {l.label} ({l.nativeLabel})
                    </option>
                  ))}
                </select>
              </div>

              {!speechSupported && (
                <span className="text-xs font-bold text-amber-400 bg-amber-950/40 px-3 py-1 rounded-full border border-amber-500/30">
                  Simulation Demo
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Text Size options */}
              <button
                onClick={() => {
                  if (fontSize === 'large') setFontSize('huge');
                  else if (fontSize === 'huge') setFontSize('giant');
                  else setFontSize('large');
                }}
                className="px-3 py-1.5 rounded-xl bg-[#050b1a] border border-[#1a274c] text-[#94a3b8] hover:text-[#f8fafc] text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Type className="w-3.5 h-3.5 text-[#0ea5e9]" />
                <span>Size: {fontSize.toUpperCase()}</span>
              </button>

              <button
                onClick={() => {
                  navigator.clipboard?.writeText(speechTranscript.join('\n'));
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="p-2 rounded-xl bg-[#050b1a] border border-[#1a274c] text-[#94a3b8] hover:text-[#f8fafc] cursor-pointer"
                title="Copy captions"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>

              <button
                onClick={() => {
                  setSpeechTranscript([]);
                  setSpeechInterim('');
                }}
                className="p-2 rounded-xl bg-[#050b1a] border border-[#1a274c] text-[#94a3b8] hover:text-rose-400 cursor-pointer"
                title="Clear transcript"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Large Captions Display Box in Dark Navy Card */}
          <div className="min-h-[50vh] rounded-3xl p-6 sm:p-8 lg:p-10 bg-[#0d1630] border border-[#1a274c] shadow-inner space-y-4 overflow-y-auto">
            {speechTranscript.length === 0 && !speechInterim && (
              <div className="h-full min-h-[260px] flex flex-col items-center justify-center text-center text-[#94a3b8] space-y-3">
                <Volume2 className="w-12 h-12 opacity-30 text-[#0ea5e9]" />
                <p className="text-base sm:text-lg font-bold text-[#f8fafc]">
                  Waiting for spoken voice ({SUPPORTED_LANGUAGES.find((l) => l.code === sttLang)?.label})...
                </p>
                <p className="text-xs sm:text-sm max-w-md text-[#94a3b8]">
                  Tap &ldquo;Start Live Captions&rdquo; below and speak into your microphone in {SUPPORTED_LANGUAGES.find((l) => l.code === sttLang)?.label} ({sttLang}).
                </p>
              </div>
            )}

            {speechTranscript.map((line, idx) => (
              <p
                key={idx}
                className={`text-[#f8fafc] ${
                  sttLang === 'hi-IN' ? 'font-devanagari' : sttLang === 'te-IN' ? 'font-telugu' : 'font-sans'
                } ${
                  fontSize === 'giant'
                    ? 'text-3xl sm:text-5xl leading-relaxed font-black'
                    : fontSize === 'huge'
                    ? 'text-2xl sm:text-4xl leading-relaxed font-bold'
                    : 'text-xl sm:text-2xl leading-relaxed font-semibold'
                }`}
              >
                {line}
              </p>
            ))}

            {speechInterim && (
              <p
                className={`text-[#0ea5e9] italic animate-pulse ${
                  sttLang === 'hi-IN' ? 'font-devanagari' : sttLang === 'te-IN' ? 'font-telugu' : 'font-sans'
                } ${
                  fontSize === 'giant'
                    ? 'text-3xl sm:text-5xl font-black'
                    : fontSize === 'huge'
                    ? 'text-2xl sm:text-4xl font-bold'
                    : 'text-xl sm:text-2xl font-semibold'
                }`}
              >
                {speechInterim}...
              </p>
            )}
          </div>

          {/* Dedicated Language Selector above Start Live Captions button */}
          <div className="p-4 sm:p-5 rounded-3xl bg-[#0d1630] border border-[#1a274c] shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-[#0ea5e9]" />
                <span className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-[#f8fafc]">
                  Speech Recognition Language
                </span>
                {speechListening && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-950/80 text-rose-300 border border-rose-500/40">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping" />
                    Live
                  </span>
                )}
              </div>
              <p className="text-xs text-[#94a3b8]">
                Changes recognition engine to Hindi, Telugu, or English India in real time.
              </p>
            </div>

            {/* Language Selection Buttons & Dropdown */}
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              {SUPPORTED_LANGUAGES.map((l) => {
                const isSelected = sttLang === l.code;
                return (
                  <button
                    key={l.code}
                    onClick={() => {
                      if (sttLang !== l.code) {
                        handleSelectSttLanguage(l.code);
                      }
                    }}
                    className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#0ea5e9] text-white shadow-[0_0_15px_rgba(14,165,233,0.35)] font-black'
                        : 'bg-[#050b1a] text-[#94a3b8] hover:text-[#f8fafc] border border-[#1a274c] hover:border-[#0ea5e9]'
                    }`}
                  >
                    <span className={l.fontClass}>{l.nativeLabel}</span>
                    <span className="text-[11px] opacity-75 font-normal">({l.label})</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Large Start/Stop Button */}
          <button
            onClick={toggleSpeech}
            className={`w-full py-4 sm:py-5 px-8 rounded-2xl font-black text-lg sm:text-xl md:text-2xl flex items-center justify-center gap-3 transition-all transform active:scale-98 shadow-xl cursor-pointer ${
              speechListening
                ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/40'
                : 'bg-[#0ea5e9] hover:bg-sky-400 text-white shadow-[0_0_25px_rgba(14,165,233,0.4)]'
            }`}
          >
            {speechListening ? (
              <>
                <MicOff className="w-6 h-6 animate-pulse" />
                <span>Stop Captions</span>
              </>
            ) : (
              <>
                <Mic className="w-6 h-6" />
                <span>Start Live Captions</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* MODE 4: DICTIONARY */}
      {mode === 'dictionary' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Search & Dictionary List */}
          <div className="lg:col-span-6 space-y-4">
            {/* Search Input Field */}
            <div className="p-4 rounded-3xl bg-[#0d1630] border border-[#1a274c] space-y-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search sign words, alphabet, categories..."
                  className="w-full pl-11 pr-4 py-3 rounded-2xl bg-[#050b1a] border border-[#1a274c] text-[#f8fafc] text-sm font-bold focus:outline-none focus:border-[#0ea5e9] placeholder-[#94a3b8]/50"
                />
              </div>
            </div>

            {/* Dictionary List */}
            <div className="p-4 rounded-3xl bg-[#0d1630] border border-[#1a274c] space-y-2 max-h-[500px] overflow-y-auto">
              {filteredDict.map((entry) => {
                const isSelected = selectedDictEntry.word === entry.word;
                return (
                  <div
                    key={entry.word}
                    onClick={() => setSelectedDictEntry(entry)}
                    className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 cursor-pointer ${
                      isSelected
                        ? 'bg-[#050b1a] border-[#0ea5e9] text-white shadow-[0_0_15px_rgba(14,165,233,0.25)]'
                        : 'bg-[#050b1a]/60 border-[#1a274c] hover:border-[#1e3a6a] text-[#f8fafc]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl w-10 h-10 rounded-xl bg-[#0d1630] flex items-center justify-center border border-[#1a274c]">
                        {entry.symbol}
                      </span>
                      <div>
                        <h4 className="font-black text-sm text-[#f8fafc]">{entry.word}</h4>
                        <p className="text-[11px] text-[#94a3b8]">{entry.handshape}</p>
                      </div>
                    </div>

                    <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded-lg bg-[#0d1630] text-[#0ea5e9] border border-[#1a274c]">
                      {entry.category}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Hand Viewer Box displaying selected dictionary sign */}
          <div className="lg:col-span-6 space-y-4">
            <div className="relative w-full rounded-3xl bg-black border border-sky-400/40 shadow-[0_0_35px_rgba(14,165,233,0.25)] min-h-[460px] flex flex-col items-center justify-between p-6">
              {/* Corner cyan tech brackets */}
              <div className="absolute top-4 left-4 w-6 h-6 border-t-2 border-l-2 border-[#0ea5e9] rounded-tl-lg pointer-events-none" />
              <div className="absolute top-4 right-4 w-6 h-6 border-t-2 border-r-2 border-[#0ea5e9] rounded-tr-lg pointer-events-none" />
              <div className="absolute bottom-4 left-4 w-6 h-6 border-b-2 border-l-2 border-[#0ea5e9] rounded-bl-lg pointer-events-none" />
              <div className="absolute bottom-4 right-4 w-6 h-6 border-b-2 border-r-2 border-[#0ea5e9] rounded-br-lg pointer-events-none" />

              <div className="w-full flex items-center justify-between z-10">
                <span className="text-xs font-bold text-[#0ea5e9] bg-[#0d1630]/90 px-3 py-1 rounded-full border border-sky-500/30">
                  Dictionary Pose Guide
                </span>
                <span className="text-xs font-mono font-bold text-[#94a3b8]">
                  Category: {selectedDictEntry.category}
                </span>
              </div>

              <div className="my-auto text-center space-y-5 z-10">
                <div className="w-36 h-36 sm:w-44 sm:h-44 rounded-full bg-[#0d1630] border-2 border-[#0ea5e9]/50 flex items-center justify-center shadow-[0_0_40px_rgba(14,165,233,0.3)] mx-auto">
                  <span className="text-6xl sm:text-7xl select-none">
                    {selectedDictEntry.symbol}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <h3 className="text-3xl font-black text-white tracking-tight">
                    {selectedDictEntry.word}
                  </h3>
                  <p className="text-xs font-bold uppercase tracking-wider text-[#0ea5e9]">
                    Handshape: {selectedDictEntry.handshape}
                  </p>
                  <p className="text-xs sm:text-sm text-[#94a3b8] max-w-sm mx-auto leading-relaxed">
                    {selectedDictEntry.description}
                  </p>
                </div>
              </div>

              {/* Action: Use in Text to Sign */}
              <button
                onClick={() => {
                  setInputText(selectedDictEntry.word);
                  setMode('text-to-sign');
                }}
                className="w-full py-3 rounded-2xl font-black text-xs sm:text-sm bg-[#0ea5e9] hover:bg-sky-400 text-white flex items-center justify-center gap-2 transition-all cursor-pointer z-10 shadow-md"
              >
                <Hand className="w-4 h-4" />
                <span>Simulate &ldquo;{selectedDictEntry.word}&rdquo; in Sequence Player</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Teach Letters Modal */}
      <LetterTrainingModal
        isOpen={isTrainingOpen}
        onClose={() => setIsTrainingOpen(false)}
        stillSamples={trainingData.stillSamples}
        motionSamples={trainingData.motionSamples}
        onDataChange={(newData) => {
          setTrainingData(newData);
          saveStoredData(newData);
        }}
        latestLandmarksRef={latestLandmarksRef}
        latestIsLeftHandRef={latestIsLeftHandRef}
        isCameraActive={cameraActive && isStreaming}
      />
    </div>
  );
};
