import { useState, useRef, useCallback, useEffect } from 'react';
import { downsampleToPcm16, arrayBufferToBase64 } from '../utils/audioPcm';
import { CandidateProfile, ConversationTurn, QuestionCategory } from '../types/interview';

export interface UseGeminiLiveAudioOptions {
  candidateProfile: CandidateProfile;
  conversationHistory: ConversationTurn[];
  answerStyle: 'concise' | 'detailed' | 'bullet';
  customApiKey?: string;
  onQuestionUnderstood?: (question: string, category?: QuestionCategory, intent?: string) => void;
  onAnswerChunk?: (chunk: string, fullText: string) => void;
  onAnswerComplete?: (fullText: string, metadata?: { category?: string; intent?: string }) => void;
  onError?: (error: string) => void;
  onStatusChange?: (status: 'READY' | 'CONNECTING' | 'LISTENING' | 'UNDERSTANDING' | 'GENERATING' | 'ANSWER_READY') => void;
}

export function useGeminiLiveAudio(options: UseGeminiLiveAudioOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [isListening, setIsListening] = useState<boolean>(false);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [detectedQuestion, setDetectedQuestion] = useState<string>('');
  const [generatedAnswer, setGeneratedAnswer] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Audio nodes and refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // WebSocket and buffer refs
  const wsRef = useRef<WebSocket | null>(null);
  const isWsReadyRef = useRef<boolean>(false);
  const isRecordingRef = useRef<boolean>(false);
  const isGeneratingRef = useRef<boolean>(false);
  const answerAbortControllerRef = useRef<AbortController | null>(null);

  // Real-time live transcript accumulators
  const finalizedSegmentsRef = useRef<string>('');
  const currentInterimRef = useRef<string>('');
  const questionAccumulatorRef = useRef<string>('');
  const answerAccumulatorRef = useRef<string>('');
  const vadFinalizedRef = useRef<boolean>(false);

  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSpeechTimeRef = useRef<number>(0);

  // Builds prompt string representing the candidate's actual dossier
  const buildSystemInstruction = useCallback(() => {
    const profile = optionsRef.current.candidateProfile;
    const history = optionsRef.current.conversationHistory;

    let dossier = 'No specific profile provided. Answer as an articulate, competent software engineer.';
    if (profile && (profile.name || profile.technicalSkills?.length || profile.projects?.length)) {
      dossier = `
CANDIDATE DOSSIER (Ground truth - NEVER invent experiences, skills, or projects):
- Name: ${profile.name || 'Candidate'}
- Target Role: ${profile.targetRole || 'Software Engineer'}
- Education: ${profile.degree || 'Degree'} at ${profile.college || 'University'} (${profile.gradYear || ''})
- Summary: ${profile.summary || 'N/A'}
- Core Skills: ${(profile.technicalSkills || []).join(', ')}
- Languages: ${(profile.programmingLanguages || []).join(', ')}
- Frameworks & Tools: ${(profile.frameworks || []).concat(profile.toolsDatabases || []).join(', ')}
- Projects:
${(profile.projects || [])
  .map(
    (p, idx) =>
      `  [Project ${idx + 1}] "${p.title}" (Tech: ${p.techStack}): ${p.description} ${p.highlights ? `Key Achievements: ${p.highlights}` : ''}`
  )
  .join('\n')}
- Experience:
${(profile.experience || []).map((e) => `  - ${e.role} at ${e.company} (${e.period}): ${e.description}`).join('\n')}
- Certifications: ${(profile.certifications || []).join(', ')}
- Additional Info: ${profile.otherInfo || 'N/A'}
`;
    }

    const recentHistoryText = history.slice(-4).map(
      (turn) => `Interviewer: "${turn.question}"\nCandidate: "${turn.answer}"`
    ).join('\n\n');

    return `You are a real-time interview co-pilot whisperer for a candidate sitting in an active live interview.
Your role:
1. UNDERSTAND THE INTERVIEWER'S SPOKEN QUESTION accurately from the audio stream.
2. Produce a natural, confident, direct first-person spoken answer ("I", "in my experience", "in my project...") that the candidate can read aloud immediately.
3. STRICT TRUTH: NEVER invent companies, degrees, metrics, or technologies not in the dossier. Draw strictly from their real projects and skills.
4. LENGTH & FORMAT: Keep the spoken answer between 2 to 4 punchy sentences (around 50-80 words). Do not include stage directions like "(laughs)". Text only, no markdown headers.
5. CONVERSATION CONTEXT: If the interviewer asks follow-ups, maintain context seamlessly.

${dossier}

${recentHistoryText ? `RECENT CONVERSATION HISTORY:\n${recentHistoryText}` : ''}`;
  }, []);

  // Streams first-person answer for a finalized question via SSE (/api/answer)
  const streamAnswerForQuestion = useCallback(async (question: string) => {
    const cleanQ = question.trim();
    if (!cleanQ || cleanQ.split(/\s+/).length < 2) return;
    if (isGeneratingRef.current) return;

    isGeneratingRef.current = true;
    setIsGenerating(true);
    optionsRef.current.onStatusChange?.('GENERATING');
    setGeneratedAnswer('');
    answerAccumulatorRef.current = '';

    if (answerAbortControllerRef.current) {
      answerAbortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    answerAbortControllerRef.current = abortController;

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (optionsRef.current.customApiKey?.trim()) {
        headers['x-gemini-key'] = optionsRef.current.customApiKey.trim();
      }

      const response = await fetch('/api/answer', {
        method: 'POST',
        headers,
        signal: abortController.signal,
        body: JSON.stringify({
          question: cleanQ,
          candidateProfile: optionsRef.current.candidateProfile,
          conversationHistory: optionsRef.current.conversationHistory,
          style: optionsRef.current.answerStyle,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Answer service returned ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('ReadableStream not supported');

      const decoder = new TextDecoder('utf-8');
      let streamBuffer = '';
      let accumulated = '';
      let metadata: any = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        streamBuffer += decoder.decode(value, { stream: true });
        const blocks = streamBuffer.split(/\r?\n\r?\n/);
        streamBuffer = blocks.pop() || '';

        for (const block of blocks) {
          const trimmed = block.trim();
          if (!trimmed) continue;

          const lines = trimmed.split(/\r?\n/);
          let eventType = 'message';
          let dataStr = '';

          for (const line of lines) {
            if (line.startsWith('event:')) eventType = line.slice(6).trim();
            else if (line.startsWith('data:')) dataStr = line.slice(5).trim();
          }

          if (!dataStr) continue;

          try {
            const data = JSON.parse(dataStr);
            if (eventType === 'meta') {
              metadata = data;
            } else if (eventType === 'chunk' && data.chunk) {
              accumulated += data.chunk;
              setGeneratedAnswer(accumulated);
              optionsRef.current.onAnswerChunk?.(data.chunk, accumulated);
            } else if (eventType === 'end') {
              const finalAns = data.fullAnswer || accumulated;
              setGeneratedAnswer(finalAns);
              optionsRef.current.onAnswerComplete?.(finalAns, {
                category: data.category || metadata?.category,
                intent: data.intent || metadata?.intent,
              });
              optionsRef.current.onStatusChange?.('ANSWER_READY');
              vadFinalizedRef.current = true;
            } else if (eventType === 'error') {
              throw new Error(data.message || 'Stream error');
            }
          } catch (e: any) {
            console.warn('Failed to parse SSE line:', e);
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Answer stream error:', err);
        optionsRef.current.onError?.(err.message || 'Failed to stream answer');
        optionsRef.current.onStatusChange?.('READY');
      }
    } finally {
      isGeneratingRef.current = false;
      setIsGenerating(false);
    }
  }, []);

  // Handles turn completion detected by Gemini VAD or silence detector
  const handleVadTurnComplete = useCallback(async () => {
    // 1. Finalize the complete transcript
    const finalQuestion = (
      finalizedSegmentsRef.current + ' ' + currentInterimRef.current
    ).trim() || questionAccumulatorRef.current.trim();

    if (!finalQuestion || finalQuestion.split(/\s+/).length < 2) return;

    // 2. Show the complete question
    setDetectedQuestion(finalQuestion);
    optionsRef.current.onQuestionUnderstood?.(finalQuestion);

    // If the Live WebSocket modelTurn already streamed an answer, complete it
    if (answerAccumulatorRef.current.trim()) {
      setIsGenerating(false);
      isGeneratingRef.current = false;
      const finalAnswer = answerAccumulatorRef.current.trim();
      optionsRef.current.onAnswerComplete?.(finalAnswer);
      optionsRef.current.onStatusChange?.('ANSWER_READY');
      vadFinalizedRef.current = true;
      finalizedSegmentsRef.current = '';
      currentInterimRef.current = '';
      answerAccumulatorRef.current = '';
      return;
    }

    // 3. Send the question to Gemini
    // 4. Generate a concise first-person interview answer
    // 5. Stream the answer into the "AI Suggested Answer" section
    await streamAnswerForQuestion(finalQuestion);
  }, [streamAnswerForQuestion]);

  // Connects WebSocket to Gemini Live API
  const connectGeminiLiveWebSocket = useCallback(async () => {
    isWsReadyRef.current = false;
    answerAccumulatorRef.current = '';
    questionAccumulatorRef.current = '';
    finalizedSegmentsRef.current = '';
    currentInterimRef.current = '';
    vadFinalizedRef.current = false;

    let wsUrl = '';
    let token = '';

    // 1. Try to get short-lived ephemeral token from backend (minimal request, no profile/audio in body)
    try {
      const headers: Record<string, string> = {};
      if (optionsRef.current.customApiKey?.trim()) {
        headers['x-gemini-key'] = optionsRef.current.customApiKey.trim();
      }
      const res = await fetch('/api/live-token', {
        method: 'POST',
        headers,
      });
      if (res.ok) {
        const data = await res.json();
        if (data.token) {
          token = data.token;
          wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(token)}`;
        }
      }
    } catch (e) {
      console.warn('Backend live-token endpoint unavailable, checking fallback', e);
    }

    // 2. If no ephemeral token, check custom key from Settings
    if (!wsUrl && optionsRef.current.customApiKey?.trim()) {
      const key = optionsRef.current.customApiKey.trim();
      wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(key)}`;
    }

    if (!wsUrl) {
      console.info('Direct WebSocket token not available; please ensure GEMINI_API_KEY is configured.');
      optionsRef.current.onError?.('Gemini Live session requires an API key. Please check Settings or server environment.');
      return;
    }

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('Gemini Live API WebSocket connected');
        // Send initial setup message with TEXT response modality and inputAudioTranscription enabled
        const setupMessage = {
          setup: {
            model: 'models/gemini-2.0-flash-exp',
            generationConfig: {
              responseModalities: ['TEXT'],
              temperature: 0.6,
              topP: 0.9,
            },
            inputAudioTranscription: {},
            systemInstruction: {
              parts: [{ text: buildSystemInstruction() }],
            },
          },
        };
        ws.send(JSON.stringify(setupMessage));
      };

      ws.onmessage = (event) => {
        try {
          const raw = typeof event.data === 'string' ? event.data : '';
          if (!raw) return;
          const msg = JSON.parse(raw);

          // 1. Setup complete
          if (msg.setupComplete || msg.setup_complete) {
            isWsReadyRef.current = true;
            optionsRef.current.onStatusChange?.('LISTENING');
            return;
          }

          const serverContent = msg.serverContent || msg.server_content;
          if (!serverContent) return;

          // 2. LIVE INPUT TRANSCRIPTION WHILE INTERVIEWER IS SPEAKING
          const interim =
            serverContent.interimInputTranscription ||
            serverContent.interim_input_transcription;

          const inputTx =
            serverContent.inputTranscription ||
            serverContent.input_transcription;

          let transcriptUpdated = false;

          // If starting a new utterance after previous answer was finalized, clear old buffers
          if (vadFinalizedRef.current && (interim?.text || inputTx?.text)) {
            vadFinalizedRef.current = false;
            finalizedSegmentsRef.current = '';
            currentInterimRef.current = '';
            answerAccumulatorRef.current = '';
            setGeneratedAnswer('');
          }

          // In-progress words updated in real time as the interviewer speaks
          if (interim && typeof interim.text === 'string' && interim.text.trim()) {
            currentInterimRef.current = interim.text.trim();
            transcriptUpdated = true;
          }

          // Finalized speech segment
          if (inputTx && typeof inputTx.text === 'string' && inputTx.text.trim()) {
            if (inputTx.finished) {
              finalizedSegmentsRef.current = (
                finalizedSegmentsRef.current + ' ' + inputTx.text.trim()
              ).trim();
              currentInterimRef.current = '';
            } else {
              currentInterimRef.current = inputTx.text.trim();
            }
            transcriptUpdated = true;
          }

          // Continuously show recognized speech as LIVE TEXT in Interviewer's Question
          if (transcriptUpdated) {
            const liveQuestion = (
              finalizedSegmentsRef.current + ' ' + currentInterimRef.current
            ).trim();

            if (liveQuestion) {
              questionAccumulatorRef.current = liveQuestion;
              setDetectedQuestion(liveQuestion);
              optionsRef.current.onQuestionUnderstood?.(liveQuestion);
              optionsRef.current.onStatusChange?.('UNDERSTANDING');
            }
          }

          // 3. Model text answer stream from WebSocket if emitted
          const modelTurn = serverContent.modelTurn || serverContent.model_turn;
          if (modelTurn?.parts) {
            optionsRef.current.onStatusChange?.('GENERATING');
            setIsGenerating(true);
            for (const part of modelTurn.parts) {
              if (part.text) {
                answerAccumulatorRef.current += part.text;
                setGeneratedAnswer(answerAccumulatorRef.current);
                optionsRef.current.onAnswerChunk?.(part.text, answerAccumulatorRef.current);
              }
            }
          }

          // 4. VAD Turn Complete (Interviewer finished speaking)
          const turnComplete = serverContent.turnComplete || serverContent.turn_complete;
          if (turnComplete) {
            handleVadTurnComplete();
          }

          // 5. Interruption signal
          if (serverContent.interrupted) {
            console.log('Interviewer interrupted / resumed speaking');
            optionsRef.current.onStatusChange?.('UNDERSTANDING');
            answerAccumulatorRef.current = '';
            finalizedSegmentsRef.current = '';
            currentInterimRef.current = '';
          }
        } catch (parseErr) {
          console.warn('Error parsing Live API WebSocket packet:', parseErr);
        }
      };

      ws.onerror = (err) => {
        console.warn('Gemini Live WebSocket notice:', err);
      };

      ws.onclose = () => {
        console.log('Gemini Live WebSocket closed');
        isWsReadyRef.current = false;
      };
    } catch (e) {
      console.warn('Failed to establish WebSocket to Gemini Live API:', e);
    }
  }, [buildSystemInstruction, handleVadTurnComplete]);

  // Start recording
  const startListening = useCallback(async () => {
    setErrorMessage(null);
    setDetectedQuestion('');
    setGeneratedAnswer('');
    finalizedSegmentsRef.current = '';
    currentInterimRef.current = '';
    questionAccumulatorRef.current = '';
    answerAccumulatorRef.current = '';
    vadFinalizedRef.current = false;
    isRecordingRef.current = true;
    setIsListening(true);
    optionsRef.current.onStatusChange?.('CONNECTING');

    // 1. Establish Gemini Live WebSocket connection
    await connectGeminiLiveWebSocket();

    // 2. Access mobile / desktop microphone
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      mediaStreamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }
      audioContextRef.current = audioCtx;

      // Analyser for waveform radar
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      // Level meter update loop
      const levelBuffer = new Uint8Array(analyser.frequencyBinCount);
      const updateLevel = () => {
        if (!isRecordingRef.current || !analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(levelBuffer as any);
        let sum = 0;
        for (let i = 0; i < levelBuffer.length; i++) sum += levelBuffer[i];
        const avg = sum / levelBuffer.length;
        const normalized = Math.min(Math.round((avg / 128) * 100), 100);
        setAudioLevel(normalized);

        // Track voice activity timing for turn detection
        if (normalized > 12) {
          lastSpeechTimeRef.current = Date.now();
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }
        } else if (lastSpeechTimeRef.current > 0 && Date.now() - lastSpeechTimeRef.current > 1200) {
          // 1.2s silence detected after speech
          const hasUnfinishedQuestion =
            (finalizedSegmentsRef.current || currentInterimRef.current || questionAccumulatorRef.current) &&
            !vadFinalizedRef.current &&
            !isGeneratingRef.current;

          if (!silenceTimerRef.current && hasUnfinishedQuestion) {
            silenceTimerRef.current = setTimeout(() => {
              if (isRecordingRef.current && !vadFinalizedRef.current && !isGeneratingRef.current) {
                handleVadTurnComplete();
              }
            }, 200);
          }
        }

        animFrameRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();

      // Audio processor for PCM stream
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      source.connect(processor);
      processor.connect(audioCtx.destination);

      processor.onaudioprocess = (e) => {
        if (!isRecordingRef.current) return;
        const inputData = e.inputBuffer.getChannelData(0);

        // Convert to 16kHz 16-bit mono PCM
        const pcm16 = downsampleToPcm16(inputData, audioCtx.sampleRate, 16000);

        // Send real-time audio chunk directly over WebSocket
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && isWsReadyRef.current) {
          const base64Data = arrayBufferToBase64(pcm16);
          const chunkMsg = {
            realtimeInput: {
              mediaChunks: [
                {
                  mimeType: 'audio/pcm;rate=16000',
                  data: base64Data,
                },
              ],
            },
          };
          wsRef.current.send(JSON.stringify(chunkMsg));
        }
      };

      optionsRef.current.onStatusChange?.('LISTENING');
    } catch (err: any) {
      console.error('Microphone error:', err);
      setIsListening(false);
      isRecordingRef.current = false;
      const msg =
        err.name === 'NotAllowedError'
          ? 'Microphone permission denied. Please grant access in your browser.'
          : err.name === 'NotFoundError'
          ? 'No microphone found on this device.'
          : `Microphone error: ${err.message || err}`;
      setErrorMessage(msg);
      optionsRef.current.onError?.(msg);
      optionsRef.current.onStatusChange?.('READY');
    }
  }, [connectGeminiLiveWebSocket, handleVadTurnComplete]);

  // Stop recording
  const stopListening = useCallback(() => {
    isRecordingRef.current = false;
    setIsListening(false);
    setAudioLevel(0);

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    if (answerAbortControllerRef.current) {
      answerAbortControllerRef.current.abort();
      answerAbortControllerRef.current = null;
    }

    // Flush audio stream to Gemini Live API
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(
          JSON.stringify({
            realtimeInput: {
              audioStreamEnd: true,
            },
          })
        );
      } catch {}
    }

    // Cleanup tracks & context
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    // If an unfinalized question was spoken, finalize and generate answer
    const currentQuestion = (
      finalizedSegmentsRef.current + ' ' + currentInterimRef.current
    ).trim() || questionAccumulatorRef.current.trim();

    if (currentQuestion && !vadFinalizedRef.current && !answerAccumulatorRef.current) {
      handleVadTurnComplete();
    } else {
      optionsRef.current.onStatusChange?.('READY');
    }
  }, [handleVadTurnComplete]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isRecordingRef.current = false;
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
      if (answerAbortControllerRef.current) {
        answerAbortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    isListening,
    audioLevel,
    detectedQuestion,
    generatedAnswer,
    isGenerating,
    errorMessage,
    setErrorMessage,
    startListening,
    stopListening,
    analyser: analyserRef.current,
    setDetectedQuestion,
    setGeneratedAnswer,
  };
}
