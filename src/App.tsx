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
  Clock,
  Terminal,
  BookmarkCheck,
  Activity,
  Layers,
  FlaskConical,
} from 'lucide-react';
import {
  AssistantStatus,
  CandidateProfile,
  ConversationTurn,
  InterviewSettings,
  QuestionCategory,
} from './types/interview';
import { DEFAULT_CANDIDATE_PROFILE } from './data/defaultProfile';
import { useRealtimeAudio } from './hooks/useRealtimeAudio';
import { AudioWaveform } from './components/AudioWaveform';
import { MicrophoneDiagnosticsPanel } from './components/MicrophoneDiagnosticsPanel';
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
            silenceThresholdMs: 1000,
            answerStyle: 'concise',
            autoAnswer: true,
            enableSpeechSynthesisPreview: false,
            minWordCountToTrigger: 3,
          };
    } catch {
      return {
        silenceThresholdMs: 1000,
        answerStyle: 'concise',
        autoAnswer: true,
        enableSpeechSynthesisPreview: false,
        minWordCountToTrigger: 3,
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

  // UI Flow & Pipeline States
  const [status, setStatus] = useState<AssistantStatus>('READY');
  
  // 3-Layer Real-Time Transcript Tracking
  const [liveTranscript, setLiveTranscript] = useState<string>('');
  const [liveInterim, setLiveInterim] = useState<string>('');
  const [liveFinalized, setLiveFinalized] = useState<string>('');

  const [detectedQuestion, setDetectedQuestion] = useState<string>('');
  const [questionCategory, setQuestionCategory] = useState<QuestionCategory>('General');
  const [questionIntent, setQuestionIntent] = useState<string>('');
  const [generatedAnswer, setGeneratedAnswer] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generationLatencyMs, setGenerationLatencyMs] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedAnswer, setCopiedAnswer] = useState<boolean>(false);
  const [typedQuestionInput, setTypedQuestionInput] = useState<string>('');
  const [isSimulatingSpeech, setIsSimulatingSpeech] = useState<boolean>(false);

  // Modals / Drawers
  const [isProfileModalOpen, setIsProfileModalOpen] = useState<boolean>(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState<boolean>(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const generationStartTimeRef = useRef<number>(0);
  const currentAnswerAccumulatorRef = useRef<string>('');
  const partialAnalysisDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // References for reliable question dispatch and duplicate prevention (Requirement 5)
  const lastDispatchedQuestionRef = useRef<string>('');
  const isGeneratingRef = useRef<boolean>(false);
  const logEventRef = useRef<(event: string, detail?: string) => void>(() => {});

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

  // Generate answer using real server-side Gemini streaming (SSE) (Requirements 5, 6, 7, 8)
  const generateAnswerForQuestion = useCallback(
    async (questionText: string, customStyle?: 'concise' | 'detailed' | 'bullet') => {
      const cleanQuestion = questionText.trim();
      if (!cleanQuestion) return;

      // Requirement 5: Prevent duplicate dispatch
      if (cleanQuestion === lastDispatchedQuestionRef.current && isGeneratingRef.current) {
        return;
      }
      lastDispatchedQuestionRef.current = cleanQuestion;
      isGeneratingRef.current = true;

      // Abort previous in-flight generation
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      setDetectedQuestion(cleanQuestion);
      setStatus('QUESTION DETECTED');

      // Requirement 6: Log explicit event
      logEventRef.current('[SENDING TO GEMINI]', `"${cleanQuestion}"`);

      setIsGenerating(true);
      setGeneratedAnswer('');
      currentAnswerAccumulatorRef.current = '';
      setErrorMessage(null);
      generationStartTimeRef.current = Date.now();

      // Format conversation turns for context memory
      const recentTurns = conversationHistory.slice(-4).flatMap((turn) => [
        { role: 'interviewer' as const, text: turn.question },
        { role: 'candidate' as const, text: turn.answer },
      ]);

      try {
        // Requirement 6: Log explicit event
        logEventRef.current('[/api/answer CONNECTED]', 'POST /api/answer streaming request initiated');
        setStatus('GENERATING...');

        // Requirement 7: Verify payload sent to POST /api/answer
        const response = await fetch('/api/answer', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            question: cleanQuestion,
            candidateProfile: profile,
            profile: profile,
            conversationHistory: recentTurns,
            preAnalysis: {
              category: questionCategory,
              intent: questionIntent,
            },
            style: customStyle || settings.answerStyle,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || `Server returned ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('Readable stream not supported by browser');
        }

        // Requirement 8: Robust SSE line parser
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let hasLoggedFirstChunk = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split(/\r?\n\r?\n/);
          buffer = blocks.pop() || '';

          for (const block of blocks) {
            const trimmedBlock = block.trim();
            if (!trimmedBlock) continue;

            const lines = trimmedBlock.split(/\r?\n/);
            let eventType = 'message';
            let dataStr = '';

            for (const line of lines) {
              if (line.startsWith('event:')) {
                eventType = line.slice(6).trim();
              } else if (line.startsWith('data:')) {
                const d = line.slice(5).trim();
                dataStr = dataStr ? dataStr + '\n' + d : d;
              }
            }

            if (!dataStr) continue;

            try {
              const eventData = JSON.parse(dataStr);

              if (eventType === 'meta') {
                if (eventData.category) setQuestionCategory(eventData.category);
                if (eventData.intent) setQuestionIntent(eventData.intent);
              } else if (eventType === 'chunk') {
                if (!hasLoggedFirstChunk) {
                  hasLoggedFirstChunk = true;
                  logEventRef.current('[GEMINI CHUNK RECEIVED]', eventData.chunk?.slice(0, 30));
                }
                currentAnswerAccumulatorRef.current += eventData.chunk;
                setGeneratedAnswer(currentAnswerAccumulatorRef.current);
              } else if (eventType === 'end') {
                const finalAnswer = eventData.fullAnswer || currentAnswerAccumulatorRef.current;
                setGeneratedAnswer(finalAnswer);
                if (eventData.category) setQuestionCategory(eventData.category);
                if (eventData.intent) setQuestionIntent(eventData.intent);

                const latency = Date.now() - generationStartTimeRef.current;
                setGenerationLatencyMs(latency);
                setStatus('ANSWER READY');

                // Requirement 6: Log explicit event
                logEventRef.current(
                  '[GEMINI ANSWER COMPLETE]',
                  `Generated ${finalAnswer.split(/\s+/).filter(Boolean).length} words in ${latency}ms`
                );

                // Save to conversation history memory for follow-up context
                const newTurn: ConversationTurn = {
                  id: `turn-${Date.now()}`,
                  question: cleanQuestion,
                  answer: finalAnswer,
                  category: (eventData.category as QuestionCategory) || questionCategory,
                  intent: eventData.intent || questionIntent,
                  timestamp: Date.now(),
                  durationMs: latency,
                };

                saveHistoryToStorage([...conversationHistory, newTurn]);
              } else if (eventType === 'error') {
                logEventRef.current('[PIPELINE ERROR]', eventData.message || 'Stream error occurred');
                throw new Error(eventData.message || 'Gemini stream error occurred');
              }
            } catch (pErr: any) {
              console.warn('Failed to parse SSE payload:', dataStr, pErr);
            }
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          return;
        }
        console.error('Answer generation error:', err);
        logEventRef.current('[PIPELINE ERROR]', err.message || String(err));
        setErrorMessage(
          err.message || 'Error communicating with Gemini reasoning engine. Please try again.'
        );
        setStatus('READY');
      } finally {
        setIsGenerating(false);
        isGeneratingRef.current = false;
      }
    },
    [profile, settings.answerStyle, conversationHistory, questionCategory, questionIntent]
  );

  // Hook for microphone & real-time speech recognition
  const {
    isListening,
    isSpeaking,
    hasMicPermission,
    audioLevel,
    speechSupported,
    silenceProgress,
    currentInterimTranscript,
    finalizedTranscript,
    currentUtterance,
    diagnostics,
    startListening,
    stopListening,
    simulateSpokenQuestion,
    analyser,
    logEvent,
  } = useRealtimeAudio({
    silenceThresholdMs: settings.silenceThresholdMs,
    minWords: settings.minWordCountToTrigger,
    onListeningStarted: () => {
      setStatus('LISTENING...');
    },
    onListeningStopped: () => {
      setStatus('READY');
    },
    onPartialTranscript: (data) => {
      setLiveTranscript(data.currentUtterance);
      setLiveInterim(data.currentInterimTranscript);
      setLiveFinalized(data.finalizedTranscript);

      if (data.currentUtterance.trim()) {
        setStatus((prev) => (prev === 'GENERATING...' || prev === 'ANSWER READY' ? prev : 'UNDERSTANDING...'));

        // Throttled / debounced analysis of partial question while speech continues
        if (partialAnalysisDebounceRef.current) {
          clearTimeout(partialAnalysisDebounceRef.current);
        }
        partialAnalysisDebounceRef.current = setTimeout(async () => {
          try {
            const res = await fetch('/api/analyze', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ question: data.cleanedUtterance || data.currentUtterance }),
            });
            if (res.ok) {
              const resData = await res.json();
              if (resData.category) setQuestionCategory(resData.category);
              if (resData.intent) setQuestionIntent(resData.intent);
            }
          } catch {
            // Ignore background partial errors
          }
        }, 300);
      }
    },
    onQuestionFinalized: (finalQuestion) => {
      setDetectedQuestion(finalQuestion);
      setStatus('QUESTION DETECTED');

      // Requirement 3: Automatically stream answer immediately without requiring any button click!
      if (settings.autoAnswer) {
        generateAnswerForQuestion(finalQuestion);
      }
    },
    onSpeechStateChange: (speaking) => {
      if (speaking) {
        setStatus((prev) => {
          if (prev === 'GENERATING...' || prev === 'ANSWER READY') return prev;
          return 'UNDERSTANDING...';
        });
      } else {
        setStatus((prev) => {
          // Do not clobber answer pipeline state!
          if (prev === 'QUESTION DETECTED' || prev === 'GENERATING...' || prev === 'ANSWER READY') {
            return prev;
          }
          return isListening ? 'LISTENING...' : 'READY';
        });
      }
    },
    onError: (err) => {
      setErrorMessage(err);
      setStatus('READY');
    },
  });

  // Keep logEventRef in sync with hook directly
  logEventRef.current = logEvent;

  // Toggle listening button (Requirements 2, 3, 4, 6)
  const handleToggleListening = () => {
    setErrorMessage(null);
    if (!speechSupported) {
      setErrorMessage(
        'Speech recognition is not supported in this browser. Please use Google Chrome or Microsoft Edge.'
      );
      return;
    }

    if (isListening) {
      // SECOND CLICK: Turn off microphone immediately (Requirement 3)
      stopListening();
      setStatus('READY');
    } else {
      // FIRST CLICK: Turn on microphone immediately (Requirement 3)
      startListening();
      setStatus('LISTENING...');
    }
  };

  // Copy Answer to clipboard
  const handleCopyAnswer = () => {
    if (!generatedAnswer) return;
    navigator.clipboard.writeText(generatedAnswer);
    setCopiedAnswer(true);
    setTimeout(() => setCopiedAnswer(false), 2000);
  };

  // Regenerate Answer with specified style
  const handleRegenerate = (style?: 'concise' | 'detailed' | 'bullet') => {
    if (!detectedQuestion) return;
    generateAnswerForQuestion(detectedQuestion, style);
  };

  // Clear live workspace
  const handleClear = () => {
    setLiveTranscript('');
    setLiveInterim('');
    setLiveFinalized('');
    setDetectedQuestion('');
    setGeneratedAnswer('');
    setQuestionIntent('');
    setGenerationLatencyMs(null);
    setStatus(isListening ? 'LISTENING...' : 'READY');
    setErrorMessage(null);
  };

  // Run simulated interviewer question (Test Mode)
  const handleTriggerSimulatedQuestion = (sampleQuestion: string) => {
    setErrorMessage(null);
    setIsSimulatingSpeech(true);
    setStatus('LISTENING...');

    simulateSpokenQuestion(sampleQuestion, (partial) => {
      setLiveTranscript(partial);
      setStatus('UNDERSTANDING...');
    });

    const expectedSpokenMs = sampleQuestion.split(' ').length * 160 + 200;
    setTimeout(() => {
      setIsSimulatingSpeech(false);
    }, expectedSpokenMs);
  };

  // Manual submission of typed question
  const handleManualSubmitQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!typedQuestionInput.trim()) return;
    const q = typedQuestionInput.trim();
    setDetectedQuestion(q);
    setLiveTranscript(q);
    setTypedQuestionInput('');
    setStatus('QUESTION DETECTED');
    generateAnswerForQuestion(q);
  };

  // Status Badge Styling & Labels
  const getStatusBadge = () => {
    // When microphone is not listening and no answer is generating / ready, reflect READY (Requirement 7)
    if (!isListening && (status === 'LISTENING...' || status === 'UNDERSTANDING...' || status === 'STARTING...')) {
      return {
        label: 'READY',
        classes: 'bg-slate-800/80 text-slate-300 border-slate-700/80',
        dot: 'bg-slate-400',
      };
    }

    switch (status) {
      case 'READY':
        return {
          label: 'READY',
          classes: 'bg-slate-800/80 text-slate-300 border-slate-700/80',
          dot: 'bg-slate-400',
        };
      case 'STARTING...':
        return {
          label: 'STARTING...',
          classes: 'bg-amber-500/15 text-amber-300 border-amber-500/30 animate-pulse',
          dot: 'bg-amber-400 animate-ping',
        };
      case 'LISTENING...':
        return {
          label: 'LISTENING...',
          classes: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 animate-pulse',
          dot: 'bg-emerald-400 animate-ping',
        };
      case 'UNDERSTANDING...':
        return {
          label: 'UNDERSTANDING...',
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
          label: 'GENERATING ANSWER...',
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

  // Active transcript values connecting hook & App state directly to UI (Requirement 5)
  const displayUtterance = currentUtterance || liveTranscript;
  const displayFinalized = finalizedTranscript || liveFinalized;
  const displayInterim = currentInterimTranscript || liveInterim;

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
            <div className="flex items-center gap-2.5">
              <h1 className="text-base sm:text-lg font-extrabold tracking-tight text-white flex items-center gap-1.5">
                VOXINTERVIEW <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-indigo-400">AI</span>
              </h1>
              <span className="hidden sm:inline-block text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-semibold">
                Real-Time Co-Pilot
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-none mt-0.5 font-medium">
              Real-Time Interview Question Analysis & Answer Generation
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
        {/* LEFT COLUMN: AUDIO, TRANSCRIPTION & QUESTION DETECTION (5 cols) */}
        <section className="lg:col-span-5 flex flex-col gap-5">
          {/* AUDIO RADAR & MICROPHONE STATUS CARD */}
          <div className="p-4 sm:p-5 rounded-2xl bg-[#0c1221] border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className={`p-2 rounded-xl transition-colors ${
                    isListening
                      ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {isListening ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                </div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Audio Stream & VAD Radar
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {isListening
                      ? isSpeaking
                        ? 'Speech detected – live audio incoming'
                        : `Microphone active – (${settings.silenceThresholdMs}ms silence trigger)`
                      : 'Microphone offline – click START LISTENING'}
                  </div>
                </div>
              </div>

              {/* Waveform Canvas */}
              <AudioWaveform
                isListening={isListening || isSimulatingSpeech}
                isSpeaking={isSpeaking}
                audioLevel={audioLevel}
                analyser={analyser}
                silenceProgress={silenceProgress}
              />
            </div>

            {/* Silence countdown indicator bar when speech pauses */}
            {isListening && silenceProgress > 0 && silenceProgress < 1 && (
              <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-medium">
                  <Clock className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                  Speaker paused... detecting question end
                </span>
                <span className="font-mono font-bold text-amber-400">
                  {Math.round((1 - silenceProgress) * (settings.silenceThresholdMs / 1000) * 10) / 10}s
                </span>
              </div>
            )}
          </div>

          {/* REAL-TIME MICROPHONE & SPEECH ENGINE DIAGNOSTICS */}
          <MicrophoneDiagnosticsPanel
            diagnostics={diagnostics}
            speechSupported={speechSupported}
            hasMicPermission={hasMicPermission}
            audioLevel={audioLevel}
          />

          {/* LIVE STREAMING TRANSCRIPT PANEL */}
          <div className="flex-1 min-h-[200px] p-5 rounded-2xl bg-[#0c1221] border border-slate-800 shadow-xl flex flex-col justify-between relative overflow-hidden">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-3">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      isListening
                        ? 'bg-emerald-400 animate-ping'
                        : 'bg-slate-500'
                    }`}
                  />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Live Spoken Transcript
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-slate-500">
                    {displayUtterance ? `${displayUtterance.split(/\s+/).filter(Boolean).length} words` : 'Awaiting speech'}
                  </span>
                </div>
              </div>

              {/* Incremental transcript body */}
              <div className="min-h-[100px] text-sm text-slate-200 leading-relaxed font-normal">
                {displayUtterance ? (
                  <div className="space-y-2 animate-in fade-in duration-75">
                    <p className="text-base text-slate-100 font-medium leading-relaxed">
                      {displayFinalized ? <span>{displayFinalized} </span> : null}
                      {displayInterim ? (
                        <span className="text-sky-300 font-semibold underline decoration-sky-500/40 decoration-wavy">
                          {displayInterim}
                        </span>
                      ) : null}
                      {!displayFinalized && !displayInterim ? (
                        <span className="text-slate-100">{displayUtterance}</span>
                      ) : null}
                      <span className="inline-block w-2 h-4 ml-1.5 bg-sky-400 animate-pulse align-middle" />
                    </p>
                  </div>
                ) : (
                  <p className="text-slate-500 italic text-xs leading-relaxed">
                    {isListening
                      ? 'The interviewer can speak now. Partial words will stream here continuously while they talk...'
                      : 'Microphone is currently off. Click "Start Listening" below or select a test scenario.'}
                  </p>
                )}
              </div>
            </div>

            {/* Real-time partial context understanding preview */}
            <div className="mt-3 pt-3 border-t border-slate-800/60 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                <Activity className="w-3.5 h-3.5 text-sky-400" />
                <span>Partial Analysis:</span>
                <span className="font-semibold text-slate-200">
                  {questionCategory || 'Analyzing sentence...'}
                </span>
              </div>
              {displayInterim && (
                <span className="text-[10px] font-mono text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/20">
                  Transcribing in-flight speech
                </span>
              )}
            </div>
          </div>

          {/* DETECTED INTERVIEW QUESTION CARD */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-[#0c1221] to-[#11192e] border border-indigo-950/60 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookmarkCheck className="w-4 h-4 text-indigo-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-300">
                  Detected Final Question
                </span>
              </div>

              {detectedQuestion && (
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold font-mono border ${getCategoryBadgeClass(
                      questionCategory
                    )}`}
                  >
                    {questionCategory}
                  </span>
                </div>
              )}
            </div>

            <div className="min-h-[50px] bg-slate-950/60 rounded-xl p-3.5 border border-slate-800/80">
              {detectedQuestion ? (
                <p className="text-sm sm:text-base font-semibold text-white leading-snug">
                  "{detectedQuestion}"
                </p>
              ) : (
                <p className="text-xs text-slate-500 italic">
                  Finalized question will appear here as soon as the interviewer pauses.
                </p>
              )}
            </div>

            {questionIntent && (
              <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                <span className="font-semibold text-indigo-400">Identified Intent:</span>
                <span>{questionIntent}</span>
              </div>
            )}
          </div>

          {/* TEST MODE: SPOKEN SPEECH SIMULATOR & CUSTOM PROMPT */}
          <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5 uppercase tracking-wider">
                <FlaskConical className="w-3.5 h-3.5 text-amber-400" />
                TEST MODE: Spoken Speech Simulator
              </span>
              <span className="text-[10px] text-amber-400/80 font-mono bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20">
                Real Gemini Streaming
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
              {/* Acceptance Test Question from Requirement 12 */}
              <button
                onClick={() => handleTriggerSimulatedQuestion('What is polymorphism in Java?')}
                className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-800/80 transition text-left group"
              >
                <div className="text-xs font-semibold text-white group-hover:text-indigo-300 transition">
                  "What is polymorphism in Java?"
                </div>
                <div className="text-[10px] text-blue-400 font-mono mt-0.5">Core Concept (Requirement 12)</div>
              </button>

              <button
                onClick={() =>
                  handleTriggerSimulatedQuestion(
                    'Can you explain your experience with your latest project and what technologies you used?'
                  )
                }
                className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-800/80 transition text-left group"
              >
                <div className="text-xs font-medium text-slate-200 group-hover:text-indigo-300 transition">
                  "Explain your latest project..."
                </div>
                <div className="text-[10px] text-emerald-400 font-mono mt-0.5">Project (Uses Profile Dossier)</div>
              </button>

              <button
                onClick={() =>
                  handleTriggerSimulatedQuestion('What technologies did you use in it and why?')
                }
                className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-800/80 transition text-left group"
              >
                <div className="text-xs font-medium text-slate-200 group-hover:text-indigo-300 transition">
                  "What technologies in it and why?"
                </div>
                <div className="text-[10px] text-sky-400 font-mono mt-0.5">Follow-up Context Continuity</div>
              </button>

              <button
                onClick={() =>
                  handleTriggerSimulatedQuestion(
                    'Tell me about a time you had a technical disagreement with a team member.'
                  )
                }
                className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-800/80 transition text-left group"
              >
                <div className="text-xs font-medium text-slate-200 group-hover:text-indigo-300 transition">
                  "Technical disagreement with teammate..."
                </div>
                <div className="text-[10px] text-amber-400 font-mono mt-0.5">Behavioral STAR Framework</div>
              </button>
            </div>

            {/* Custom typed question input */}
            <form onSubmit={handleManualSubmitQuestion} className="flex gap-2 pt-1">
              <input
                type="text"
                value={typedQuestionInput}
                onChange={(e) => setTypedQuestionInput(e.target.value)}
                placeholder="Or type/paste custom interviewer question..."
                className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="submit"
                disabled={!typedQuestionInput.trim()}
                className="px-3.5 py-1.5 bg-slate-800 hover:bg-indigo-600 disabled:opacity-40 text-xs font-semibold text-slate-200 rounded-lg transition"
              >
                Ask
              </button>
            </form>
          </div>
        </section>

        {/* RIGHT COLUMN: AI SUGGESTED ANSWER PANEL (7 cols) */}
        <section className="lg:col-span-7 flex flex-col">
          <div className="flex-1 p-5 sm:p-7 rounded-2xl bg-[#0c1221] border border-slate-800 shadow-2xl flex flex-col justify-between relative overflow-hidden">
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
                      Real Gemini streaming response tailored to your profile
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
              <div className="min-h-[280px] lg:min-h-[360px] py-2">
                {isGenerating && !generatedAnswer ? (
                  <div className="h-64 flex flex-col items-center justify-center space-y-3 text-slate-400">
                    <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
                    <div className="text-xs font-mono font-medium text-indigo-300">
                      Streaming Gemini answer from Candidate Dossier...
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
                        Awaiting Spoken Interview Question
                      </div>
                      <p className="text-xs text-slate-500 max-w-sm mt-1 leading-relaxed">
                        Start listening with the microphone or pick a test scenario. As soon as the question finishes, Gemini will stream a concise, natural first-person answer here.
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

            {/* Mobile/Desktop Status Pill */}
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
