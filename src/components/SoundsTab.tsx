import React, { useState, useRef } from 'react';
import { 
  Mic, 
  Check, 
  CheckCircle2, 
  Sparkles, 
  RotateCcw, 
  Play, 
  ExternalLink, 
  Volume2
} from 'lucide-react';
import { SoundPriority } from '../types';
import { SOUND_GUARDIAN_URL } from '../constants';

export interface CustomTrainedSound {
  id: string;
  name: string;
  samplesCount: number;
  priority: SoundPriority; // medium priority
  trainedAt: string;
}

interface SoundsTabProps {
  onTriggerSound: (name: string, priority: SoundPriority) => void;
  customSounds: CustomTrainedSound[];
  onAddCustomSound: (sound: CustomTrainedSound) => void;
  highContrast: boolean;
}

export const SoundsTab: React.FC<SoundsTabProps> = ({
  onTriggerSound,
  customSounds,
  onAddCustomSound,
  highContrast,
}) => {
  const [soundName, setSoundName] = useState('Front door knock');
  const [activeSampleIndex, setActiveSampleIndex] = useState(0); // 0, 1, 2
  const [samplesRecorded, setSamplesRecorded] = useState<boolean[]>([false, false, false]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordProgress, setRecordProgress] = useState(0);
  const [isTraining, setIsTraining] = useState(false);
  const [justTrained, setJustTrained] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'train' | 'monitor'>('train');

  const recordTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Handle start recording sample
  const startRecording = () => {
    if (isRecording) return;
    setIsRecording(true);
    setRecordProgress(0);

    let progress = 0;
    recordTimerRef.current = setInterval(() => {
      progress += 10;
      setRecordProgress(progress);
      if (progress >= 100) {
        stopRecording(true);
      }
    }, 150);
  };

  // Handle stop recording
  const stopRecording = (completed: boolean = true) => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    setIsRecording(false);
    setRecordProgress(0);

    if (completed) {
      setSamplesRecorded((prev) => {
        const next = [...prev];
        next[activeSampleIndex] = true;
        return next;
      });

      // Advance to next unrecorded sample
      if (activeSampleIndex < 2) {
        setActiveSampleIndex((prev) => prev + 1);
      }
    }
  };

  // Clear samples
  const resetSamples = () => {
    setSamplesRecorded([false, false, false]);
    setActiveSampleIndex(0);
    setJustTrained(null);
  };

  // Handle "Train sound"
  const handleTrainSound = () => {
    if (!soundName.trim()) return;
    setIsTraining(true);

    setTimeout(() => {
      const newCustomSound: CustomTrainedSound = {
        id: `custom-${Date.now()}`,
        name: soundName.trim(),
        samplesCount: 3,
        priority: 'medium', // treated as medium priority per prompt
        trainedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      onAddCustomSound(newCustomSound);
      setIsTraining(false);
      setJustTrained(soundName.trim());
      resetSamples();
    }, 1600);
  };

  const allRecorded = samplesRecorded.every(Boolean);

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 space-y-6 select-none">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className={`text-2xl lg:text-3xl font-black tracking-tight ${highContrast ? 'text-amber-300' : 'text-[#f8fafc]'}`}>
            Custom Sound Training
          </h1>
          <p className="text-xs sm:text-sm text-[#94a3b8] font-medium mt-0.5">
            Teach NādaSakhi your home&apos;s unique sounds · Medium priority alerting
          </p>
        </div>

        {/* View Switcher: Train vs Sound Guardian Embed */}
        <div className="flex items-center gap-1 bg-[#0d1630] border border-[#1a274c] p-1.5 rounded-2xl text-xs sm:text-sm font-bold">
          <button
            onClick={() => setViewMode('train')}
            className={`px-3 sm:px-4 py-1.5 rounded-xl transition-colors cursor-pointer ${
              viewMode === 'train' ? 'bg-[#0ea5e9] text-white shadow-[0_0_15px_rgba(14,165,233,0.35)]' : 'text-[#94a3b8] hover:text-[#f8fafc]'
            }`}
          >
            Train Sounds
          </button>
          <button
            onClick={() => setViewMode('monitor')}
            className={`px-3 sm:px-4 py-1.5 rounded-xl transition-colors cursor-pointer ${
              viewMode === 'monitor' ? 'bg-[#0ea5e9] text-white shadow-[0_0_15px_rgba(14,165,233,0.35)]' : 'text-[#94a3b8] hover:text-[#f8fafc]'
            }`}
          >
            Live Monitor
          </button>
        </div>
      </div>

      {viewMode === 'train' ? (
        <div className="space-y-6">
          {/* Success Banner when just trained */}
          {justTrained && (
            <div
              role="alert"
              className="p-4 sm:p-5 rounded-3xl bg-emerald-950/80 border border-emerald-500/50 text-emerald-200 text-xs sm:text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg"
            >
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
                <div>
                  <p className="font-extrabold text-base text-white">Sound trained: &ldquo;{justTrained}&rdquo;</p>
                  <p className="text-emerald-300/90 text-xs">Saved in app memory. Will trigger medium-priority acoustic alerts.</p>
                </div>
              </div>
              <button
                onClick={() => onTriggerSound(justTrained, 'medium')}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs shrink-0 cursor-pointer self-start sm:self-auto"
              >
                Test Match Alert
              </button>
            </div>
          )}

          {/* Responsive Side-by-Side Grid on tablet/desktop */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
            {/* LEFT COLUMN: Text field, 3 sample cards, Train sound button */}
            <div className="lg:col-span-6 space-y-6">
              {/* 1. Text field "Sound name" */}
              <div className="p-6 rounded-3xl bg-[#0d1630] border border-[#1a274c] space-y-3 shadow-lg">
                <label
                  htmlFor="sound-name-input"
                  className="text-xs font-extrabold uppercase tracking-wider text-[#94a3b8] block"
                >
                  Sound name
                </label>
                <input
                  id="sound-name-input"
                  type="text"
                  value={soundName}
                  onChange={(e) => setSoundName(e.target.value)}
                  placeholder="e.g. Front door knock"
                  className={`w-full px-4 py-3.5 rounded-2xl text-base font-bold transition-colors focus:outline-none focus:ring-2 ${
                    highContrast
                      ? 'bg-black border-2 border-amber-400 text-white focus:ring-white'
                      : 'bg-[#050b1a] border border-[#1a274c] text-[#f8fafc] focus:border-[#0ea5e9] focus:ring-[#0ea5e9] placeholder-[#94a3b8]/50'
                  }`}
                />
              </div>

              {/* 2. "Record samples" with three sample cards (Sample 1, 2, 3) */}
              <div className="p-6 rounded-3xl bg-[#0d1630] border border-[#1a274c] space-y-4 shadow-lg">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-extrabold uppercase tracking-wider text-[#94a3b8]">
                    Record samples
                  </h2>
                  <button
                    onClick={resetSamples}
                    className="text-xs font-bold text-[#94a3b8] hover:text-[#f8fafc] flex items-center gap-1.5 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset samples</span>
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {[0, 1, 2].map((idx) => {
                    const isDone = samplesRecorded[idx];
                    const isCurrent = activeSampleIndex === idx && !isDone;

                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setActiveSampleIndex(idx)}
                        className={`p-4 rounded-2xl border text-center flex flex-col items-center justify-center space-y-2 transition-all cursor-pointer ${
                          isDone
                            ? highContrast
                              ? 'bg-zinc-900 border-emerald-400 text-white'
                              : 'bg-emerald-950/60 border border-emerald-500/60 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)]'
                            : isCurrent
                            ? highContrast
                              ? 'bg-zinc-950 border-amber-400 text-amber-300'
                              : 'bg-[#050b1a] border-2 border-[#0ea5e9] text-[#0ea5e9] shadow-[0_0_20px_rgba(14,165,233,0.25)]'
                            : 'bg-[#050b1a]/80 border border-[#1a274c] text-[#94a3b8] hover:border-[#1e3a6a]'
                        }`}
                      >
                        <span className="text-xs sm:text-sm font-bold">Sample {idx + 1}</span>

                        <div className="w-10 h-10 rounded-full flex items-center justify-center">
                          {isDone ? (
                            <div className="w-9 h-9 rounded-full bg-emerald-500 text-black flex items-center justify-center font-black">
                              <Check className="w-5 h-5 stroke-[3]" />
                            </div>
                          ) : (
                            <div
                              className={`w-9 h-9 rounded-full border-2 border-dashed flex items-center justify-center ${
                                isCurrent ? 'border-[#0ea5e9] text-[#0ea5e9] animate-pulse' : 'border-[#1a274c] text-[#94a3b8]'
                              }`}
                            >
                              <span className="text-xs font-bold">{idx + 1}</span>
                            </div>
                          )}
                        </div>

                        <span className="text-xs font-bold opacity-80">
                          {isDone ? 'Recorded' : isCurrent ? 'Ready' : 'Waiting'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 3. "Train sound" button */}
              <button
                type="button"
                onClick={handleTrainSound}
                disabled={!allRecorded || isTraining}
                className={`w-full py-4 sm:py-5 px-6 rounded-2xl font-black text-base sm:text-lg flex items-center justify-center gap-2.5 transition-all cursor-pointer ${
                  allRecorded && !isTraining
                    ? highContrast
                      ? 'bg-amber-400 text-black hover:bg-amber-300 shadow-lg'
                      : 'bg-[#0ea5e9] hover:bg-sky-400 text-white shadow-[0_0_25px_rgba(14,165,233,0.4)]'
                    : 'bg-[#050b1a] text-[#94a3b8] border border-[#1a274c] cursor-not-allowed opacity-60'
                }`}
              >
                <Sparkles className={`w-5 h-5 ${isTraining ? 'animate-spin' : ''}`} />
                <span>
                  {isTraining
                    ? 'Training neural pattern...'
                    : allRecorded
                    ? 'Train sound'
                    : `Record all 3 samples to train (${samplesRecorded.filter(Boolean).length}/3)`}
                </span>
              </button>
            </div>

            {/* RIGHT COLUMN: Large round "Hold to record" button & Custom sounds in memory */}
            <div className="lg:col-span-6 space-y-6">
              {/* Large Round Microphone Button */}
              <div className="p-8 rounded-3xl bg-[#0d1630] border border-[#1a274c] flex flex-col items-center justify-center space-y-4 shadow-lg">
                <div className="relative flex items-center justify-center my-4">
                  {/* Concentric animated waveform rings */}
                  {isRecording && (
                    <>
                      <div className="absolute w-56 h-56 rounded-full bg-[#0ea5e9]/20 animate-ping pointer-events-none" />
                      <div className="absolute w-44 h-44 rounded-full bg-[#0ea5e9]/30 animate-pulse border-2 border-[#0ea5e9]/50 pointer-events-none" />
                    </>
                  )}

                  <button
                    type="button"
                    onMouseDown={startRecording}
                    onMouseUp={() => stopRecording(true)}
                    onTouchStart={startRecording}
                    onTouchEnd={() => stopRecording(true)}
                    className={`relative w-32 h-32 rounded-full border-4 flex flex-col items-center justify-center transition-all duration-150 transform active:scale-95 cursor-pointer select-none focus:outline-none focus:ring-4 ${
                      isRecording
                        ? 'bg-rose-600 border-white text-white shadow-[0_0_40px_rgba(244,63,94,0.6)]'
                        : highContrast
                        ? 'bg-amber-400 border-white text-black hover:bg-amber-300 focus:ring-white'
                        : 'bg-gradient-to-tr from-[#0ea5e9] to-[#2563eb] border-[#38bdf8] text-white shadow-[0_0_35px_rgba(14,165,233,0.4)] focus:ring-[#0ea5e9]'
                    }`}
                    aria-label="Hold to record sample"
                  >
                    <Mic className={`w-10 h-10 ${isRecording ? 'animate-bounce' : ''}`} />
                    <span className="text-[11px] font-black uppercase tracking-wider mt-1">
                      {isRecording ? 'Recording...' : 'Hold'}
                    </span>
                  </button>
                </div>

                <div className="text-center">
                  <p className="text-sm font-extrabold text-[#f8fafc]">
                    {isRecording ? 'Listening for sample audio...' : 'Hold to record'}
                  </p>
                  <p className="text-xs text-[#94a3b8] mt-1">
                    Press and hold while making the sound (e.g. knock on wood).
                  </p>
                </div>
              </div>

              {/* Memory-Trained Custom Sounds List */}
              <section aria-labelledby="custom-sounds-heading" className="space-y-3">
                <h2 id="custom-sounds-heading" className="text-xs font-black uppercase tracking-wider text-[#94a3b8] px-1">
                  Custom trained sounds in memory ({customSounds.length})
                </h2>

                <div className="space-y-2.5">
                  {customSounds.length === 0 ? (
                    <div className="p-6 rounded-3xl border border-dashed border-[#1a274c] text-center text-xs text-[#94a3b8]">
                      No custom sounds trained yet. Record 3 samples to save one in memory.
                    </div>
                  ) : (
                    customSounds.map((sound) => (
                      <div
                        key={sound.id}
                        className="p-4 rounded-2xl bg-[#0d1630] border border-[#1a274c] flex items-center justify-between gap-4 shadow-md"
                      >
                        <div className="flex items-center gap-3.5">
                          <div className="w-11 h-11 rounded-xl bg-[#050b1a] border border-[#1a274c] flex items-center justify-center text-[#0ea5e9]">
                            <Volume2 className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-extrabold text-sm sm:text-base text-[#f8fafc]">{sound.name}</h3>
                              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-500/40">
                                Medium priority
                              </span>
                            </div>
                            <p className="text-xs text-[#94a3b8] mt-0.5">
                              {sound.samplesCount} samples · Trained at {sound.trainedAt}
                            </p>
                          </div>
                        </div>

                        <button
                          onClick={() => onTriggerSound(sound.name, 'medium')}
                          className="px-3.5 py-2 rounded-xl text-xs font-bold bg-[#050b1a] hover:bg-[#131e3d] text-[#cbd5e1] hover:text-[#f8fafc] border border-[#1a274c] hover:border-[#0ea5e9] transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
                        >
                          <Play className="w-3.5 h-3.5 text-[#0ea5e9] fill-current" />
                          <span>Test Match</span>
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      ) : (
        /* Live Monitor View */
        <div className="flex flex-col h-[70vh] min-h-[500px] space-y-3">
          <div className="flex items-center justify-between text-xs text-[#94a3b8] px-1">
            <span>EchoAlert Real-Time Sound Monitor</span>
            <a
              href={SOUND_GUARDIAN_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#0ea5e9] hover:text-sky-300 flex items-center gap-1 font-bold underline"
            >
              <span>Open in new tab</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="flex-1 rounded-3xl overflow-hidden border border-[#1a274c] bg-[#050b1a]">
            <iframe
              src={SOUND_GUARDIAN_URL}
              title="Sound Guardian Workspace"
              allow="camera; microphone; autoplay; fullscreen"
              className="w-full h-full border-0"
            />
          </div>
        </div>
      )}
    </div>
  );
};
