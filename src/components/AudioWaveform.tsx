import React, { useEffect, useRef } from 'react';

interface AudioWaveformProps {
  isListening: boolean;
  isSpeaking: boolean;
  audioLevel: number; // 0 to 100
  analyser: AnalyserNode | null;
  silenceProgress: number; // 0 to 1
}

export const AudioWaveform: React.FC<AudioWaveformProps> = ({
  isListening,
  isSpeaking,
  audioLevel,
  analyser,
  silenceProgress,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let buffer: Uint8Array | null = null;
    if (analyser) {
      buffer = new Uint8Array(analyser.frequencyBinCount);
    }

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      if (!isListening) {
        // Idle faint line
        ctx.beginPath();
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1.5;
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();
        return;
      }

      const barCount = 36;
      const barWidth = 3;
      const gap = (width - barCount * barWidth) / (barCount - 1);

      if (analyser && buffer) {
        analyser.getByteFrequencyData(buffer as any);
      }

      for (let i = 0; i < barCount; i++) {
        let value = 0.08;
        if (analyser && buffer) {
          const index = Math.floor((i / barCount) * (buffer.length / 2));
          value = Math.max(buffer[index] / 255, 0.08);
        } else if (isSpeaking) {
          // Synthetic wave if analyser is off (simulation mode)
          const time = Date.now() / 150;
          value = 0.2 + 0.6 * Math.abs(Math.sin(time + i * 0.3));
        } else {
          // Low idle breathing wave
          const time = Date.now() / 800;
          value = 0.08 + 0.05 * Math.sin(time + i * 0.4);
        }

        const barHeight = Math.max(value * height * 0.85, 4);
        const x = i * (barWidth + gap);
        const y = (height - barHeight) / 2;

        // Gradient based on speaking / silence state
        const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
        if (isSpeaking) {
          gradient.addColorStop(0, '#38bdf8'); // sky-400
          gradient.addColorStop(1, '#6366f1'); // indigo-500
        } else {
          gradient.addColorStop(0, '#10b981'); // emerald-500
          gradient.addColorStop(1, '#059669'); // emerald-600
        }

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 2);
        ctx.fill();
      }

      animRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [isListening, isSpeaking, analyser]);

  return (
    <div className="flex items-center gap-3">
      <div className="relative h-9 w-48 sm:w-56 bg-slate-900/60 rounded-lg px-2 border border-slate-800/80 flex items-center overflow-hidden">
        <canvas
          ref={canvasRef}
          width={220}
          height={36}
          className="w-full h-full block"
        />

        {/* Silence countdown overlay bar when speech pauses */}
        {isListening && silenceProgress > 0 && silenceProgress < 1 && (
          <div
            className="absolute bottom-0 left-0 h-[2px] bg-amber-400/90 transition-all duration-75"
            style={{ width: `${silenceProgress * 100}%` }}
            title="Silence threshold detecting question end"
          />
        )}
      </div>

      {/* Mic Volume Level Pill */}
      <div className="flex items-center gap-1.5 text-xs font-mono">
        <div
          className={`w-2 h-2 rounded-full transition-colors duration-200 ${
            !isListening
              ? 'bg-slate-600'
              : isSpeaking
              ? 'bg-sky-400 animate-ping'
              : 'bg-emerald-400 animate-pulse'
          }`}
        />
        <span
          className={`${
            !isListening
              ? 'text-slate-500'
              : isSpeaking
              ? 'text-sky-300 font-semibold'
              : 'text-emerald-400'
          }`}
        >
          {!isListening ? 'OFF' : isSpeaking ? 'VOICE IN' : 'READY'}
        </span>
      </div>
    </div>
  );
};
