import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  RotateCw, 
  History, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  BellRing, 
  Flame, 
  ShieldAlert, 
  Volume2, 
  ChevronDown,
  ChevronUp,
  Terminal,
  RefreshCw
} from 'lucide-react';
import { N8N_WEBHOOK_URL } from '../constants';

interface AlertItem {
  id?: string | number;
  time?: string;
  timestamp?: string;
  createdAt?: string;
  date?: string;
  sound?: string;
  sound_type?: string;
  soundType?: string;
  type?: string;
  status?: string;
  severity?: string;
  [key: string]: unknown;
}

interface AlertHistoryPanelProps {
  highContrast: boolean;
  onTriggerAlert?: (sound: string) => void;
}

export const AlertHistoryPanel: React.FC<AlertHistoryPanelProps> = ({
  highContrast,
  onTriggerAlert,
}) => {
  const [loading, setLoading] = useState(false);
  const [alerts, setAlerts] = useState<AlertItem[] | null>(null);
  const [errorDetails, setErrorDetails] = useState<{
    status: number | string;
    snippet: string;
    message?: string;
  } | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Directly call https://bonu.app.n8n.cloud/webhook/nadasakhi with 10-second timeout
  const fetchAlertHistory = useCallback(async () => {
    // Cancel any previous in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setErrorDetails(null);

    // 10-second timeout
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

      const responseText = await response.text();

      // Check whether response is valid JSON
      let parsedJson: unknown;
      let isValidJson = false;

      try {
        parsedJson = JSON.parse(responseText);
        isValidJson = true;
      } catch {
        isValidJson = false;
      }

      // If call fails (!response.ok) or reply is not JSON:
      if (!response.ok || !isValidJson) {
        setErrorDetails({
          status: response.status || 'Non-JSON Response',
          snippet: responseText.slice(0, 300) || '(Empty response body)',
          message: !isValidJson
            ? 'Reply is not valid JSON'
            : `HTTP server error status ${response.status}`,
        });
        setAlerts(null);
        return;
      }

      // Extract array of records
      let items: AlertItem[] = [];
      if (Array.isArray(parsedJson)) {
        items = parsedJson;
      } else if (parsedJson && typeof parsedJson === 'object') {
        const obj = parsedJson as Record<string, unknown>;
        if (Array.isArray(obj.alerts)) items = obj.alerts as AlertItem[];
        else if (Array.isArray(obj.history)) items = obj.history as AlertItem[];
        else if (Array.isArray(obj.data)) items = obj.data as AlertItem[];
        else if (Array.isArray(obj.records)) items = obj.records as AlertItem[];
        else if (Array.isArray(obj.items)) items = obj.items as AlertItem[];
        else items = [obj as AlertItem];
      }

      setAlerts(items);
      setLastFetched(new Date());
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      const isAbort = err instanceof Error && err.name === 'AbortError';
      const errMsg = err instanceof Error ? err.message : String(err);

      if (isAbort) {
        setErrorDetails({
          status: '408 / Timeout',
          snippet: 'Request exceeded the 10-second timeout threshold without a response from the server.',
          message: 'Connection timed out after 10 seconds',
        });
      } else {
        setErrorDetails({
          status: 'Network / CORS Error',
          snippet: errMsg.slice(0, 300) || 'Unable to connect to webhook URL',
          message: 'Network request failed',
        });
      }
      setAlerts(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    fetchAlertHistory();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchAlertHistory]);

  const formatTimestamp = (raw?: string) => {
    if (!raw) return 'Recent';
    try {
      const d = new Date(raw);
      if (isNaN(d.getTime())) return String(raw);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', month: 'short', day: 'numeric' });
    } catch {
      return String(raw);
    }
  };

  const getSoundIcon = (soundName?: string) => {
    const s = String(soundName || '').toUpperCase();
    if (s.includes('FIRE') || s.includes('SMOKE')) return <Flame className="w-5 h-5 text-amber-500" />;
    if (s.includes('DOOR') || s.includes('BELL')) return <BellRing className="w-5 h-5 text-blue-500" />;
    if (s.includes('SIREN') || s.includes('POLICE')) return <ShieldAlert className="w-5 h-5 text-red-500" />;
    return <Volume2 className="w-5 h-5 text-purple-500" />;
  };

  return (
    <section
      aria-labelledby="alert-history-heading"
      className={`rounded-3xl p-6 sm:p-8 border transition-all duration-200 ${
        highContrast
          ? 'bg-zinc-950 border-amber-400 text-white'
          : 'bg-white border-slate-200 shadow-sm text-slate-900'
      }`}
    >
      <div className="space-y-6">
        {/* Header with Title and Refresh Button */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold ${
                highContrast
                  ? 'bg-amber-400 text-black'
                  : 'bg-teal-100 text-teal-800 border border-teal-200'
              }`}
            >
              <History className="w-6 h-6" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2
                  id="alert-history-heading"
                  className={`text-xl sm:text-2xl font-black tracking-tight ${
                    highContrast ? 'text-amber-300' : 'text-slate-900'
                  }`}
                >
                  Alert History
                </h2>
                <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300">
                  mode: &quot;get_history&quot;
                </span>
              </div>
              <p
                className={`text-xs sm:text-sm mt-0.5 ${
                  highContrast ? 'text-zinc-300' : 'text-slate-500'
                }`}
              >
                Direct browser sync from{' '}
                <code className="text-xs font-mono">{N8N_WEBHOOK_URL}</code>
                {lastFetched && ` · Synced at ${lastFetched.toLocaleTimeString()}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Refresh Button */}
            <button
              onClick={fetchAlertHistory}
              disabled={loading}
              className={`px-4 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 border transition-all duration-150 transform active:scale-95 focus:outline-none focus-visible:ring-3 cursor-pointer ${
                highContrast
                  ? 'bg-amber-400 text-black border-white hover:bg-amber-300 focus-visible:ring-white disabled:opacity-50'
                  : 'bg-teal-700 text-white hover:bg-teal-800 border-teal-700 shadow-sm focus-visible:ring-teal-500 disabled:opacity-50'
              }`}
              aria-label="Refresh Alert History from n8n webhook"
            >
              <RotateCw
                className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
            </button>
          </div>
        </div>

        {/* Condition 1: Error, Timeout, or Non-JSON Response */}
        {errorDetails && (
          <div
            role="alert"
            className={`p-5 sm:p-6 rounded-2xl border space-y-4 ${
              highContrast
                ? 'bg-zinc-900 border-amber-400 text-white'
                : 'bg-amber-50/90 border-amber-300 text-amber-950'
            }`}
          >
            {/* Friendly user-facing notification */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <AlertTriangle
                  className={`w-6 h-6 shrink-0 mt-0.5 ${
                    highContrast ? 'text-amber-400' : 'text-amber-700'
                  }`}
                  aria-hidden="true"
                />
                <div>
                  <h3 className="font-black text-base sm:text-lg">
                    NādaSakhi cannot reach the server right now. Please try again.
                  </h3>
                  <p
                    className={`text-xs sm:text-sm mt-1 ${
                      highContrast ? 'text-zinc-300' : 'text-amber-900/90'
                    }`}
                  >
                    The webhook may be sleeping, timed out after 10 seconds, or returned non-JSON data.
                  </p>
                </div>
              </div>

              {/* Retry button */}
              <div className="flex items-center gap-2.5 self-start sm:self-center shrink-0">
                <button
                  onClick={fetchAlertHistory}
                  disabled={loading}
                  className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-black flex items-center gap-2 border transition-all duration-150 transform active:scale-95 focus:outline-none focus-visible:ring-3 cursor-pointer ${
                    highContrast
                      ? 'bg-amber-400 text-black border-white hover:bg-amber-300 focus-visible:ring-white disabled:opacity-50'
                      : 'bg-amber-800 hover:bg-amber-900 text-white border-amber-900 shadow-sm focus-visible:ring-amber-500 disabled:opacity-50'
                  }`}
                  aria-label="Retry connecting to server"
                >
                  <RefreshCw
                    className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
                    aria-hidden="true"
                  />
                  <span>{loading ? 'Retrying...' : 'Retry'}</span>
                </button>

                {/* Show Details toggle button */}
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  aria-expanded={showDetails}
                  className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-colors cursor-pointer ${
                    highContrast
                      ? 'border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-800'
                      : 'border-amber-300 bg-white/80 hover:bg-white text-amber-950'
                  }`}
                >
                  <Terminal className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{showDetails ? 'Hide details' : 'Show details'}</span>
                  {showDetails ? (
                    <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            {/* Revealed Debug Details (Revealed by "Show details" toggle) */}
            {showDetails && (
              <div
                className={`pt-4 border-t space-y-3 ${
                  highContrast ? 'border-zinc-800' : 'border-amber-200'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-bold flex items-center gap-2">
                    <span className="uppercase tracking-wider opacity-75">HTTP Status:</span>
                    <span className="font-mono px-2 py-0.5 rounded bg-black/60 text-amber-300 border border-amber-400/40">
                      {errorDetails.status}
                    </span>
                  </div>
                  {errorDetails.message && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-300 border border-red-300/50">
                      {errorDetails.message}
                    </span>
                  )}
                </div>

                <div>
                  <p className="text-xs font-bold uppercase tracking-wider opacity-75 mb-1.5">
                    First 300 characters of server reply:
                  </p>
                  <pre
                    className={`p-3.5 rounded-xl font-mono text-xs overflow-x-auto whitespace-pre-wrap break-all border ${
                      highContrast
                        ? 'bg-black text-amber-300 border-zinc-700'
                        : 'bg-white text-slate-800 border-slate-300 shadow-inner'
                    }`}
                  >
                    {errorDetails.snippet}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Condition 2: Success JSON response loaded */}
        {!errorDetails && alerts && (
          <div className="space-y-4">
            {alerts.length === 0 ? (
              <div className="text-center py-12 px-4 rounded-2xl border border-dashed border-slate-200 dark:border-zinc-800">
                <Clock className="w-10 h-10 mx-auto text-slate-400 mb-2" />
                <p className="font-bold text-base">No sound alerts recorded in history yet.</p>
                <p className="text-xs text-slate-500 mt-1">
                  When acoustic events occur or you trigger a test, they will appear here.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-zinc-800">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr
                      className={`border-b text-xs uppercase font-black tracking-wider ${
                        highContrast
                          ? 'bg-zinc-900 border-zinc-800 text-amber-400'
                          : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      <th scope="col" className="py-3.5 px-4">Time</th>
                      <th scope="col" className="py-3.5 px-4">Sound Type</th>
                      <th scope="col" className="py-3.5 px-4">Status</th>
                      {onTriggerAlert && (
                        <th scope="col" className="py-3.5 px-4 text-right">Quick Test</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-zinc-800">
                    {alerts.map((item, index) => {
                      const sound = String(item.sound || item.sound_type || item.soundType || item.type || item.event || 'Acoustic Alert').toUpperCase();
                      const timeStr = formatTimestamp(item.time || item.timestamp || item.createdAt || item.date);
                      const status = String(item.status || item.severity || 'Acknowledged');

                      return (
                        <tr
                          key={index}
                          className={`transition-colors ${
                            highContrast
                              ? 'hover:bg-zinc-900/60'
                              : 'hover:bg-slate-50/80'
                          }`}
                        >
                          {/* Time Column */}
                          <td className="py-3.5 px-4 whitespace-nowrap font-medium text-xs sm:text-sm">
                            <div className="flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 opacity-60" aria-hidden="true" />
                              <span>{timeStr}</span>
                            </div>
                          </td>

                          {/* Sound Type Column */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              {getSoundIcon(sound)}
                              <span className="font-extrabold text-sm sm:text-base tracking-tight">
                                {sound}
                              </span>
                            </div>
                          </td>

                          {/* Status Column */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider border ${
                                status.toLowerCase().includes('danger') || status.toLowerCase().includes('critical')
                                  ? highContrast
                                    ? 'bg-red-950 text-red-300 border-red-500'
                                    : 'bg-red-50 text-red-700 border-red-200'
                                  : highContrast
                                  ? 'bg-amber-400/20 text-amber-300 border-amber-400/40'
                                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              }`}
                            >
                              <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                              <span>{status}</span>
                            </span>
                          </td>

                          {/* Quick Re-test Action */}
                          {onTriggerAlert && (
                            <td className="py-3.5 px-4 text-right whitespace-nowrap">
                              <button
                                onClick={() => onTriggerAlert(sound)}
                                className={`text-xs font-bold px-2.5 py-1 rounded-lg border transition-colors ${
                                  highContrast
                                    ? 'border-amber-400 text-amber-300 hover:bg-zinc-900'
                                    : 'border-slate-300 hover:bg-slate-100 text-slate-700'
                                }`}
                              >
                                Re-simulate
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
