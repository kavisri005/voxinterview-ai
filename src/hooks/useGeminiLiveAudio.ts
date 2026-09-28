import { useState, useRef, useCallback, useEffect } from 'react';
import { downsampleToPcm16, arrayBufferToBase64, encodeWav } from '../utils/audioPcm';
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
  const answerAccumulatorRef = useRef<string>('');
  const questionAccumulatorRef = useRef<string>('');
  const pcmChunksRef = useRef<ArrayBuffer[]>([]);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSpeechTimeRef = useRef<number>(0);
  const fallbackTriggeredRef = useRef<boolean>(false);

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

  // Server-side audio fallback pipeline (SSE)
  const processBufferedAudioFallback = useCallback(async () => {
    if (fallbackTriggeredRef.current || pcmChunksRef.current.length === 0) return;
    fallbackTriggeredRef.current = true;

    optionsRef.current.onStatusChange?.('UNDERSTANDING');
    setIsGenerating(true);

    try {
      // Calculate total buffer length and merge chunks
      let totalLength = 0;
      for (const chunk of pcmChunksRef.current) {
        totalLength += chunk.byteLength;
      }

      if (totalLength < 16000 * 2 * 0.5) {
        // Less than 0.5s of audio
        setIsGenerating(false);
        optionsRef.current.onStatusChange?.(isRecordingRef.current ? 'LISTENING' : 'READY');
        return;
      }

      const mergedPcm = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of pcmChunksRef.current) {
        mergedPcm.set(new Uint8Array(chunk), offset);
        offset += chunk.byteLength;
      }

      const wavBuffer = encodeWav(mergedPcm.buffer, 16000);
      const audioBase64 = arrayBufferToBase64(wavBuffer);

      optionsRef.current.onStatusChange?.('GENERATING');

      const response = await fetch('/api/audio-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64,
          mimeType: 'audio/wav',
          candidateProfile: optionsRef.current.candidateProfile,
          conversationHistory: optionsRef.current.conversationHistory,
          style: optionsRef.current.answerStyle,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Server returned ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('ReadableStream not supported');

      const decoder = new TextDecoder('utf-8');
      let streamBuffer = '';
      let accumulated = '';
      let recognizedQuestion = '';

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
            if (eventType === 'chunk' && data.chunk) {
              accumulated += data.chunk;
              // Filter out question prefix from displayed answer if present
              const cleanAns = accumulated.replace(/^QUESTION:\s*[^\n\r]+[\r\n]*/i, '').trim();
              setGeneratedAnswer(cleanAns);
              optionsRef.current.onAnswerChunk?.(data.chunk, cleanAns);
            } else if (eventType === 'end') {
              recognizedQuestion = data.question || '';
              const finalAns = (data.fullAnswer || accumulated).replace(/^QUESTION:\s*[^\n\r]+[\r\n]*/i, '').trim();
              if (recognizedQuestion) {
                setDetectedQuestion(recognizedQuestion);
                optionsRef.current.onQuestionUnderstood?.(
                  recognizedQuestion,
                  data.category as QuestionCategory,
                  data.intent
                );
              }
              setGeneratedAnswer(finalAns);
              optionsRef.current.onAnswerComplete?.(finalAns, {
                category: data.category,
                intent: data.intent,
              });
              optionsRef.current.onStatusChange?.('ANSWER_READY');
            } else if (eventType === 'error') {
              throw new Error(data.message || 'Stream error');
            }
          } catch (e: any) {
            console.warn('Failed to parse SSE line:', e);
          }
        }
      }
    } catch (err: any) {
      console.error('Audio processing fallback error:', err);
      setErrorMessage(err.message || 'Failed to analyze audio');
      optionsRef.current.onError?.(err.message || 'Failed to analyze audio');
      optionsRef.current.onStatusChange?.('READY');
    } finally {
      setIsGenerating(false);
      // Clear buffer for next turn
      pcmChunksRef.current = [];
    }
  }, []);

  // Connects WebSocket to Gemini Live API
  const connectGeminiLiveWebSocket = useCallback(async () => {
    isWsReadyRef.current = false;
    answerAccumulatorRef.current = '';
    questionAccumulatorRef.current = '';

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

    // If no direct WebSocket credentials, the real-time audio buffer will use /api/audio-answer directly
    if (!wsUrl) {
      console.info('Direct WebSocket token not available; using real-time audio pipeline via server.');
      return;
    }

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('Gemini Live API WebSocket connected');
        // Send initial setup message with TEXT modality
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

          // Setup complete
          if (msg.setupComplete) {
            isWsReadyRef.current = true;
            optionsRef.current.onStatusChange?.('LISTENING');
            return;
          }

          const serverContent = msg.serverContent;
          if (!serverContent) return;

          // 1. Live input audio transcription (Interviewer's spoken question)
          if (serverContent.inputTranscription?.text) {
            questionAccumulatorRef.current += serverContent.inputTranscription.text;
            const q = questionAccumulatorRef.current.trim();
            setDetectedQuestion(q);
            optionsRef.current.onStatusChange?.('UNDERSTANDING');
            optionsRef.current.onQuestionUnderstood?.(q);
          }

          // 2. Model text answer stream (Candidate spoken answer)
          if (serverContent.modelTurn?.parts) {
            optionsRef.current.onStatusChange?.('GENERATING');
            setIsGenerating(true);
            for (const part of serverContent.modelTurn.parts) {
              if (part.text) {
                answerAccumulatorRef.current += part.text;
                setGeneratedAnswer(answerAccumulatorRef.current);
                optionsRef.current.onAnswerChunk?.(part.text, answerAccumulatorRef.current);
              }
            }
          }

          // 3. Turn complete
          if (serverContent.turnComplete) {
            setIsGenerating(false);
            const finalAnswer = answerAccumulatorRef.current;
            optionsRef.current.onAnswerComplete?.(finalAnswer);
            optionsRef.current.onStatusChange?.('ANSWER_READY');
            // Reset for next question in session
            answerAccumulatorRef.current = '';
            questionAccumulatorRef.current = '';
          }

          // 4. Interruption
          if (serverContent.interrupted) {
            console.log('Interviewer interrupted/resumed speaking');
            optionsRef.current.onStatusChange?.('UNDERSTANDING');
            answerAccumulatorRef.current = '';
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
  }, [buildSystemInstruction]);

  // Start recording
  const startListening = useCallback(async () => {
    setErrorMessage(null);
    setDetectedQuestion('');
    setGeneratedAnswer('');
    fallbackTriggeredRef.current = false;
    pcmChunksRef.current = [];
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
          if (!silenceTimerRef.current && pcmChunksRef.current.length > 0 && !fallbackTriggeredRef.current) {
            silenceTimerRef.current = setTimeout(() => {
              if (isRecordingRef.current && !isWsReadyRef.current) {
                // If direct WebSocket turn did not fire, process the buffered speech turn
                processBufferedAudioFallback();
              }
            }, 300);
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
        pcmChunksRef.current.push(pcm16);

        // If WebSocket is active, send real-time audio chunk directly
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && isWsReadyRef.current) {
          const base64Data = arrayBufferToBase64(pcm16);
          const chunkMsg = {
            realtimeInput: {
              audio: {
                data: base64Data,
                mimeType: 'audio/pcm;rate=16000',
              },
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
  }, [connectGeminiLiveWebSocket, processBufferedAudioFallback]);

  // Stop recording
  const stopListening = useCallback(() => {
    isRecordingRef.current = false;
    setIsListening(false);
    setAudioLevel(0);

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
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

    // If WebSocket turn didn't complete and we have buffered speech, process turn
    if (!fallbackTriggeredRef.current && pcmChunksRef.current.length > 0 && !answerAccumulatorRef.current) {
      processBufferedAudioFallback();
    } else {
      optionsRef.current.onStatusChange?.('READY');
    }
  }, [processBufferedAudioFallback]);

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
