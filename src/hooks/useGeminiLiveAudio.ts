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
  const chunksSentCountRef = useRef<number>(0);

  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSpeechTimeRef = useRef<number>(0);

  // Latency timestamps for all 6 required stages
  const lastMicCaptureTimeRef = useRef<number>(0);
  const lastMicLogTimeRef = useRef<number>(0);
  const lastTranscriptChunkTimeRef = useRef<number>(0);
  const turnCompleteTimeRef = useRef<number>(0);
  const answerGenStartTimeRef = useRef<number>(0);
  const firstAnswerTokenTimeRef = useRef<number>(0);
  const answerCompleteTimeRef = useRef<number>(0);

  // Builds prompt for Gemini Live API audio understanding & context
  const buildSystemInstruction = useCallback(() => {
    const profile = optionsRef.current.candidateProfile;
    let dossier = 'No specific candidate profile provided.';
    if (profile && (profile.name || profile.technicalSkills?.length || profile.projects?.length)) {
      const skills = (profile.technicalSkills || []).slice(0, 10).join(', ');
      const projects = (profile.projects || [])
        .slice(0, 3)
        .map((p) => `"${p.title}" (${p.techStack}): ${p.description}`)
        .join('; ');
      dossier = `CANDIDATE DOSSIER: Name: ${profile.name || 'Candidate'} | Role: ${profile.targetRole || 'Software Engineer'} | Skills: ${skills} | Projects: ${projects}`;
    }

    return `You are VoxInterview AI, an elite real-time interview co-pilot and general-purpose question answering agent.
1. Answer ANY interview question directly and accurately—technical, coding, system design, behavioral, project, or general.
2. If about the candidate or their projects, answer in natural first-person ("I", "in my project...") strictly using the dossier.
3. If technical, conceptual, or general, use your full model knowledge to explain clearly.
4. Maintain conversation context across turns. Resolve follow-ups and pronouns ("it", "that", "why did you choose it?") naturally.
5. Keep answers speakable and concise for live interviews. Never reject questions as unknown or unsupported.

${dossier}`;
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

    const genStartTime = Date.now();
    answerGenStartTimeRef.current = genStartTime;
    console.log(`[VOX TIMING] [${new Date(genStartTime).toISOString()}] ANSWER GENERATION STARTED (status: ANALYZING... question: "${cleanQ}")`);

    if (answerAbortControllerRef.current) {
      answerAbortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    answerAbortControllerRef.current = abortController;

    // Send rich candidate information grounded in dossier
    const profile = optionsRef.current.candidateProfile;
    const activeProfile = profile ? {
      name: profile.name || 'Candidate',
      targetRole: profile.targetRole || 'Software Professional',
      email: profile.email || '',
      phone: profile.phone || '',
      degree: profile.degree || '',
      college: profile.college || '',
      gradYear: profile.gradYear || '',
      summary: profile.summary || '',
      technicalSkills: profile.technicalSkills || [],
      programmingLanguages: profile.programmingLanguages || [],
      frameworks: profile.frameworks || [],
      testingAutomationSkills: profile.testingAutomationSkills || [],
      toolsDatabases: profile.toolsDatabases || [],
      projects: (profile.projects || []).map((p) => ({
        title: p.title,
        role: p.role || '',
        techStack: p.techStack,
        description: p.description || '',
        highlights: p.highlights || '',
      })),
      experience: (profile.experience || []).map((e) => ({
        role: e.role,
        company: e.company,
        period: e.period,
        description: e.description || '',
      })),
      internships: (profile.internships || []).map((i) => ({
        role: i.role,
        company: i.company,
        period: i.period,
        description: i.description || '',
      })),
      certifications: profile.certifications || [],
      achievements: profile.achievements || [],
      otherInfo: profile.otherInfo || '',
    } : undefined;

    // Send last 6 conversation turns for complete follow-up and pronoun resolution
    const conversationTurns = (optionsRef.current.conversationHistory || []).slice(-6).map((turn) => ({
      question: turn.question || '',
      answer: (turn.answer || '').slice(0, 250),
    }));

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
          candidateProfile: activeProfile,
          conversationHistory: conversationTurns,
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
      let firstTokenReceived = false;

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
              if (!firstTokenReceived) {
                firstTokenReceived = true;
                const firstTokenTime = Date.now();
                firstAnswerTokenTimeRef.current = firstTokenTime;
                const ttft = turnCompleteTimeRef.current > 0 ? firstTokenTime - turnCompleteTimeRef.current : firstTokenTime - genStartTime;
                console.log(`[VOX TIMING] [${new Date(firstTokenTime).toISOString()}] FIRST ANSWER TOKEN RECEIVED: "${data.chunk}" (TTFT: ${ttft}ms from turn complete)`);
              }
              accumulated += data.chunk;
              console.log('[Gemini Live] Gemini response text:', data.chunk);
              setGeneratedAnswer(accumulated);
              optionsRef.current.onAnswerChunk?.(data.chunk, accumulated);
            } else if (eventType === 'end') {
              const finalAns = data.fullAnswer || accumulated;
              const ansCompleteTime = Date.now();
              answerCompleteTimeRef.current = ansCompleteTime;
              const totalLatency = turnCompleteTimeRef.current > 0 ? ansCompleteTime - turnCompleteTimeRef.current : ansCompleteTime - genStartTime;
              const wordCount = finalAns.trim().split(/\s+/).filter(Boolean).length;
              console.log(`[VOX TIMING] [${new Date(ansCompleteTime).toISOString()}] ANSWER COMPLETE: "${finalAns.slice(0, 60)}..." (Total latency: ${totalLatency}ms from turn complete, words: ${wordCount})`);

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
  const handleVadTurnComplete = useCallback(async (source: 'gemini-vad' | 'silence-detector' = 'gemini-vad') => {
    // 1. Finalize the complete transcript
    const finalQuestion = (
      finalizedSegmentsRef.current + ' ' + currentInterimRef.current
    ).trim() || questionAccumulatorRef.current.trim();

    if (!finalQuestion || finalQuestion.split(/\s+/).length < 2) return;
    if (isGeneratingRef.current) return;

    const turnTime = Date.now();
    turnCompleteTimeRef.current = turnTime;
    console.log(`[VOX TIMING] [${new Date(turnTime).toISOString()}] TURN COMPLETE (source: ${source})`);

    // 2. Show the complete question immediately
    setDetectedQuestion(finalQuestion);
    optionsRef.current.onQuestionUnderstood?.(finalQuestion);

    // If outputAudioTranscription already streamed an answer, complete it
    if (answerAccumulatorRef.current.trim()) {
      setIsGenerating(false);
      isGeneratingRef.current = false;
      const finalAnswer = answerAccumulatorRef.current.trim();
      const ansTime = Date.now();
      answerCompleteTimeRef.current = ansTime;
      console.log(`[VOX TIMING] [${new Date(ansTime).toISOString()}] ANSWER COMPLETE: "${finalAnswer}"`);
      optionsRef.current.onAnswerComplete?.(finalAnswer);
      optionsRef.current.onStatusChange?.('ANSWER_READY');
      vadFinalizedRef.current = true;
      finalizedSegmentsRef.current = '';
      currentInterimRef.current = '';
      answerAccumulatorRef.current = '';
      return;
    }

    // 3. Immediately start generating the answer
    await streamAnswerForQuestion(finalQuestion);
  }, [streamAnswerForQuestion]);

  // Connects WebSocket to Gemini Live API and verifies setupComplete
  const connectGeminiLiveWebSocket = useCallback(async (): Promise<void> => {
    isWsReadyRef.current = false;
    answerAccumulatorRef.current = '';
    questionAccumulatorRef.current = '';
    finalizedSegmentsRef.current = '';
    currentInterimRef.current = '';
    vadFinalizedRef.current = false;
    chunksSentCountRef.current = 0;

    let wsUrl = '';
    let token = '';

    // 1. Request short-lived ephemeral token from backend
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
          const method = token.startsWith('auth_tokens/')
            ? 'BidiGenerateContentConstrained'
            : 'BidiGenerateContent';
          const paramName = token.startsWith('auth_tokens/') ? 'access_token' : 'key';
          wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.${method}?${paramName}=${encodeURIComponent(token)}`;
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        const serverErrorMessage = errData?.error || `Server returned ${res.status}`;
        throw new Error(serverErrorMessage);
      }
    } catch (e: any) {
      if (!optionsRef.current.customApiKey?.trim()) {
        throw new Error(e?.message || 'Failed to authenticate with Gemini Live API');
      }
    }

    // Fallback to custom key if configured
    if (!wsUrl && optionsRef.current.customApiKey?.trim()) {
      const key = optionsRef.current.customApiKey.trim();
      wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(key)}`;
    }

    if (!wsUrl) {
      throw new Error('GEMINI_API_KEY is not configured on the production server. Please add GEMINI_API_KEY to Vercel environment variables or enter it in Settings.');
    }

    // Return a Promise that verifies WebSocket connection and awaits setupComplete
    return new Promise<void>((resolve, reject) => {
      let isSettled = false;
      const safeResolve = () => {
        if (!isSettled) {
          isSettled = true;
          resolve();
        }
      };
      const safeReject = (err: Error) => {
        if (!isSettled) {
          isSettled = true;
          reject(err);
        }
      };

      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {}
        wsRef.current = null;
      }

      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[Gemini Live] Live session connected');
        // Gemini Live model setup with inputAudioTranscription enabled
        // responseModalities is set to AUDIO for server handshake compatibility, while client handles strictly TEXT (no audio output/playback)
        const setupMessage = {
          setup: {
            model: 'models/gemini-3.1-flash-live-preview',
            generationConfig: {
              responseModalities: ['AUDIO'],
              temperature: 0.6,
              topP: 0.9,
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            realtimeInputConfig: {
              automaticActivityDetection: {
                disabled: false,
                endOfSpeechSensitivity: 'END_SENSITIVITY_HIGH',
                silenceDurationMs: 600,
              },
            },
            systemInstruction: {
              parts: [{ text: buildSystemInstruction() }],
            },
          },
        };
        ws.send(JSON.stringify(setupMessage));
      };

      ws.onmessage = async (event) => {
        try {
          let raw = '';
          if (typeof event.data === 'string') {
            raw = event.data;
          } else if (event.data instanceof ArrayBuffer) {
            raw = new TextDecoder('utf-8').decode(event.data);
          } else if (event.data instanceof Blob) {
            raw = await event.data.text();
          } else if (event.data) {
            raw = String(event.data);
          }
          if (!raw) return;

          const msg = JSON.parse(raw);

          // 1. Setup complete confirmation from Google Gemini Live API
          if (msg.setupComplete || msg.setup_complete) {
            isWsReadyRef.current = true;
            safeResolve();
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

          // Reset buffers if previous turn was finalized and new speech is detected
          if (vadFinalizedRef.current && (interim?.text || inputTx?.text)) {
            vadFinalizedRef.current = false;
            finalizedSegmentsRef.current = '';
            currentInterimRef.current = '';
            answerAccumulatorRef.current = '';
            setGeneratedAnswer('');
          }

          // In-progress words updated in real time as the interviewer speaks
          if (interim && typeof interim.text === 'string' && interim.text.trim()) {
            const now = Date.now();
            lastTranscriptChunkTimeRef.current = now;
            console.log(`[VOX TIMING] [${new Date(now).toISOString()}] TRANSCRIPT CHUNK RECEIVED: "${interim.text.trim()}"`);
            currentInterimRef.current = interim.text.trim();
            transcriptUpdated = true;
          }

          // Finalized speech segment
          if (inputTx && typeof inputTx.text === 'string' && inputTx.text.trim()) {
            const now = Date.now();
            lastTranscriptChunkTimeRef.current = now;
            console.log(`[VOX TIMING] [${new Date(now).toISOString()}] TRANSCRIPT CHUNK RECEIVED: "${inputTx.text.trim()}"`);
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

          // 3. Model text answer stream from WebSocket if output transcription is emitted
          const outTx = serverContent.outputTranscription || serverContent.output_transcription;
          if (outTx && typeof outTx.text === 'string' && outTx.text.trim()) {
            console.log('[Gemini Live] Gemini response text:', outTx.text);
            answerAccumulatorRef.current += outTx.text;
            setGeneratedAnswer(answerAccumulatorRef.current);
            optionsRef.current.onAnswerChunk?.(outTx.text, answerAccumulatorRef.current);
          }

          // 4. VAD Turn Complete (Interviewer finished speaking)
          const turnComplete = serverContent.turnComplete || serverContent.turn_complete;
          if (turnComplete) {
            handleVadTurnComplete('gemini-vad');
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
        console.error('[Gemini Live] Live session error:', err);
        safeReject(new Error('WebSocket connection error with Gemini Live API'));
      };

      ws.onclose = (event) => {
        console.log(`[Gemini Live] Live session error/close (code: ${event.code}, reason: ${event.reason || 'Closed'})`);
        isWsReadyRef.current = false;
        if (!isSettled) {
          safeReject(
            new Error(
              event.reason
                ? `Gemini Live error: ${event.reason} (code ${event.code})`
                : `Gemini Live connection closed before setup completed (code ${event.code})`
            )
          );
        }
      };

      // 12-second safety timeout waiting for setupComplete
      setTimeout(() => {
        if (!isWsReadyRef.current && !isSettled) {
          safeReject(new Error('Gemini Live session timed out waiting for setup confirmation'));
        }
      }, 12000);
    });
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
    chunksSentCountRef.current = 0;

    optionsRef.current.onStatusChange?.('CONNECTING');

    // 1. Establish Gemini Live WebSocket connection and verify setupComplete
    try {
      await connectGeminiLiveWebSocket();
    } catch (wsErr: any) {
      console.error('[Gemini Live] Live session connection failure:', wsErr);
      const errMsg = wsErr?.message || 'Failed to connect to Gemini Live API';
      setErrorMessage(errMsg);
      optionsRef.current.onError?.(errMsg);
      optionsRef.current.onStatusChange?.('READY');
      setIsListening(false);
      isRecordingRef.current = false;
      return;
    }

    // 2. Access mobile / desktop microphone (ONLY after Gemini Live is confirmed connected)
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
      isRecordingRef.current = true;
      setIsListening(true);

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
        } else if (lastSpeechTimeRef.current > 0 && Date.now() - lastSpeechTimeRef.current > 600) {
          // 600ms silence detected after speech (500-700ms window)
          const hasUnfinishedQuestion =
            (finalizedSegmentsRef.current || currentInterimRef.current || questionAccumulatorRef.current) &&
            !vadFinalizedRef.current &&
            !isGeneratingRef.current;

          if (hasUnfinishedQuestion) {
            lastSpeechTimeRef.current = 0; // prevent repeated triggers
            handleVadTurnComplete('silence-detector');
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

        // Track microphone audio captured timestamp
        const now = Date.now();
        lastMicCaptureTimeRef.current = now;
        if (now - lastMicLogTimeRef.current > 1500) {
          lastMicLogTimeRef.current = now;
          console.log(`[VOX TIMING] [${new Date(now).toISOString()}] MICROPHONE AUDIO CAPTURED (16kHz PCM streaming active)`);
        }

        // Send real-time audio chunk directly over WebSocket
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && isWsReadyRef.current) {
          const base64Data = arrayBufferToBase64(pcm16);
          const chunkMsg = {
            realtimeInput: {
              audio: {
                mimeType: 'audio/pcm;rate=16000',
                data: base64Data,
              },
            },
          };
          wsRef.current.send(JSON.stringify(chunkMsg));
          chunksSentCountRef.current++;
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
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {}
        wsRef.current = null;
      }
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
