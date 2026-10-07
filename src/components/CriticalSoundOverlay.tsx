import React, { useEffect, useState } from 'react';
import { 
  Flame, 
  AlertTriangle, 
  ShieldAlert, 
  Sparkles,
  VolumeX, 
  Check, 
  Send,
  AlertCircle
} from 'lucide-react';
import { DetectedSound } from '../types';
import { WebhookResult } from '../services/webhook';

interface CriticalSoundOverlayProps {
  sound: DetectedSound;
  onAcknowledge: () => void;
  onMute5Min: () => void;
  webhookResult?: WebhookResult | null;
  highContrast: boolean;
}

export const CriticalSoundOverlay: React.FC<CriticalSoundOverlayProps> = ({
  sound,
  onAcknowledge,
  onMute5Min,
  webhookResult,
  highContrast,
}) => {
  const [pulseLevel, setPulseLevel] = useState(1);

  // Vibration loop with navigator.vibrate
  useEffect(() => {
    const vibrate = () => {
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate([600, 200, 600, 200, 1000]);
        } catch (e) {
          console.warn('Vibration failed:', e);
        }
      }
    };

    vibrate();
    const interval = setInterval(vibrate, 2600);

    return () => {
      clearInterval(interval);
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate(0);
        } catch (_) {}
      }
    };
  }, []);

  // Keyboard accessibility
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        onAcknowledge();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onAcknowledge]);

  const soundNameUpper = sound.name.toUpperCase();

  const getCriticalIcon = () => {
    if (soundNameUpper.includes('GLASS')) {
      return <Sparkles className="w-24 h-24 sm:w-28 sm:h-28 text-amber-300" aria-hidden="true" />;
    }
    return <Flame className="w-24 h-24 sm:w-28 sm:h-28 text-amber-400" aria-hidden="true" />;
  };

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="critical-sound-title"
      aria-describedby="critical-sound-match"
      className={`fixed inset-0 z-50 min-h-[100dvh] w-screen flex flex-col items-center justify-between p-6 sm:p-8 lg:p-12 select-none overflow-y-auto ${
        highContrast
          ? 'bg-black text-white border-8 border-red-600'
          : 'bg-gradient-to-b from-red-950 via-red-900 to-black text-white'
      }`}
    >
      {/* Top Tag & Webhook Status Indicator */}
      <div className="w-full max-w-2xl flex items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-red-900/80 border border-red-500/50">
          <span className="w-2.5 h-2.5 rounded-full bg-red-400 animate-ping" />
          <span className="text-xs sm:text-sm font-black uppercase tracking-wider text-red-200">
            Critical Hazard Alert
          </span>
        </div>

        {webhookResult && (
          <div className="text-xs sm:text-sm flex items-center gap-1.5">
            {webhookResult.success ? (
              <span className="flex items-center gap-1.5 text-emerald-400 font-bold bg-black/60 px-3 py-1.5 rounded-full border border-emerald-500/40">
                <Send className="w-3.5 h-3.5" />
                <span>n8n Synced</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-amber-300 font-bold bg-black/60 px-3 py-1.5 rounded-full border border-amber-500/40">
                <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                <span>Webhook: {webhookResult.status}</span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Webhook Error Banner if the request failed */}
      {webhookResult && !webhookResult.success && (
        <div className="w-full max-w-2xl my-3 p-4 rounded-2xl bg-black/85 border border-amber-400 text-left space-y-1.5">
          <div className="flex items-center justify-between text-xs sm:text-sm font-bold text-amber-300">
            <span>Webhook Notice · HTTP {webhookResult.status}</span>
          </div>
          {webhookResult.snippet && (
            <pre className="text-xs font-mono text-zinc-300 overflow-x-auto whitespace-pre-wrap break-all p-3 rounded-xl bg-zinc-950 border border-zinc-800">
              {webhookResult.snippet}
            </pre>
          )}
        </div>
      )}

      {/* Center Focus: Pulsing circles around large flame icon & HUGE TEXT SCALED WITH CLAMP */}
      <div className="flex-1 flex flex-col items-center justify-center text-center my-6 space-y-6 max-w-3xl">
        {/* Pulsing concentric circles around large flame icon */}
        <div className="relative flex items-center justify-center">
          {/* Ring 3 (Outer pulse) */}
          <div className="absolute w-64 h-64 sm:w-80 sm:h-80 lg:w-96 lg:h-96 rounded-full bg-red-600/20 animate-ping opacity-40 pointer-events-none" />

          {/* Ring 2 (Middle pulse) */}
          <div className="absolute w-52 h-52 sm:w-64 sm:h-64 lg:w-76 lg:h-76 rounded-full bg-red-500/30 animate-pulse border-2 border-red-400/50 pointer-events-none" />

          {/* Ring 1 (Inner glowing circle) */}
          <div className="relative w-40 h-40 sm:w-48 sm:h-48 lg:w-56 lg:h-56 rounded-full bg-gradient-to-br from-red-600 to-amber-600 flex items-center justify-center shadow-[0_0_70px_rgba(239,68,68,0.85)] border-4 border-amber-300">
            {getCriticalIcon()}
          </div>
        </div>

        {/* Huge Text: Scaled with clamp() so it looks great on phone, tablet, and laptop */}
        <div className="space-y-3">
          <h1
            id="critical-sound-title"
            style={{ fontSize: 'clamp(2.5rem, 7vw, 5.5rem)', lineHeight: 1.05 }}
            className="font-black uppercase tracking-tight text-white drop-shadow-[0_6px_20px_rgba(0,0,0,0.8)]"
          >
            {soundNameUpper}
          </h1>

          {/* Detected <time> · <match>% match */}
          <p
            id="critical-sound-match"
            className="text-base sm:text-xl lg:text-2xl font-bold text-red-200 drop-shadow-sm"
          >
            Detected {sound.displayTime || 'Just now'} · {sound.matchPercent || 98}% match
          </p>
        </div>
      </div>

      {/* Bottom Action Buttons: Big "I'm aware" and "Mute for 5 min" outline */}
      <div className="w-full max-w-lg sm:max-w-xl space-y-3 pb-4">
        {/* Big "I'm aware" button */}
        <button
          onClick={onAcknowledge}
          autoFocus
          className="w-full py-4 sm:py-5 px-8 rounded-2xl font-black text-xl sm:text-2xl text-red-950 bg-white hover:bg-zinc-100 active:scale-98 transition-all duration-150 shadow-[0_10px_35px_rgba(0,0,0,0.6)] border-2 border-white flex items-center justify-center gap-3 cursor-pointer focus:outline-none focus:ring-4 focus:ring-amber-300"
          aria-label="I'm aware, acknowledge alert and dismiss"
        >
          <Check className="w-7 h-7 sm:w-8 sm:h-8 text-emerald-600 stroke-[3]" aria-hidden="true" />
          <span>I&apos;m aware</span>
        </button>

        {/* "Mute for 5 min" outline button */}
        <button
          onClick={onMute5Min}
          className="w-full py-3.5 sm:py-4 px-8 rounded-2xl font-bold text-sm sm:text-base text-white hover:bg-white/10 active:scale-98 transition-all duration-150 border-2 border-white/60 hover:border-white flex items-center justify-center gap-2 cursor-pointer focus:outline-none focus:ring-4 focus:ring-white/40"
          aria-label="Mute sound alert for 5 minutes"
        >
          <VolumeX className="w-5 h-5 text-zinc-300" aria-hidden="true" />
          <span>Mute for 5 min</span>
        </button>
      </div>
    </div>
  );
};
