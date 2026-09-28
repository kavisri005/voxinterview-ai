import React from 'react';
import { X, Sliders, Check, Zap, Sparkles } from 'lucide-react';
import { InterviewSettings } from '../types/interview';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: InterviewSettings;
  onUpdateSettings: (settings: InterviewSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
}) => {
  if (!isOpen) return null;

  const thresholds = [
    { value: 800, label: '800ms', desc: 'Ultra-fast – for crisp, non-pausing interviewers' },
    { value: 1000, label: '1000ms', desc: 'Recommended default – optimal interview balance' },
    { value: 1500, label: '1500ms', desc: 'Relaxed – accommodates thoughtful speaking pauses' },
    { value: 2000, label: '2000ms', desc: 'Conservative – waits for long natural pauses' },
  ];

  const styles = [
    {
      value: 'concise',
      title: 'Concise & Spoken (Recommended)',
      desc: '2 to 4 natural sentences. Easy to speak out loud without hesitation.',
    },
    {
      value: 'detailed',
      title: 'Deep Technical & Architectural',
      desc: 'Up to 5–6 sentences. In-depth reasoning and system trade-offs.',
    },
    {
      value: 'bullet',
      title: 'Bullet Points & Key Anchors',
      desc: 'Intro statement followed by 3 high-impact glanceable bullets.',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-[#0c1220] border border-slate-800 rounded-2xl shadow-2xl p-6 text-slate-100 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Detection & Answer Engine Settings</h2>
              <p className="text-xs text-slate-400">Fine-tune silence thresholds and AI answer delivery</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Silence Threshold Selector */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-amber-400" />
              Question End Silence Threshold
            </label>
            <span className="text-xs font-mono font-semibold text-amber-400 px-2 py-0.5 rounded bg-amber-400/10 border border-amber-400/20">
              {settings.silenceThresholdMs}ms
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {thresholds.map((t) => {
              const isSelected = settings.silenceThresholdMs === t.value;
              return (
                <button
                  key={t.value}
                  onClick={() => onUpdateSettings({ ...settings, silenceThresholdMs: t.value })}
                  className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                    isSelected
                      ? 'bg-amber-500/10 border-amber-500/50 text-white shadow-sm shadow-amber-500/10'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className="text-xs font-bold font-mono text-white">{t.label}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-amber-400" />}
                  </div>
                  <span className="text-[10px] leading-tight text-slate-400">{t.desc.split('–')[0]}</span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-500">
            Duration of silence to mark interviewer speech segment complete.
          </p>
        </div>

        {/* Answer Trigger Mode */}
        <div className="space-y-3">
          <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <Zap className="w-4 h-4 text-emerald-400" />
            Answer Generation Trigger
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onUpdateSettings({ ...settings, autoAnswer: false })}
              className={`p-3 rounded-xl border text-left transition ${
                !settings.autoAnswer
                  ? 'bg-emerald-500/10 border-emerald-500/50 text-white shadow-sm shadow-emerald-500/10'
                  : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-white">Manual Button (Recommended)</span>
                {!settings.autoAnswer && <Check className="w-3.5 h-3.5 text-emerald-400" />}
              </div>
              <p className="text-[10px] text-slate-400 leading-tight">
                Click GENERATE ANSWER or press Enter when the interviewer finishes speaking.
              </p>
            </button>

            <button
              onClick={() => onUpdateSettings({ ...settings, autoAnswer: true })}
              className={`p-3 rounded-xl border text-left transition ${
                settings.autoAnswer
                  ? 'bg-emerald-500/10 border-emerald-500/50 text-white shadow-sm shadow-emerald-500/10'
                  : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-white">Automatic on Silence</span>
                {settings.autoAnswer && <Check className="w-3.5 h-3.5 text-emerald-400" />}
              </div>
              <p className="text-[10px] text-slate-400 leading-tight">
                Auto-generates answer when silence threshold is detected.
              </p>
            </button>
          </div>
        </div>

        {/* Answer Style */}
        <div className="space-y-3">
          <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            AI Answer Pacing & Format
          </label>

          <div className="space-y-2">
            {styles.map((s) => {
              const isSelected = settings.answerStyle === s.value;
              return (
                <button
                  key={s.value}
                  onClick={() => onUpdateSettings({ ...settings, answerStyle: s.value as any })}
                  className={`w-full p-3 rounded-xl border text-left transition flex items-start gap-3 ${
                    isSelected
                      ? 'bg-indigo-500/10 border-indigo-500/50 text-white'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <div
                    className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                      isSelected ? 'border-indigo-400 bg-indigo-500' : 'border-slate-600'
                    }`}
                  >
                    {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-white">{s.title}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{s.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Minimum Word Count Filter */}
        <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-slate-200">Noise & Cough Filter</div>
            <div className="text-[11px] text-slate-500">
              Ignore short utterances under {settings.minWordCountToTrigger} words (like "um", "okay")
            </div>
          </div>
          <div className="flex gap-1.5">
            {[2, 3, 4].map((count) => (
              <button
                key={count}
                onClick={() => onUpdateSettings({ ...settings, minWordCountToTrigger: count })}
                className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition ${
                  settings.minWordCountToTrigger === count
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {count} words
              </button>
            ))}
          </div>
        </div>

        {/* Optional Client API Key */}
        <div className="pt-2 border-t border-slate-800 space-y-1.5">
          <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
            <span>Direct Gemini API Key (Optional)</span>
            <span className="text-[10px] text-slate-500 font-normal">Leave blank to use server key</span>
          </label>
          <input
            type="password"
            value={settings.customApiKey || ''}
            onChange={(e) => onUpdateSettings({ ...settings, customApiKey: e.target.value })}
            placeholder="AIzaSy... (Optional private browser override)"
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
          />
        </div>

        {/* Action Button */}
        <div className="pt-2 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-lg shadow-indigo-600/20 transition"
          >
            Apply & Close
          </button>
        </div>
      </div>
    </div>
  );
};
