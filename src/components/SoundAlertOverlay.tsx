import React, { useEffect, useState } from 'react';
import { 
  Flame, 
  BellRing, 
  ShieldAlert, 
  Volume2, 
  AlertTriangle, 
  CheckCircle2, 
  Send,
  Zap
} from 'lucide-react';
import { N8N_WEBHOOK_URL } from '../constants';

interface SoundAlertOverlayProps {
  soundName: string;
  onAcknowledge: () => void;
  webhookStatus?: 'sending' | 'sent' | 'error';
}

export const SoundAlertOverlay: React.FC<SoundAlertOverlayProps> = ({
  soundName,
  onAcknowledge,
  webhookStatus = 'sent',
}) => {
  const [flashIntensity, setFlashIntensity] = useState<'bright' | 'deep'>('bright');

  // Flashing red background effect for visual alerting (critical for deaf individuals)
  useEffect(() => {
    const flashInterval = setInterval(() => {
      setFlashIntensity((prev) => (prev === 'bright' ? 'deep' : 'bright'));
    }, 450);

    return () => clearInterval(flashInterval);
  }, []);

  // Vibrate the device using navigator.vibrate if available
  useEffect(() => {
    const triggerVibration = () => {
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        try {
          // Strong pulsing vibration pattern: vibrate 500ms, pause 250ms, vibrate 500ms, pause 250ms, vibrate 1000ms
          navigator.vibrate([500, 250, 500, 250, 1000]);
        } catch (e) {
          console.warn('Vibration not permitted by browser or device:', e);
        }
      }
    };

    triggerVibration();
    // Repeat vibration every 2.5 seconds while alert is active
    const vibrateInterval = setInterval(triggerVibration, 2500);

    return () => {
      clearInterval(vibrateInterval);
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate(0); // Stop vibration immediately
        } catch (_) {}
      }
    };
  }, []);

  // Handle keyboard escape or space to acknowledge
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') {
        onAcknowledge();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onAcknowledge]);

  // Determine icon based on sound name
  const upper = soundName.toUpperCase();
  const getSoundIcon = () => {
    if (upper.includes('FIRE') || upper.includes('SMOKE') || upper.includes('BURN')) {
      return <Flame className="w-28 h-28 sm:w-40 sm:h-40 text-amber-300 animate-bounce" aria-hidden="true" />;
    }
    if (upper.includes('DOOR') || upper.includes('BELL') || upper.includes('KNOCK')) {
      return <BellRing className="w-28 h-28 sm:w-40 sm:h-40 text-white animate-bounce" aria-hidden="true" />;
    }
    if (upper.includes('SIREN') || upper.includes('POLICE') || upper.includes('AMBULANCE') || upper.includes('ALARM')) {
      return <ShieldAlert className="w-28 h-28 sm:w-40 sm:h-40 text-amber-300 animate-bounce" aria-hidden="true" />;
    }
    if (upper.includes('GLASS') || upper.includes('BREAK') || upper.includes('CRASH')) {
      return <AlertTriangle className="w-28 h-28 sm:w-40 sm:h-40 text-amber-300 animate-bounce" aria-hidden="true" />;
    }
    return <Volume2 className="w-28 h-28 sm:w-40 sm:h-40 text-white animate-bounce" aria-hidden="true" />;
  };

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="alert-sound-title"
      aria-describedby="alert-sound-desc"
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-between p-4 sm:p-8 md:p-12 transition-colors duration-200 select-none ${
        flashIntensity === 'bright'
          ? 'bg-red-600 text-white'
          : 'bg-red-950 text-white'
      }`}
      style={{
        boxShadow: 'inset 0 0 100px rgba(0, 0, 0, 0.8)',
      }}
    >
      {/* Top Banner: Emergency Status & Webhook Confirmation */}
      <div className="w-full max-w-4xl flex flex-wrap items-center justify-between gap-3 bg-black/60 backdrop-blur-md px-5 py-3 rounded-2xl border-2 border-white/60">
        <div className="flex items-center gap-2.5">
          <span className="w-4 h-4 rounded-full bg-red-500 animate-ping" />
          <span className="font-black text-sm sm:text-base tracking-widest uppercase text-amber-300">
            DANGER SOUND DETECTED
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-200">
          <Send className="w-4 h-4 text-emerald-400" aria-hidden="true" />
          <span>Webhook:</span>
          <span className="bg-black/70 px-2 py-0.5 rounded text-[11px] font-mono text-emerald-300 border border-emerald-500/40">
            mode: &quot;sound_event&quot;
          </span>
          <span className="text-emerald-400 font-bold">Dispatched</span>
        </div>
      </div>

      {/* Center Hero: Very Large Icon and Large Text naming the sound */}
      <div className="flex-1 flex flex-col items-center justify-center text-center my-6 space-y-6 max-w-5xl">
        {/* Giant Pulsing Icon */}
        <div className="p-6 sm:p-8 rounded-full bg-black/50 border-4 border-white shadow-2xl flex items-center justify-center">
          {getSoundIcon()}
        </div>

        {/* Large Sound Name Text */}
        <div className="space-y-3">
          <div className="inline-block px-4 py-1 rounded-full bg-black/70 text-amber-300 text-sm sm:text-base font-extrabold uppercase tracking-widest border border-amber-400">
            Acoustic Warning Event
          </div>

          <h1
            id="alert-sound-title"
            className="text-4xl sm:text-6xl md:text-8xl font-black uppercase tracking-tight text-white drop-shadow-[0_8px_16px_rgba(0,0,0,0.8)] leading-none"
          >
            {soundName}
          </h1>

          <p
            id="alert-sound-desc"
            className="text-lg sm:text-2xl font-bold text-amber-200 max-w-2xl mx-auto drop-shadow-md"
          >
            Vibrating device & flashing visual alert. A dangerous or attention sound was detected by NādaSakhi.
          </p>
        </div>
      </div>

      {/* Bottom Area: Big "I am safe / Acknowledge" button */}
      <div className="w-full max-w-xl flex flex-col items-center gap-4">
        <button
          onClick={onAcknowledge}
          autoFocus
          className="w-full py-5 sm:py-6 px-8 sm:px-12 rounded-3xl font-black text-2xl sm:text-3xl text-red-950 bg-white hover:bg-slate-100 active:scale-95 transition-all duration-150 shadow-[0_10px_35px_rgba(0,0,0,0.6)] border-4 border-white flex items-center justify-center gap-3 cursor-pointer focus:outline-none focus:ring-8 focus:ring-amber-400"
          aria-label="I am safe, Acknowledge danger sound alert and close overlay"
        >
          <CheckCircle2 className="w-9 h-9 sm:w-11 sm:h-11 text-emerald-600 shrink-0" aria-hidden="true" />
          <span>I am safe / Acknowledge</span>
        </button>

        <p className="text-xs sm:text-sm text-white/80 font-medium">
          Pressing acknowledge stops flashing, silences vibration, and resumes regular monitoring.
        </p>
      </div>
    </div>
  );
};
