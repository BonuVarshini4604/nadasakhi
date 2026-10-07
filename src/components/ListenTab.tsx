import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Activity, 
  Settings, 
  BellRing, 
  Flame, 
  ShieldAlert, 
  Sparkles, 
  Volume2, 
  VolumeX,
  Dog, 
  Clock, 
  Radio, 
  AlertCircle,
  ChevronRight,
  Mic,
  MicOff,
  Sliders,
  CheckCircle2,
  Info,
  Cpu,
  Zap,
  Loader2,
  AlertTriangle
} from 'lucide-react';
import { DetectedSound, SoundPriority, TabType } from '../types';
import { WebhookResult } from '../services/webhook';
import { yamnetClassifier, PredictionResult } from '../services/yamnet';

interface ListenTabProps {
  latestAlert: DetectedSound | null;
  recentSounds: DetectedSound[];
  currentStatus: string;
  isListening: boolean;
  onTriggerSound: (name: string, priority: SoundPriority, confidence?: number) => void;
  onNavigateToTab: (tab: TabType) => void;
  onOpenSettings: () => void;
  lastWebhookResult?: WebhookResult | null;
  highContrast: boolean;
}

export const ListenTab: React.FC<ListenTabProps> = ({
  latestAlert,
  recentSounds,
  currentStatus,
  isListening,
  onTriggerSound,
  onNavigateToTab,
  onOpenSettings,
  lastWebhookResult,
  highContrast,
}) => {
  // Web Audio API State for Live Microphone Level Meter & Reacting Waveform
  const [micActive, setMicActive] = useState(false);
  const [micLevel, setMicLevel] = useState(0); // 0 to 100%
  const [micFrequencies, setMicFrequencies] = useState<number[]>(new Array(10).fill(0.15));
  const [micError, setMicError] = useState<string | null>(null);

  // YAMNet Model State & Detection Tracking
  const [modelLoading, setModelLoading] = useState(false);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [modelFallbackNotice, setModelFallbackNotice] = useState<string | null>(null);
  const [detectedSoundName, setDetectedSoundName] = useState<string | null>(null);
  const [detectedConfidence, setDetectedConfidence] = useState<number | null>(null);

  // Refs for audio processing pipeline
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Buffer for roughly 1-second audio at 16 kHz (15600 samples)
  const audioRingBufferRef = useRef<Float32Array>(new Float32Array(15600));
  const ringBufferIndexRef = useRef<number>(0);
  const isClassifyingRef = useRef<boolean>(false);
  const lastInferenceTimeRef = useRef<number>(0);

  // Two-window consecutive scoring tracker: Map<displayName, number of consecutive windows > 0.5>
  const consecutiveScoresRef = useRef<Map<string, { count: number; lastScore: number }>>(new Map());

  // Cooldown tracker per sound: Map<displayName, timestamp>
  const soundCooldownsRef = useRef<Map<string, number>>(new Map());

  // Loudness detection fallback tracker
  const loudSoundCooldownRef = useRef<number>(0);

  // Trigger alert with vibration, cooldown, and webhook flow
  const fireAlert = useCallback((displayName: string, priority: SoundPriority, score: number) => {
    const now = Date.now();
    const lastTriggered = soundCooldownsRef.current.get(displayName) || 0;
    // 10-second cool-down per sound to avoid repeats
    if (now - lastTriggered < 10000) {
      return;
    }

    soundCooldownsRef.current.set(displayName, now);

    // Vibrate device if supported
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        if (priority === 'critical') {
          navigator.vibrate([400, 150, 400, 150, 600]);
        } else if (priority === 'medium') {
          navigator.vibrate([250, 100, 250]);
        } else {
          navigator.vibrate(150);
        }
      } catch (_) {}
    }

    // Trigger existing alert flow: red overlay for critical, card for others, webhook call
    onTriggerSound(displayName, priority, score);
  }, [onTriggerSound]);

  // Load YAMNet Model on component mount or trigger
  useEffect(() => {
    let mounted = true;

    const initModel = async () => {
      setModelLoading(true);
      const success = await yamnetClassifier.loadModel();
      if (!mounted) return;

      setModelLoading(false);
      if (success) {
        setModelLoaded(true);
        setModelFallbackNotice(null);
      } else {
        setModelLoaded(false);
        setModelFallbackNotice(
          'YAMNet model could not be loaded directly from TF Hub. Active mode: Loudness Acoustic Fallback.'
        );
      }
    };

    initModel();

    return () => {
      mounted = false;
    };
  }, []);

  // Process 1-second audio window with YAMNet or fallback loudness detector
  const processAudioWindow = useCallback(async (audioWindow16k: Float32Array, avgRms: number) => {
    if (isClassifyingRef.current) return;
    isClassifyingRef.current = true;

    try {
      if (modelLoaded && yamnetClassifier.hasLoaded()) {
        const result: PredictionResult | null = await yamnetClassifier.classify(audioWindow16k);

        if (result) {
          setDetectedSoundName(result.mapped?.displayName || result.className);
          setDetectedConfidence(result.score);

          // Check if mapped class scores above 0.5 for two windows in a row
          if (result.mapped && result.score > 0.5) {
            const soundKey = result.mapped.displayName;
            const currentRecord = consecutiveScoresRef.current.get(soundKey) || { count: 0, lastScore: 0 };
            const newCount = currentRecord.count + 1;
            consecutiveScoresRef.current.set(soundKey, { count: newCount, lastScore: result.score });

            // Requirement 4: When a mapped class scores above 0.5 for two windows in a row
            if (newCount >= 2) {
              fireAlert(result.mapped.displayName, result.mapped.priority, result.score);
              // Reset consecutive count after firing
              consecutiveScoresRef.current.set(soundKey, { count: 0, lastScore: result.score });
            }
          } else {
            // Reset consecutive counter for sounds that didn't meet threshold in this window
            consecutiveScoresRef.current.clear();
          }
        }
      } else {
        // Fallback: simple loudness detection (a sudden loud sound shows "Loud sound detected" as medium priority)
        // Sensitivity threshold: RMS amplitude > 0.28 (roughly > 75% mic volume)
        if (avgRms > 0.28) {
          const now = Date.now();
          if (now - loudSoundCooldownRef.current > 10000) {
            loudSoundCooldownRef.current = now;
            setDetectedSoundName('Loud Sound');
            setDetectedConfidence(Math.min(0.95, Math.round(avgRms * 100) / 100));
            fireAlert('Loud sound detected', 'medium', avgRms);
          }
        }
      }
    } catch (e) {
      console.warn('Audio classification error:', e);
    } finally {
      isClassifyingRef.current = false;
    }
  }, [modelLoaded, fireAlert]);

  // Start Live Microphone Monitoring at 16 kHz Mono via Web Audio API
  const startMicMonitoring = useCallback(async () => {
    try {
      setMicError(null);
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setMicError('Web Audio API / Microphone access is not supported on this browser.');
        return;
      }

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1, // Mono
          sampleRate: 16000, // 16 kHz
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      mediaStreamRef.current = stream;

      // Create AudioContext at 16 kHz mono
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      // Try setting sampleRate to 16000 if browser allows; otherwise resample
      let ctx: AudioContext;
      try {
        ctx = new AudioContextClass({ sampleRate: 16000 });
      } catch (_) {
        ctx = new AudioContextClass();
      }
      audioContextRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);

      // 1. Analyser Node for Live Spectrum & Volume Meter
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.65;
      source.connect(analyser);
      analyserRef.current = analyser;

      // 2. Audio Processing pipeline for YAMNet (16 kHz 1-second chunks)
      // Using ScriptProcessorNode (bufferSize: 4096) to collect raw PCM mono samples
      const bufferSize = 4096;
      const scriptProcessor = ctx.createScriptProcessor(bufferSize, 1, 1);
      scriptProcessorRef.current = scriptProcessor;

      const targetSampleRate = 16000;
      const actualSampleRate = ctx.sampleRate;
      const resampleRatio = actualSampleRate / targetSampleRate;

      scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
        const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);

        // Calculate RMS loudness
        let sumSquares = 0;
        for (let i = 0; i < inputData.length; i++) {
          sumSquares += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sumSquares / inputData.length);

        // Downsample or copy into 16 kHz ring buffer (15600 samples ~ 0.975 seconds)
        const ring = audioRingBufferRef.current;
        let ringIdx = ringBufferIndexRef.current;

        if (Math.abs(resampleRatio - 1.0) < 0.05) {
          // Direct 16 kHz copy
          for (let i = 0; i < inputData.length; i++) {
            ring[ringIdx] = inputData[i];
            ringIdx = (ringIdx + 1) % ring.length;
          }
        } else {
          // Simple linear interpolation downsampling to 16 kHz
          for (let i = 0; i < inputData.length; i += resampleRatio) {
            const srcIdx = Math.floor(i);
            ring[ringIdx] = inputData[srcIdx] || 0;
            ringIdx = (ringIdx + 1) % ring.length;
          }
        }
        ringBufferIndexRef.current = ringIdx;

        // Run inference roughly every 1000ms
        const now = Date.now();
        if (now - lastInferenceTimeRef.current >= 950) {
          lastInferenceTimeRef.current = now;
          // Extract current 15600 sample window in correct chronological order
          const snapshot16k = new Float32Array(ring.length);
          for (let j = 0; j < ring.length; j++) {
            snapshot16k[j] = ring[(ringIdx + j) % ring.length];
          }
          processAudioWindow(snapshot16k, rms);
        }
      };

      source.connect(scriptProcessor);
      // Connect to destination via silent gain to keep scriptProcessor active in WebKit/Chrome
      const silentGain = ctx.createGain();
      silentGain.gain.value = 0;
      scriptProcessor.connect(silentGain);
      silentGain.connect(ctx.destination);

      setMicActive(true);

      // Real-time animation loop for level meter
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const sampleAudio = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const normalized = Math.min(100, Math.round((avg / 115) * 100));
        setMicLevel(normalized);

        const binPicks = [1, 2, 4, 6, 8, 10, 13, 16, 20, 25];
        const freqs = binPicks.map((bin) => {
          const val = dataArray[bin] || 0;
          return Math.max(0.12, Math.min(1, val / 195));
        });
        setMicFrequencies(freqs);

        animFrameRef.current = requestAnimationFrame(sampleAudio);
      };

      sampleAudio();
    } catch (err: unknown) {
      console.warn('Microphone access denied or error:', err);
      setMicActive(false);
      setMicError('Microphone access was denied or unavailable. Please enable mic access in your browser to analyze live room sound.');
    }
  }, [processAudioWindow]);

  // Stop Live Microphone Monitoring
  const stopMicMonitoring = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setMicActive(false);
    setMicLevel(0);
    setMicFrequencies(new Array(10).fill(0.15));
    setDetectedSoundName(null);
    setDetectedConfidence(null);
    consecutiveScoresRef.current.clear();
  }, []);

  // Cleanup Web Audio API resources on component unmount
  useEffect(() => {
    return () => {
      stopMicMonitoring();
    };
  }, [stopMicMonitoring]);
  // Waveform bars animation
  const waveformHeights = [
    'h-4 animate-[pulse_1.2s_ease-in-out_infinite]',
    'h-8 animate-[pulse_1.0s_ease-in-out_infinite]',
    'h-14 animate-[pulse_0.8s_ease-in-out_infinite]',
    'h-20 animate-[pulse_0.6s_ease-in-out_infinite]',
    'h-16 animate-[pulse_0.7s_ease-in-out_infinite]',
    'h-24 animate-[pulse_0.5s_ease-in-out_infinite]',
    'h-16 animate-[pulse_0.9s_ease-in-out_infinite]',
    'h-20 animate-[pulse_0.7s_ease-in-out_infinite]',
    'h-12 animate-[pulse_1.1s_ease-in-out_infinite]',
    'h-6 animate-[pulse_1.3s_ease-in-out_infinite]',
  ];

  const getSoundIcon = (name: string) => {
    const s = name.toUpperCase();
    if (s.includes('SMOKE') || s.includes('FIRE')) return <Flame className="w-5 h-5 text-rose-500" />;
    if (s.includes('DOOR') || s.includes('BELL')) return <BellRing className="w-5 h-5 text-sky-400" />;
    if (s.includes('DOG') || s.includes('BARK')) return <Dog className="w-5 h-5 text-amber-400" />;
    if (s.includes('GLASS')) return <Sparkles className="w-5 h-5 text-yellow-300" />;
    return <Volume2 className="w-5 h-5 text-purple-400" />;
  };

  const getPriorityTagClass = (priority: SoundPriority) => {
    if (priority === 'critical') {
      return highContrast 
        ? 'bg-red-950 text-red-300 border-red-500' 
        : 'bg-rose-500/20 text-rose-400 border border-rose-500/40';
    }
    if (priority === 'medium') {
      return highContrast 
        ? 'bg-amber-950 text-amber-300 border-amber-500' 
        : 'bg-amber-500/20 text-amber-400 border border-amber-500/40';
    }
    return highContrast 
      ? 'bg-zinc-800 text-sky-300 border-sky-400' 
      : 'bg-sky-500/15 text-sky-400 border border-sky-500/30';
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 space-y-6 lg:space-y-8 select-none">
      {/* Mobile-only Header (On desktop, Sidebar contains the header) */}
      <header className="md:hidden flex items-center justify-between pt-1">
        <div className="flex items-center gap-3">
          <div
            className={`w-11 h-11 rounded-2xl flex items-center justify-center shadow-lg transition-transform ${
              highContrast
                ? 'bg-amber-400 text-black'
                : 'bg-gradient-to-tr from-[#0ea5e9] to-[#2563eb] text-white shadow-[0_0_20px_rgba(14,165,233,0.35)]'
            }`}
          >
            <Activity className="w-6 h-6 stroke-[2.5]" aria-hidden="true" />
          </div>
          <div>
            <h1 className={`text-xl font-black tracking-tight flex items-center gap-2 ${highContrast ? 'text-amber-300' : 'text-[#f8fafc]'}`}>
              <span>NādaSakhi</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#0d1630] text-[#0ea5e9] border border-[#1a274c] uppercase font-bold">
                SoundWatch
              </span>
            </h1>
            <p className="text-xs font-semibold text-[#94a3b8]">
              Hear what matters
            </p>
          </div>
        </div>

        <button
          onClick={onOpenSettings}
          title="Settings & Accessibility"
          aria-label="Settings and Accessibility options"
          className={`p-2.5 rounded-xl border transition-colors focus:outline-none focus-visible:ring-2 cursor-pointer ${
            highContrast
              ? 'border-zinc-700 bg-zinc-900 text-amber-300 hover:text-white'
              : 'border-[#1a274c] bg-[#0d1630] text-[#94a3b8] hover:text-[#f8fafc] hover:bg-[#131e3d]'
          }`}
        >
          <Settings className="w-5 h-5" aria-hidden="true" />
        </button>
      </header>

      {/* Desktop Page Title Banner */}
      <div className="hidden md:flex items-center justify-between">
        <div>
          <h1 className={`text-2xl lg:text-3xl font-black tracking-tight ${highContrast ? 'text-amber-300' : 'text-[#f8fafc]'}`}>
            Live Acoustic Monitor
          </h1>
          <p className="text-sm text-[#94a3b8] mt-0.5">
            Real-time on-device sound detection and emergency danger recognition.
          </p>
        </div>

        {/* Green pill indicator on desktop header */}
        <div
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold shadow-xs ${
            highContrast
              ? 'bg-black text-emerald-400 border border-emerald-500'
              : 'bg-emerald-950/70 text-emerald-400 border border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
          }`}
        >
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
          </span>
          <span>Listening · On-device only</span>
        </div>
      </div>

      {/* Responsive Layout Grid: Left column (Circular listening area) & Right column (Latest alert & Recent sounds) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
        {/* LEFT COLUMN: Circular listening area, green pill, and triggers */}
        <div className="lg:col-span-5 flex flex-col items-center space-y-6">
          {/* Mobile Green Pill */}
          <div className="md:hidden flex justify-center w-full">
            <div
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold shadow-xs ${
                highContrast
                  ? 'bg-black text-emerald-400 border border-emerald-500'
                  : 'bg-emerald-950/70 text-emerald-400 border border-emerald-500/40'
              }`}
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span>Listening · On-device only</span>
            </div>
          </div>

          {/* Large circular area with dotted blue border & animated waveform in center */}
          <div
            style={{
              boxShadow:
                micActive && micLevel > 8
                  ? `0 0 ${24 + micLevel * 0.75}px rgba(14, 165, 233, ${0.25 + (micLevel / 100) * 0.5})`
                  : undefined,
              transform:
                micActive && micLevel > 18
                  ? `scale(${1 + Math.min(0.06, (micLevel / 100) * 0.06)})`
                  : undefined,
            }}
            className="relative w-64 h-64 sm:w-72 sm:h-72 lg:w-80 lg:h-80 rounded-full border-2 border-dashed flex flex-col items-center justify-center p-6 transition-all duration-100 mx-auto"
          >
            <div
              className={`absolute inset-0 rounded-full transition-colors ${
                highContrast
                  ? 'border-2 border-dashed border-amber-400 bg-zinc-950'
                  : micActive && micLevel > 40
                  ? 'border-2 border-dashed border-cyan-300 bg-[#0d1630]/85 shadow-[0_0_50px_rgba(14,165,233,0.35)]'
                  : 'border-2 border-dashed border-[#0ea5e9]/80 bg-[#0d1630]/70 shadow-[0_0_50px_rgba(14,165,233,0.18)]'
              }`}
            />

            {/* Animated waveform in center (reacts to real mic frequency spectrum when mic is active) */}
            <div className="relative z-10 flex items-center justify-center gap-1.5 sm:gap-2 h-28 sm:h-32 w-48 sm:w-56 px-2">
              {waveformHeights.map((hClass, idx) => {
                if (micActive) {
                  const barHeightPx = Math.round(14 + (micFrequencies[idx] || 0.15) * 82);
                  return (
                    <span
                      key={idx}
                      style={{ height: `${barHeightPx}px` }}
                      className={`w-2 sm:w-2.5 lg:w-3 rounded-full transition-all duration-75 ${
                        highContrast
                          ? 'bg-amber-400'
                          : micLevel > 70
                          ? 'bg-gradient-to-t from-rose-500 via-amber-400 to-yellow-300 shadow-[0_0_12px_rgba(244,63,94,0.6)]'
                          : micLevel > 35
                          ? 'bg-gradient-to-t from-[#0ea5e9] via-emerald-400 to-cyan-300 shadow-[0_0_10px_rgba(14,165,233,0.5)]'
                          : 'bg-gradient-to-t from-[#0ea5e9] via-cyan-400 to-[#38bdf8]'
                      }`}
                    />
                  );
                }

                return (
                  <span
                    key={idx}
                    className={`w-2 sm:w-2.5 lg:w-3 rounded-full transition-all duration-150 ${hClass} ${
                      highContrast
                        ? 'bg-amber-400'
                        : 'bg-gradient-to-t from-[#0ea5e9] via-cyan-400 to-[#38bdf8]'
                    }`}
                  />
                );
              })}
            </div>

            {/* Label inside/under waveform */}
            <div className="relative z-10 mt-4 text-center px-4 max-w-xs space-y-1">
              <p
                className={`text-sm sm:text-base font-extrabold tracking-tight transition-colors ${
                  detectedSoundName
                    ? 'text-cyan-300 animate-pulse'
                    : currentStatus.includes('Quiet')
                    ? micActive
                      ? micLevel > 40
                        ? 'text-cyan-300'
                        : 'text-[#94a3b8]'
                      : 'text-[#94a3b8]'
                    : highContrast
                    ? 'text-amber-300'
                    : 'text-[#38bdf8]'
                }`}
              >
                {detectedSoundName
                  ? `Detected: ${detectedSoundName}`
                  : currentStatus.includes('Quiet') && micActive
                  ? micLevel > 45
                    ? `Live Sound Detected · ${micLevel}% Volume`
                    : 'Quiet · Room sounds look normal'
                  : currentStatus}
              </p>

              {/* Requirement 5: show the detected class name and score below it. Label the score "model confidence", not accuracy. */}
              {micActive && (
                <div className="text-[11px] font-mono text-[#94a3b8] flex items-center justify-center gap-1.5 flex-wrap">
                  {detectedSoundName && detectedConfidence !== null ? (
                    <span className="px-2 py-0.5 rounded-full bg-[#050b1a] border border-[#1a274c] text-[#0ea5e9] font-bold">
                      {detectedSoundName} · {Math.round(detectedConfidence * 100)}% model confidence
                    </span>
                  ) : (
                    <span>
                      {modelLoaded ? 'YAMNet 16 kHz active' : 'Acoustic monitor active'}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Model Status or Fallback Notice */}
          {modelFallbackNotice && (
            <div className="w-full p-3 rounded-2xl bg-amber-950/60 border border-amber-500/40 text-amber-200 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{modelFallbackNotice}</span>
            </div>
          )}

          {/* Live Microphone Level Meter (Web Audio API) */}
          <div className="w-full p-4 rounded-3xl bg-[#0d1630] border border-[#1a274c] space-y-3 shadow-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className={`p-2 rounded-xl transition-colors ${
                    micActive
                      ? 'bg-[#050b1a] text-[#0ea5e9] shadow-[0_0_12px_rgba(14,165,233,0.35)]'
                      : 'bg-[#050b1a] text-[#94a3b8]'
                  }`}
                >
                  <Mic className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-[#f8fafc]">
                    Live Microphone Level Meter
                  </h3>
                  <p className="text-[11px] text-[#94a3b8]">
                    {micActive
                      ? modelLoaded
                        ? '16 kHz mono · YAMNet neural audio active'
                        : 'Web Audio API analyser active'
                      : 'Tap "Start listening" to activate real-time classification'}
                  </p>
                </div>
              </div>

              {/* Requirement 1: User taps "Start listening" */}
              <button
                onClick={micActive ? stopMicMonitoring : startMicMonitoring}
                className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
                  micActive
                    ? 'bg-emerald-950/80 border border-emerald-500/50 text-emerald-400 hover:bg-emerald-900 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                    : 'bg-[#0ea5e9] hover:bg-sky-400 text-white shadow-[0_0_15px_rgba(14,165,233,0.35)]'
                }`}
              >
                {micActive ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    <span>Listening Active · Stop</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-3.5 h-3.5" />
                    <span>Start listening</span>
                  </>
                )}
              </button>
            </div>

            {/* Level meter progress bar & values */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-xs font-mono font-bold">
                <span className="text-[#94a3b8]">Audio Input Level</span>
                <span
                  className={
                    micLevel > 70
                      ? 'text-rose-400 font-black'
                      : micLevel > 35
                      ? 'text-cyan-300'
                      : 'text-[#94a3b8]'
                  }
                >
                  {micActive
                    ? `${micLevel}% · approx. ${Math.round(-60 + micLevel * 0.6)} dB`
                    : 'Mic in Standby (0%)'}
                </span>
              </div>

              <div className="w-full h-3 rounded-full bg-[#050b1a] border border-[#1a274c] overflow-hidden p-0.5 relative">
                {/* Visual Level Track */}
                <div
                  className={`h-full rounded-full transition-all duration-75 ${
                    micLevel > 75
                      ? 'bg-gradient-to-r from-emerald-500 via-amber-400 to-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.6)]'
                      : micLevel > 35
                      ? 'bg-gradient-to-r from-[#0ea5e9] to-emerald-400 shadow-[0_0_10px_rgba(14,165,233,0.45)]'
                      : 'bg-[#0ea5e9]'
                  }`}
                  style={{ width: `${micActive ? Math.max(3, micLevel) : 0}%` }}
                />
              </div>

              {/* Meter scale labels */}
              <div className="flex items-center justify-between text-[10px] text-[#94a3b8]/70 font-mono pt-0.5 px-0.5">
                <span>Silence (0%)</span>
                <span>Normal Speech (~40%)</span>
                <span>Loud / Alarm (80%+)</span>
              </div>
            </div>

            {micError && (
              <p className="text-xs text-amber-300 bg-amber-950/60 p-2.5 rounded-xl border border-amber-500/40 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
                <span>{micError}</span>
              </p>
            )}
          </div>

          {/* Demo mode: trigger a test alert (Requirement 6: Keep the demo buttons, labelled "Demo mode") */}
          <div className="w-full p-4 rounded-3xl bg-[#0d1630] border border-[#1a274c] space-y-3 shadow-lg">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-[#94a3b8] flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-[#0ea5e9]" />
                <span>Demo mode</span>
              </span>
              <span className="text-[11px] text-[#94a3b8]/80 font-mono">Dispatches to n8n</span>
            </div>

            <p className="text-xs text-[#94a3b8] leading-relaxed">
              These buttons simulate a detected sound for demonstration.
            </p>

            <div className="grid grid-cols-2 gap-2 text-xs">
              {/* Critical sounds */}
              <button
                onClick={() => onTriggerSound('Smoke Alarm', 'critical')}
                className="p-2.5 rounded-xl bg-rose-950/80 border border-rose-500/60 hover:bg-rose-900 text-white font-bold flex items-center gap-2 cursor-pointer transition-colors"
              >
                <Flame className="w-4 h-4 text-rose-400 shrink-0" />
                <span className="truncate">🔥 Smoke Alarm</span>
              </button>

              <button
                onClick={() => onTriggerSound('Glass Breaking', 'critical')}
                className="p-2.5 rounded-xl bg-rose-950/80 border border-rose-500/60 hover:bg-rose-900 text-white font-bold flex items-center gap-2 cursor-pointer transition-colors"
              >
                <Sparkles className="w-4 h-4 text-amber-300 shrink-0" />
                <span className="truncate">💥 Glass Break</span>
              </button>

              {/* Low-priority sounds */}
              <button
                onClick={() => onTriggerSound('Doorbell', 'low')}
                className="p-2.5 rounded-xl bg-[#050b1a] border border-[#1a274c] hover:border-[#0ea5e9] hover:bg-[#131e3d] text-[#f8fafc] font-bold flex items-center gap-2 cursor-pointer transition-colors"
              >
                <BellRing className="w-4 h-4 text-[#0ea5e9] shrink-0" />
                <span className="truncate">🔔 Doorbell</span>
              </button>

              <button
                onClick={() => onTriggerSound('Dog Bark', 'low')}
                className="p-2.5 rounded-xl bg-[#050b1a] border border-[#1a274c] hover:border-amber-500/40 hover:bg-[#131e3d] text-[#f8fafc] font-bold flex items-center gap-2 cursor-pointer transition-colors"
              >
                <Dog className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="truncate">🐕 Dog Bark</span>
              </button>
            </div>
          </div>

          {/* Webhook Feedback Notification */}
          {lastWebhookResult && !lastWebhookResult.success && (
            <div
              role="alert"
              className="w-full p-3.5 rounded-2xl bg-[#0d1630] border border-amber-400 text-xs text-amber-200 space-y-1.5"
            >
              <div className="flex items-center gap-1.5 font-bold text-amber-300">
                <AlertCircle className="w-4 h-4 text-red-400" />
                <span>Webhook Notice (HTTP {lastWebhookResult.status})</span>
              </div>
              {lastWebhookResult.snippet && (
                <pre className="font-mono text-[11px] p-2 rounded bg-[#050b1a] overflow-x-auto whitespace-pre-wrap break-all text-[#cbd5e1] border border-[#1a274c]">
                  {lastWebhookResult.snippet}
                </pre>
              )}
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Latest alert card & Recent sounds list */}
        <div className="lg:col-span-7 space-y-6">
          {/* Latest Alert Card */}
          <section aria-labelledby="latest-alert-heading" className="space-y-2.5">
            <h2 id="latest-alert-heading" className="text-xs uppercase font-extrabold tracking-wider text-[#94a3b8] px-1">
              Latest Alert
            </h2>

            {latestAlert ? (
              <div
                className={`p-5 rounded-3xl border transition-all ${
                  highContrast
                    ? 'bg-zinc-950 border-amber-400 text-white'
                    : 'bg-[#0d1630] border-[#1a274c] text-[#f8fafc] shadow-lg'
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <div
                      className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                        highContrast ? 'bg-amber-400 text-black' : 'bg-[#050b1a] border border-[#1a274c] text-white shadow-xs'
                      }`}
                    >
                      {getSoundIcon(latestAlert.name)}
                    </div>
                    <div>
                      <h3 className="font-black text-lg tracking-tight text-[#f8fafc]">
                        {latestAlert.name}
                      </h3>
                      <div className="flex items-center gap-1.5 text-xs text-[#94a3b8] mt-0.5">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{latestAlert.displayTime || 'Just now'}</span>
                        <span>·</span>
                        <span>{latestAlert.matchPercent || 94}% confidence</span>
                      </div>
                    </div>
                  </div>

                  <span
                    className={`text-xs font-black uppercase tracking-wider px-3 py-1.5 rounded-xl ${getPriorityTagClass(
                      latestAlert.priority
                    )}`}
                  >
                    {latestAlert.priority} priority
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-5 rounded-3xl border border-dashed border-[#1a274c] text-center text-xs text-[#94a3b8]">
                No sound alerts recorded yet.
              </div>
            )}
          </section>

          {/* Recent sounds list with icons, names and times, and a "See all" link */}
          <section aria-labelledby="recent-sounds-heading" className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h2 id="recent-sounds-heading" className="text-xs uppercase font-extrabold tracking-wider text-[#94a3b8]">
                Recent sounds
              </h2>
              <button
                onClick={() => onNavigateToTab('history')}
                className={`text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer ${
                  highContrast ? 'text-amber-300 hover:text-white' : 'text-[#0ea5e9] hover:text-sky-300'
                }`}
              >
                <span>See all in History</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-2.5">
              {recentSounds.length === 0 ? (
                <div className="p-5 rounded-2xl border border-dashed border-[#1a274c] text-center text-xs text-[#94a3b8]">
                  No recent sounds.
                </div>
              ) : (
                recentSounds.map((sound) => (
                  <div
                    key={sound.id}
                    className={`p-4 rounded-2xl border flex items-center justify-between transition-colors ${
                      highContrast
                        ? 'bg-zinc-950 border-zinc-800 hover:border-amber-400'
                        : 'bg-[#0d1630] border-[#1a274c] hover:bg-[#131e3d]'
                    }`}
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="w-10 h-10 rounded-xl bg-[#050b1a] border border-[#1a274c] flex items-center justify-center">
                        {getSoundIcon(sound.name)}
                      </div>
                      <div>
                        <h4 className="font-extrabold text-sm sm:text-base text-[#f8fafc]">{sound.name}</h4>
                        <p className="text-xs text-[#94a3b8]">{sound.displayTime}</p>
                      </div>
                    </div>

                    <span
                      className={`text-[11px] font-black uppercase px-2.5 py-1 rounded-lg ${getPriorityTagClass(
                        sound.priority
                      )}`}
                    >
                      {sound.priority}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
