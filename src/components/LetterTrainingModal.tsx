import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Check, 
  Trash2, 
  Sparkles, 
  Download, 
  Upload, 
  HelpCircle, 
  AlertTriangle,
  RotateCcw,
  Circle,
  ShieldAlert,
  ArrowRight
} from 'lucide-react';
import { 
  LETTERS_LIST, 
  MOTION_LETTERS, 
  NEUTRAL_LABEL,
  SamplePoint, 
  MotionSample,
  StoredTrainingData,
  AccuracyReport, 
  evaluateHeldOutAccuracy, 
  saveStoredData,
  retrainFromScratch,
  extractHandFeatures,
  resampleAndNormalizePath,
  checkHandQuality,
  detectOverlappingLetters,
  OverlappingPair
} from '../services/alphabetClassifier';
import { NormalizedLandmark } from '@mediapipe/tasks-vision';

interface LetterTrainingModalProps {
  isOpen: boolean;
  onClose: () => void;
  stillSamples: SamplePoint[];
  motionSamples: MotionSample[];
  onDataChange: (data: StoredTrainingData) => void;
  latestLandmarksRef: React.MutableRefObject<NormalizedLandmark[] | null>;
  latestIsLeftHandRef: React.MutableRefObject<boolean>;
  isCameraActive: boolean;
}

export const LetterTrainingModal: React.FC<LetterTrainingModalProps> = ({
  isOpen,
  onClose,
  stillSamples,
  motionSamples,
  onDataChange,
  latestLandmarksRef,
  latestIsLeftHandRef,
  isCameraActive,
}) => {
  const [selectedLetter, setSelectedLetter] = useState<string>('A');
  const [isRecordingStill, setIsRecordingStill] = useState(false);
  const [isRecordingMotion, setIsRecordingMotion] = useState(false);
  const [motionCountdown, setMotionCountdown] = useState<number>(0);
  const [recordBlockedReason, setRecordBlockedReason] = useState<string | null>(null);
  const [liveQuality, setLiveQuality] = useState<{ isGood: boolean; ringColor: 'green' | 'red'; reason: string }>({
    isGood: false,
    ringColor: 'red',
    reason: 'Waiting for hand...',
  });
  const [accuracyReport, setAccuracyReport] = useState<AccuracyReport | null>(null);
  const [importExportMsg, setImportExportMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  const stillIntervalRef = useRef<number | null>(null);
  const motionTimerRef = useRef<number | null>(null);
  const motionIntervalRef = useRef<number | null>(null);
  const currentMotionPathRef = useRef<[number, number][]>([]);
  const prevLandmarksRef = useRef<NormalizedLandmark[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Still sample counts
  const stillCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const l of LETTERS_LIST) {
      if (!MOTION_LETTERS.has(l)) {
        map[l] = 0;
      }
    }
    map[NEUTRAL_LABEL] = 0;
    for (const s of stillSamples) {
      map[s.letter] = (map[s.letter] || 0) + 1;
    }
    return map;
  }, [stillSamples]);

  // Motion sample counts
  const motionCounts = useMemo(() => {
    const map: Record<'J' | 'Z', number> = { J: 0, Z: 0 };
    for (const m of motionSamples) {
      map[m.letter] = (map[m.letter] || 0) + 1;
    }
    return map;
  }, [motionSamples]);

  // 6. TRAINING QUALITY CHECKS: Detect strongly overlapping letter pairs
  const overlappingPairs = useMemo<OverlappingPair[]>(() => {
    return detectOverlappingLetters(stillSamples);
  }, [stillSamples]);

  const isSelectedMotion = MOTION_LETTERS.has(selectedLetter);
  const isSelectedNeutral = selectedLetter === NEUTRAL_LABEL;

  const currentCount = isSelectedMotion 
    ? (motionCounts[selectedLetter as 'J' | 'Z'] || 0)
    : (stillCounts[selectedLetter] || 0);

  const targetCount = isSelectedMotion ? 15 : 40;
  // Warning on any letter with fewer than 25 samples ("record more")
  const needsMoreSamples = !isSelectedMotion && currentCount < 25;
  const isLetterReady = isSelectedMotion ? currentCount >= 8 : currentCount >= 20;

  // Track live quality ring on every frame while modal is open
  useEffect(() => {
    if (!isOpen || !isCameraActive) return;

    const interval = window.setInterval(() => {
      const lms = latestLandmarksRef.current;
      const quality = checkHandQuality(lms, prevLandmarksRef.current);
      prevLandmarksRef.current = lms;
      setLiveQuality({
        isGood: quality.isGood,
        ringColor: quality.ringColor,
        reason: quality.reason,
      });
    }, 100);

    return () => clearInterval(interval);
  }, [isOpen, isCameraActive, latestLandmarksRef]);

  // Stop still recording helper
  const stopStillRecording = () => {
    if (stillIntervalRef.current) {
      clearInterval(stillIntervalRef.current);
      stillIntervalRef.current = null;
    }
    setIsRecordingStill(false);
    setRecordBlockedReason(null);
  };

  // 7. Start still recording with live feedback:
  // Green when hand is fully in view and steady, red when cut off, too small, or blurry.
  // DO NOT record samples while red!
  const startStillRecording = () => {
    if (isSelectedMotion) return;
    if (stillIntervalRef.current) clearInterval(stillIntervalRef.current);

    setIsRecordingStill(true);
    setRecordBlockedReason(null);

    stillIntervalRef.current = window.setInterval(() => {
      const currentLetterSamples = stillSamples.filter((s) => s.letter === selectedLetter);
      if (currentLetterSamples.length >= 40) {
        stopStillRecording();
        return;
      }

      const lms = latestLandmarksRef.current;
      const quality = checkHandQuality(lms, prevLandmarksRef.current);
      prevLandmarksRef.current = lms;

      // 7. Do not record samples while red
      if (!quality.isGood) {
        setRecordBlockedReason(quality.reason);
        return;
      } else {
        setRecordBlockedReason(null);
      }

      if (lms && lms.length >= 21) {
        const feats = extractHandFeatures(lms, latestIsLeftHandRef.current);
        if (feats) {
          const newPoint: SamplePoint = {
            letter: selectedLetter,
            features: feats,
            timestamp: Date.now(),
          };
          const updated = [...stillSamples, newPoint];
          onDataChange({ stillSamples: updated, motionSamples });
        }
      }
    }, 100);
  };

  // Start motion recording for J and Z: 1.5 seconds, resamples to 16 points
  const startMotionRecording = () => {
    if (!isSelectedMotion || isRecordingMotion || !isCameraActive) return;
    if (currentCount >= 15) return;

    // Check hand quality before starting motion
    const lms = latestLandmarksRef.current;
    const quality = checkHandQuality(lms, prevLandmarksRef.current);
    if (!quality.isGood && quality.reason !== 'Hand is moving / blurry (hold hand steady)') {
      setRecordBlockedReason(quality.reason);
      return;
    }
    setRecordBlockedReason(null);

    setIsRecordingMotion(true);
    setMotionCountdown(1.5);
    currentMotionPathRef.current = [];

    const startTime = performance.now();
    const durationMs = 1500;
    const tipIndex = selectedLetter === 'J' ? 20 : 8;

    motionIntervalRef.current = window.setInterval(() => {
      const elapsed = performance.now() - startTime;
      const remainingSec = Math.max(0, (durationMs - elapsed) / 1000);
      setMotionCountdown(Math.round(remainingSec * 10) / 10);

      const currentLms = latestLandmarksRef.current;
      if (currentLms && currentLms.length >= 21) {
        const wrist = currentLms[0];
        const middleMcp = currentLms[9];
        const scale = Math.hypot(
          middleMcp.x - wrist.x,
          middleMcp.y - wrist.y,
          (middleMcp.z || 0) - (wrist.z || 0)
        ) || 1.0;

        let tipRelX = (currentLms[tipIndex].x - wrist.x) / scale;
        const tipRelY = (currentLms[tipIndex].y - wrist.y) / scale;
        if (latestIsLeftHandRef.current) {
          tipRelX = -tipRelX;
        }

        currentMotionPathRef.current.push([tipRelX, tipRelY]);
      }
    }, 30);

    motionTimerRef.current = window.setTimeout(() => {
      if (motionIntervalRef.current) {
        clearInterval(motionIntervalRef.current);
        motionIntervalRef.current = null;
      }
      setIsRecordingMotion(false);
      setMotionCountdown(0);

      const rawPath = currentMotionPathRef.current;
      if (rawPath.length >= 4) {
        const normalized16 = resampleAndNormalizePath(rawPath, 16);
        const newMotion: MotionSample = {
          letter: selectedLetter as 'J' | 'Z',
          path: normalized16,
          timestamp: Date.now(),
        };
        const updated = [...motionSamples, newMotion];
        onDataChange({ stillSamples, motionSamples: updated });
      }
    }, durationMs);
  };

  useEffect(() => {
    return () => {
      if (stillIntervalRef.current) clearInterval(stillIntervalRef.current);
      if (motionIntervalRef.current) clearInterval(motionIntervalRef.current);
      if (motionTimerRef.current) clearTimeout(motionTimerRef.current);
    };
  }, []);

  if (!isOpen) return null;

  const handleClearSelectedLetter = () => {
    if (isSelectedMotion) {
      const updated = motionSamples.filter((m) => m.letter !== selectedLetter);
      onDataChange({ stillSamples, motionSamples: updated });
    } else {
      const updated = stillSamples.filter((s) => s.letter !== selectedLetter);
      onDataChange({ stillSamples: updated, motionSamples });
    }
    setAccuracyReport(null);
  };

  const handleClearAll = () => {
    if (window.confirm('Are you sure you want to clear all training samples? You can export JSON first to keep a backup.')) {
      const emptyData: StoredTrainingData = { stillSamples: [], motionSamples: [] };
      onDataChange(emptyData);
      saveStoredData(emptyData);
      setAccuracyReport(null);
    }
  };

  // 9. Retrain from scratch
  const handleRetrainFromScratch = () => {
    if (window.confirm('Retrain from scratch: This resets all letter and neutral samples back to fresh clean baseline seed data. Continue?')) {
      const freshData = retrainFromScratch();
      onDataChange(freshData);
      setAccuracyReport(null);
      setImportExportMsg({ type: 'success', text: 'Reset to clean baseline dataset successfully!' });
      setTimeout(() => setImportExportMsg(null), 3000);
    }
  };

  const handleExportJson = () => {
    try {
      const exportPayload: StoredTrainingData = {
        stillSamples,
        motionSamples,
      };
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportPayload, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `signbridge-letter-samples-${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      setImportExportMsg({ type: 'success', text: 'Samples exported successfully!' });
    } catch (err) {
      setImportExportMsg({ type: 'error', text: 'Export failed: ' + String(err) });
    }
    setTimeout(() => setImportExportMsg(null), 3000);
  };

  // 9. Import samples: supports backward compatibility with older 63-feature files
  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed && (Array.isArray(parsed.stillSamples) || Array.isArray(parsed))) {
          const newStill: SamplePoint[] = Array.isArray(parsed.stillSamples) ? parsed.stillSamples : parsed;
          const newMotion: MotionSample[] = Array.isArray(parsed.motionSamples) ? parsed.motionSamples : [];
          const combined: StoredTrainingData = { stillSamples: newStill, motionSamples: newMotion };
          onDataChange(combined);
          saveStoredData(combined);
          setImportExportMsg({ 
            type: 'success', 
            text: `Imported ${newStill.length} still samples & ${newMotion.length} motions successfully!` 
          });
          setAccuracyReport(null);
        } else {
          setImportExportMsg({ type: 'error', text: 'Invalid JSON format for training samples.' });
        }
      } catch (err) {
        setImportExportMsg({ type: 'error', text: 'Failed to parse JSON file: ' + String(err) });
      }
      setTimeout(() => setImportExportMsg(null), 3500);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleTestAccuracy = () => {
    const report = evaluateHeldOutAccuracy(stillSamples, 5);
    setAccuracyReport(report);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="w-full max-w-4xl bg-[#0d1630] border border-[#1a274c] rounded-3xl shadow-2xl p-5 sm:p-7 space-y-6 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#1a274c]">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-2xl bg-sky-500/10 border border-sky-400/30 text-[#0ea5e9]">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-white">Teach Letters (A to Z) &amp; Neutral Class</h2>
              <p className="text-xs text-[#94a3b8]">
                Still samples: <span className="font-bold text-sky-400">{stillSamples.length}</span> · Motion samples (J, Z): <span className="font-bold text-sky-400">{motionSamples.length}</span>
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              stopStillRecording();
              onClose();
            }}
            className="px-3.5 py-1.5 rounded-xl bg-[#050b1a] border border-[#1a274c] hover:border-rose-500/50 text-[#94a3b8] hover:text-white text-xs font-bold transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>

        {/* 7. Live Hand Quality Ring Indicator Banner */}
        <div className="p-3.5 rounded-2xl bg-[#050b1a] border border-[#1a274c] flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center">
              <span
                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                  liveQuality.ringColor === 'green'
                    ? 'border-emerald-400 bg-emerald-950/60 shadow-[0_0_12px_rgba(16,185,129,0.5)]'
                    : 'border-rose-500 bg-rose-950/60 shadow-[0_0_12px_rgba(244,63,94,0.5)]'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    liveQuality.ringColor === 'green' ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
                  }`}
                />
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white">Camera Hand Status:</span>
                <span
                  className={`text-xs font-mono font-bold ${
                    liveQuality.ringColor === 'green' ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {liveQuality.ringColor === 'green' ? 'GREEN (Optimal for recording)' : 'RED (Blocked)'}
                </span>
              </div>
              <p className="text-[11px] text-[#94a3b8]">
                {liveQuality.reason}
              </p>
            </div>
          </div>
          <div className="text-[11px] text-sky-300 font-medium bg-sky-950/40 border border-sky-500/20 px-3 py-1.5 rounded-xl">
            Tip: Record slowly with hand rotated slightly, good lighting &amp; plain background.
          </div>
        </div>

        {/* 6. Overlap Warnings Banner */}
        {overlappingPairs.length > 0 && (
          <div className="p-3.5 rounded-2xl bg-amber-950/40 border border-amber-500/40 space-y-1.5">
            <div className="flex items-center gap-2 text-amber-300 text-xs font-bold">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Training Overlap Warning ({overlappingPairs.length} pair{overlappingPairs.length > 1 ? 's' : ''})</span>
            </div>
            <div className="space-y-1 pl-6">
              {overlappingPairs.map((p, idx) => (
                <p key={idx} className="text-[11px] text-amber-200/90 leading-relaxed">
                  • {p.warningMessage}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Letters Grid A..Z + 5. NEUTRAL CLASS */}
        <div className="space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs font-extrabold uppercase tracking-wider text-[#94a3b8]">
              Select Class (Tap to train or inspect)
            </span>
            <span className="text-[11px] text-[#94a3b8]">
              Target: ≥25 samples for high precision (warns below 25)
            </span>
          </div>

          <div className="grid grid-cols-6 sm:grid-cols-9 md:grid-cols-14 gap-1.5 sm:gap-2">
            {LETTERS_LIST.map((letter) => {
              const isMotion = MOTION_LETTERS.has(letter);
              const count = isMotion 
                ? (motionCounts[letter as 'J' | 'Z'] || 0)
                : (stillCounts[letter] || 0);
              const minNeeded = isMotion ? 8 : 25;
              const hasEnough = count >= minNeeded;
              const isSelected = selectedLetter === letter;
              const warnCount = !isMotion && count < 25;

              return (
                <button
                  key={letter}
                  type="button"
                  onClick={() => setSelectedLetter(letter)}
                  className={`relative p-2 rounded-2xl flex flex-col items-center justify-center transition-all cursor-pointer border ${
                    isSelected
                      ? 'bg-[#0ea5e9] text-white border-sky-300 shadow-[0_0_15px_rgba(14,165,233,0.5)] scale-105 z-10'
                      : isMotion
                      ? hasEnough
                        ? 'bg-[#050b1a] text-amber-300 border-amber-500/50 hover:border-amber-400'
                        : 'bg-[#050b1a] text-amber-200/80 border-amber-500/30 hover:border-amber-400'
                      : warnCount
                      ? 'bg-[#050b1a] text-amber-200 border-amber-500/30 hover:border-amber-400'
                      : hasEnough
                      ? 'bg-[#050b1a] text-emerald-300 border-emerald-500/40 hover:border-emerald-400'
                      : 'bg-[#050b1a] text-[#cbd5e1] border-[#1a274c] hover:border-sky-500/40'
                  }`}
                >
                  <span className="text-base sm:text-lg font-black">{letter}</span>
                  <div className="flex items-center gap-0.5 mt-0.5">
                    {hasEnough ? (
                      <Check className="w-3 h-3 text-emerald-400 stroke-[3]" />
                    ) : (
                      <Circle className="w-2.5 h-2.5 text-slate-600" />
                    )}
                    <span className="text-[10px] font-mono font-bold">
                      {count}
                    </span>
                  </div>
                  {isMotion ? (
                    <span className="absolute -top-1.5 -right-1 text-[7px] bg-amber-950 text-amber-300 px-1 rounded-full border border-amber-500/40">
                      motion
                    </span>
                  ) : warnCount ? (
                    <span className="absolute -top-1.5 -right-1 text-[7px] bg-amber-950/90 text-amber-300 px-1 rounded-full border border-amber-500/50">
                      &lt;25
                    </span>
                  ) : null}
                </button>
              );
            })}

            {/* 5. NEUTRAL CLASS BUTTON */}
            <button
              type="button"
              onClick={() => setSelectedLetter(NEUTRAL_LABEL)}
              className={`relative col-span-2 sm:col-span-1 p-2 rounded-2xl flex flex-col items-center justify-center transition-all cursor-pointer border ${
                isSelectedNeutral
                  ? 'bg-purple-600 text-white border-purple-300 shadow-[0_0_15px_rgba(168,85,247,0.5)] scale-105 z-10'
                  : 'bg-[#050b1a] text-purple-300 border-purple-500/40 hover:border-purple-400'
              }`}
            >
              <span className="text-xs sm:text-sm font-black">Neutral</span>
              <div className="flex items-center gap-0.5 mt-0.5">
                {stillCounts[NEUTRAL_LABEL] >= 20 ? (
                  <Check className="w-3 h-3 text-purple-400 stroke-[3]" />
                ) : (
                  <Circle className="w-2.5 h-2.5 text-slate-600" />
                )}
                <span className="text-[10px] font-mono font-bold">
                  {stillCounts[NEUTRAL_LABEL] || 0}
                </span>
              </div>
              <span className="absolute -top-1.5 -right-1 text-[7px] bg-purple-950 text-purple-300 px-1 rounded-full border border-purple-500/40">
                no sign
              </span>
            </button>
          </div>
        </div>

        {/* Selected Letter Recorder Card */}
        <div className="p-5 sm:p-6 rounded-3xl bg-[#050b1a] border border-[#1a274c] space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className={`w-14 h-14 rounded-2xl border-2 flex items-center justify-center font-black shadow-lg ${
                isSelectedNeutral
                  ? 'bg-purple-950/60 border-purple-400 text-purple-300 text-xl'
                  : 'bg-[#0d1630] border-sky-400/50 text-[#0ea5e9] text-2xl'
              }`}>
                {isSelectedNeutral ? 'REST' : selectedLetter}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base sm:text-lg font-black text-white">
                    {isSelectedNeutral
                      ? 'Neutral / No Sign (Resting Hand)'
                      : `Letter "${selectedLetter}"`}
                  </h3>
                  {isSelectedMotion && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-500/40">
                      Motion Letter
                    </span>
                  )}
                  {needsMoreSamples && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-500/50">
                      Record more (fewer than 25)
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#94a3b8]">
                  {isSelectedNeutral
                    ? 'Relaxed open hand, mid-transition, or resting hand. When this wins, app displays "Ready" and adds nothing.'
                    : isSelectedMotion
                    ? selectedLetter === 'J'
                      ? 'Pinky tip trajectory drawn as a hook over 1.5 seconds.'
                      : 'Index tip trajectory drawn as a Z over 1.5 seconds.'
                    : `Still hand pose (${currentCount}/${targetCount} samples)`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleClearSelectedLetter}
                disabled={currentCount === 0}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-[#0d1630] hover:bg-[#131e3d] text-rose-300 hover:text-white border border-[#1a274c] hover:border-rose-500/50 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear {isSelectedNeutral ? 'Neutral' : selectedLetter}</span>
              </button>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-[#94a3b8]">Recorded Samples</span>
              <span className={`font-bold ${isLetterReady ? 'text-emerald-400' : 'text-amber-400'}`}>
                {currentCount} / {targetCount} {isLetterReady ? '✓ Ready' : '(Needs more)'}
              </span>
            </div>
            <div className="w-full h-3 rounded-full bg-[#0d1630] border border-[#1a274c] overflow-hidden p-0.5">
              <div
                className={`h-full rounded-full transition-all duration-200 ${
                  isSelectedNeutral
                    ? 'bg-purple-500'
                    : isLetterReady
                    ? 'bg-gradient-to-r from-emerald-500 to-[#0ea5e9]'
                    : 'bg-gradient-to-r from-amber-500 to-[#0ea5e9]'
                }`}
                style={{ width: `${Math.min(100, (currentCount / targetCount) * 100)}%` }}
              />
            </div>
          </div>

          {/* Recording Feedback Warning if blocked */}
          {recordBlockedReason && (
            <div className="p-2.5 rounded-xl bg-rose-950/70 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
              <span>Recording paused: {recordBlockedReason}</span>
            </div>
          )}

          {/* Record Actions */}
          {!isSelectedMotion ? (
            /* STILL LETTER RECORDING: "Hold to record" button */
            <div className="flex flex-col items-center justify-center p-4 rounded-2xl bg-[#0d1630] border border-[#1a274c] space-y-3">
              <button
                type="button"
                onMouseDown={startStillRecording}
                onMouseUp={stopStillRecording}
                onMouseLeave={stopStillRecording}
                onTouchStart={startStillRecording}
                onTouchEnd={stopStillRecording}
                disabled={!isCameraActive || currentCount >= 40}
                className={`w-full max-w-sm py-4 px-6 rounded-2xl text-sm font-black transition-all cursor-pointer flex items-center justify-center gap-2 select-none shadow-lg ${
                  isRecordingStill
                    ? 'bg-rose-600 text-white shadow-[0_0_25px_rgba(225,29,72,0.6)] scale-98 ring-4 ring-rose-400/30'
                    : 'bg-[#0ea5e9] hover:bg-sky-400 text-white shadow-[0_0_20px_rgba(14,165,233,0.35)]'
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                <span className={`w-3 h-3 rounded-full ${isRecordingStill ? 'bg-white animate-ping' : 'bg-white'}`} />
                <span>
                  {currentCount >= 40
                    ? `Max 40 samples reached for "${selectedLetter}"`
                    : isRecordingStill
                    ? `Recording "${selectedLetter}" (Release to stop)...`
                    : !isCameraActive
                    ? 'Start Camera First to Record'
                    : `Hold to record "${selectedLetter}"`}
                </span>
              </button>
              <p className="text-[11px] text-[#94a3b8] text-center max-w-md">
                Hold the button down while keeping your hand steady in camera view. Samples are captured every 100 ms up to 40 samples.
              </p>
            </div>
          ) : (
            /* MOTION LETTER RECORDING (J & Z): "Record motion" button */
            <div className="flex flex-col items-center justify-center p-4 rounded-2xl bg-[#0d1630] border border-[#1a274c] space-y-3">
              <button
                type="button"
                onClick={startMotionRecording}
                disabled={!isCameraActive || isRecordingMotion || currentCount >= 15}
                className={`w-full max-w-sm py-4 px-6 rounded-2xl text-sm font-black transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg ${
                  isRecordingMotion
                    ? 'bg-amber-600 text-white shadow-[0_0_25px_rgba(217,119,6,0.6)] animate-pulse'
                    : 'bg-amber-500 hover:bg-amber-400 text-black shadow-[0_0_20px_rgba(245,158,11,0.35)]'
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                <Sparkles className="w-4 h-4" />
                <span>
                  {currentCount >= 15
                    ? `Max 15 motions recorded for "${selectedLetter}"`
                    : isRecordingMotion
                    ? `Tracing "${selectedLetter}"... ${motionCountdown}s remaining`
                    : !isCameraActive
                    ? 'Start Camera First to Record'
                    : `Record motion for "${selectedLetter}" (1.5s)`}
                </span>
              </button>
              <p className="text-[11px] text-amber-200/90 text-center max-w-md font-medium">
                {selectedLetter === 'J'
                  ? 'Click "Record motion", then trace the J hook stroke in the air with your pinky fingertip during 1.5 seconds.'
                  : 'Click "Record motion", then trace the Z shape in the air with your index fingertip during 1.5 seconds.'}
              </p>
            </div>
          )}
        </div>

        {/* Accuracy and Export / Import Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          {/* 6. Test Accuracy Button & Confusion Results */}
          <div className="p-5 rounded-3xl bg-[#050b1a] border border-[#1a274c] space-y-3 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black uppercase tracking-wider text-white">
                  Test Accuracy (5-fold holdout)
                </h4>
                <button
                  type="button"
                  onClick={handleTestAccuracy}
                  disabled={stillSamples.length < 5}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#0ea5e9] hover:bg-sky-400 text-white transition-colors cursor-pointer disabled:opacity-40"
                >
                  Test accuracy
                </button>
              </div>
              <p className="text-[11px] text-[#94a3b8] mt-1">
                Holds out every 5th sample, tests with weighted 1/distance k-NN, and reports confusion breakdown.
              </p>
            </div>

            {accuracyReport && (
              <div className="p-3.5 rounded-2xl bg-[#0d1630] border border-sky-500/40 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-sky-200 font-bold">
                    accuracy on held-out samples from this user
                  </span>
                  <span className="text-lg font-black text-emerald-400 font-mono">
                    {accuracyReport.overallAccuracy}%
                  </span>
                </div>
                <div className="text-[11px] text-[#94a3b8]">
                  Tested on {accuracyReport.totalTestSamples} held-out validation samples.
                </div>

                {/* Confusion List */}
                {accuracyReport.confusedPairs.length > 0 && (
                  <div className="p-2.5 rounded-xl bg-[#050b1a] border border-rose-500/30 text-[11px] space-y-1.5">
                    <span className="font-extrabold text-rose-300 uppercase tracking-wider text-[10px] block">
                      Confusion List:
                    </span>
                    <div className="space-y-1 text-rose-200 font-mono text-[11px]">
                      {accuracyReport.confusedPairs.map((cp, idx) => (
                        <div key={idx} className="bg-rose-950/60 px-2 py-1 rounded border border-rose-500/20 flex items-center justify-between">
                          <span>{cp.actual} is confused with {cp.predicted}</span>
                          <span className="font-bold text-rose-300">{cp.count} time{cp.count > 1 ? 's' : ''}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Per letter summary */}
                <div className="max-h-28 overflow-y-auto space-y-1 pr-1 scrollbar-thin pt-1 border-t border-[#1a274c]">
                  {Object.entries(accuracyReport.letterAccuracies).map(([l, stat]) => (
                    <div key={l} className="flex justify-between text-[11px] font-mono">
                      <span className="font-bold text-white">{l === NEUTRAL_LABEL ? 'Neutral' : l}:</span>
                      <span className={stat.percentage >= 80 ? 'text-emerald-400' : stat.percentage >= 60 ? 'text-amber-400' : 'text-rose-400'}>
                        {stat.correct}/{stat.total} ({stat.percentage}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Backup, Retrain & Import / Export */}
          <div className="p-5 rounded-3xl bg-[#050b1a] border border-[#1a274c] space-y-3 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black uppercase tracking-wider text-white">
                  Model Dataset Operations
                </h4>
                <button
                  type="button"
                  onClick={handleRetrainFromScratch}
                  className="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-rose-950/80 text-rose-300 hover:bg-rose-900 border border-rose-500/50 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Retrain from scratch</span>
                </button>
              </div>
              <p className="text-[11px] text-[#94a3b8] mt-1">
                Export JSON to backup or transfer samples across devices. Supports both legacy 63-feature and 82-feature datasets.
              </p>
            </div>

            {importExportMsg && (
              <div
                className={`p-2.5 rounded-xl text-xs font-medium border ${
                  importExportMsg.type === 'success'
                    ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300'
                    : 'bg-rose-950/80 border-rose-500/40 text-rose-300'
                }`}
              >
                {importExportMsg.text}
              </div>
            )}

            <div className="space-y-2 pt-1">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportJson}
                  disabled={stillSamples.length === 0 && motionSamples.length === 0}
                  className="flex-1 py-2.5 px-3 rounded-xl text-xs font-bold bg-[#0d1630] hover:bg-[#131e3d] text-[#f8fafc] border border-[#1a274c] hover:border-[#0ea5e9] flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40"
                >
                  <Download className="w-3.5 h-3.5 text-[#0ea5e9]" />
                  <span>Export samples (JSON)</span>
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 py-2.5 px-3 rounded-xl text-xs font-bold bg-[#0d1630] hover:bg-[#131e3d] text-[#f8fafc] border border-[#1a274c] hover:border-[#0ea5e9] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-[#0ea5e9]" />
                  <span>Import samples (JSON)</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleImportJson}
                  className="hidden"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="text-[11px] text-rose-400 hover:text-rose-300 font-bold hover:underline"
                >
                  Clear all samples
                </button>
                <span className="text-[11px] text-slate-500 font-mono">
                  Total: {stillSamples.length + motionSamples.length} samples
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
