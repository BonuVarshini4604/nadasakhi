import React from 'react';
import { 
  X, 
  Sun, 
  Moon, 
  Type, 
  Vibrate, 
  Check, 
  ExternalLink,
  ShieldCheck,
  Send
} from 'lucide-react';
import { TextScale } from '../types';
import { N8N_WEBHOOK_URL } from '../constants';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  highContrast: boolean;
  onToggleHighContrast: () => void;
  textScale: TextScale;
  onChangeTextScale: (scale: TextScale) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  highContrast,
  onToggleHighContrast,
  textScale,
  onChangeTextScale,
}) => {
  if (!isOpen) return null;

  const handleTestVibration = () => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([300, 150, 300]);
      } catch (_) {}
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm"
    >
      <div
        className={`w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 border transition-all ${
          highContrast
            ? 'bg-black border-amber-400 text-white'
            : 'bg-[#0d1630] border-[#1a274c] text-[#f8fafc] shadow-2xl'
        }`}
      >
        <div className="flex items-center justify-between pb-4 border-b border-[#1a274c]">
          <h2 id="settings-modal-title" className="text-lg font-black tracking-tight text-[#f8fafc]">
            SoundWatch Settings
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-[#94a3b8] hover:text-[#f8fafc] hover:bg-[#131e3d] transition-colors cursor-pointer"
            aria-label="Close settings"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="py-5 space-y-5 text-sm">
          {/* High Contrast Mode */}
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-[#f8fafc]">High Contrast Mode</p>
              <p className="text-xs text-[#94a3b8]">Pure black background with amber highlights</p>
            </div>
            <button
              onClick={onToggleHighContrast}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                highContrast
                  ? 'bg-amber-400 text-black border-white'
                  : 'bg-[#050b1a] text-[#cbd5e1] border-[#1a274c] hover:border-[#0ea5e9]'
              }`}
            >
              {highContrast ? 'Enabled' : 'Disabled'}
            </button>
          </div>

          {/* Text Size */}
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-[#f8fafc]">Text Scale</p>
              <p className="text-xs text-[#94a3b8]">Increase reading font size</p>
            </div>
            <div className="flex items-center gap-1 bg-[#050b1a] p-1 rounded-xl border border-[#1a274c]">
              {(['normal', 'large', 'xlarge'] as TextScale[]).map((scale) => (
                <button
                  key={scale}
                  onClick={() => onChangeTextScale(scale)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    textScale === scale
                      ? highContrast
                        ? 'bg-amber-400 text-black'
                        : 'bg-[#0ea5e9] text-white shadow-xs'
                      : 'text-[#94a3b8] hover:text-[#f8fafc]'
                  }`}
                >
                  {scale === 'normal' ? '100%' : scale === 'large' ? '115%' : '130%'}
                </button>
              ))}
            </div>
          </div>

          {/* Haptic Vibration Test */}
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-[#f8fafc]">Haptic Vibration Test</p>
              <p className="text-xs text-[#94a3b8]">Test device vibration feedback</p>
            </div>
            <button
              onClick={handleTestVibration}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-[#050b1a] border border-[#1a274c] hover:border-[#0ea5e9] text-[#cbd5e1] hover:text-[#f8fafc] transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Vibrate className="w-4 h-4 text-[#0ea5e9]" />
              <span>Test Pulse</span>
            </button>
          </div>

          {/* Webhook Configuration Information */}
          <div className="p-3.5 rounded-2xl bg-[#050b1a] border border-[#1a274c] space-y-1 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-[#f8fafc]">
              <Send className="w-3.5 h-3.5 text-[#0ea5e9]" />
              <span>Webhook Destination:</span>
            </div>
            <p className="font-mono text-[11px] text-[#94a3b8] break-all">
              {N8N_WEBHOOK_URL}
            </p>
            <p className="text-[11px] text-[#94a3b8]/80">
              Direct browser fetch with payload mode: sound_event & get_history.
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-3.5 rounded-2xl font-black text-sm bg-[#0ea5e9] hover:bg-sky-400 text-white transition-colors cursor-pointer shadow-[0_0_20px_rgba(14,165,233,0.35)]"
        >
          Done
        </button>
      </div>
    </div>
  );
};
