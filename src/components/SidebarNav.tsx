import React from 'react';
import { TabType } from '../types';
import { 
  AudioLines, 
  MessageSquareText, 
  History, 
  BellRing, 
  Activity, 
  Settings, 
  Radio, 
  CheckCircle2,
  ExternalLink
} from 'lucide-react';
import { N8N_WEBHOOK_URL } from '../constants';

interface SidebarNavProps {
  currentTab: TabType;
  onSelectTab: (tab: TabType) => void;
  onOpenSettings: () => void;
  highContrast: boolean;
}

export const SidebarNav: React.FC<SidebarNavProps> = ({
  currentTab,
  onSelectTab,
  onOpenSettings,
  highContrast,
}) => {
  const tabs = [
    {
      id: 'listen' as TabType,
      label: 'Listen',
      description: 'Live room waveform',
      icon: AudioLines,
    },
    {
      id: 'captions' as TabType,
      label: 'Captions',
      description: 'Sign & speech translation',
      icon: MessageSquareText,
    },
    {
      id: 'history' as TabType,
      label: 'History',
      description: 'Timeline & past alerts',
      icon: History,
    },
    {
      id: 'sounds' as TabType,
      label: 'Sounds',
      description: 'Custom sound training',
      icon: BellRing,
    },
  ];

  return (
    <aside
      aria-label="Desktop Navigation Sidebar"
      className={`hidden md:flex flex-col w-64 lg:w-72 shrink-0 border-r min-h-[100dvh] sticky top-0 h-screen p-5 lg:p-6 justify-between transition-colors duration-150 z-30 ${
        highContrast
          ? 'bg-black border-amber-400 text-white'
          : 'bg-[#070f24] border-[#1a274c] text-[#cbd5e1]'
      }`}
    >
      <div className="space-y-6">
        {/* Brand Header */}
        <div className="flex items-center gap-3">
          <div
            className={`w-11 h-11 rounded-2xl flex items-center justify-center shadow-lg transition-transform ${
              highContrast
                ? 'bg-amber-400 text-black'
                : 'bg-gradient-to-tr from-[#0ea5e9] to-[#2563eb] text-white shadow-[0_0_20px_rgba(14,165,233,0.35)]'
            }`}
          >
            <Activity className="w-6 h-6 stroke-[2.5]" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className={`text-lg font-black tracking-tight ${highContrast ? 'text-amber-300' : 'text-[#f8fafc]'}`}>
                NādaSakhi
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#0d1630] text-[#0ea5e9] border border-[#1a274c] uppercase font-bold">
                SoundWatch
              </span>
            </div>
            <p className="text-xs text-[#94a3b8] font-semibold">Hear what matters</p>
          </div>
        </div>

        {/* Live Status Pill (Success Green chip) */}
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold ${
            highContrast
              ? 'bg-zinc-900 border border-emerald-400 text-emerald-300'
              : 'bg-emerald-950/60 border border-emerald-500/40 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.15)]'
          }`}
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="truncate">Listening · On-device only</span>
        </div>

        {/* Navigation Tabs List */}
        <nav aria-label="Sidebar main links" className="space-y-1.5">
          {tabs.map((tab) => {
            const isActive = currentTab === tab.id;
            const Icon = tab.icon;

            return (
              <button
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-left font-bold transition-all duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 ${
                  highContrast
                    ? isActive
                      ? 'bg-amber-400 text-black shadow-md'
                      : 'text-zinc-300 hover:text-white hover:bg-zinc-900'
                    : isActive
                    ? 'bg-[#0ea5e9]/15 text-[#38bdf8] border border-[#0ea5e9]/40 shadow-[0_0_20px_rgba(14,165,233,0.2)]'
                    : 'text-[#94a3b8] hover:text-[#f8fafc] hover:bg-[#0d1630] border border-transparent'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
                    isActive
                      ? highContrast
                        ? 'bg-black text-amber-400'
                        : 'bg-[#0ea5e9] text-white shadow-sm'
                      : 'bg-[#0d1630] text-[#94a3b8] border border-[#1a274c]'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className={`text-sm font-black tracking-tight ${isActive ? 'text-[#f8fafc]' : ''}`}>
                    {tab.label}
                  </div>
                  <div className="text-[11px] font-normal text-[#94a3b8] truncate">{tab.description}</div>
                </div>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Footer & Settings Action */}
      <div className="pt-4 border-t border-[#1a274c] space-y-3">
        <button
          onClick={onOpenSettings}
          className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-xs font-bold border transition-colors cursor-pointer ${
            highContrast
              ? 'border-zinc-700 bg-zinc-900 text-amber-300 hover:text-white'
              : 'border-[#1a274c] bg-[#0d1630] text-[#cbd5e1] hover:text-[#f8fafc] hover:border-[#0ea5e9]'
          }`}
        >
          <Settings className="w-4 h-4 text-[#0ea5e9]" />
          <span>App Settings</span>
        </button>

        <div className="px-2 text-[11px] text-[#94a3b8] space-y-0.5">
          <p className="font-semibold text-[#cbd5e1]">NādaSakhi Accessibility Platform</p>
          <p className="truncate text-[10px] opacity-75">n8n: bonu.app.n8n.cloud</p>
        </div>
      </div>
    </aside>
  );
};
