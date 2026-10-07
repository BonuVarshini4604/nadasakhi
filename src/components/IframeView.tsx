import React, { useState, useRef } from 'react';
import { PlatformModule } from '../types';
import { 
  ExternalLink, 
  RotateCw, 
  ArrowLeft, 
  ShieldAlert, 
  Hand, 
  AlertTriangle, 
  Camera, 
  Mic, 
  Check, 
  Info,
  Maximize2,
  History
} from 'lucide-react';
import { AlertHistoryPanel } from './AlertHistoryPanel';

interface IframeViewProps {
  module: PlatformModule;
  onBackToHome: () => void;
  highContrast: boolean;
  onTriggerSoundAlert?: (soundName: string) => void;
}

export const IframeView: React.FC<IframeViewProps> = ({
  module,
  onBackToHome,
  highContrast,
  onTriggerSoundAlert,
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [showPermTips, setShowPermTips] = useState(false);
  const [showAlertHistory, setShowAlertHistory] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handleReload = () => {
    setIsLoading(true);
    setReloadKey((prev) => prev + 1);
  };

  const isSoundGuardian = module.id === 'sound-guardian';
  const Icon = isSoundGuardian ? ShieldAlert : Hand;

  return (
    <main className="flex flex-col flex-1 w-full bg-slate-900">
      {/* Top Controller & Notice Bar */}
      <section
        aria-label={`${module.title} toolbar`}
        className={`px-4 sm:px-6 py-3 border-b flex flex-wrap items-center justify-between gap-3 transition-colors ${
          highContrast
            ? 'bg-black border-amber-400 text-white'
            : 'bg-slate-900 border-slate-800 text-white'
        }`}
      >
        {/* Left: Back button & Module identity */}
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToHome}
            aria-label="Back to Home"
            className={`p-2 rounded-lg border transition-colors flex items-center justify-center focus:outline-none focus-visible:ring-3 ${
              highContrast
                ? 'border-amber-400 text-amber-300 hover:bg-zinc-900 focus-visible:ring-amber-400'
                : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white focus-visible:ring-teal-500'
            }`}
          >
            <ArrowLeft className="w-5 h-5" aria-hidden="true" />
            <span className="hidden sm:inline-block ml-1.5 text-xs font-bold">Home</span>
          </button>

          <div className="flex items-center gap-2.5">
            <div
              className={`p-2 rounded-lg flex items-center justify-center ${
                highContrast
                  ? 'bg-amber-400 text-black'
                  : isSoundGuardian
                  ? 'bg-teal-600 text-white'
                  : 'bg-indigo-600 text-white'
              }`}
            >
              <Icon className="w-5 h-5" aria-hidden="true" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h1
                  className={`text-base sm:text-lg font-black tracking-tight ${
                    highContrast ? 'text-amber-300' : 'text-white'
                  }`}
                >
                  {module.title}
                </h1>
                <span
                  className={`hidden md:inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded ${
                    highContrast
                      ? 'bg-amber-400/20 text-amber-300 border border-amber-400/50'
                      : 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live Workspace
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block truncate max-w-md">
                {module.tagline}
              </p>
            </div>
          </div>
        </div>

        {/* Center / Right: Hardware notice & Action Buttons */}
        <div className="flex items-center gap-2 sm:gap-3 ml-auto">
          {/* Permission Tips Toggle (Sound Guardian only) */}
          {isSoundGuardian && (
            <button
              onClick={() => setShowPermTips(!showPermTips)}
              aria-expanded={showPermTips}
              title="Microphone/Camera permission tips"
              className={`hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border transition-colors ${
                showPermTips
                  ? highContrast
                    ? 'bg-amber-400 text-black border-amber-400'
                    : 'bg-slate-700 text-white border-slate-600'
                  : highContrast
                  ? 'border-zinc-700 text-zinc-300 hover:border-amber-400'
                  : 'border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Info className="w-4 h-4" aria-hidden="true" />
              <span>Permissions Help</span>
            </button>
          )}

          {/* Reload iframe */}
          <button
            onClick={handleReload}
            title="Reload embedded app"
            aria-label="Reload embedded applet"
            className={`p-2 sm:px-3 sm:py-2 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-colors focus:outline-none focus-visible:ring-3 ${
              highContrast
                ? 'border-zinc-700 text-zinc-300 hover:bg-zinc-900 hover:text-white focus-visible:ring-amber-400'
                : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white focus-visible:ring-teal-500'
            }`}
          >
            <RotateCw className="w-4 h-4" aria-hidden="true" />
            <span className="hidden md:inline">Reload</span>
          </button>

          {/* Prominent OPEN IN NEW TAB Button (Requested in Prompt) */}
          <a
            href={module.url}
            target="_blank"
            rel="noopener noreferrer"
            title={`Open ${module.title} in a full browser tab for unrestricted microphone and camera hardware access`}
            aria-label={`Open ${module.title} in new browser tab`}
            className={`px-4 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-black flex items-center gap-2 shadow-md transition-all duration-150 transform active:scale-98 focus:outline-none focus-visible:ring-4 ${
              highContrast
                ? 'bg-amber-400 text-black hover:bg-amber-300 focus-visible:ring-white'
                : isSoundGuardian
                ? 'bg-teal-600 hover:bg-teal-500 text-white focus-visible:ring-teal-400'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white focus-visible:ring-indigo-400'
            }`}
          >
            <span>Open in new tab</span>
            <ExternalLink className="w-4 h-4 shrink-0" aria-hidden="true" />
          </a>
        </div>
      </section>

      {/* Permission & Hardware Guidance Banner (Visible only on Sound Guardian tab) */}
      {isSoundGuardian && (
        <aside
          aria-label="Hardware permission advisory"
          className={`px-4 sm:px-6 py-2.5 border-b text-xs flex items-center justify-between gap-3 ${
            highContrast
              ? 'bg-zinc-950 border-zinc-800 text-zinc-300'
              : 'bg-slate-950/90 border-slate-800/80 text-slate-300'
          }`}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle
              className={`w-4 h-4 shrink-0 ${
                highContrast ? 'text-amber-400' : 'text-amber-400'
              }`}
              aria-hidden="true"
            />
            <p>
              <strong className="text-white">Hardware Advisory:</strong>{' '}
              <span>
                Sound Guardian requires <strong>Microphone</strong> access for acoustic danger alerts.
              </span>{' '}
              If your browser restricts media permissions inside embedded frames, tap{' '}
              <a
                href={module.url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-bold text-amber-300 hover:text-amber-200"
              >
                Open in new tab
              </a>{' '}
              for full hardware access.
            </p>
          </div>

          <a
            href={module.url}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 font-bold underline text-amber-400 hover:text-amber-300 hidden md:inline"
          >
            Launch Tab ↗
          </a>
        </aside>
      )}

      {/* Danger Sound Event Simulator & Test Trigger Bar (for Sound Guardian) */}
      {isSoundGuardian && onTriggerSoundAlert && (
        <section
          aria-label="Danger sound event test simulator"
          className={`px-4 sm:px-6 py-2.5 border-b flex flex-wrap items-center justify-between gap-2 text-xs transition-colors ${
            highContrast
              ? 'bg-zinc-900 border-amber-400/80 text-white'
              : 'bg-slate-900/95 border-slate-700/80 text-slate-200'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
            <span className="font-extrabold uppercase tracking-wider text-amber-400">
              Test Sound Alert & Webhook:
            </span>
            <span className="text-slate-400 hidden lg:inline">
              (Triggers full-screen red flash, vibration & n8n webhook)
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { name: 'FIRE ALARM', label: '🔥 Fire Alarm' },
              { name: 'DOORBELL', label: '🔔 Doorbell' },
              { name: 'POLICE SIREN', label: '🚨 Police Siren' },
              { name: 'GLASS BREAK', label: '💥 Glass Break' },
              { name: 'CAR HORN', label: '🚗 Car Horn' },
            ].map((snd) => (
              <button
                key={snd.name}
                onClick={() => onTriggerSoundAlert(snd.name)}
                className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all transform active:scale-95 focus:outline-none focus-visible:ring-2 cursor-pointer ${
                  highContrast
                    ? 'bg-amber-400 text-black hover:bg-amber-300 focus-visible:ring-white'
                    : 'bg-red-700 hover:bg-red-600 text-white shadow-xs focus-visible:ring-red-400'
                }`}
                title={`Trigger "${snd.name}" alert overlay, device vibration, and n8n webhook`}
              >
                {snd.label}
              </button>
            ))}

            <button
              onClick={() => setShowAlertHistory(!showAlertHistory)}
              className={`ml-2 px-2.5 py-1 rounded-md text-xs font-bold border transition-colors flex items-center gap-1.5 ${
                showAlertHistory
                  ? highContrast
                    ? 'bg-amber-400 text-black border-amber-400'
                    : 'bg-white text-slate-900 border-white'
                  : highContrast
                  ? 'border-zinc-700 text-zinc-300 hover:text-white'
                  : 'border-slate-700 text-slate-300 hover:text-white'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>{showAlertHistory ? 'Hide History' : 'Alert History'}</span>
            </button>
          </div>
        </section>
      )}

      {/* Expandable Alert History Drawer inside Sound Guardian */}
      {isSoundGuardian && showAlertHistory && (
        <section
          aria-label="Alert history section"
          className="p-4 sm:p-6 border-b bg-slate-950"
        >
          <AlertHistoryPanel
            highContrast={highContrast}
            onTriggerAlert={onTriggerSoundAlert}
          />
        </section>
      )}

      {/* Expanded Help Modal/Tray (Sound Guardian only) */}
      {isSoundGuardian && showPermTips && (
        <section
          aria-label="Permission instructions"
          className={`p-4 border-b text-sm ${
            highContrast ? 'bg-zinc-900 border-amber-400 text-white' : 'bg-slate-800 text-slate-200 border-slate-700'
          }`}
        >
          <div className="max-w-4xl mx-auto space-y-2">
            <h2 className="font-bold text-base flex items-center gap-2">
              <Info className="w-5 h-5 text-amber-400" />
              Troubleshooting Camera & Microphone Permissions:
            </h2>
            <ol className="list-decimal list-inside space-y-1 text-xs sm:text-sm opacity-90">
              <li>
                Check your browser&apos;s address bar icon (lock or camera/mic icon) and make sure Camera and Microphone are set to <strong>Allow</strong>.
              </li>
              <li>
                Embedded iframes are often blocked from accessing hardware by browser third-party policies (e.g., in Safari or strict privacy profiles).
              </li>
              <li>
                Click the <strong>&ldquo;Open in new tab&rdquo;</strong> button above to open the AI Studio app directly, where hardware prompts always work natively.
              </li>
            </ol>
          </div>
        </section>
      )}

      {/* Full-Screen Embedded Iframe Area */}
      <div className="relative flex-1 w-full bg-slate-950 flex flex-col min-h-[calc(100vh-140px)]">
        {/* Loading Overlay */}
        {isLoading && (
          <div
            className={`absolute inset-0 z-10 flex flex-col items-center justify-center p-6 text-center ${
              highContrast ? 'bg-black text-white' : 'bg-slate-950 text-white'
            }`}
          >
            <div className="w-12 h-12 border-4 border-amber-400 border-t-transparent rounded-full animate-spin mb-4" />
            <h3 className="text-xl font-bold mb-2">Connecting to {module.title}...</h3>
            <p className="text-sm text-slate-400 max-w-md mb-6">
              Loading real-time accessibility interface. Camera, microphone, and audio permissions are requested.
            </p>
            <div className="flex items-center gap-3">
              <a
                href={module.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`px-4 py-2 rounded-lg font-bold text-sm border inline-flex items-center gap-2 ${
                  highContrast
                    ? 'border-amber-400 text-amber-300 bg-zinc-900'
                    : 'border-slate-700 bg-slate-800 text-slate-200 hover:text-white'
                }`}
              >
                <span>Taking too long? Open in new tab</span>
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
        )}

        {/* The required Iframe with allow="camera; microphone; autoplay; fullscreen" */}
        <iframe
          key={reloadKey}
          ref={iframeRef}
          src={module.url}
          title={`${module.title} Workspace`}
          allow="camera; microphone; autoplay; fullscreen"
          sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts allow-downloads"
          loading="eager"
          onLoad={() => setIsLoading(false)}
          className="w-full flex-1 border-0 h-[calc(100vh-140px)] min-h-[600px]"
        />
      </div>
    </main>
  );
};
