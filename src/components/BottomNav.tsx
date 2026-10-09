import React from 'react';
import { TabType } from '../types';
import { 
  AudioLines, 
  MessageSquareText, 
  History, 
  BellRing
} from 'lucide-react';

interface BottomNavProps {
  currentTab: TabType;
  onSelectTab: (tab: TabType) => void;
  highContrast: boolean;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  currentTab,
  onSelectTab,
  highContrast,
}) => {
  const tabs = [
    {
      id: 'listen' as TabType,
      label: 'Listen',
      icon: AudioLines,
    },
    {
      id: 'captions' as TabType,
      label: 'Captions',
      icon: MessageSquareText,
    },
    {
      id: 'history' as TabType,
      label: 'History',
      icon: History,
    },
    {
      id: 'sounds' as TabType,
      label: 'Sounds',
      icon: BellRing,
    },
  ];

  return (
    <nav
      role="navigation"
      aria-label="Bottom Navigation"
      className={`md:hidden shrink-0 z-40 border-t backdrop-blur-xl transition-colors duration-150 w-full ${
        highContrast
          ? 'bg-black/95 border-amber-400 text-white'
          : 'bg-[#070f24]/95 border-[#1a274c] text-[#94a3b8]'
      }`}
    >
      <div className="max-w-md mx-auto px-4 h-18 flex items-center justify-around">
        {tabs.map((tab) => {
          const isActive = currentTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`flex-1 flex flex-col items-center justify-center py-2 px-3 rounded-2xl transition-all duration-150 focus:outline-none focus-visible:ring-2 cursor-pointer ${
                highContrast
                  ? isActive
                    ? 'text-amber-300 font-extrabold focus-visible:ring-amber-400'
                    : 'text-zinc-400 hover:text-white focus-visible:ring-white'
                  : isActive
                  ? 'text-[#0ea5e9] font-bold focus-visible:ring-[#0ea5e9]'
                  : 'text-[#94a3b8] hover:text-[#f8fafc] focus-visible:ring-[#0ea5e9]'
              }`}
            >
              <div
                className={`relative p-1.5 rounded-xl transition-transform ${
                  isActive
                    ? highContrast
                      ? 'bg-amber-400/20 scale-105'
                      : 'bg-[#0ea5e9]/15 scale-105'
                    : ''
                }`}
              >
                <Icon
                  className={`w-6 h-6 transition-colors ${
                    isActive
                      ? highContrast
                        ? 'text-amber-400 stroke-[2.5]'
                        : 'text-[#0ea5e9] stroke-[2.5]'
                      : 'stroke-[1.8]'
                  }`}
                  aria-hidden="true"
                />
                {isActive && (
                  <span
                    className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${
                      highContrast ? 'bg-amber-400' : 'bg-[#0ea5e9] shadow-[0_0_8px_#0ea5e9]'
                    }`}
                  />
                )}
              </div>
              <span
                className={`text-xs mt-1 tracking-tight ${
                  isActive ? 'font-black' : 'font-medium'
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
