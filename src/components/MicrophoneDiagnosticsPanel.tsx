import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Info,
  Terminal,
  Volume2,
  XCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { AudioDiagnostics } from '../hooks/useRealtimeAudio';

interface MicrophoneDiagnosticsPanelProps {
  diagnostics: AudioDiagnostics;
  speechSupported: boolean;
  hasMicPermission: boolean | null;
  audioLevel: number;
}

export const MicrophoneDiagnosticsPanel: React.FC<MicrophoneDiagnosticsPanelProps> = ({
  diagnostics,
  speechSupported,
  hasMicPermission,
  audioLevel,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const isInIframe = typeof window !== 'undefined' && window.self !== window.top;

  const getMicPermBadge = () => {
    if (diagnostics.micPermission === 'GRANTED' || hasMicPermission === true) {
      return { text: 'GRANTED', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' };
    }
    if (diagnostics.micPermission === 'DENIED' || hasMicPermission === false) {
      return { text: 'DENIED', color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' };
    }
    return { text: 'PROMPT', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' };
  };

  const getMediaStreamBadge = () => {
    switch (diagnostics.mediaStream) {
      case 'CONNECTED':
        return { text: 'CONNECTED', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' };
      case 'CONNECTING':
        return { text: 'CONNECTING...', color: 'text-sky-400 bg-sky-500/10 border-sky-500/20' };
      case 'FAILED':
        return { text: 'FAILED', color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' };
      default:
        return { text: 'DISCONNECTED', color: 'text-slate-400 bg-slate-800 border-slate-700' };
    }
  };

  const getRecognitionBadge = () => {
    switch (diagnostics.recognitionState) {
      case 'LISTENING':
        return { text: 'LISTENING', color: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30' };
      case 'SPEECH_ACTIVE':
        return { text: 'RECEIVING SPEECH', color: 'text-sky-300 bg-sky-500/20 border-sky-500/40 animate-pulse' };
      case 'STARTING':
        return { text: 'STARTING...', color: 'text-amber-400 bg-amber-500/15 border-amber-500/30' };
      case 'ERROR':
        return { text: 'ERROR', color: 'text-rose-400 bg-rose-500/15 border-rose-500/30' };
      default:
        return { text: 'STOPPED', color: 'text-slate-400 bg-slate-800 border-slate-700' };
    }
  };

  const micBadge = getMicPermBadge();
  const streamBadge = getMediaStreamBadge();
  const recognitionBadge = getRecognitionBadge();

  return (
    <div className="rounded-xl bg-[#0a0f1d] border border-slate-800/90 overflow-hidden shadow-lg">
      {/* Header bar */}
      <div className="px-4 py-2.5 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-sky-400" />
          <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
            Microphone & Speech Engine Diagnostics
          </span>
          {isInIframe && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
              Inside Iframe
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Open in Standalone / New Tab Button */}
          <a
            href={typeof window !== 'undefined' ? window.location.href : '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 hover:text-white border border-indigo-500/30 text-[11px] font-semibold transition"
            title="Open app in a dedicated standalone browser tab"
          >
            <ExternalLink className="w-3 h-3" />
            <span>Open in New Tab</span>
          </a>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main status grid */}
      <div className="p-3 sm:p-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs border-b border-slate-800/80 bg-slate-950/40">
        <div>
          <span className="text-[10px] font-mono text-slate-400 block uppercase">Mic Permission:</span>
          <span className={`inline-block px-2 py-0.5 rounded font-mono font-bold text-[11px] border mt-0.5 ${micBadge.color}`}>
            {micBadge.text}
          </span>
        </div>

        <div>
          <span className="text-[10px] font-mono text-slate-400 block uppercase">MediaStream:</span>
          <span className={`inline-block px-2 py-0.5 rounded font-mono font-bold text-[11px] border mt-0.5 ${streamBadge.color}`}>
            {streamBadge.text}
          </span>
        </div>

        <div>
          <span className="text-[10px] font-mono text-slate-400 block uppercase">SpeechRecognition:</span>
          <span
            className={`inline-block px-2 py-0.5 rounded font-mono font-bold text-[11px] border mt-0.5 ${
              speechSupported
                ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                : 'text-rose-400 bg-rose-500/10 border-rose-500/20'
            }`}
          >
            {speechSupported ? 'SUPPORTED' : 'UNSUPPORTED'}
          </span>
        </div>

        <div>
          <span className="text-[10px] font-mono text-slate-400 block uppercase">Recognition:</span>
          <span className={`inline-block px-2 py-0.5 rounded font-mono font-bold text-[11px] border mt-0.5 ${recognitionBadge.color}`}>
            {recognitionBadge.text}
          </span>
        </div>
      </div>

      {/* Expandable Diagnostic Details & Event Logs */}
      {isExpanded && (
        <div className="p-3 sm:p-4 space-y-3 bg-[#080d19]">
          {/* Last Error banner if any */}
          {diagnostics.lastError && (
            <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/25 flex items-start gap-2 text-xs text-rose-300">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Last Error: </span>
                <span>{diagnostics.lastError}</span>
              </div>
            </div>
          )}

          {/* Last Transcript */}
          <div className="text-xs">
            <span className="text-[11px] font-mono text-slate-400">Last Transcript: </span>
            <span className="font-mono text-slate-200">
              {diagnostics.lastTranscript ? `"${diagnostics.lastTranscript}"` : '(None received yet)'}
            </span>
          </div>

          {/* Live Event Stream Log */}
          <div>
            <div className="text-[10px] font-mono uppercase text-slate-400 mb-1.5 flex items-center justify-between">
              <span>SpeechRecognition Event Log (Latest First):</span>
              <span className="text-slate-500">{diagnostics.eventLogs.length} events</span>
            </div>

            <div className="max-h-28 overflow-y-auto rounded-lg bg-slate-950 p-2 border border-slate-800 text-[11px] font-mono space-y-1">
              {diagnostics.eventLogs.length === 0 ? (
                <div className="text-slate-600 italic">No events logged yet. Click START LISTENING to begin.</div>
              ) : (
                diagnostics.eventLogs.slice(0, 15).map((log, i) => (
                  <div key={i} className="flex items-start gap-2 leading-relaxed">
                    <span className="text-slate-500 shrink-0">{log.time}</span>
                    <span className="text-sky-300 font-semibold shrink-0">[{log.event}]</span>
                    {log.detail && <span className="text-slate-300 break-all">{log.detail}</span>}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
