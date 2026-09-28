import { useState, useEffect, useRef, useCallback } from 'react';
import { cleanTranscript } from '../utils/transcriptCleaner';

interface IWindow extends Window {
  SpeechRecognition?: any;
  webkitSpeechRecognition?: any;
}

export interface AudioDiagnostics {
  micPermission: 'PROMPT' | 'GRANTED' | 'DENIED';
  mediaStream: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'FAILED';
  speechRecognition: 'SUPPORTED' | 'UNSUPPORTED';
  recognitionState: 'IDLE' | 'STARTING' | 'LISTENING' | 'SPEECH_ACTIVE' | 'STOPPED' | 'ERROR';
  lastTranscript: string;
  lastError: string;
  eventLogs: Array<{ time: string; event: string; detail?: string }>;
}

export interface UseRealtimeAudioOptions {
  silenceThresholdMs: number;
  minWords: number;
  onListeningStarted?: () => void;
  onListeningStopped?: () => void;
  onPartialTranscript?: (data: {
    currentInterimTranscript: string;
    finalizedTranscript: string;
    currentUtterance: string;
    cleanedUtterance: string;
  }) => void;
  onQuestionFinalized?: (question: string) => void;
  onSpeechStateChange?: (isSpeaking: boolean) => void;
  onError?: (error: string) => void;
}

export function useRealtimeAudio({
  silenceThresholdMs,
  minWords,
  onListeningStarted,
  onListeningStopped,
  onPartialTranscript,
  onQuestionFinalized,
  onSpeechStateChange,
  onError,
}: UseRealtimeAudioOptions) {
  // Store all options & callbacks in a mutable ref to guarantee completely stable hook callbacks
  // and prevent infinite re-render loops / Maximum update depth exceeded errors
  const optionsRef = useRef<UseRealtimeAudioOptions>({
    silenceThresholdMs,
    minWords,
    onListeningStarted,
    onListeningStopped,
    onPartialTranscript,
    onQuestionFinalized,
    onSpeechStateChange,
    onError,
  });

  // Always keep optionsRef updated with latest values without causing effect re-triggers
  optionsRef.current = {
    silenceThresholdMs,
    minWords,
    onListeningStarted,
    onListeningStopped,
    onPartialTranscript,
    onQuestionFinalized,
    onSpeechStateChange,
    onError,
  };

  // ONE Authoritative recording state across the entire hook & UI
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [hasMicPermission, setHasMicPermission] = useState<boolean | null>(null);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [speechSupported, setSpeechSupported] = useState<boolean>(true);
  const [silenceProgress, setSilenceProgress] = useState<number>(0);

  // Authoritative React transcript states for progressive UI rendering
  const [currentInterimTranscript, setCurrentInterimTranscript] = useState<string>('');
  const [finalizedTranscript, setFinalizedTranscript] = useState<string>('');
  const [currentUtterance, setCurrentUtterance] = useState<string>('');

  // Diagnostic state
  const [diagnostics, setDiagnostics] = useState<AudioDiagnostics>({
    micPermission: 'PROMPT',
    mediaStream: 'DISCONNECTED',
    speechRecognition: 'SUPPORTED',
    recognitionState: 'IDLE',
    lastTranscript: '',
    lastError: '',
    eventLogs: [],
  });

  // Explicit ref determining whether recognition is allowed to run / restart
  const shouldBeListeningRef = useRef<boolean>(false);

  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const silenceIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const silenceStartRef = useRef<number>(0);
  const restartTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Transcript accumulator refs
  const finalizedTranscriptRef = useRef<string>('');
  const baseFinalizedRef = useRef<string>('');
  const currentInterimRef = useRef<string>('');
  const currentUtteranceRef = useRef<string>('');

  // Duplicate question dispatch prevention ref
  const lastDispatchedQuestionRef = useRef<string>('');

  const hasFatalErrorRef = useRef<boolean>(false);
  const restartCountRef = useRef<number>(0);
  const lastRestartTimeRef = useRef<number>(0);

  // Helper to add diagnostic log - completely stable with empty deps
  const logEvent = useCallback((event: string, detail?: string) => {
    const time = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    });
    setDiagnostics((prev) => ({
      ...prev,
      eventLogs: [{ time, event, detail }, ...prev.eventLogs.slice(0, 49)],
    }));
  }, []);

  // Check speech recognition support on initial mount
  useEffect(() => {
    const win = window as unknown as IWindow;
    const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSpeechSupported(false);
      const unsupportedMsg =
        'Speech recognition is not supported in this browser. Please use Google Chrome or Microsoft Edge.';
      setDiagnostics((prev) => ({
        ...prev,
        speechRecognition: 'UNSUPPORTED',
        lastError: unsupportedMsg,
      }));
    } else {
      setSpeechSupported(true);
      setDiagnostics((prev) => ({
        ...prev,
        speechRecognition: 'SUPPORTED',
      }));
    }
  }, []);

  // Question Finalization Pipeline
  const finalizeCurrentQuestion = useCallback(
    (triggerSource: string) => {
      // If user stopped listening, do not trigger further question dispatches
      if (!shouldBeListeningRef.current && triggerSource !== 'stop_listening' && triggerSource !== 'simulation') {
        return;
      }

      // Combine finalized transcript + latest interim transcript
      const combined = (
        (finalizedTranscriptRef.current ? finalizedTranscriptRef.current + ' ' : '') +
        currentInterimRef.current
      ).replace(/\s+/g, ' ').trim() || currentUtteranceRef.current.trim();

      if (!combined) {
        setSilenceProgress(0);
        setIsSpeaking(false);
        optionsRef.current.onSpeechStateChange?.(false);
        return;
      }

      // Clean filler words & verify minimum meaningful word count
      const { cleaned, isSubstantial } = cleanTranscript(combined, optionsRef.current.minWords);

      if (!isSubstantial) {
        return;
      }

      // Prevent duplicate dispatch
      if (cleaned === lastDispatchedQuestionRef.current) {
        return;
      }
      lastDispatchedQuestionRef.current = cleaned;

      // Log explicit event
      logEvent('[QUESTION DETECTED]', `"${cleaned}" (via ${triggerSource})`);

      // Clear any pending silence timers
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      if (silenceIntervalRef.current) {
        clearInterval(silenceIntervalRef.current);
        silenceIntervalRef.current = null;
      }
      setSilenceProgress(0);
      setIsSpeaking(false);

      // Dispatch question before any cleanup
      optionsRef.current.onQuestionFinalized?.(cleaned);

      // Reset utterance state for subsequent question
      finalizedTranscriptRef.current = '';
      baseFinalizedRef.current = '';
      currentInterimRef.current = '';
      currentUtteranceRef.current = '';

      setFinalizedTranscript('');
      setCurrentInterimTranscript('');
      setCurrentUtterance('');

      optionsRef.current.onPartialTranscript?.({
        currentInterimTranscript: '',
        finalizedTranscript: '',
        currentUtterance: '',
        cleanedUtterance: '',
      });
    },
    [logEvent]
  );

  // Process incoming speech results
  const handleTranscriptUpdate = useCallback(
    (interimText: string, finalAccumulated: string, combinedUtterance: string) => {
      // Guard: Never process or update transcripts after user has stopped recording
      if (!shouldBeListeningRef.current) {
        return;
      }

      finalizedTranscriptRef.current = finalAccumulated.trim();
      currentInterimRef.current = interimText.trim();
      currentUtteranceRef.current = combinedUtterance.trim();

      // Immediately commit to React state for UI rendering
      setCurrentInterimTranscript(currentInterimRef.current);
      setFinalizedTranscript(finalizedTranscriptRef.current);
      setCurrentUtterance(currentUtteranceRef.current);

      if (combinedUtterance.trim()) {
        setDiagnostics((prev) => ({
          ...prev,
          lastTranscript: combinedUtterance.trim(),
          recognitionState: 'SPEECH_ACTIVE',
        }));

        setIsSpeaking(true);
        optionsRef.current.onSpeechStateChange?.(true);
      }

      // Synchronously notify parent component without delay
      optionsRef.current.onPartialTranscript?.({
        currentInterimTranscript: currentInterimRef.current,
        finalizedTranscript: finalizedTranscriptRef.current,
        currentUtterance: combinedUtterance.trim(),
        cleanedUtterance: cleanTranscript(combinedUtterance, 1).cleaned,
      });

      // Reset Silence Timers for natural pause detection
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      if (silenceIntervalRef.current) {
        clearInterval(silenceIntervalRef.current);
        silenceIntervalRef.current = null;
      }

      silenceStartRef.current = Date.now();
      setSilenceProgress(0);

      const thresholdMs = optionsRef.current.silenceThresholdMs;

      // Progress countdown interval
      silenceIntervalRef.current = setInterval(() => {
        if (!shouldBeListeningRef.current) {
          if (silenceIntervalRef.current) clearInterval(silenceIntervalRef.current);
          return;
        }
        const elapsed = Date.now() - silenceStartRef.current;
        const progress = Math.min(elapsed / thresholdMs, 1);
        setSilenceProgress(progress);
      }, 40);

      // Fallback silence timeout triggers question completion
      silenceTimerRef.current = setTimeout(() => {
        if (silenceIntervalRef.current) {
          clearInterval(silenceIntervalRef.current);
          silenceIntervalRef.current = null;
        }
        if (shouldBeListeningRef.current) {
          logEvent('Silence detected', `${thresholdMs}ms threshold reached`);
          finalizeCurrentQuestion('silence');
        }
      }, thresholdMs);
    },
    [logEvent, finalizeCurrentQuestion]
  );

  // Core function to create and start a single SpeechRecognition session
  const startRecognitionSession = useCallback(() => {
    const win = window as unknown as IWindow;
    const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (!shouldBeListeningRef.current || hasFatalErrorRef.current) {
      return;
    }

    // Safely detach and destroy any existing instance
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onstart = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.onspeechstart = null;
        recognitionRef.current.onspeechend = null;
        recognitionRef.current.onnomatch = null;
        recognitionRef.current.abort();
      } catch {}
      recognitionRef.current = null;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognition.maxAlternatives = 1;

      // Event: onstart
      recognition.onstart = () => {
        if (!shouldBeListeningRef.current) {
          try {
            recognition.abort();
          } catch {}
          return;
        }

        setIsListening(true);
        setDiagnostics((prev) => ({
          ...prev,
          recognitionState: 'LISTENING',
        }));
        logEvent('[SPEECH RECOGNITION STARTED]', 'recognition.onstart fired – engine actively listening');
        optionsRef.current.onListeningStarted?.();
      };

      // Event: onspeechstart
      recognition.onspeechstart = () => {
        if (!shouldBeListeningRef.current) return;
        logEvent('onspeechstart', 'Audio speech detected');
        setIsSpeaking(true);
        setDiagnostics((prev) => ({
          ...prev,
          recognitionState: 'SPEECH_ACTIVE',
        }));
        optionsRef.current.onSpeechStateChange?.(true);
      };

      // Event: onspeechend
      recognition.onspeechend = () => {
        if (!shouldBeListeningRef.current) return;
        logEvent('onspeechend', 'Speech input ended/paused');
        setIsSpeaking(false);
        optionsRef.current.onSpeechStateChange?.(false);

        // Immediately finalize question when speech ends with substantial words
        if (finalizedTranscriptRef.current || currentUtteranceRef.current) {
          finalizeCurrentQuestion('onspeechend');
        }
      };

      // Event: onnomatch
      recognition.onnomatch = () => {
        if (!shouldBeListeningRef.current) return;
        logEvent('onnomatch', 'Speech detected but no transcription matched');
      };

      // Event: onresult
      recognition.onresult = (event: any) => {
        if (!shouldBeListeningRef.current) {
          return;
        }

        let interimText = '';
        let finalAccumulated = '';

        for (let i = 0; i < event.results.length; ++i) {
          const result = event.results[i];
          const transcriptText = result[0]?.transcript || '';

          if (result.isFinal) {
            finalAccumulated += (finalAccumulated ? ' ' : '') + transcriptText;
          } else {
            interimText += (interimText ? ' ' : '') + transcriptText;
          }
        }

        const totalFinalized = (
          (baseFinalizedRef.current ? baseFinalizedRef.current + ' ' : '') + finalAccumulated
        ).trim();

        const combinedCurrent = (
          (totalFinalized ? totalFinalized + ' ' : '') + interimText
        ).replace(/\s+/g, ' ').trim();

        if (interimText) {
          logEvent('[INTERIM TRANSCRIPT]', `"${interimText}"`);
        }
        if (finalAccumulated) {
          logEvent('[FINAL TRANSCRIPT]', `"${finalAccumulated}"`);
        }

        handleTranscriptUpdate(interimText, totalFinalized, combinedCurrent);
      };

      // Event: onerror
      recognition.onerror = (event: any) => {
        const errCode = event.error || 'unknown_error';
        const errDetail = event.message || '';
        let formattedMessage = '';

        switch (errCode) {
          case 'not-allowed':
            formattedMessage = 'Microphone permission or speech recognition access was denied.';
            hasFatalErrorRef.current = true;
            shouldBeListeningRef.current = false;
            setHasMicPermission(false);
            setIsListening(false);
            break;
          case 'service-not-allowed':
            formattedMessage = 'Browser speech recognition service is not allowed or restricted.';
            hasFatalErrorRef.current = true;
            shouldBeListeningRef.current = false;
            setIsListening(false);
            break;
          case 'audio-capture':
            formattedMessage = 'No microphone device was found or audio capture failed.';
            hasFatalErrorRef.current = true;
            shouldBeListeningRef.current = false;
            setIsListening(false);
            break;
          case 'network':
            formattedMessage = 'Network error communicating with speech recognition service.';
            break;
          case 'no-speech':
            formattedMessage = 'No speech detected yet.';
            break;
          case 'aborted':
            formattedMessage = 'Speech recognition session was aborted.';
            break;
          default:
            formattedMessage = `${errCode} ${errDetail}`;
            break;
        }

        logEvent('[MIC ERROR]', `${errCode} - ${formattedMessage}`);

        setDiagnostics((prev) => ({
          ...prev,
          lastError: formattedMessage,
          recognitionState: hasFatalErrorRef.current ? 'ERROR' : prev.recognitionState,
        }));

        if (hasFatalErrorRef.current) {
          optionsRef.current.onError?.(formattedMessage);
        }
      };

      // Event: onend
      recognition.onend = () => {
        if (!shouldBeListeningRef.current || hasFatalErrorRef.current) {
          setIsListening(false);
          setDiagnostics((prev) => ({
            ...prev,
            recognitionState: hasFatalErrorRef.current ? 'ERROR' : 'STOPPED',
          }));
          logEvent('[SPEECH RECOGNITION STOPPED]', 'Engine shut down cleanly');
          optionsRef.current.onListeningStopped?.();
          return;
        }

        // If a question was recognized before unexpected onend, finalize it
        if (finalizedTranscriptRef.current || currentUtteranceRef.current) {
          finalizeCurrentQuestion('onend');
        }

        // Preserve finalized transcript from this turn so it isn't lost on restart
        if (finalizedTranscriptRef.current) {
          baseFinalizedRef.current = finalizedTranscriptRef.current;
        }

        // Avoid infinite rapid restart loop
        const now = Date.now();
        if (now - lastRestartTimeRef.current < 2000) {
          restartCountRef.current++;
        } else {
          restartCountRef.current = 1;
        }
        lastRestartTimeRef.current = now;

        if (restartCountRef.current > 12) {
          console.warn('Excessive SpeechRecognition restarts, pausing');
          shouldBeListeningRef.current = false;
          setIsListening(false);
          setDiagnostics((prev) => ({
            ...prev,
            recognitionState: 'STOPPED',
            lastError: 'Speech recognition restarted too frequently. Click START LISTENING again.',
          }));
          logEvent('[SPEECH RECOGNITION STOPPED]', 'Restart limit reached, paused');
          return;
        }

        // Clear any pending restart timer
        if (restartTimerRef.current) {
          clearTimeout(restartTimerRef.current);
          restartTimerRef.current = null;
        }

        // In Chrome, an ended instance CANNOT be re-started. Create fresh single instance.
        restartTimerRef.current = setTimeout(() => {
          if (shouldBeListeningRef.current && !hasFatalErrorRef.current) {
            logEvent('[SPEECH RECOGNITION STARTED]', 'Auto-restarting fresh instance for continuous session');
            startRecognitionSession();
          }
        }, 120);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err: any) {
      console.error('Failed to start SpeechRecognition:', err);
      shouldBeListeningRef.current = false;
      setIsListening(false);
      const errMsg = `Speech recognition failed to start: ${err.message || err}`;
      setDiagnostics((prev) => ({
        ...prev,
        recognitionState: 'ERROR',
        lastError: errMsg,
      }));
      logEvent('[MIC ERROR]', err.message || String(err));
      optionsRef.current.onError?.(errMsg);
    }
  }, [logEvent, handleTranscriptUpdate, finalizeCurrentQuestion]);

  // START LISTENING
  const startListening = useCallback(async () => {
    logEvent('[MIC BUTTON CLICK]', 'START');

    const win = window as unknown as IWindow;
    const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSpeechSupported(false);
      const unsupportedMsg =
        'Speech recognition is not supported in this browser. Please use Google Chrome or Microsoft Edge.';
      setDiagnostics((prev) => ({
        ...prev,
        speechRecognition: 'UNSUPPORTED',
        lastError: unsupportedMsg,
        recognitionState: 'ERROR',
      }));
      logEvent('[MIC ERROR]', unsupportedMsg);
      optionsRef.current.onError?.(unsupportedMsg);
      return;
    }

    // Set authoritative states
    shouldBeListeningRef.current = true;
    setIsListening(true);
    hasFatalErrorRef.current = false;
    restartCountRef.current = 0;

    finalizedTranscriptRef.current = '';
    baseFinalizedRef.current = '';
    currentInterimRef.current = '';
    currentUtteranceRef.current = '';
    lastDispatchedQuestionRef.current = '';

    setFinalizedTranscript('');
    setCurrentInterimTranscript('');
    setCurrentUtterance('');

    setDiagnostics((prev) => ({
      ...prev,
      recognitionState: 'STARTING',
      mediaStream: 'CONNECTING',
      lastError: '',
    }));

    logEvent('[MIC START]', 'Microphone capture initiated');

    // 1. Request microphone permission & start Web Audio Analyser (for visualizer only)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // User might have clicked STOP while permission was resolving
      if (!shouldBeListeningRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      mediaStreamRef.current = stream;
      setHasMicPermission(true);
      setDiagnostics((prev) => ({
        ...prev,
        micPermission: 'GRANTED',
        mediaStream: 'CONNECTED',
      }));
      logEvent('Microphone permission', 'GRANTED – MediaStream connected');

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }
      audioContextRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const buffer = new Uint8Array(analyser.frequencyBinCount);
      const updateLevel = () => {
        if (!shouldBeListeningRef.current || !analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(buffer as any);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          sum += buffer[i];
        }
        const avg = sum / buffer.length;
        const normalized = Math.min(Math.round((avg / 128) * 100), 100);
        setAudioLevel(normalized);
        animFrameRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();
    } catch (err: any) {
      console.warn('Microphone permission error:', err);
      setHasMicPermission(false);
      shouldBeListeningRef.current = false;
      setIsListening(false);
      const errMsg =
        err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
          ? 'Microphone permission was denied. If in preview iframe, click "Open in New Tab" to grant permission.'
          : err.name === 'NotFoundError'
          ? 'No microphone hardware found on this device.'
          : `Microphone access error: ${err.message || 'Unable to access microphone'}`;

      setDiagnostics((prev) => ({
        ...prev,
        micPermission: 'DENIED',
        mediaStream: 'FAILED',
        recognitionState: 'ERROR',
        lastError: errMsg,
      }));
      logEvent('[MIC ERROR]', `getUserMedia error: ${err.name || err.message}`);
      optionsRef.current.onError?.(errMsg);
      return;
    }

    // 2. Initialize SpeechRecognition & start
    startRecognitionSession();
  }, [logEvent, startRecognitionSession]);

  // STOP LISTENING
  const stopListening = useCallback(() => {
    logEvent('[MIC BUTTON CLICK]', 'STOP');

    shouldBeListeningRef.current = false;
    hasFatalErrorRef.current = false;

    setIsListening(false);
    setIsSpeaking(false);
    setAudioLevel(0);
    setSilenceProgress(0);

    logEvent('[MIC STOP]', 'Stopping audio capture and SpeechRecognition engine');

    // Finalize any recognized question before shutting down
    if (finalizedTranscriptRef.current || currentUtteranceRef.current) {
      finalizeCurrentQuestion('stop_listening');
    }

    // Clear any pending restart timer
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }

    // Clear any silence timers
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (silenceIntervalRef.current) {
      clearInterval(silenceIntervalRef.current);
      silenceIntervalRef.current = null;
    }

    // Stop and cleanup SpeechRecognition instance
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onstart = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.onspeechstart = null;
        recognitionRef.current.onspeechend = null;
        recognitionRef.current.onnomatch = null;
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }

    // Stop/cleanup any MediaStream tracks
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    setDiagnostics((prev) => ({
      ...prev,
      recognitionState: 'STOPPED',
      mediaStream: 'DISCONNECTED',
    }));

    logEvent('[SPEECH RECOGNITION STOPPED]', 'Microphone and speech engine successfully stopped');

    optionsRef.current.onListeningStopped?.();
  }, [logEvent, finalizeCurrentQuestion]);

  // Cleanup exclusively on component unmount - EMPTY dependency array prevents re-render loops!
  useEffect(() => {
    return () => {
      shouldBeListeningRef.current = false;
      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
      }
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      if (silenceIntervalRef.current) {
        clearInterval(silenceIntervalRef.current);
        silenceIntervalRef.current = null;
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.onstart = null;
          recognitionRef.current.onresult = null;
          recognitionRef.current.onerror = null;
          recognitionRef.current.onend = null;
          recognitionRef.current.abort();
        } catch {}
        recognitionRef.current = null;
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, []);

  // TEST MODE: Word-by-word simulated speech
  const simulateSpokenQuestion = useCallback(
    (questionText: string, onProgress?: (partial: string) => void) => {
      stopListening();
      shouldBeListeningRef.current = true;
      setIsListening(true);
      setIsSpeaking(true);
      optionsRef.current.onSpeechStateChange?.(true);

      finalizedTranscriptRef.current = '';
      baseFinalizedRef.current = '';
      currentInterimRef.current = '';
      currentUtteranceRef.current = '';

      logEvent('[MIC START]', `TEST MODE: Speech Simulation: "${questionText}"`);

      const words = questionText.split(' ');
      let currentWordIndex = 0;
      let accumulated = '';

      const interval = setInterval(() => {
        if (!shouldBeListeningRef.current) {
          clearInterval(interval);
          return;
        }

        if (currentWordIndex < words.length) {
          accumulated += (currentWordIndex > 0 ? ' ' : '') + words[currentWordIndex];
          currentWordIndex++;
          logEvent('[INTERIM TRANSCRIPT]', `"${accumulated}"`);
          handleTranscriptUpdate(accumulated, '', accumulated);
          if (onProgress) onProgress(accumulated);
        } else {
          clearInterval(interval);
          logEvent('[FINAL TRANSCRIPT]', `"${accumulated}"`);
          setTimeout(() => {
            if (shouldBeListeningRef.current) {
              finalizeCurrentQuestion('simulation');
            }
          }, 300);
        }
      }, 160);
    },
    [stopListening, handleTranscriptUpdate, logEvent, finalizeCurrentQuestion]
  );

  return {
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
    analyser: analyserRef.current,
    logEvent,
  };
}
