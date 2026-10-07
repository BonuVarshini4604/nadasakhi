import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  RotateCw, 
  ChevronRight, 
  AlertTriangle, 
  Flame, 
  BellRing, 
  ShieldAlert, 
  Volume2, 
  Dog, 
  Sparkles, 
  Clock, 
  Terminal,
  Send,
  Play,
  CheckCircle2,
  Info
} from 'lucide-react';
import { N8N_WEBHOOK_URL } from '../constants';
import { SoundPriority } from '../types';

export type HistoryFilter = 'All' | 'Critical' | 'Home' | 'Custom';

export interface TimelineAlertItem {
  id: string;
  name: string;
  category: 'Critical' | 'Home' | 'Custom';
  priority: SoundPriority;
  time: string;
  group: 'Today' | 'Yesterday';
  description: string;
  matchPercent?: number;
}

interface HistoryTabProps {
  highContrast: boolean;
  onTriggerAlert: (soundName: string, priority: SoundPriority) => void;
}

export const HistoryTab: React.FC<HistoryTabProps> = ({
  highContrast,
  onTriggerAlert,
}) => {
  const [filter, setFilter] = useState<HistoryFilter>('All');
  const [loading, setLoading] = useState(false);
  const [serverReplySnippet, setServerReplySnippet] = useState<string | null>(null);
  const [httpStatus, setHttpStatus] = useState<number | string | null>(null);
  const [isErrorOrEmpty, setIsErrorOrEmpty] = useState(false);
  const [showDebugSnippet, setShowDebugSnippet] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<TimelineAlertItem | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Default timeline data grouped by Today and Yesterday
  const [timelineItems, setTimelineItems] = useState<TimelineAlertItem[]>([
    {
      id: 'h-1',
      name: 'Smoke Alarm',
      category: 'Critical',
      priority: 'critical',
      time: '10:42 AM',
      group: 'Today',
      description: 'Loud high-frequency hazard alarm detected',
      matchPercent: 99,
    },
    {
      id: 'h-2',
      name: 'Doorbell',
      category: 'Home',
      priority: 'low',
      time: '9:15 AM',
      group: 'Today',
      description: 'Front entrance chime detected',
      matchPercent: 94,
    },
    {
      id: 'h-3',
      name: 'Front Door Knock',
      category: 'Custom',
      priority: 'medium',
      time: '8:30 AM',
      group: 'Today',
      description: 'Custom trained pattern matched doorway',
      matchPercent: 91,
    },
    {
      id: 'h-4',
      name: 'Glass Breaking',
      category: 'Critical',
      priority: 'critical',
      time: '11:18 PM',
      group: 'Yesterday',
      description: 'Sharp acoustic shatter detected in living room',
      matchPercent: 97,
    },
    {
      id: 'h-5',
      name: 'Dog Bark',
      category: 'Home',
      priority: 'low',
      time: '4:05 PM',
      group: 'Yesterday',
      description: 'Repeated pet acoustic pattern detected',
      matchPercent: 89,
    },
    {
      id: 'h-6',
      name: 'Baby Cry',
      category: 'Custom',
      priority: 'medium',
      time: '2:12 PM',
      group: 'Yesterday',
      description: 'Infant distress acoustic frequency detected',
      matchPercent: 93,
    },
  ]);

  // Set initial selected alert
  useEffect(() => {
    if (timelineItems.length > 0 && !selectedAlert) {
      setSelectedAlert(timelineItems[0]);
    }
  }, [timelineItems, selectedAlert]);

  // Load data by calling https://bonu.app.n8n.cloud/webhook/nadasakhi with POST and {"mode":"get_history"}
  const fetchHistory = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setIsErrorOrEmpty(false);
    setServerReplySnippet(null);
    setHttpStatus(null);

    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 10000);

    try {
      const response = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mode: 'get_history' }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      setHttpStatus(response.status);

      const responseText = await response.text();
      setServerReplySnippet(responseText.slice(0, 300) || '(Empty response body)');

      let parsedJson: unknown = null;
      let isJson = false;

      try {
        parsedJson = JSON.parse(responseText);
        isJson = true;
      } catch {
        isJson = false;
      }

      if (!response.ok || !isJson) {
        setIsErrorOrEmpty(true);
        return;
      }

      // Check if reply has data
      let records: Record<string, unknown>[] = [];
      if (Array.isArray(parsedJson)) {
        records = parsedJson;
      } else if (parsedJson && typeof parsedJson === 'object') {
        const obj = parsedJson as Record<string, unknown>;
        if (Array.isArray(obj.alerts)) records = obj.alerts as Record<string, unknown>[];
        else if (Array.isArray(obj.history)) records = obj.history as Record<string, unknown>[];
        else if (Array.isArray(obj.data)) records = obj.data as Record<string, unknown>[];
        else records = [obj];
      }

      if (records.length === 0) {
        setIsErrorOrEmpty(true);
      } else {
        const mapped: TimelineAlertItem[] = records.map((r, i) => {
          const soundName = String(r.sound || r.name || r.event || 'Acoustic Sound');
          const isCrit = soundName.toLowerCase().includes('alarm') || soundName.toLowerCase().includes('smoke') || soundName.toLowerCase().includes('glass');
          const isCustom = soundName.toLowerCase().includes('knock') || soundName.toLowerCase().includes('custom');
          const cat: 'Critical' | 'Home' | 'Custom' = isCrit ? 'Critical' : isCustom ? 'Custom' : 'Home';

          const timeVal = r.time || r.timestamp || r.createdAt;
          const displayTime = timeVal ? new Date(String(timeVal)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '10:00 AM';

          return {
            id: `server-${i}`,
            name: soundName,
            category: cat,
            priority: isCrit ? 'critical' : isCustom ? 'medium' : 'low',
            time: displayTime,
            group: i < 3 ? 'Today' : 'Yesterday',
            description: String(r.description || `${soundName} event captured by acoustic monitor`),
            matchPercent: Number(r.match || r.matchPercent || 95),
          };
        });

        setTimelineItems(mapped);
        if (mapped.length > 0) setSelectedAlert(mapped[0]);
      }

      setLastFetched(new Date());
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      const isAbort = err instanceof Error && err.name === 'AbortError';
      const errMsg = err instanceof Error ? err.message : String(err);
      setHttpStatus(isAbort ? '408 / Timeout' : 'Network Error');
      setServerReplySnippet(isAbort ? 'Request timed out after 10 seconds waiting for server response.' : errMsg.slice(0, 300));
      setIsErrorOrEmpty(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchHistory]);

  const getSoundIcon = (name: string) => {
    const s = name.toUpperCase();
    if (s.includes('SMOKE') || s.includes('FIRE')) return <Flame className="w-5 h-5 text-rose-400" />;
    if (s.includes('DOOR') || s.includes('BELL')) return <BellRing className="w-5 h-5 text-sky-400" />;
    if (s.includes('DOG') || s.includes('BARK')) return <Dog className="w-5 h-5 text-amber-400" />;
    if (s.includes('GLASS')) return <Sparkles className="w-5 h-5 text-yellow-300" />;
    return <Volume2 className="w-5 h-5 text-purple-400" />;
  };

  const getDotColor = (category: 'Critical' | 'Home' | 'Custom') => {
    if (category === 'Critical') return 'bg-rose-500 shadow-[0_0_8px_#f43f5e]';
    if (category === 'Custom') return 'bg-purple-400 shadow-[0_0_8px_#c084fc]';
    return 'bg-sky-400 shadow-[0_0_8px_#38bdf8]';
  };

  const filterTabs: HistoryFilter[] = ['All', 'Critical', 'Home', 'Custom'];

  const filteredItems = timelineItems.filter((item) => {
    if (filter === 'All') return true;
    return item.category === filter;
  });

  const todayItems = filteredItems.filter((i) => i.group === 'Today');
  const yesterdayItems = filteredItems.filter((i) => i.group === 'Yesterday');

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 space-y-6 select-none">
      {/* Top Header with Title and Refresh Button */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className={`text-2xl lg:text-3xl font-black tracking-tight ${highContrast ? 'text-amber-300' : 'text-[#f8fafc]'}`}>
            Alert History
          </h1>
          <p className="text-xs sm:text-sm text-[#94a3b8] font-medium mt-0.5">
            Timeline of past danger and home acoustic events · Synced with n8n
          </p>
        </div>

        {/* Refresh button */}
        <button
          onClick={fetchHistory}
          disabled={loading}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold border flex items-center gap-2 transition-all active:scale-95 cursor-pointer ${
            highContrast
              ? 'bg-amber-400 text-black border-white hover:bg-amber-300'
              : 'bg-[#0d1630] border-[#1a274c] text-[#cbd5e1] hover:text-[#f8fafc] hover:bg-[#131e3d]'
          }`}
          aria-label="Refresh timeline history"
        >
          <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
        </button>
      </div>

      {/* Friendly message & first 300 characters of reply if reply is empty or fails */}
      {isErrorOrEmpty && (
        <div
          role="alert"
          className={`p-4 sm:p-5 rounded-2xl border space-y-3 ${
            highContrast
              ? 'bg-zinc-950 border-amber-400 text-white'
              : 'bg-[#0d1630] border-amber-500/40 text-amber-200'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <p className="font-bold text-sm text-white">
                  NādaSakhi cannot reach the server right now.
                </p>
                <p className="text-xs text-[#94a3b8] mt-0.5">
                  Showing cached timeline events below. Please try again or inspect debug details.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
              <button
                onClick={fetchHistory}
                className="px-3.5 py-1.5 rounded-lg text-xs font-black bg-amber-500 hover:bg-amber-400 text-black transition-colors cursor-pointer"
              >
                Retry
              </button>
              <button
                onClick={() => setShowDebugSnippet(!showDebugSnippet)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold border border-[#1a274c] bg-[#050b1a] text-[#94a3b8] hover:text-[#f8fafc] cursor-pointer"
              >
                {showDebugSnippet ? 'Hide details' : 'Show details'}
              </button>
            </div>
          </div>

          {/* First 300 characters of server reply */}
          {serverReplySnippet && showDebugSnippet && (
            <div className="pt-2 border-t border-[#1a274c] space-y-1">
              <p className="text-[11px] text-[#94a3b8] font-mono">
                Server Reply (HTTP {httpStatus || 'N/A'}) - First 300 characters:
              </p>
              <pre className="p-3 rounded-xl font-mono text-xs text-[#cbd5e1] bg-[#050b1a] border border-[#1a274c] whitespace-pre-wrap break-all overflow-x-auto">
                {serverReplySnippet}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* 2-Column Responsive Layout: Timeline on Left, Alert Details on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
        {/* LEFT COLUMN: Filter chips & Timeline grouped by Today and Yesterday */}
        <div className="lg:col-span-7 space-y-6">
          {/* Filter chips at the top: All, Critical, Home, Custom */}
          <div className="flex items-center gap-1.5 p-1.5 bg-[#0d1630] rounded-2xl border border-[#1a274c]">
            {filterTabs.map((tab) => {
              const isActive = filter === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setFilter(tab)}
                  className={`flex-1 py-2 px-3 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
                    isActive
                      ? highContrast
                        ? 'bg-amber-400 text-black shadow-sm'
                        : 'bg-[#0ea5e9] text-white shadow-[0_0_15px_rgba(14,165,233,0.4)]'
                      : 'text-[#94a3b8] hover:text-[#f8fafc] hover:bg-[#131e3d]'
                  }`}
                >
                  {tab}
                </button>
              );
            })}
          </div>

          {/* Timeline lists */}
          <div className="space-y-6">
            {/* Today Group */}
            {todayItems.length > 0 && (
              <section aria-labelledby="today-heading" className="space-y-3">
                <h2 id="today-heading" className="text-xs font-black uppercase tracking-wider text-[#94a3b8] px-1">
                  Today
                </h2>

                <div className="space-y-2.5">
                  {todayItems.map((item) => {
                    const isSelected = selectedAlert?.id === item.id;
                    return (
                      <div
                        key={item.id}
                        onClick={() => setSelectedAlert(item)}
                        className={`p-4 rounded-2xl border transition-all flex items-center justify-between gap-3 cursor-pointer ${
                          isSelected
                            ? highContrast
                              ? 'bg-zinc-900 border-amber-400 text-white shadow-md'
                              : 'bg-[#0d1630] border-2 border-[#0ea5e9] text-[#f8fafc] shadow-[0_0_20px_rgba(14,165,233,0.25)]'
                            : highContrast
                            ? 'bg-zinc-950 border-zinc-800 hover:border-amber-400 text-white'
                            : 'bg-[#0d1630] border-[#1a274c] hover:bg-[#131e3d] text-[#f8fafc]'
                        }`}
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${getDotColor(item.category)}`} />

                          <div className="w-11 h-11 rounded-xl bg-[#050b1a] border border-[#1a274c] flex items-center justify-center shrink-0">
                            {getSoundIcon(item.name)}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="font-extrabold text-sm sm:text-base text-[#f8fafc] truncate">{item.name}</h3>
                              <span className="text-xs text-[#94a3b8] shrink-0 font-medium">· {item.time}</span>
                            </div>
                            <p className="text-xs text-[#94a3b8] truncate mt-0.5">{item.description}</p>
                          </div>
                        </div>

                        <ChevronRight className="w-4 h-4 text-[#94a3b8] shrink-0" aria-hidden="true" />
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Yesterday Group */}
            {yesterdayItems.length > 0 && (
              <section aria-labelledby="yesterday-heading" className="space-y-3">
                <h2 id="yesterday-heading" className="text-xs font-black uppercase tracking-wider text-[#94a3b8] px-1">
                  Yesterday
                </h2>

                <div className="space-y-2.5">
                  {yesterdayItems.map((item) => {
                    const isSelected = selectedAlert?.id === item.id;
                    return (
                      <div
                        key={item.id}
                        onClick={() => setSelectedAlert(item)}
                        className={`p-4 rounded-2xl border transition-all flex items-center justify-between gap-3 cursor-pointer ${
                          isSelected
                            ? highContrast
                              ? 'bg-zinc-900 border-amber-400 text-white shadow-md'
                              : 'bg-[#0d1630] border-2 border-[#0ea5e9] text-[#f8fafc] shadow-[0_0_20px_rgba(14,165,233,0.25)]'
                            : highContrast
                            ? 'bg-zinc-950 border-zinc-800 hover:border-amber-400 text-white'
                            : 'bg-[#0d1630] border-[#1a274c] hover:bg-[#131e3d] text-[#f8fafc]'
                        }`}
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${getDotColor(item.category)}`} />

                          <div className="w-11 h-11 rounded-xl bg-[#050b1a] border border-[#1a274c] flex items-center justify-center shrink-0">
                            {getSoundIcon(item.name)}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="font-extrabold text-sm sm:text-base text-[#f8fafc] truncate">{item.name}</h3>
                              <span className="text-xs text-[#94a3b8] shrink-0 font-medium">· {item.time}</span>
                            </div>
                            <p className="text-xs text-[#94a3b8] truncate mt-0.5">{item.description}</p>
                          </div>
                        </div>

                        <ChevronRight className="w-4 h-4 text-[#94a3b8] shrink-0" aria-hidden="true" />
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {filteredItems.length === 0 && (
              <div className="text-center py-12 px-4 rounded-2xl border border-dashed border-[#1a274c] text-[#94a3b8] text-xs">
                No alerts found under &ldquo;{filter}&rdquo; filter.
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Alert Details panel on wide screens */}
        <div className="lg:col-span-5 space-y-6">
          <section
            aria-labelledby="alert-details-heading"
            className={`p-6 rounded-3xl border transition-all ${
              highContrast
                ? 'bg-zinc-950 border-amber-400 text-white'
                : 'bg-[#0d1630] border-[#1a274c] text-[#f8fafc] shadow-lg'
            }`}
          >
            <div className="space-y-5">
              <div className="flex items-center justify-between pb-4 border-b border-[#1a274c]">
                <h2 id="alert-details-heading" className="text-xs uppercase font-extrabold tracking-wider text-[#94a3b8]">
                  Event Inspection
                </h2>
                {selectedAlert && (
                  <span
                    className={`text-xs font-black uppercase px-2.5 py-1 rounded-lg ${
                      selectedAlert.category === 'Critical'
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                        : selectedAlert.category === 'Custom'
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                        : 'bg-[#0ea5e9]/20 text-[#38bdf8] border border-[#0ea5e9]/40'
                    }`}
                  >
                    {selectedAlert.category}
                  </span>
                )}
              </div>

              {selectedAlert ? (
                <div className="space-y-5">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-[#050b1a] flex items-center justify-center border border-[#1a274c]">
                      {getSoundIcon(selectedAlert.name)}
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-[#f8fafc]">{selectedAlert.name}</h3>
                      <p className="text-xs text-[#94a3b8] mt-0.5 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{selectedAlert.time} · {selectedAlert.group}</span>
                      </p>
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-[#050b1a] border border-[#1a274c] space-y-2 text-xs">
                    <p className="text-[#94a3b8] font-bold uppercase tracking-wider text-[11px]">Analysis Description</p>
                    <p className="text-[#cbd5e1] leading-relaxed text-sm">{selectedAlert.description}</p>
                    <div className="flex items-center justify-between pt-2 border-t border-[#1a274c] text-[#94a3b8]">
                      <span>Neural Confidence Match:</span>
                      <span className="font-mono font-bold text-[#0ea5e9]">{selectedAlert.matchPercent || 95}%</span>
                    </div>
                  </div>

                  {/* Re-simulate Trigger */}
                  <button
                    onClick={() => onTriggerAlert(selectedAlert.name, selectedAlert.priority)}
                    className="w-full py-3.5 px-4 rounded-2xl font-black text-sm bg-[#0ea5e9] hover:bg-sky-400 text-white flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-[0_0_20px_rgba(14,165,233,0.35)]"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>Re-test Alert & Webhook</span>
                  </button>
                </div>
              ) : (
                <div className="text-center py-8 text-xs text-[#94a3b8]">
                  Select an alert on the left to inspect details.
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
