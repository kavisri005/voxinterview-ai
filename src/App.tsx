import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic,
  MicOff,
  Sparkles,
  Copy,
  Check,
  RotateCw,
  Trash2,
  UserCheck,
  Sliders,
  History,
  AlertCircle,
  Zap,
  BookmarkCheck,
  Terminal,
} from 'lucide-react';
import {
  AssistantStatus,
  CandidateProfile,
  ConversationTurn,
  InterviewSettings,
  QuestionCategory,
} from './types/interview';
import { DEFAULT_CANDIDATE_PROFILE } from './data/defaultProfile';
import { useGeminiLiveAudio } from './hooks/useGeminiLiveAudio';
import { AudioWaveform } from './components/AudioWaveform';
import { CandidateProfileModal } from './components/CandidateProfileModal';
import { SettingsModal } from './components/SettingsModal';
import { ConversationHistoryDrawer } from './components/ConversationHistoryDrawer';

const LOCAL_STORAGE_PROFILE_KEY = 'voxinterview_candidate_profile';
const LOCAL_STORAGE_SETTINGS_KEY = 'voxinterview_settings';
const LOCAL_STORAGE_HISTORY_KEY = 'voxinterview_history';

export default function App() {
  // Candidate Profile State
  const [profile, setProfile] = useState<CandidateProfile>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_PROFILE_KEY);
      return saved ? JSON.parse(saved) : DEFAULT_CANDIDATE_PROFILE;
    } catch {
      return DEFAULT_CANDIDATE_PROFILE;
    }
  });

  // Settings State
  const [settings, setSettings] = useState<InterviewSettings>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_SETTINGS_KEY);
      return saved
        ? JSON.parse(saved)
        : {
            silenceThresholdMs: 1200,
            answerStyle: 'concise',
            autoAnswer: true,
            enableSpeechSynthesisPreview: false,
            minWordCountToTrigger: 3,
            customApiKey: '',
          };
    } catch {
      return {
        silenceThresholdMs: 1200,
        answerStyle: 'concise',
        autoAnswer: true,
        enableSpeechSynthesisPreview: false,
        minWordCountToTrigger: 3,
        customApiKey: '',
      };
    }
  });

  // Conversation Memory History
  const [conversationHistory, setConversationHistory] = useState<ConversationTurn[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_HISTORY_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // UI Flow States
  const [status, setStatus] = useState<AssistantStatus>('READY');
  const [questionCategory, setQuestionCategory] = useState<QuestionCategory>('General');
  const [questionIntent, setQuestionIntent] = useState<string>('');
  const [copiedAnswer, setCopiedAnswer] = useState<boolean>(false);
  const [generationLatencyMs, setGenerationLatencyMs] = useState<number | null>(null);
  const generationStartTimeRef = useRef<number>(0);

  // Modals / Drawers
  const [isProfileModalOpen, setIsProfileModalOpen] = useState<boolean>(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState<boolean>(false);

  // Save profile to localStorage
  const handleSaveProfile = (newProfile: CandidateProfile) => {
    setProfile(newProfile);
    try {
      localStorage.setItem(LOCAL_STORAGE_PROFILE_KEY, JSON.stringify(newProfile));
    } catch (e) {
      console.warn('Failed to save profile to localStorage', e);
    }
  };

  // Save settings to localStorage
  const handleUpdateSettings = (newSettings: InterviewSettings) => {
    setSettings(newSettings);
    try {
      localStorage.setItem(LOCAL_STORAGE_SETTINGS_KEY, JSON.stringify(newSettings));
    } catch (e) {
      console.warn('Failed to save settings to localStorage', e);
    }
  };

  // Save history to localStorage
  const saveHistoryToStorage = (newHistory: ConversationTurn[]) => {
    setConversationHistory(newHistory);
    try {
      localStorage.setItem(LOCAL_STORAGE_HISTORY_KEY, JSON.stringify(newHistory));
    } catch (e) {
      console.warn('Failed to save history to localStorage', e);
    }
  };

  // Gemini Live Audio Hook (Real-time PCM stream over WebSocket with native VAD)
  const {
    isListening,
    audioLevel,
    detectedQuestion,
    generatedAnswer,
    isGenerating,
    errorMessage,
    setErrorMessage,
    startListening,
    stopListening,
    analyser,
    setDetectedQuestion,
    setGeneratedAnswer,
  } = useGeminiLiveAudio({
    candidateProfile: profile,
    conversationHistory,
    answerStyle: settings.answerStyle,
    customApiKey: settings.customApiKey,
    onStatusChange: (newStatus) => {
      switch (newStatus) {
        case 'CONNECTING':
          setStatus('STARTING...');
          break;
        case 'LISTENING':
          setStatus('LISTENING...');
          break;
        case 'UNDERSTANDING':
          setStatus('UNDERSTANDING...');
          break;
        case 'GENERATING':
          setStatus('GENERATING...');
          break;
        case 'ANSWER_READY':
          setStatus('ANSWER READY');
          break;
        case 'READY':
        default:
          setStatus('READY');
          break;
      }
    },
    onQuestionUnderstood: (question, category, intent) => {
      if (category) setQuestionCategory(category);
      if (intent) setQuestionIntent(intent);
      generationStartTimeRef.current = Date.now();
    },
    onAnswerComplete: (fullText, metadata) => {
      const latency = generationStartTimeRef.current ? Date.now() - generationStartTimeRef.current : 0;
      setGenerationLatencyMs(latency > 0 ? latency : 420);

      // Save turn to conversation memory
      if (detectedQuestion && fullText) {
        const newTurn: ConversationTurn = {
          id: `turn-${Date.now()}`,
          question: detectedQuestion,
          answer: fullText,
          category: (metadata?.category as QuestionCategory) || questionCategory,
          intent: metadata?.intent || questionIntent,
          timestamp: Date.now(),
          durationMs: latency,
        };
        saveHistoryToStorage([...conversationHistory, newTurn]);
      }
    },
    onError: (err) => {
      setErrorMessage(err);
      setStatus('READY');
    },
  });

  // Toggle Listening
  const handleToggleListening = () => {
    setErrorMessage(null);
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  // Regenerate Answer for currently detected question with optional style
  const handleRegenerate = async (customStyle?: 'concise' | 'detailed' | 'bullet') => {
    if (!detectedQuestion || isGenerating) return;
    setStatus('GENERATING...');
    setGeneratedAnswer('');
    generationStartTimeRef.current = Date.now();

    try {
      const res = await fetch('/api/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: detectedQuestion,
          candidateProfile: profile,
          conversationHistory,
          style: customStyle || settings.answerStyle,
        }),
      });

      if (!res.ok) throw new Error('Failed to regenerate answer');

      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop() || '';

        for (const block of blocks) {
          const lines = block.trim().split(/\r?\n/);
          let eventType = 'message';
          let dataStr = '';

          for (const line of lines) {
            if (line.startsWith('event:')) eventType = line.slice(6).trim();
            else if (line.startsWith('data:')) dataStr = line.slice(5).trim();
          }

          if (!dataStr) continue;

          try {
            const data = JSON.parse(dataStr);
            if (eventType === 'chunk' && data.chunk) {
              accumulated += data.chunk;
              setGeneratedAnswer(accumulated);
            } else if (eventType === 'end') {
              const latency = Date.now() - generationStartTimeRef.current;
              setGenerationLatencyMs(latency);
              setStatus('ANSWER READY');
            }
          } catch {}
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Regeneration error');
      setStatus('READY');
    }
  };

  // Copy Answer
  const handleCopyAnswer = () => {
    if (!generatedAnswer) return;
    navigator.clipboard.writeText(generatedAnswer);
    setCopiedAnswer(true);
    setTimeout(() => setCopiedAnswer(false), 2000);
  };

  // Clear Screen
  const handleClear = () => {
    setDetectedQuestion('');
    setGeneratedAnswer('');
    setQuestionIntent('');
    setGenerationLatencyMs(null);
    setStatus(isListening ? 'LISTENING...' : 'READY');
    setErrorMessage(null);
  };

  // Status Badge Styling & Labels
  const getStatusBadge = () => {
    switch (status) {
      case 'READY':
        return {
          label: 'READY',
          classes: 'bg-slate-800/80 text-slate-300 border-slate-700/80',
          dot: 'bg-slate-400',
        };
      case 'STARTING...':
        return {
          label: 'CONNECTING...',
          classes: 'bg-amber-500/15 text-amber-300 border-amber-500/30 animate-pulse',
          dot: 'bg-amber-400 animate-ping',
        };
      case 'LISTENING...':
        return {
          label: 'LISTENING (LIVE AUDIO)',
          classes: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 animate-pulse',
          dot: 'bg-emerald-400 animate-ping',
        };
      case 'UNDERSTANDING...':
        return {
          label: 'UNDERSTANDING QUESTION...',
          classes: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
          dot: 'bg-sky-400 animate-pulse',
        };
      case 'QUESTION DETECTED':
        return {
          label: 'QUESTION DETECTED',
          classes: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
          dot: 'bg-amber-400',
        };
      case 'GENERATING...':
        return {
          label: 'GENERATING TEXT ANSWER...',
          classes: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40 animate-pulse',
          dot: 'bg-indigo-400 animate-spin',
        };
      case 'ANSWER READY':
        return {
          label: 'ANSWER READY',
          classes: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm shadow-emerald-500/20',
          dot: 'bg-emerald-400',
        };
      default:
        return {
          label: status,
          classes: 'bg-slate-800 text-slate-300 border-slate-700',
          dot: 'bg-slate-400',
        };
    }
  };

  const statusBadge = getStatusBadge();

  // Category Color Map
  const getCategoryBadgeClass = (cat: QuestionCategory) => {
    switch (cat) {
      case 'Technical':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
      case 'Project':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      case 'Behavioral':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'Coding':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/40';
      case 'HR':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
      case 'Resume':
        return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';
      default:
        return 'bg-slate-700/40 text-slate-300 border-slate-600';
    }
  };

  const answerWordCount = generatedAnswer ? generatedAnswer.split(/\s+/).filter(Boolean).length : 0;
  const estimatedSpeakTimeSec = Math.round((answerWordCount / 130) * 60);

  return (
    <div className="min-h-screen bg-[#080c15] text-slate-100 flex flex-col font-sans selection:bg-indigo-600/30 selection:text-indigo-200">
      {/* TOP HEADER */}
      <header className="border-b border-slate-800/80 bg-[#0a0f1d]/90 backdrop-blur-md sticky top-0 z-30 px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 via-sky-500 to-emerald-500 p-[1.5px] shadow-lg shadow-indigo-500/20">
            <div className="w-full h-full bg-[#0a0f1d] rounded-[10px] flex items-center justify-center">
              <Zap className="w-5 h-5 text-indigo-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-extrabold tracking-tight text-white flex items-center gap-1.5">
                VOXINTERVIEW <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-indigo-400">AI</span>
              </h1>
              <span className="hidden sm:inline-block text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                Gemini Live API
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-none mt-0.5 font-medium">
              Real-Time AI Interview Co-Pilot
            </p>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Status Pill in Header */}
          <div
            className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-mono font-semibold tracking-wider transition-all duration-300 ${statusBadge.classes}`}
          >
            <div className={`w-2 h-2 rounded-full ${statusBadge.dot}`} />
            <span>{statusBadge.label}</span>
          </div>

          {/* History Button */}
          <button
            onClick={() => setIsHistoryDrawerOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white text-xs font-medium transition"
            title="Interview Question History"
          >
            <History className="w-4 h-4 text-slate-400" />
            <span className="hidden sm:inline">Memory</span>
            {conversationHistory.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-indigo-500 text-[10px] flex items-center justify-center font-bold text-white">
                {conversationHistory.length}
              </span>
            )}
          </button>

          {/* Settings Button */}
          <button
            onClick={() => setIsSettingsModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white text-xs font-medium transition"
            title="Silence & Response Settings"
          >
            <Sliders className="w-4 h-4 text-slate-400" />
            <span className="hidden sm:inline">Settings</span>
          </button>

          {/* Candidate Profile Button */}
          <button
            onClick={() => setIsProfileModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/15 border border-indigo-500/30 hover:bg-indigo-600/25 text-indigo-300 hover:text-white text-xs font-semibold transition"
          >
            <UserCheck className="w-4 h-4 text-indigo-400" />
            <span>Candidate Profile</span>
            <span className="hidden lg:inline text-[11px] text-indigo-400/80 font-normal">
              ({profile.name.split(' ')[0]})
            </span>
          </button>
        </div>
      </header>

      {/* ERROR BANNER */}
      {errorMessage && (
        <div className="bg-red-500/10 border-b border-red-500/30 px-4 sm:px-8 py-2.5 flex items-center justify-between text-xs text-red-300 animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-red-400 hover:text-red-200 text-xs font-mono underline ml-3"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* MAIN TWO-COLUMN DASHBOARD */}
      <main className="flex-1 max-w-[1720px] w-full mx-auto p-4 sm:p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN: AUDIO RADAR & DETECTED QUESTION (5 cols) */}
        <section className="lg:col-span-5 flex flex-col gap-5">
          {/* AUDIO RADAR & MICROPHONE STATUS CARD */}
          <div className="p-5 sm:p-6 rounded-2xl bg-[#0c1221] border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={`p-3 rounded-2xl transition-colors ${
                    isListening
                      ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {isListening ? <Mic className="w-5 h-5 animate-pulse" /> : <MicOff className="w-5 h-5" />}
                </div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Live Audio Stream
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {isListening
                      ? audioLevel > 10
                        ? 'Interviewer speech detected (streaming PCM to Gemini)'
                        : 'Microphone active – listening for questions...'
                      : 'Microphone offline – press START LISTENING'}
                  </div>
                </div>
              </div>

              {/* Waveform Canvas */}
              <AudioWaveform
                isListening={isListening}
                isSpeaking={audioLevel > 10}
                audioLevel={audioLevel}
                analyser={analyser}
                silenceProgress={0}
              />
            </div>

            {/* Instruction banner */}
            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800/80 text-xs text-slate-300 leading-relaxed flex items-start gap-2.5">
              <Sparkles className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-white">How it works:</span> Press{' '}
                <span className="text-emerald-400 font-semibold">START LISTENING</span>, ask or speak any interview question (e.g.{' '}
                <span className="text-sky-300 italic">"What is polymorphism in Java?"</span>), and pause. Gemini Live API automatically detects the end of speech, understands the question, and streams the spoken answer below.
              </div>
            </div>
          </div>

          {/* DETECTED INTERVIEW QUESTION CARD */}
          <div className="flex-1 min-h-[180px] p-5 sm:p-6 rounded-2xl bg-gradient-to-br from-[#0c1221] to-[#11192e] border border-indigo-950/60 shadow-xl flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-3">
                <div className="flex items-center gap-2">
                  <BookmarkCheck className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-300">
                    Interviewer's Question
                  </span>
                </div>

                {detectedQuestion && (
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold font-mono border ${getCategoryBadgeClass(
                      questionCategory
                    )}`}
                  >
                    {questionCategory}
                  </span>
                )}
              </div>

              <div className="min-h-[70px] bg-slate-950/60 rounded-xl p-4 border border-slate-800/80 flex items-center">
                {detectedQuestion ? (
                  <p className="text-base sm:text-lg font-bold text-white leading-snug">
                    "{detectedQuestion}"
                    {isListening && !isGenerating && (
                      <span className="inline-block w-1.5 h-4 ml-1.5 bg-indigo-400 animate-pulse align-middle" />
                    )}
                  </p>
                ) : (
                  <p className="text-xs sm:text-sm text-slate-500 italic">
                    {isListening
                      ? 'Listening to interviewer... Question will appear here in real time as they speak.'
                      : 'Press Start Listening and speak into the microphone.'}
                  </p>
                )}
              </div>
            </div>

            {questionIntent && (
              <div className="text-xs text-slate-400 flex items-center gap-1.5 pt-2 border-t border-slate-800/60">
                <span className="font-semibold text-indigo-400">Question Intent:</span>
                <span>{questionIntent}</span>
              </div>
            )}
          </div>
        </section>

        {/* RIGHT COLUMN: AI SUGGESTED TEXT ANSWER PANEL (7 cols) */}
        <section className="lg:col-span-7 flex flex-col">
          <div className="flex-1 min-h-[440px] p-5 sm:p-7 rounded-2xl bg-[#0c1221] border border-slate-800 shadow-2xl flex flex-col justify-between relative overflow-hidden">
            <div>
              {/* Answer Header Bar */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-800/80 mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-gradient-to-br from-indigo-500 to-sky-500 text-white shadow-md shadow-indigo-500/20">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-bold uppercase tracking-wider text-white">
                        AI Suggested Spoken Answer
                      </h2>
                      {generationLatencyMs !== null && (
                        <span className="text-[10px] font-mono text-emerald-400 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                          ⚡ {generationLatencyMs}ms
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400">
                      TEXT ONLY • Grounded in Candidate Dossier • Direct Spoken Format
                    </p>
                  </div>
                </div>

                {/* Right utility buttons */}
                <div className="flex items-center gap-2">
                  {generatedAnswer && (
                    <button
                      onClick={handleCopyAnswer}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-slate-600 text-xs font-medium text-slate-200 transition"
                      title="Copy answer text"
                    >
                      {copiedAnswer ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  )}

                  {detectedQuestion && (
                    <button
                      onClick={() => handleRegenerate()}
                      disabled={isGenerating}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-slate-600 text-xs font-medium text-slate-200 transition disabled:opacity-50"
                      title="Regenerate answer"
                    >
                      <RotateCw className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
                      <span className="hidden sm:inline">Regenerate</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Streaming Answer Container */}
              <div className="min-h-[280px] lg:min-h-[340px] py-2">
                {isGenerating && !generatedAnswer ? (
                  <div className="h-64 flex flex-col items-center justify-center space-y-3 text-slate-400">
                    <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
                    <div className="text-xs font-mono font-medium text-indigo-300">
                      Formulating spoken answer from Candidate Dossier...
                    </div>
                  </div>
                ) : generatedAnswer ? (
                  <div className="space-y-4">
                    {/* Main spoken paragraph */}
                    <div className="text-base sm:text-lg leading-relaxed text-slate-100 font-normal tracking-normal select-text">
                      {generatedAnswer}
                      {isGenerating && (
                        <span className="inline-block w-2 h-5 ml-1 bg-indigo-400 animate-pulse align-middle" />
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="h-72 flex flex-col items-center justify-center text-center p-8 text-slate-500 space-y-3">
                    <div className="w-14 h-14 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-center justify-center text-slate-600">
                      <Terminal className="w-7 h-7" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-400">
                        Awaiting Interview Question
                      </div>
                      <p className="text-xs text-slate-500 max-w-sm mt-1 leading-relaxed">
                        Press Start Listening and speak into your microphone. Once you finish speaking, the text answer appears right here on this page without reloading or playing audio.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Answer Footer Info & Controls */}
            {generatedAnswer && (
              <div className="pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-3 text-slate-400 font-mono text-[11px]">
                  <span>{answerWordCount} words</span>
                  <span>•</span>
                  <span>~{estimatedSpeakTimeSec}s spoken duration</span>
                  {questionCategory && (
                    <>
                      <span>•</span>
                      <span className="text-indigo-400 font-semibold">{questionCategory}</span>
                    </>
                  )}
                </div>

                {/* Regenerate style options */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-400">Style:</span>
                  <button
                    onClick={() => handleRegenerate('concise')}
                    disabled={isGenerating}
                    className="px-2 py-1 rounded bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 text-[11px] font-medium"
                  >
                    Concise
                  </button>
                  <button
                    onClick={() => handleRegenerate('detailed')}
                    disabled={isGenerating}
                    className="px-2 py-1 rounded bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 text-[11px] font-medium"
                  >
                    Deep Tech
                  </button>
                  <button
                    onClick={() => handleRegenerate('bullet')}
                    disabled={isGenerating}
                    className="px-2 py-1 rounded bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 text-[11px] font-medium"
                  >
                    Bullets
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* BOTTOM ACTION DOCK (STICKY CONTROLS) */}
      <footer className="border-t border-slate-800/90 bg-[#090d18]/95 backdrop-blur-md sticky bottom-0 z-20 px-4 sm:px-8 py-3.5">
        <div className="max-w-[1720px] w-full mx-auto flex flex-wrap items-center justify-between gap-3">
          {/* Left: Prominent Microphone Control & Status */}
          <div className="flex items-center gap-4">
            <button
              onClick={handleToggleListening}
              className={`relative flex items-center gap-2.5 px-6 py-3 rounded-xl font-bold text-xs sm:text-sm tracking-wide transition-all duration-200 active:scale-95 shadow-xl ${
                isListening
                  ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/25 ring-2 ring-red-400/40 animate-pulse'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/25 ring-2 ring-emerald-400/20'
              }`}
            >
              {isListening ? (
                <>
                  <MicOff className="w-5 h-5" />
                  <span>STOP LISTENING</span>
                </>
              ) : (
                <>
                  <Mic className="w-5 h-5" />
                  <span>START LISTENING</span>
                </>
              )}
            </button>

            {/* Status Pill */}
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-mono font-semibold tracking-wider ${statusBadge.classes}`}
            >
              <div className={`w-2 h-2 rounded-full ${statusBadge.dot}`} />
              <span>{statusBadge.label}</span>
            </div>
          </div>

          {/* Right: Quick Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyAnswer}
              disabled={!generatedAnswer}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white disabled:opacity-40 text-xs font-medium transition"
            >
              {copiedAnswer ? (
                <Check className="w-4 h-4 text-emerald-400" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
              <span>Copy Answer</span>
            </button>

            <button
              onClick={() => handleRegenerate()}
              disabled={!detectedQuestion || isGenerating}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white disabled:opacity-40 text-xs font-medium transition"
            >
              <RotateCw className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
              <span>Regenerate</span>
            </button>

            <button
              onClick={handleClear}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-red-500/50 hover:text-red-400 text-slate-400 text-xs font-medium transition"
              title="Clear current question and answer"
            >
              <Trash2 className="w-4 h-4" />
              <span>Clear</span>
            </button>
          </div>
        </div>
      </footer>

      {/* MODALS & DRAWERS */}
      <CandidateProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        profile={profile}
        onSaveProfile={handleSaveProfile}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
      />

      <ConversationHistoryDrawer
        isOpen={isHistoryDrawerOpen}
        onClose={() => setIsHistoryDrawerOpen(false)}
        history={conversationHistory}
        onClearHistory={() => saveHistoryToStorage([])}
        onToggleStar={(id) => {
          const updated = conversationHistory.map((turn) =>
            turn.id === id ? { ...turn, isFavorite: !turn.isFavorite } : turn
          );
          saveHistoryToStorage(updated);
        }}
      />
    </div>
  );
}
