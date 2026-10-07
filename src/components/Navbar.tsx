import React, { useState } from 'react';
import { TabType, TextScale } from '../types';
import { 
  Home, 
  ShieldAlert, 
  Hand, 
  ExternalLink, 
  Sun, 
  Moon, 
  Type, 
  Menu, 
  X,
  Volume2
} from 'lucide-react';
import { SOUND_GUARDIAN_URL, SIGN_BRIDGE_URL } from '../constants';

interface NavbarProps {
  currentTab: TabType;
  onSelectTab: (tab: TabType) => void;
  highContrast: boolean;
  onToggleHighContrast: () => void;
  textScale: TextScale;
  onChangeTextScale: (scale: TextScale) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onSelectTab,
  highContrast,
  onToggleHighContrast,
  textScale,
  onChangeTextScale,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    {
      id: 'home' as TabType,
      label: 'Home',
      icon: Home,
      description: 'Platform Overview',
    },
    {
      id: 'sound-guardian' as TabType,
      label: 'Sound Guardian',
      icon: ShieldAlert,
      description: 'Danger Sound Alerts',
      externalUrl: SOUND_GUARDIAN_URL,
    },
    {
      id: 'sign-bridge' as TabType,
      label: 'SignBridge',
      icon: Hand,
      description: 'Sign & Live Captions',
      externalUrl: SIGN_BRIDGE_URL,
    },
  ];

  const cycleTextScale = () => {
    if (textScale === 'normal') onChangeTextScale('large');
    else if (textScale === 'large') onChangeTextScale('xlarge');
    else onChangeTextScale('normal');
  };

  const textScaleLabel = {
    normal: '100%',
    large: '115%',
    xlarge: '130%',
  }[textScale];

  return (
    <header
      role="banner"
      className={`sticky top-0 z-50 border-b transition-colors duration-200 ${
        highContrast
          ? 'bg-black border-amber-400 text-white'
          : 'bg-white/95 backdrop-blur-md border-slate-200 text-slate-900 shadow-xs'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Brand Logo & Name */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => onSelectTab('home')}
              className={`flex items-center gap-3 text-left rounded-lg p-1.5 focus:outline-none focus-visible:ring-3 ${
                highContrast
                  ? 'focus-visible:ring-amber-400 hover:bg-zinc-900'
                  : 'focus-visible:ring-teal-600 hover:bg-slate-50'
              }`}
              aria-label="NādaSakhi Home - Smart Accessibility Platform"
            >
              <div
                className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold text-xl shadow-xs ${
                  highContrast
                    ? 'bg-amber-400 text-black border-2 border-white'
                    : 'bg-gradient-to-br from-teal-600 to-indigo-700 text-white'
                }`}
              >
                <Volume2 className="w-6 h-6" aria-hidden="true" />
              </div>
              <div>
                <div className="flex items-baseline gap-2">
                  <span
                    className={`font-black tracking-tight text-xl sm:text-2xl ${
                      highContrast ? 'text-amber-400' : 'text-slate-900'
                    }`}
                  >
                    NādaSakhi
                  </span>
                  <span
                    className={`hidden md:inline-block text-xs uppercase font-bold tracking-wider px-2 py-0.5 rounded ${
                      highContrast
                        ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40'
                        : 'bg-teal-50 text-teal-800 border border-teal-200'
                    }`}
                  >
                    Accessibility Hub
                  </span>
                </div>
                <p
                  className={`text-xs font-medium ${
                    highContrast ? 'text-zinc-300' : 'text-slate-500'
                  }`}
                >
                  Smart Accessibility Platform for Deaf & Speech-Impaired
                </p>
              </div>
            </button>
          </div>

          {/* Desktop Navigation Tabs */}
          <nav
            aria-label="Main Navigation"
            className="hidden lg:flex items-center gap-1.5 bg-slate-100/80 p-1.5 rounded-xl border border-slate-200 dark:border-transparent"
            style={{
              backgroundColor: highContrast ? '#18181b' : undefined,
              borderColor: highContrast ? '#e4e4e7' : undefined,
            }}
          >
            {navItems.map((item) => {
              const isActive = currentTab === item.id;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectTab(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all duration-150 focus:outline-none focus-visible:ring-3 ${
                    highContrast
                      ? isActive
                        ? 'bg-amber-400 text-black font-extrabold shadow-sm'
                        : 'text-zinc-200 hover:text-white hover:bg-zinc-800'
                      : isActive
                      ? 'bg-white text-teal-900 shadow-sm border border-slate-200'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 ${
                      isActive
                        ? highContrast
                          ? 'text-black'
                          : 'text-teal-600'
                        : highContrast
                        ? 'text-zinc-400'
                        : 'text-slate-500'
                    }`}
                    aria-hidden="true"
                  />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Accessibility Settings & Quick Actions */}
          <div className="flex items-center gap-2">
            {/* Font Size Adjuster */}
            <button
              onClick={cycleTextScale}
              aria-label={`Adjust text scale. Current: ${textScaleLabel}`}
              title={`Adjust text scale: ${textScaleLabel}`}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-colors focus:outline-none focus-visible:ring-3 ${
                highContrast
                  ? 'border border-amber-400/60 bg-zinc-900 text-amber-300 hover:bg-zinc-800 focus-visible:ring-amber-400'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 focus-visible:ring-teal-600'
              }`}
            >
              <Type className="w-4 h-4" aria-hidden="true" />
              <span className="hidden sm:inline">Text:</span>
              <span>{textScaleLabel}</span>
            </button>

            {/* High Contrast Toggle */}
            <button
              onClick={onToggleHighContrast}
              aria-pressed={highContrast}
              aria-label={highContrast ? 'Switch to standard contrast' : 'Switch to high contrast'}
              title={highContrast ? 'Switch to standard contrast' : 'Enable high contrast mode'}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-colors focus:outline-none focus-visible:ring-3 ${
                highContrast
                  ? 'bg-amber-400 text-black border border-white hover:bg-amber-300 focus-visible:ring-white'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 focus-visible:ring-teal-600'
              }`}
            >
              {highContrast ? (
                <>
                  <Sun className="w-4 h-4 text-black" aria-hidden="true" />
                  <span className="hidden sm:inline">High Contrast: On</span>
                  <span className="sm:hidden">HC On</span>
                </>
              ) : (
                <>
                  <Moon className="w-4 h-4 text-slate-600" aria-hidden="true" />
                  <span className="hidden sm:inline">High Contrast: Off</span>
                  <span className="sm:hidden">HC Off</span>
                </>
              )}
            </button>

            {/* Current Tab "Open in New Tab" quick button when inside an iframe */}
            {currentTab !== 'home' && (
              <a
                href={currentTab === 'sound-guardian' ? SOUND_GUARDIAN_URL : SIGN_BRIDGE_URL}
                target="_blank"
                rel="noopener noreferrer"
                title="Open current applet directly in a new browser tab"
                aria-label="Open in new browser tab"
                className={`hidden md:inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-colors focus:outline-none focus-visible:ring-3 ${
                  highContrast
                    ? 'bg-zinc-800 border border-amber-400 text-amber-300 hover:bg-zinc-700'
                    : 'bg-teal-50 border border-teal-200 text-teal-800 hover:bg-teal-100'
                }`}
              >
                <span>New Tab</span>
                <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
              </a>
            )}

            {/* Mobile menu toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-expanded={mobileMenuOpen}
              aria-label="Toggle navigation menu"
              className={`lg:hidden p-2.5 rounded-lg border focus:outline-none focus-visible:ring-3 ${
                highContrast
                  ? 'border-amber-400 bg-zinc-900 text-amber-300'
                  : 'border-slate-200 bg-white text-slate-700'
              }`}
            >
              {mobileMenuOpen ? (
                <X className="w-5 h-5" aria-hidden="true" />
              ) : (
                <Menu className="w-5 h-5" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Nav Dropdown */}
      {mobileMenuOpen && (
        <div
          className={`lg:hidden border-t px-4 pt-3 pb-4 space-y-2 ${
            highContrast ? 'bg-zinc-950 border-amber-400/40' : 'bg-slate-50 border-slate-200'
          }`}
        >
          {navItems.map((item) => {
            const isActive = currentTab === item.id;
            const Icon = item.icon;
            return (
              <div key={item.id} className="flex items-center gap-2">
                <button
                  onClick={() => {
                    onSelectTab(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`flex-1 flex items-center gap-3 px-4 py-3 rounded-lg text-base font-semibold text-left transition-colors ${
                    highContrast
                      ? isActive
                        ? 'bg-amber-400 text-black font-extrabold'
                        : 'text-zinc-200 hover:bg-zinc-800'
                      : isActive
                      ? 'bg-teal-700 text-white shadow-xs'
                      : 'text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <Icon className="w-5 h-5" aria-hidden="true" />
                  <div>
                    <div>{item.label}</div>
                    <div
                      className={`text-xs ${
                        isActive
                          ? highContrast
                            ? 'text-zinc-900'
                            : 'text-teal-100'
                          : highContrast
                          ? 'text-zinc-400'
                          : 'text-slate-500'
                      }`}
                    >
                      {item.description}
                    </div>
                  </div>
                </button>
                {item.externalUrl && (
                  <a
                    href={item.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open ${item.label} in new browser tab`}
                    className={`p-3 rounded-lg border flex items-center justify-center ${
                      highContrast
                        ? 'border-amber-400 text-amber-300 bg-zinc-900'
                        : 'border-slate-300 text-slate-700 bg-white'
                    }`}
                  >
                    <ExternalLink className="w-5 h-5" aria-hidden="true" />
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </header>
  );
};
