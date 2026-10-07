/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { TabType, TextScale, SoundPriority, DetectedSound, CaptionLanguageCode } from './types';
import { BottomNav } from './components/BottomNav';
import { SidebarNav } from './components/SidebarNav';
import { ListenTab } from './components/ListenTab';
import { CaptionsTab } from './components/CaptionsTab';
import { HistoryTab } from './components/HistoryTab';
import { SoundsTab, CustomTrainedSound } from './components/SoundsTab';
import { CriticalSoundOverlay } from './components/CriticalSoundOverlay';
import { LowPriorityCard } from './components/LowPriorityCard';
import { SettingsModal } from './components/SettingsModal';
import { sendSoundEventWebhook, WebhookResult } from './services/webhook';

export default function App() {
  const [currentTab, setCurrentTab] = useState<TabType>('listen');
  const [highContrast, setHighContrast] = useState(false);
  const [textScale, setTextScale] = useState<TextScale>('normal');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  // Remember chosen caption language while the app is open in memory
  const [captionsLanguage, setCaptionsLanguage] = useState<CaptionLanguageCode>('en-IN');

  // Sound recognition state
  const [currentStatus, setCurrentStatus] = useState('Quiet / Room sounds look normal');
  const [criticalAlert, setCriticalAlert] = useState<DetectedSound | null>(null);
  const [lowPriorityAlert, setLowPriorityAlert] = useState<DetectedSound | null>(null);
  const [lastWebhookResult, setLastWebhookResult] = useState<WebhookResult | null>(null);

  // Custom trained sounds stored in app memory (no browser storage)
  const [customSounds, setCustomSounds] = useState<CustomTrainedSound[]>([
    {
      id: 'custom-init-1',
      name: 'Front door knock',
      samplesCount: 3,
      priority: 'medium',
      trainedAt: 'Today',
    },
  ]);

  const handleAddCustomSound = (newSound: CustomTrainedSound) => {
    setCustomSounds((prev) => [newSound, ...prev]);
  };

  // Initial recent sounds
  const [latestAlert, setLatestAlert] = useState<DetectedSound | null>({
    id: 'initial-1',
    name: 'Doorbell',
    priority: 'low',
    time: new Date(Date.now() - 120000).toISOString(),
    displayTime: '2 min ago',
    matchPercent: 94,
  });

  const [recentSounds, setRecentSounds] = useState<DetectedSound[]>([
    {
      id: 'init-1',
      name: 'Doorbell',
      priority: 'low',
      time: new Date(Date.now() - 120000).toISOString(),
      displayTime: '2 min ago',
      matchPercent: 94,
    },
    {
      id: 'init-2',
      name: 'Dog Bark',
      priority: 'low',
      time: new Date(Date.now() - 900000).toISOString(),
      displayTime: '15 min ago',
      matchPercent: 88,
    },
    {
      id: 'init-3',
      name: 'Knocking',
      priority: 'medium',
      time: new Date(Date.now() - 3600000).toISOString(),
      displayTime: '1 hr ago',
      matchPercent: 91,
    },
  ]);

  // Main sound event detection handler
  const handleTriggerSound = useCallback(
    async (soundName: string, priority: SoundPriority = 'low', matchPercent: number = 98) => {
      const now = new Date();
      const detectedItem: DetectedSound = {
        id: `sound-${Date.now()}`,
        name: soundName,
        priority: priority,
        time: now.toISOString(),
        displayTime: 'Just now',
        matchPercent: matchPercent,
      };

      // 1. Update status label on Listen tab
      setCurrentStatus(`Detected: ${soundName.toUpperCase()}`);

      // 2. Update Latest alert card and recent sounds list
      setLatestAlert(detectedItem);
      setRecentSounds((prev) => [detectedItem, ...prev.filter((p) => p.name !== soundName)].slice(0, 8));

      // 3. Webhook rule: call https://bonu.app.n8n.cloud/webhook/nadasakhi directly from browser
      const webhookRes = await sendSoundEventWebhook(soundName, priority, detectedItem.time, matchPercent / 100);
      setLastWebhookResult(webhookRes);

      // 4. Critical sounds (smoke alarm, glass breaking, fire alarm) show full-screen red/orange overlay
      // Low-priority & medium-priority sounds use card notification only
      if (priority === 'critical') {
        setCriticalAlert(detectedItem);
      } else {
        setLowPriorityAlert(detectedItem);
      }

      // Revert status label back to quiet after 8 seconds
      setTimeout(() => {
        setCurrentStatus((curr) =>
          curr.includes(soundName.toUpperCase()) ? 'Quiet / Room sounds look normal' : curr
        );
      }, 8000);
    },
    []
  );

  // Listen to postMessages from child iframes (e.g. EchoAlert / Sound Guardian)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      try {
        if (!event.data) return;
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;

        if (data && typeof data === 'object') {
          const isSoundEvent =
            data.mode === 'sound_event' ||
            data.type === 'sound_event' ||
            data.type === 'danger_sound' ||
            data.event === 'sound_detected' ||
            data.sound_event ||
            data.alert;

          if (isSoundEvent) {
            const rawSound = String(data.sound || data.sound_event || data.label || data.name || 'Alarm');
            const isCrit =
              rawSound.toLowerCase().includes('smoke') ||
              rawSound.toLowerCase().includes('fire') ||
              rawSound.toLowerCase().includes('glass') ||
              rawSound.toLowerCase().includes('alarm') ||
              rawSound.toLowerCase().includes('siren');

            handleTriggerSound(rawSound, isCrit ? 'critical' : 'low', data.match || 96);
          }
        }
      } catch {
        // Non-JSON or standard iframe messages
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleTriggerSound]);

  // URL hash sync
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash === 'listen' || hash === 'captions' || hash === 'history' || hash === 'sounds') {
        setCurrentTab(hash as TabType);
      }
    };

    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const handleSelectTab = (tab: TabType) => {
    setCurrentTab(tab);
    window.location.hash = tab;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const textScaleClass = {
    normal: 'text-base',
    large: 'text-lg',
    xlarge: 'text-xl',
  }[textScale];

  return (
    <div
      className={`min-h-[100dvh] w-full flex flex-col md:flex-row font-sans transition-colors duration-150 overflow-x-hidden ${textScaleClass} ${
        highContrast
          ? 'bg-black text-white antialiased'
          : 'bg-[#050b1a] text-[#f8fafc] antialiased'
      }`}
    >
      {/* Skip to main content */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 z-50 px-4 py-2 bg-amber-400 text-black font-bold rounded-lg shadow-lg outline-none"
      >
        Skip to main content
      </a>

      {/* Tablet & Desktop (768px and wider) Left Sidebar Navigation */}
      <SidebarNav
        currentTab={currentTab}
        onSelectTab={handleSelectTab}
        onOpenSettings={() => setIsSettingsOpen(true)}
        highContrast={highContrast}
      />

      {/* Main Content Area: Fills remaining space, max width ~1200px, centered with comfortable padding */}
      <div
        className={`flex-1 flex flex-col min-w-0 ${
          currentTab === 'captions'
            ? 'h-[100dvh] overflow-hidden'
            : 'min-h-[100dvh] overflow-y-auto'
        }`}
      >
        <main
          id="main-content"
          className={`flex-1 flex flex-col w-full ${
            currentTab === 'captions'
              ? 'pb-18 md:pb-0 h-[100dvh] overflow-hidden'
              : 'pb-24 md:pb-8'
          }`}
        >
          {currentTab === 'listen' && (
            <ListenTab
              latestAlert={latestAlert}
              recentSounds={recentSounds}
              currentStatus={currentStatus}
              isListening={true}
              onTriggerSound={handleTriggerSound}
              onNavigateToTab={handleSelectTab}
              onOpenSettings={() => setIsSettingsOpen(true)}
              lastWebhookResult={lastWebhookResult}
              highContrast={highContrast}
            />
          )}

          {currentTab === 'captions' && (
            <CaptionsTab
              highContrast={highContrast}
              persistedLanguage={captionsLanguage}
              onLanguageChange={setCaptionsLanguage}
            />
          )}

          {currentTab === 'history' && (
            <HistoryTab
              highContrast={highContrast}
              onTriggerAlert={(soundName, priority) => handleTriggerSound(soundName, priority)}
            />
          )}

          {currentTab === 'sounds' && (
            <SoundsTab
              onTriggerSound={handleTriggerSound}
              customSounds={customSounds}
              onAddCustomSound={handleAddCustomSound}
              highContrast={highContrast}
            />
          )}
        </main>
      </div>

      {/* Mobile-Only (< 768px) Bottom Navigation Bar */}
      <BottomNav
        currentTab={currentTab}
        onSelectTab={handleSelectTab}
        highContrast={highContrast}
      />

      {/* Low & Medium Priority Alert Card (Doorbell, Dog Bark, Custom Sounds) */}
      {lowPriorityAlert && (
        <LowPriorityCard
          sound={lowPriorityAlert}
          onDismiss={() => setLowPriorityAlert(null)}
          highContrast={highContrast}
        />
      )}

      {/* Full-Screen Critical Hazard Overlay (SMOKE ALARM screen) */}
      {criticalAlert && (
        <CriticalSoundOverlay
          sound={criticalAlert}
          onAcknowledge={() => {
            setCriticalAlert(null);
            setCurrentStatus('Quiet / Room sounds look normal');
          }}
          onMute5Min={() => {
            setCriticalAlert(null);
            setCurrentStatus('Muted for 5 minutes');
          }}
          webhookResult={lastWebhookResult}
          highContrast={highContrast}
        />
      )}

      {/* Settings & Accessibility Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        highContrast={highContrast}
        onToggleHighContrast={() => setHighContrast(!highContrast)}
        textScale={textScale}
        onChangeTextScale={setTextScale}
      />
    </div>
  );
}
