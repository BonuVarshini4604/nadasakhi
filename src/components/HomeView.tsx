import React from 'react';
import { TabType } from '../types';
import { 
  ShieldAlert, 
  Hand, 
  ExternalLink, 
  Volume2, 
  MessageSquareText, 
  Sparkles, 
  ArrowRight,
  Camera,
  Mic,
  BellRing,
  HelpCircle,
  Eye,
  CheckCircle2,
  Info,
  Building2
} from 'lucide-react';
import { SOUND_GUARDIAN_URL, SIGN_BRIDGE_URL, MODULES } from '../constants';
import { AlertHistoryPanel } from './AlertHistoryPanel';

interface HomeViewProps {
  onSelectTab: (tab: TabType) => void;
  highContrast: boolean;
  onTriggerSoundAlert?: (soundName: string) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({ 
  onSelectTab, 
  highContrast,
  onTriggerSoundAlert,
}) => {
  const soundGuardian = MODULES['sound-guardian'];
  const signBridge = MODULES['sign-bridge'];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-12">
      {/* Hero Section */}
      <section
        aria-labelledby="hero-heading"
        className={`rounded-3xl p-6 sm:p-10 lg:p-12 border transition-all duration-200 ${
          highContrast
            ? 'bg-zinc-950 border-amber-400 text-white shadow-none'
            : 'bg-gradient-to-b from-teal-50/70 via-white to-slate-50 border-slate-200/90 shadow-sm'
        }`}
      >
        <div className="max-w-4xl mx-auto text-center space-y-6">
          {/* Assistive Subtitle / Kicker */}
          <div className="flex items-center justify-center gap-2 text-sm font-semibold">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                highContrast
                  ? 'bg-amber-400 text-black'
                  : 'bg-teal-100 text-teal-900 border border-teal-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              Unified Assistive Technology
            </span>
          </div>

          <h1
            id="hero-heading"
            className={`text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-tight ${
              highContrast ? 'text-amber-300' : 'text-slate-900'
            }`}
          >
            NādaSakhi – Smart Accessibility Platform
          </h1>

          {/* User's specified intro message */}
          <p
            className={`text-lg sm:text-2xl font-medium leading-relaxed max-w-3xl mx-auto ${
              highContrast ? 'text-zinc-100 font-semibold' : 'text-slate-700'
            }`}
          >
            NādaSakhi helps <span className="underline decoration-2 underline-offset-4 font-bold">deaf and speech-impaired people</span> with{' '}
            <span className={highContrast ? 'text-amber-300 font-bold' : 'text-teal-800 font-bold'}>danger-sound alerts</span>,{' '}
            <span className={highContrast ? 'text-amber-300 font-bold' : 'text-indigo-800 font-bold'}>sign-to-text</span>,{' '}
            <span className={highContrast ? 'text-amber-300 font-bold' : 'text-indigo-800 font-bold'}>text-to-sign</span>, and{' '}
            <span className={highContrast ? 'text-amber-300 font-bold' : 'text-teal-800 font-bold'}>live captions</span>.
          </p>

          {/* Three Large Accessible Action Buttons Under Intro */}
          <div
            aria-label="Quick launch tools"
            className="pt-2 sm:pt-4 grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5 max-w-4xl mx-auto w-full"
          >
            {/* Button 1: Try Sound Alert */}
            <button
              onClick={() => onSelectTab('sound-guardian')}
              className={`group flex flex-col items-center justify-center text-center p-6 sm:p-7 rounded-2xl border-2 transition-all duration-150 transform hover:-translate-y-0.5 active:scale-98 focus:outline-none focus-visible:ring-4 cursor-pointer ${
                highContrast
                  ? 'bg-amber-400 text-black border-white hover:bg-amber-300 focus-visible:ring-white shadow-lg'
                  : 'bg-teal-700 hover:bg-teal-800 text-white border-teal-800 shadow-md hover:shadow-xl focus-visible:ring-teal-500'
              }`}
              aria-label="Try Sound Alert - Opens Sound Guardian tab"
            >
              <div
                className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center mb-3 transition-transform group-hover:scale-105 ${
                  highContrast
                    ? 'bg-black text-amber-400'
                    : 'bg-teal-800/80 text-white'
                }`}
              >
                <BellRing className="w-8 h-8 sm:w-9 sm:h-9" aria-hidden="true" />
              </div>
              <span className="text-xl sm:text-2xl font-black tracking-tight leading-snug">
                Try Sound Alert
              </span>
              <span
                className={`text-xs sm:text-sm font-semibold mt-1.5 ${
                  highContrast ? 'text-zinc-900 font-bold' : 'text-teal-100'
                }`}
              >
                Opens Sound Guardian ↗
              </span>
            </button>

            {/* Button 2: Try Sign to Text */}
            <button
              onClick={() => onSelectTab('sign-bridge')}
              className={`group flex flex-col items-center justify-center text-center p-6 sm:p-7 rounded-2xl border-2 transition-all duration-150 transform hover:-translate-y-0.5 active:scale-98 focus:outline-none focus-visible:ring-4 cursor-pointer ${
                highContrast
                  ? 'bg-amber-400 text-black border-white hover:bg-amber-300 focus-visible:ring-white shadow-lg'
                  : 'bg-indigo-700 hover:bg-indigo-800 text-white border-indigo-800 shadow-md hover:shadow-xl focus-visible:ring-indigo-500'
              }`}
              aria-label="Try Sign to Text - Opens SignBridge tab"
            >
              <div
                className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center mb-3 transition-transform group-hover:scale-105 ${
                  highContrast
                    ? 'bg-black text-amber-400'
                    : 'bg-indigo-800/80 text-white'
                }`}
              >
                <Hand className="w-8 h-8 sm:w-9 sm:h-9" aria-hidden="true" />
              </div>
              <span className="text-xl sm:text-2xl font-black tracking-tight leading-snug">
                Try Sign to Text
              </span>
              <span
                className={`text-xs sm:text-sm font-semibold mt-1.5 ${
                  highContrast ? 'text-zinc-900 font-bold' : 'text-indigo-100'
                }`}
              >
                Opens SignBridge ↗
              </span>
            </button>

            {/* Button 3: Try Text to Sign */}
            <button
              onClick={() => onSelectTab('sign-bridge')}
              className={`group flex flex-col items-center justify-center text-center p-6 sm:p-7 rounded-2xl border-2 transition-all duration-150 transform hover:-translate-y-0.5 active:scale-98 focus:outline-none focus-visible:ring-4 cursor-pointer ${
                highContrast
                  ? 'bg-amber-400 text-black border-white hover:bg-amber-300 focus-visible:ring-white shadow-lg'
                  : 'bg-violet-700 hover:bg-violet-800 text-white border-violet-800 shadow-md hover:shadow-xl focus-visible:ring-violet-500'
              }`}
              aria-label="Try Text to Sign - Opens SignBridge tab"
            >
              <div
                className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center mb-3 transition-transform group-hover:scale-105 ${
                  highContrast
                    ? 'bg-black text-amber-400'
                    : 'bg-violet-800/80 text-white'
                }`}
              >
                <MessageSquareText className="w-8 h-8 sm:w-9 sm:h-9" aria-hidden="true" />
              </div>
              <span className="text-xl sm:text-2xl font-black tracking-tight leading-snug">
                Try Text to Sign
              </span>
              <span
                className={`text-xs sm:text-sm font-semibold mt-1.5 ${
                  highContrast ? 'text-zinc-900 font-bold' : 'text-violet-100'
                }`}
              >
                Opens SignBridge ↗
              </span>
            </button>
          </div>

          {/* Instant Danger Sound Overlay Test Bar */}
          {onTriggerSoundAlert && (
            <div
              className={`pt-2 flex flex-wrap items-center justify-center gap-2 text-xs rounded-xl p-3 border ${
                highContrast
                  ? 'bg-zinc-900 border-amber-400/50 text-white'
                  : 'bg-red-50/80 border-red-200 text-red-950'
              }`}
            >
              <span className="font-extrabold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-600 animate-ping" />
                Test Live Danger Alert Overlay:
              </span>
              <button
                onClick={() => onTriggerSoundAlert('FIRE ALARM')}
                className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white font-black rounded-lg shadow-xs transition-colors cursor-pointer"
                title="Trigger simulated Fire Alarm alert"
              >
                🚨 Fire Alarm
              </button>
              <button
                onClick={() => onTriggerSoundAlert('DOORBELL')}
                className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-black rounded-lg shadow-xs transition-colors cursor-pointer"
                title="Trigger simulated Doorbell alert"
              >
                🔔 Doorbell
              </button>
              <button
                onClick={() => onTriggerSoundAlert('POLICE SIREN')}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-900 text-white font-black rounded-lg shadow-xs transition-colors cursor-pointer"
                title="Trigger simulated Police Siren alert"
              >
                🚓 Siren
              </button>
            </div>
          )}

          <p
            className={`text-sm sm:text-base max-w-2xl mx-auto pt-2 ${
              highContrast ? 'text-zinc-300' : 'text-slate-500'
            }`}
          >
            Or explore the detailed module workspaces and direct browser access below:
          </p>
        </div>
      </section>

      {/* "Why NādaSakhi" Section */}
      <section
        aria-labelledby="why-nadasakhi-heading"
        className={`rounded-3xl p-6 sm:p-10 lg:p-12 border transition-all duration-200 ${
          highContrast
            ? 'bg-zinc-950 border-amber-400 text-white'
            : 'bg-white border-slate-200 shadow-sm text-slate-900'
        }`}
      >
        <div className="max-w-5xl mx-auto space-y-8">
          <div className="text-center space-y-3">
            <h2
              id="why-nadasakhi-heading"
              className={`text-2xl sm:text-4xl lg:text-5xl font-black tracking-tight ${
                highContrast ? 'text-amber-300' : 'text-slate-900'
              }`}
            >
              Why NādaSakhi
            </h2>
            <p
              className={`text-base sm:text-xl max-w-2xl mx-auto font-medium ${
                highContrast ? 'text-zinc-200' : 'text-slate-600'
              }`}
            >
              Essential safety and effortless communication designed for dignity and independence.
            </p>
          </div>

          {/* Three Short Points */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Point 1 */}
            <div
              className={`p-6 sm:p-7 rounded-2xl border flex flex-col justify-start space-y-3 transition-colors ${
                highContrast
                  ? 'bg-zinc-900 border-amber-400/60 text-white'
                  : 'bg-rose-50/50 border-rose-200/80 text-rose-950'
              }`}
            >
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center font-black ${
                  highContrast
                    ? 'bg-amber-400 text-black'
                    : 'bg-rose-600 text-white shadow-xs'
                }`}
              >
                <ShieldAlert className="w-6 h-6" aria-hidden="true" />
              </div>
              <h3 className="text-lg sm:text-xl font-black tracking-tight">
                Danger Sound Awareness
              </h3>
              <p
                className={`text-base sm:text-lg leading-relaxed ${
                  highContrast ? 'text-zinc-200' : 'text-slate-700'
                }`}
              >
                Deaf and speech-impaired people can miss danger sounds like alarms and horns.
              </p>
            </div>

            {/* Point 2 */}
            <div
              className={`p-6 sm:p-7 rounded-2xl border flex flex-col justify-start space-y-3 transition-colors ${
                highContrast
                  ? 'bg-zinc-900 border-amber-400/60 text-white'
                  : 'bg-blue-50/50 border-blue-200/80 text-blue-950'
              }`}
            >
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center font-black ${
                  highContrast
                    ? 'bg-amber-400 text-black'
                    : 'bg-blue-600 text-white shadow-xs'
                }`}
              >
                <Building2 className="w-6 h-6" aria-hidden="true" />
              </div>
              <h3 className="text-lg sm:text-xl font-black tracking-tight">
                Everyday Counter Access
              </h3>
              <p
                className={`text-base sm:text-lg leading-relaxed ${
                  highContrast ? 'text-zinc-200' : 'text-slate-700'
                }`}
              >
                Communication at counters like banks and hospitals is hard without an interpreter.
              </p>
            </div>

            {/* Point 3 */}
            <div
              className={`p-6 sm:p-7 rounded-2xl border flex flex-col justify-start space-y-3 transition-colors ${
                highContrast
                  ? 'bg-zinc-900 border-amber-400/60 text-white'
                  : 'bg-emerald-50/50 border-emerald-200/80 text-emerald-950'
              }`}
            >
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center font-black ${
                  highContrast
                    ? 'bg-amber-400 text-black'
                    : 'bg-emerald-600 text-white shadow-xs'
                }`}
              >
                <Sparkles className="w-6 h-6" aria-hidden="true" />
              </div>
              <h3 className="text-lg sm:text-xl font-black tracking-tight">
                Unified In One Place
              </h3>
              <p
                className={`text-base sm:text-lg leading-relaxed ${
                  highContrast ? 'text-zinc-200' : 'text-slate-700'
                }`}
              >
                NādaSakhi gives sound alerts, sign-to-text, text-to-sign and speech-to-text in one place.
              </p>
            </div>
          </div>

          {/* Four-Item Feature Row with Icons */}
          <div className="pt-6 border-t border-dashed border-slate-200 dark:border-zinc-800">
            <h3
              className={`text-xs sm:text-sm font-extrabold uppercase tracking-widest text-center mb-6 ${
                highContrast ? 'text-amber-400' : 'text-slate-500'
              }`}
            >
              Core Platform Capabilities
            </h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              {/* Feature 1: Sound Alerts */}
              <div
                className={`p-5 rounded-2xl border text-center flex flex-col items-center justify-center space-y-2.5 transition-all ${
                  highContrast
                    ? 'bg-zinc-900 border-amber-400/40 text-white'
                    : 'bg-teal-50/80 border-teal-200/90 text-teal-950 shadow-xs'
                }`}
              >
                <div
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                    highContrast
                      ? 'bg-amber-400 text-black'
                      : 'bg-teal-700 text-white shadow-sm'
                  }`}
                >
                  <BellRing className="w-7 h-7" aria-hidden="true" />
                </div>
                <h4 className="font-black text-lg sm:text-xl tracking-tight">
                  Sound Alerts
                </h4>
                <p className="text-xs sm:text-sm font-medium opacity-85 leading-snug">
                  Danger acoustic events, sirens & smoke alarms.
                </p>
              </div>

              {/* Feature 2: Sign-to-Text */}
              <div
                className={`p-5 rounded-2xl border text-center flex flex-col items-center justify-center space-y-2.5 transition-all ${
                  highContrast
                    ? 'bg-zinc-900 border-amber-400/40 text-white'
                    : 'bg-indigo-50/80 border-indigo-200/90 text-indigo-950 shadow-xs'
                }`}
              >
                <div
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                    highContrast
                      ? 'bg-amber-400 text-black'
                      : 'bg-indigo-700 text-white shadow-sm'
                  }`}
                >
                  <Hand className="w-7 h-7" aria-hidden="true" />
                </div>
                <h4 className="font-black text-lg sm:text-xl tracking-tight">
                  Sign-to-Text
                </h4>
                <p className="text-xs sm:text-sm font-medium opacity-85 leading-snug">
                  Webcam neural gestures translated into clear text.
                </p>
              </div>

              {/* Feature 3: Text-to-Sign */}
              <div
                className={`p-5 rounded-2xl border text-center flex flex-col items-center justify-center space-y-2.5 transition-all ${
                  highContrast
                    ? 'bg-zinc-900 border-amber-400/40 text-white'
                    : 'bg-violet-50/80 border-violet-200/90 text-violet-950 shadow-xs'
                }`}
              >
                <div
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                    highContrast
                      ? 'bg-amber-400 text-black'
                      : 'bg-violet-700 text-white shadow-sm'
                  }`}
                >
                  <Eye className="w-7 h-7" aria-hidden="true" />
                </div>
                <h4 className="font-black text-lg sm:text-xl tracking-tight">
                  Text-to-Sign
                </h4>
                <p className="text-xs sm:text-sm font-medium opacity-85 leading-snug">
                  Typed sentences transformed into visual sign guide.
                </p>
              </div>

              {/* Feature 4: Speech-to-Text */}
              <div
                className={`p-5 rounded-2xl border text-center flex flex-col items-center justify-center space-y-2.5 transition-all ${
                  highContrast
                    ? 'bg-zinc-900 border-amber-400/40 text-white'
                    : 'bg-emerald-50/80 border-emerald-200/90 text-emerald-950 shadow-xs'
                }`}
              >
                <div
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                    highContrast
                      ? 'bg-amber-400 text-black'
                      : 'bg-emerald-700 text-white shadow-sm'
                  }`}
                >
                  <MessageSquareText className="w-7 h-7" aria-hidden="true" />
                </div>
                <h4 className="font-black text-lg sm:text-xl tracking-tight">
                  Speech-to-Text
                </h4>
                <p className="text-xs sm:text-sm font-medium opacity-85 leading-snug">
                  Live conversational subtitles and audio transcription.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Alert History Panel (Direct webhook fetch to bonu.app.n8n.cloud) */}
      <AlertHistoryPanel
        highContrast={highContrast}
        onTriggerAlert={onTriggerSoundAlert}
      />

      {/* Two BIG Action Buttons / Cards Required by Prompt */}
      <section aria-labelledby="modules-heading" className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2
              id="modules-heading"
              className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${
                highContrast ? 'text-white' : 'text-slate-900'
              }`}
            >
              Launch Core Accessibility Tools
            </h2>
            <p
              className={`text-sm sm:text-base mt-1 ${
                highContrast ? 'text-zinc-300' : 'text-slate-600'
              }`}
            >
              Click either large button to launch the integrated full-screen workspace, or open in a new tab.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
          {/* BIG BUTTON 1: Sound Guardian */}
          <div
            className={`rounded-3xl p-6 sm:p-8 border-2 flex flex-col justify-between transition-all duration-200 ${
              highContrast
                ? 'bg-zinc-950 border-amber-400 text-white'
                : 'bg-white border-teal-600/30 hover:border-teal-600 shadow-md hover:shadow-xl'
            }`}
          >
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div
                  className={`w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 ${
                    highContrast
                      ? 'bg-amber-400 text-black'
                      : 'bg-teal-600 text-white shadow-sm'
                  }`}
                >
                  <ShieldAlert className="w-9 h-9" aria-hidden="true" />
                </div>
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-md border">
                  <Mic className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Microphone Audio</span>
                </div>
              </div>

              <div>
                <h3
                  className={`text-2xl sm:text-3xl font-black tracking-tight ${
                    highContrast ? 'text-amber-300' : 'text-slate-900'
                  }`}
                >
                  Sound Guardian
                </h3>
                <p
                  className={`text-sm sm:text-base font-semibold mt-1 ${
                    highContrast ? 'text-zinc-200' : 'text-teal-700'
                  }`}
                >
                  {soundGuardian.tagline}
                </p>
              </div>

              <p
                className={`text-base leading-relaxed ${
                  highContrast ? 'text-zinc-200' : 'text-slate-600'
                }`}
              >
                {soundGuardian.shortDesc}
              </p>

              {/* Feature Checklist */}
              <ul className="space-y-2 pt-2 border-t border-dashed border-slate-200 dark:border-zinc-800">
                {soundGuardian.features.slice(0, 3).map((feat, idx) => (
                  <li key={idx} className="flex items-center gap-2 text-sm font-medium">
                    <CheckCircle2
                      className={`w-4 h-4 shrink-0 ${
                        highContrast ? 'text-amber-400' : 'text-teal-600'
                      }`}
                      aria-hidden="true"
                    />
                    <span className={highContrast ? 'text-zinc-200' : 'text-slate-700'}>
                      {feat}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Action buttons */}
            <div className="pt-6 mt-6 border-t border-slate-200 dark:border-zinc-800 space-y-3">
              <button
                onClick={() => onSelectTab('sound-guardian')}
                className={`w-full py-4 px-6 rounded-2xl font-black text-lg sm:text-xl flex items-center justify-center gap-3 transition-all duration-150 transform active:scale-98 focus:outline-none focus-visible:ring-4 cursor-pointer ${
                  highContrast
                    ? 'bg-amber-400 text-black hover:bg-amber-300 focus-visible:ring-white'
                    : 'bg-teal-700 hover:bg-teal-800 text-white shadow-lg hover:shadow-teal-900/20 focus-visible:ring-teal-500'
                }`}
                aria-label="Open Sound Guardian tab for danger-sound alerts"
              >
                <span>Open Sound Guardian</span>
                <ArrowRight className="w-6 h-6" aria-hidden="true" />
              </button>

              <a
                href={SOUND_GUARDIAN_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={`w-full py-2.5 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 border transition-colors focus:outline-none focus-visible:ring-3 ${
                  highContrast
                    ? 'border-zinc-700 bg-zinc-900 text-amber-300 hover:bg-zinc-800 focus-visible:ring-amber-400'
                    : 'border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 focus-visible:ring-teal-600'
                }`}
                aria-label="Open Sound Guardian in a new browser tab"
              >
                <span>Direct Open in New Tab</span>
                <ExternalLink className="w-4 h-4" aria-hidden="true" />
              </a>
            </div>
          </div>

          {/* BIG BUTTON 2: SignBridge */}
          <div
            className={`rounded-3xl p-6 sm:p-8 border-2 flex flex-col justify-between transition-all duration-200 ${
              highContrast
                ? 'bg-zinc-950 border-amber-400 text-white'
                : 'bg-white border-indigo-600/30 hover:border-indigo-600 shadow-md hover:shadow-xl'
            }`}
          >
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div
                  className={`w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 ${
                    highContrast
                      ? 'bg-amber-400 text-black'
                      : 'bg-indigo-600 text-white shadow-sm'
                  }`}
                >
                  <Hand className="w-9 h-9" aria-hidden="true" />
                </div>
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-md border">
                  <Camera className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Camera & Speech</span>
                </div>
              </div>

              <div>
                <h3
                  className={`text-2xl sm:text-3xl font-black tracking-tight ${
                    highContrast ? 'text-amber-300' : 'text-slate-900'
                  }`}
                >
                  SignBridge
                </h3>
                <p
                  className={`text-sm sm:text-base font-semibold mt-1 ${
                    highContrast ? 'text-zinc-200' : 'text-indigo-700'
                  }`}
                >
                  {signBridge.tagline}
                </p>
              </div>

              <p
                className={`text-base leading-relaxed ${
                  highContrast ? 'text-zinc-200' : 'text-slate-600'
                }`}
              >
                {signBridge.shortDesc}
              </p>

              {/* Feature Checklist */}
              <ul className="space-y-2 pt-2 border-t border-dashed border-slate-200 dark:border-zinc-800">
                {signBridge.features.slice(0, 3).map((feat, idx) => (
                  <li key={idx} className="flex items-center gap-2 text-sm font-medium">
                    <CheckCircle2
                      className={`w-4 h-4 shrink-0 ${
                        highContrast ? 'text-amber-400' : 'text-indigo-600'
                      }`}
                      aria-hidden="true"
                    />
                    <span className={highContrast ? 'text-zinc-200' : 'text-slate-700'}>
                      {feat}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Action buttons */}
            <div className="pt-6 mt-6 border-t border-slate-200 dark:border-zinc-800 space-y-3">
              <button
                onClick={() => onSelectTab('sign-bridge')}
                className={`w-full py-4 px-6 rounded-2xl font-black text-lg sm:text-xl flex items-center justify-center gap-3 transition-all duration-150 transform active:scale-98 focus:outline-none focus-visible:ring-4 cursor-pointer ${
                  highContrast
                    ? 'bg-amber-400 text-black hover:bg-amber-300 focus-visible:ring-white'
                    : 'bg-indigo-700 hover:bg-indigo-800 text-white shadow-lg hover:shadow-indigo-900/20 focus-visible:ring-indigo-500'
                }`}
                aria-label="Open SignBridge tab for sign translation and live captions"
              >
                <span>Open SignBridge</span>
                <ArrowRight className="w-6 h-6" aria-hidden="true" />
              </button>

              <a
                href={SIGN_BRIDGE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={`w-full py-2.5 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 border transition-colors focus:outline-none focus-visible:ring-3 ${
                  highContrast
                    ? 'border-zinc-700 bg-zinc-900 text-amber-300 hover:bg-zinc-800 focus-visible:ring-amber-400'
                    : 'border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 focus-visible:ring-indigo-600'
                }`}
                aria-label="Open SignBridge in a new browser tab"
              >
                <span>Direct Open in New Tab</span>
                <ExternalLink className="w-4 h-4" aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Browser Hardware Permission Assistive Notice */}
      <section
        aria-label="Browser permission advice"
        className={`rounded-2xl p-6 border transition-colors ${
          highContrast
            ? 'bg-zinc-900 border-amber-400/60 text-white'
            : 'bg-amber-50/80 border-amber-200/90 text-amber-950'
        }`}
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Info
              className={`w-6 h-6 shrink-0 mt-0.5 ${
                highContrast ? 'text-amber-400' : 'text-amber-700'
              }`}
              aria-hidden="true"
            />
            <div>
              <h3 className="font-bold text-base">
                Pro Tip for Camera & Microphone Permissions
              </h3>
              <p
                className={`text-sm mt-1 leading-relaxed ${
                  highContrast ? 'text-zinc-300' : 'text-amber-900/90'
                }`}
              >
                Browsers enforce strict privacy sandboxes on embedded iframes. If your webcam or microphone doesn't trigger a permission prompt inside the tab, use the <strong>&ldquo;Open in new tab&rdquo;</strong> button on that tab to run it directly in a dedicated window.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-stretch sm:self-auto shrink-0">
            <a
              href={SOUND_GUARDIAN_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={`px-3.5 py-2 rounded-lg text-xs font-bold border inline-flex items-center gap-1.5 transition-colors ${
                highContrast
                  ? 'border-amber-400 text-amber-300 hover:bg-zinc-800'
                  : 'border-amber-300 bg-white text-amber-900 hover:bg-amber-100/50'
              }`}
            >
              <span>Sound Guardian Tab</span>
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            </a>
            <a
              href={SIGN_BRIDGE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={`px-3.5 py-2 rounded-lg text-xs font-bold border inline-flex items-center gap-1.5 transition-colors ${
                highContrast
                  ? 'border-amber-400 text-amber-300 hover:bg-zinc-800'
                  : 'border-amber-300 bg-white text-amber-900 hover:bg-amber-100/50'
              }`}
            >
              <span>SignBridge Tab</span>
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            </a>
          </div>
        </div>
      </section>

      {/* Calming Accessibility Manifesto / Footer Info */}
      <footer
        className={`pt-8 border-t text-center space-y-3 ${
          highContrast ? 'border-zinc-800 text-zinc-400' : 'border-slate-200 text-slate-500'
        }`}
      >
        <p className="text-sm font-semibold">
          NādaSakhi – Empowering accessibility, security, and independent living.
        </p>
        <div className="flex items-center justify-center gap-4 text-xs">
          <span>High Contrast Compliant</span>
          <span>·</span>
          <span>Screen Reader Optimized</span>
          <span>·</span>
          <span>WCAG AA+ Standards</span>
        </div>
      </footer>
    </div>
  );
};
