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
  Loader2
} from 'lucide-react';
import { SIGN_BRIDGE_URL } from '../constants';
import { translateToEnglish } from '../services/translate';
import { sendTextToSignWebhook, WebhookResult } from '../services/webhook';
import { buildOfflineSignSequence, SignSequenceItem } from '../services/signSequence';
import { 
  handLandmarkerService, 
  drawHandLandmarks, 
  classifyHandGesture 
} from '../services/handLandmarker';
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
  'HELLO', 'THANK YOU', 'PLEASE', 'HELP', 'DOCTOR', 'WATER', 'YES', 'NO'
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

  // Sign to Text State
  const [cameraActive, setCameraActive] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraError, setCameraError] = useState<{
    title: string;
    message: string;
    fixSteps: string[];
  } | null>(null);
  const [realFps, setRealFps] = useState<number>(0);
  const [activeModelName, setActiveModelName] = useState<string | null>(null);
  const [detectedGesture, setDetectedGesture] = useState<string>('WAITING FOR GESTURE');
  const [confidence, setConfidence] = useState<number>(0);
  const [signToTextTranscript, setSignToTextTranscript] = useState<string[]>([
    'Hello',
    'Thank you for assisting me'
  ]);

  // Webcam & Landmark Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const framesCountRef = useRef<number>(0);
  const lastFpsTimeRef = useRef<number>(0);
  const lastGestureAddedTimeRef = useRef<number>(0);
  const lastDetectedGestureRef = useRef<string>('');

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
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
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
            .then(() => {
              setIsStreaming(true);
              handLandmarkerService.initialize().then((loaded) => {
                if (loaded) {
                  setActiveModelName(handLandmarkerService.getModelName());
                }
              });
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
    setRealFps(0);
    setActiveModelName(null);
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

        if (handLandmarkerService.getModelName() && !activeModelName) {
          setActiveModelName(handLandmarkerService.getModelName());
        }

        const landmarksList = handLandmarkerService.detectForVideo(video, now);
        const ctx = canvas.getContext('2d');

        if (ctx) {
          drawHandLandmarks(ctx, landmarksList || [], canvas.width, canvas.height);
        }

        if (landmarksList && landmarksList.length > 0) {
          const classification = classifyHandGesture(landmarksList[0]);
          if (classification) {
            setDetectedGesture(classification.gesture);
            setConfidence(classification.confidence);

            const timeSinceLast = now - lastGestureAddedTimeRef.current;
            if (
              timeSinceLast > 3000 &&
              classification.gesture !== lastDetectedGestureRef.current &&
              classification.gesture !== 'GESTURE DETECTED'
            ) {
              lastGestureAddedTimeRef.current = now;
              lastDetectedGestureRef.current = classification.gesture;
              setSignToTextTranscript((prev) => [...prev, classification.gesture]);
            }
          }
        } else {
          setDetectedGesture('WAITING FOR GESTURE');
          setConfidence(0);
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
  }, [isStreaming]);

  const simulateDetectGesture = (word: string) => {
    setDetectedGesture(word);
    setConfidence(Math.floor(Math.random() * 8) + 92);
    setSignToTextTranscript((prev) => [...prev, word]);
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
          ? 'flex flex-col h-full w-full p-2 sm:p-3 md:p-4 overflow-hidden'
          : 'max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 space-y-6 overflow-y-auto min-h-full pb-20 md:pb-8'
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

      {/* MODE 0: SIGNBRIDGE VIEW (Fills all available space: full width, calc(100dvh minus header and tab bar), no extra inner scrolling area, no double scrollbar, rounded corners, thin dark theme border, allow="camera; microphone; autoplay; fullscreen") */}
      {mode === 'signbridge' && (
        <div
          className="w-full flex-1 min-h-0 flex flex-col mt-2 sm:mt-2.5 overflow-hidden"
          style={{
            height: 'calc(100dvh - var(--header-tabbar-offset, 13rem))',
          }}
        >
          <div
            className={`w-full h-full flex-1 min-h-0 rounded-2xl md:rounded-3xl border ${
              highContrast ? 'border-amber-400 bg-black' : 'border-[#1a274c] bg-[#050b1a]'
            } overflow-hidden shadow-2xl relative`}
          >
            <iframe
              key={iframeKey}
              src={SIGN_BRIDGE_URL}
              title="SignBridge AI Workspace"
              allow="camera; microphone; autoplay; fullscreen"
              className="w-full h-full border-0 block bg-[#050b1a]"
            />
          </div>
        </div>
      )}

      {/* MODE 1: SIGN TO TEXT */}
      {mode === 'sign-to-text' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Black hand viewer box with subtle cyan glow border */}
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

              {/* Floating Top HUD when streaming */}
              {isStreaming && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
                  <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#050b1a]/85 backdrop-blur-md border border-sky-400/50 shadow-[0_0_20px_rgba(14,165,233,0.3)] text-xs font-bold text-white">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="tracking-wide uppercase font-black">{detectedGesture}</span>
                    {confidence > 0 && (
                      <span className="font-mono text-emerald-400 font-extrabold text-[11px]">
                        ({confidence}%)
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
                      <span>Neural Hand Landmarker 21 Keypoints</span>
                    </div>
                    <h3 className="text-xl sm:text-2xl font-black text-white">
                      Waiting for gesture
                    </h3>
                    <p className="text-xs text-[#94a3b8] max-w-xs font-medium">
                      Press &quot;Start Webcam&quot; below to enable live video and real-time hand gesture recognition.
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

                {/* Show the real frame rate and the real model name, or remove those labels if they are not real */}
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

            {/* Preset Gesture Simulator Chips */}
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
          </div>

          {/* Right Column: Live Transcript and Output */}
          <div className="lg:col-span-5 space-y-4">
            <div className="p-6 rounded-3xl bg-[#0d1630] border border-[#1a274c] space-y-4 shadow-lg">
              <div className="flex items-center justify-between pb-3 border-b border-[#1a274c]">
                <h3 className="text-sm font-black uppercase tracking-wider text-[#f8fafc]">
                  Translated Spoken Output
                </h3>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(signToTextTranscript.join(' '));
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    title="Copy transcript"
                    className="p-1.5 rounded-lg bg-[#050b1a] border border-[#1a274c] text-[#94a3b8] hover:text-white cursor-pointer"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => setSignToTextTranscript([])}
                    title="Clear transcript"
                    className="p-1.5 rounded-lg bg-[#050b1a] border border-[#1a274c] text-[#94a3b8] hover:text-rose-400 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-[#050b1a] border border-[#1a274c] min-h-[220px] max-h-[320px] overflow-y-auto space-y-2">
                {signToTextTranscript.length === 0 ? (
                  <p className="text-xs text-[#94a3b8] italic">No gestures recognized yet. Make a sign or click preset chips.</p>
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
                  const speech = new SpeechSynthesisUtterance(signToTextTranscript.join(' '));
                  window.speechSynthesis?.speak(speech);
                }}
                disabled={signToTextTranscript.length === 0}
                className="w-full py-3.5 px-4 rounded-2xl font-black text-sm bg-[#0ea5e9] hover:bg-sky-400 text-white flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                <Volume2 className="w-4 h-4" />
                <span>Speak Output Aloud</span>
              </button>
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
    </div>
  );
};
