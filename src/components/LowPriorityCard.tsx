import React, { useEffect } from 'react';
import { BellRing, Dog, X, Check, Clock } from 'lucide-react';
import { DetectedSound } from '../types';

interface LowPriorityCardProps {
  sound: DetectedSound;
  onDismiss: () => void;
  highContrast: boolean;
}

export const LowPriorityCard: React.FC<LowPriorityCardProps> = ({
  sound,
  onDismiss,
  highContrast,
}) => {
  // Gentle short vibration for low priority sound
  useEffect(() => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(200);
      } catch (_) {}
    }

    const timer = setTimeout(() => {
      onDismiss();
    }, 6000);

    return () => clearTimeout(timer);
  }, [onDismiss]);

  const getIcon = () => {
    const s = sound.name.toUpperCase();
    if (s.includes('DOG') || s.includes('BARK')) return <Dog className="w-5 h-5 text-amber-400" />;
    return <BellRing className="w-5 h-5 text-sky-400" />;
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-4 left-4 right-4 max-w-md mx-auto z-50 animate-[slideDown_0.3s_ease-out]"
    >
      <div
        className={`p-3.5 sm:p-4 rounded-2xl border shadow-2xl flex items-center justify-between gap-3 backdrop-blur-xl ${
          highContrast
            ? 'bg-black border-amber-400 text-white'
            : 'bg-[#0d1630]/95 border-[#1a274c] text-[#f8fafc] shadow-[0_0_25px_rgba(14,165,233,0.25)]'
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              highContrast ? 'bg-amber-400 text-black' : 'bg-[#050b1a] text-white border border-[#1a274c]'
            }`}
          >
            {getIcon()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-extrabold text-sm text-[#f8fafc]">{sound.name}</h4>
              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-[#0ea5e9]/20 text-[#38bdf8] border border-[#0ea5e9]/40">
                Low priority
              </span>
            </div>
            <p className="text-xs text-[#94a3b8] flex items-center gap-1 mt-0.5">
              <Clock className="w-3 h-3" />
              <span>Detected {sound.displayTime || 'Just now'}</span>
            </p>
          </div>
        </div>

        <button
          onClick={onDismiss}
          className="p-1.5 rounded-lg text-[#94a3b8] hover:text-[#f8fafc] hover:bg-[#131e3d] transition-colors cursor-pointer"
          aria-label="Dismiss alert"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
