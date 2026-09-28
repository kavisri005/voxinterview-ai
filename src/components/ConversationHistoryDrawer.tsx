import React from 'react';
import { X, Copy, Check, Star, Trash2, Clock, MessageSquare, Download } from 'lucide-react';
import { ConversationTurn } from '../types/interview';

interface ConversationHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  history: ConversationTurn[];
  onClearHistory: () => void;
  onToggleStar: (id: string) => void;
}

export const ConversationHistoryDrawer: React.FC<ConversationHistoryDrawerProps> = ({
  isOpen,
  onClose,
  history,
  onClearHistory,
  onToggleStar,
}) => {
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleExport = () => {
    if (!history.length) return;
    const content = history
      .map(
        (turn, index) =>
          `### [Q${index + 1}] (${turn.category}) - ${new Date(turn.timestamp).toLocaleTimeString()}\n` +
          `**Interviewer:** ${turn.question}\n\n` +
          `**Candidate Answer:**\n${turn.answer}\n\n---\n`
      )
      .join('\n');

    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `VoxInterview-Session-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case 'Technical':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'Project':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'Behavioral':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'Coding':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      case 'HR':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      case 'Resume':
        return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';
      default:
        return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-xl bg-[#0c1220] border-l border-slate-800 shadow-2xl flex flex-col h-full text-slate-100 animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">Interview Q&A Memory</h2>
                <span className="text-xs px-2 py-0.5 rounded-full font-mono bg-indigo-500/20 text-indigo-300">
                  {history.length}
                </span>
              </div>
              <p className="text-xs text-slate-400">Maintained context for continuous follow-up questions</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {history.length > 0 && (
              <>
                <button
                  onClick={handleExport}
                  title="Export Markdown notes"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                >
                  <Download className="w-4 h-4" />
                </button>
                <button
                  onClick={onClearHistory}
                  title="Clear history"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800 transition"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content list */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {history.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-500">
              <MessageSquare className="w-12 h-12 stroke-[1.2] mb-3 text-slate-600" />
              <div className="text-sm font-medium text-slate-400">No questions recorded yet</div>
              <p className="text-xs text-slate-500 max-w-xs mt-1">
                Start the microphone or test a simulated question. Spoken questions and generated answers are saved here to preserve conversation context.
              </p>
            </div>
          ) : (
            history.map((turn, index) => (
              <div
                key={turn.id}
                className="p-4 rounded-xl bg-slate-900/70 border border-slate-800/90 space-y-3 hover:border-slate-700 transition"
              >
                {/* Meta header */}
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-slate-400 font-bold">#{index + 1}</span>
                    <span
                      className={`px-2 py-0.5 rounded-md font-semibold text-[11px] border ${getCategoryColor(
                        turn.category
                      )}`}
                    >
                      {turn.category}
                    </span>
                    <span className="text-slate-500 flex items-center gap-1 font-mono text-[10px]">
                      <Clock className="w-3 h-3" />
                      {new Date(turn.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onToggleStar(turn.id)}
                      className={`p-1 rounded hover:bg-slate-800 transition ${
                        turn.isFavorite ? 'text-amber-400' : 'text-slate-500 hover:text-slate-300'
                      }`}
                      title={turn.isFavorite ? 'Unstar' : 'Star answer'}
                    >
                      <Star className={`w-3.5 h-3.5 ${turn.isFavorite ? 'fill-amber-400' : ''}`} />
                    </button>
                    <button
                      onClick={() => handleCopy(turn.id, turn.answer)}
                      className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition"
                      title="Copy answer"
                    >
                      {copiedId === turn.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Question */}
                <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-1">
                    Interviewer Question
                  </div>
                  <div className="text-xs font-semibold text-slate-200 leading-snug">
                    "{turn.question}"
                  </div>
                </div>

                {/* Answer */}
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-wider text-indigo-400 mb-1">
                    AI Suggested Spoken Answer
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
                    {turn.answer}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
