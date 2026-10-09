import React, { useState, useEffect, useRef } from 'react';
import { 
  Check, 
  Trash2, 
  Sparkles, 
  Download, 
  Upload, 
  HelpCircle, 
  CheckCircle2, 
  AlertCircle, 
  Circle,
  Play
} from 'lucide-react';
import { 
  LETTERS_LIST, 
  MOTION_LETTERS, 
  SamplePoint, 
  AccuracyReport, 
  evaluateHeldOutAccuracy, 
  saveStoredSamples,
  extractHandFeatures
} from '../services/alphabetClassifier';
import { NormalizedLandmark } from '@mediapipe/tasks-vision';

interface LetterTrainingModalProps {
  isOpen: boolean;
  onClose: () => void;
  samples: SamplePoint[];
  onSamplesChange: (newSamples: SamplePoint[]) => void;
  latestLandmarksRef: React.MutableRefObject<NormalizedLandmark[] | null>;
  latestIsLeftHandRef: React.MutableRefObject<boolean>;
  isCameraActive: boolean;
}

export const LetterTrainingModal: React.FC<LetterTrainingModalProps> = ({
  isOpen,
  onClose,
  samples,
  onSamplesChange,
  latestLandmarksRef,
  latestIsLeftHandRef,
  isCameraActive,
}) => {
  const [selectedLetter, setSelectedLetter] = useState<string>('A');
  const [isRecording, setIsRecording] = useState(false);
  const [accuracyReport, setAccuracyReport] = useState<AccuracyReport | null>(null);
  const [importExportMsg, setImportExportMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const recordIntervalRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Calculate counts per letter
  const countsByLetter = React.useMemo(() => {
    const map: Record<string, number> = {};
    for (const l of LETTERS_LIST) {
      map[l] = 0;
    }
    for (const s of samples) {
      map[s.letter] = (map[s.letter] || 0) + 1;
    }
    return map;
  }, [samples]);

  const selectedCount = countsByLetter[selectedLetter] || 0;
  const isSelectedMotion = MOTION_LETTERS.has(selectedLetter);

  // Stop recording helper
  const stopRecording = () => {
    if (recordIntervalRef.current) {
      clearInterval(recordIntervalRef.current);
      recordIntervalRef.current = null;
    }
    setIsRecording(false);
  };

  // Start recording every 100ms up to 40 samples
  const startRecording = () => {
    if (isSelectedMotion) return;
    if (recordIntervalRef.current) clearInterval(recordIntervalRef.current);

    setIsRecording(true);

    recordIntervalRef.current = window.setInterval(() => {
      // Check latest count
      const currentLetterSamples = samples.filter((s) => s.letter === selectedLetter);
      if (currentLetterSamples.length >= 40) {
        stopRecording();
        return;
      }

      const lms = latestLandmarksRef.current;
      if (lms && lms.length >= 21) {
        const feats = extractHandFeatures(lms, latestIsLeftHandRef.current);
        if (feats) {
          const newPoint: SamplePoint = {
            letter: selectedLetter,
            features: feats,
            timestamp: Date.now(),
          };
          onSamplesChange([...samples, newPoint]);
        }
      }
    }, 100);
  };

  // Cleanup on unmount or modal close
  useEffect(() => {
    return () => {
      if (recordIntervalRef.current) {
        clearInterval(recordIntervalRef.current);
      }
    };
  }, []);

  if (!isOpen) return null;

  const handleClearSelectedLetter = () => {
    const updated = samples.filter((s) => s.letter !== selectedLetter);
    onSamplesChange(updated);
    setAccuracyReport(null);
  };

  const handleClearAll = () => {
    if (window.confirm('Are you sure you want to clear all training samples?')) {
      onSamplesChange([]);
      saveStoredSamples([]);
      setAccuracyReport(null);
    }
  };

  const handleExportJson = () => {
    try {
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(samples, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `signbridge_letter_samples_${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      setImportExportMsg({ type: 'success', text: `Exported ${samples.length} samples successfully.` });
      setTimeout(() => setImportExportMsg(null), 3000);
    } catch (err) {
      setImportExportMsg({ type: 'error', text: 'Export failed: ' + String(err) });
    }
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].letter && parsed[0].features) {
          onSamplesChange(parsed);
          saveStoredSamples(parsed);
          setImportExportMsg({ type: 'success', text: `Imported ${parsed.length} samples successfully!` });
          setAccuracyReport(null);
        } else {
          setImportExportMsg({ type: 'error', text: 'Invalid JSON format. Expected array of SamplePoint objects.' });
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
    const report = evaluateHeldOutAccuracy(samples, 5);
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
              <h2 className="text-lg sm:text-xl font-black text-white">Teach Letters (k-NN Classifier)</h2>
              <p className="text-xs text-[#94a3b8]">
                Record real hand samples for letters A to Z. Total samples: <span className="font-bold text-sky-400">{samples.length}</span>
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              stopRecording();
              onClose();
            }}
            className="px-3.5 py-1.5 rounded-xl bg-[#050b1a] border border-[#1a274c] hover:border-rose-500/50 text-[#94a3b8] hover:text-white text-xs font-bold transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>

        {/* Tip Text */}
        <div className="p-3.5 rounded-2xl bg-[#050b1a] border border-sky-500/30 flex items-start gap-3">
          <HelpCircle className="w-4 h-4 text-[#0ea5e9] shrink-0 mt-0.5" />
          <p className="text-xs text-sky-200/90 leading-relaxed font-medium">
            <span className="font-bold text-white">Tip: </span>
            Record each letter slowly, moving the hand a little closer, further and tilted, with good light.
          </p>
        </div>

        {/* Letters Grid A..Z */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider text-[#94a3b8]">
              Select Letter (Tap to train)
            </span>
            <span className="text-[11px] text-[#94a3b8]">
              Target: at least 20 samples per letter (up to 40)
            </span>
          </div>

          <div className="grid grid-cols-6 sm:grid-cols-9 md:grid-cols-13 gap-1.5 sm:gap-2">
            {LETTERS_LIST.map((letter) => {
              const count = countsByLetter[letter] || 0;
              const hasEnough = count >= 20;
              const isSelected = selectedLetter === letter;
              const isMotion = MOTION_LETTERS.has(letter);

              return (
                <button
                  key={letter}
                  type="button"
                  onClick={() => setSelectedLetter(letter)}
                  className={`relative p-2 sm:p-2.5 rounded-2xl flex flex-col items-center justify-center transition-all cursor-pointer border ${
                    isSelected
                      ? 'bg-[#0ea5e9] text-white border-sky-300 shadow-[0_0_15px_rgba(14,165,233,0.5)] scale-105 z-10'
                      : isMotion
                      ? 'bg-[#050b1a]/50 text-slate-500 border-dashed border-slate-700/60 hover:border-slate-500'
                      : hasEnough
                      ? 'bg-[#050b1a] text-emerald-300 border-emerald-500/40 hover:border-emerald-400'
                      : 'bg-[#050b1a] text-[#cbd5e1] border-[#1a274c] hover:border-sky-500/40'
                  }`}
                >
                  <span className="text-base sm:text-lg font-black">{letter}</span>
                  <div className="flex items-center gap-0.5 mt-0.5">
                    {hasEnough ? (
                      <Check className="w-3 h-3 text-emerald-400 stroke-[3]" />
                    ) : isMotion ? (
                      <span className="text-[9px] text-amber-400/80">~</span>
                    ) : (
                      <Circle className="w-2.5 h-2.5 text-slate-600" />
                    )}
                    <span className="text-[10px] font-mono font-bold">
                      {isMotion ? '—' : count}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Letter Recorder Card */}
        <div className="p-5 sm:p-6 rounded-3xl bg-[#050b1a] border border-[#1a274c] space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-[#0d1630] border-2 border-sky-400/50 flex items-center justify-center text-2xl font-black text-[#0ea5e9] shadow-[0_0_20px_rgba(14,165,233,0.3)]">
                {selectedLetter}
              </div>
              <div>
                <h3 className="text-base font-black text-white flex items-center gap-2">
                  <span>Letter {selectedLetter}</span>
                  {selectedCount >= 20 && (
                    <span className="text-[11px] font-bold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded-full border border-emerald-500/40 flex items-center gap-1">
                      <Check className="w-3 h-3" /> Ready
                    </span>
                  )}
                  {isSelectedMotion && (
                    <span className="text-[11px] font-bold text-amber-400 bg-amber-950/80 px-2 py-0.5 rounded-full border border-amber-500/40">
                      needs motion, not supported yet
                    </span>
                  )}
                </h3>
                <p className="text-xs text-[#94a3b8] mt-0.5">
                  Samples recorded: <span className="font-bold text-white font-mono">{selectedCount}</span> / 40 max
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleClearSelectedLetter}
                disabled={selectedCount === 0}
                className="px-3 py-2 rounded-xl text-xs font-bold bg-[#0d1630] hover:bg-[#131e3d] text-rose-300 border border-rose-500/40 hover:border-rose-400 transition-colors cursor-pointer disabled:opacity-40"
              >
                Clear letter
              </button>
              <button
                type="button"
                onClick={handleClearAll}
                disabled={samples.length === 0}
                className="px-3 py-2 rounded-xl text-xs font-bold bg-[#0d1630] hover:bg-[#131e3d] text-rose-400 border border-rose-500/30 transition-colors cursor-pointer disabled:opacity-40"
              >
                Clear all
              </button>
            </div>
          </div>

          {/* Progress Bar for selected letter */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-[11px] text-[#94a3b8] font-mono">
              <span>Recording Progress</span>
              <span>{Math.round((Math.min(40, selectedCount) / 40) * 100)}%</span>
            </div>
            <div className="w-full h-3 rounded-full bg-[#0d1630] overflow-hidden border border-[#1a274c]">
              <div
                className={`h-full transition-all duration-200 ${
                  selectedCount >= 20 ? 'bg-emerald-500' : 'bg-[#0ea5e9]'
                }`}
                style={{ width: `${Math.min(100, (selectedCount / 40) * 100)}%` }}
              />
            </div>
          </div>

          {/* Big "Hold to record" button */}
          {!isSelectedMotion ? (
            <div className="pt-2 flex flex-col items-center">
              <button
                type="button"
                onMouseDown={startRecording}
                onMouseUp={stopRecording}
                onMouseLeave={stopRecording}
                onTouchStart={startRecording}
                onTouchEnd={stopRecording}
                onTouchCancel={stopRecording}
                disabled={!isCameraActive || selectedCount >= 40}
                className={`w-full sm:w-auto sm:min-w-[280px] py-4 px-8 rounded-2xl text-base font-black flex items-center justify-center gap-3 transition-all cursor-pointer select-none active:scale-95 shadow-lg ${
                  isRecording
                    ? 'bg-rose-600 text-white shadow-[0_0_25px_rgba(244,63,94,0.6)] animate-pulse'
                    : selectedCount >= 40
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/50 cursor-not-allowed opacity-75'
                    : !isCameraActive
                    ? 'bg-[#0d1630] text-slate-500 border border-[#1a274c] cursor-not-allowed'
                    : 'bg-[#0ea5e9] hover:bg-sky-400 text-white shadow-[0_0_20px_rgba(14,165,233,0.4)]'
                }`}
              >
                <div className={`w-3.5 h-3.5 rounded-full ${isRecording ? 'bg-white animate-ping' : 'bg-white'}`} />
                <span>
                  {isRecording
                    ? `Recording "${selectedLetter}" (${selectedCount}/40)...`
                    : selectedCount >= 40
                    ? `40 samples captured for "${selectedLetter}"`
                    : !isCameraActive
                    ? 'Start webcam first to record'
                    : `Hold to record "${selectedLetter}"`}
                </span>
              </button>
              <p className="text-[11px] text-[#94a3b8] mt-2 text-center">
                Press and hold while holding the pose. Captures 1 sample every 100ms when hand is detected.
              </p>
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-500/30 text-amber-300 text-xs text-center font-medium">
              Letter {selectedLetter} requires hand motion (drawing the shape in the air). Static snapshot classifiers do not support J or Z yet.
            </div>
          )}
        </div>

        {/* Accuracy and Export / Import Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          {/* Test Accuracy Button & Results */}
          <div className="p-5 rounded-3xl bg-[#050b1a] border border-[#1a274c] space-y-3 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black uppercase tracking-wider text-white">
                  Test Accuracy (5-fold holdout)
                </h4>
                <button
                  type="button"
                  onClick={handleTestAccuracy}
                  disabled={samples.length < 5}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#0ea5e9] hover:bg-sky-400 text-white transition-colors cursor-pointer disabled:opacity-40"
                >
                  Test accuracy
                </button>
              </div>
              <p className="text-[11px] text-[#94a3b8] mt-1">
                Holds out every 5th sample of each letter and classifies it against the remaining training samples using k-NN (k=5).
              </p>
            </div>

            {accuracyReport && (
              <div className="p-3.5 rounded-2xl bg-[#0d1630] border border-sky-500/40 space-y-2">
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
                {/* Per letter summary */}
                <div className="max-h-24 overflow-y-auto space-y-1 pr-1 scrollbar-thin pt-1 border-t border-[#1a274c]">
                  {Object.entries(accuracyReport.letterAccuracies).map(([l, stat]) => (
                    <div key={l} className="flex justify-between text-[11px] font-mono">
                      <span className="font-bold text-white">{l}:</span>
                      <span className={stat.percentage >= 80 ? 'text-emerald-400' : stat.percentage >= 60 ? 'text-amber-400' : 'text-rose-400'}>
                        {stat.correct}/{stat.total} ({stat.percentage}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Backup, Export & Import */}
          <div className="p-5 rounded-3xl bg-[#050b1a] border border-[#1a274c] space-y-3 flex flex-col justify-between">
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-white">
                Backup & Restore Training Samples
              </h4>
              <p className="text-[11px] text-[#94a3b8] mt-1">
                Samples are saved in browser storage. Export JSON to keep a backup or reload your dataset.
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

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleExportJson}
                disabled={samples.length === 0}
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
          </div>
        </div>
      </div>
    </div>
  );
};
