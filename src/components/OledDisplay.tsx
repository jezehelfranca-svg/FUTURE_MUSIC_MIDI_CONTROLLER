import React, { useEffect, useRef } from 'react';
import { audioEngine } from '../audio/AudioEngine';
import type { ChordMode, KnobMode, PadBank, ScaleId } from '../types/studio';

interface OledDisplayProps {
  bpm: number;
  swing: number;
  isPlaying: boolean;
  isRecording: boolean;
  currentStep: number;
  knobMode: KnobMode;
  padBank: PadBank;
  kitName: string;
  synthName: string;
  scale: ScaleId;
  chordMode: ChordMode;
  octave: number;
  lastEventText: string;
  midiDeviceName: string | null;
}

export const OledDisplay: React.FC<OledDisplayProps> = ({
  bpm,
  swing,
  isPlaying,
  isRecording,
  currentStep,
  knobMode,
  padBank,
  kitName,
  synthName,
  scale,
  chordMode,
  octave,
  lastEventText,
  midiDeviceName,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let rafId = 0;
    const draw = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const w = canvas.width;
          const h = canvas.height;
          ctx.fillStyle = '#070A0F';
          ctx.fillRect(0, 0, w, h);

          // Subtle center gridline
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, h / 2);
          ctx.lineTo(w, h / 2);
          ctx.stroke();

          // Live audio waveform
          const samples = audioEngine.getWaveformSamples();
          ctx.strokeStyle = isRecording ? '#EF4444' : '#14B8A6';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          const slice = w / samples.length;
          for (let i = 0; i < samples.length; i++) {
            const x = i * slice;
            const y = h / 2 - samples[i] * (h * 0.44);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }
      rafId = requestAnimationFrame(draw);
    };
    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [isRecording]);

  const beat = Math.floor(currentStep / 4) + 1;
  const sub = (currentStep % 4) + 1;

  return (
    <div
      data-testid="mpk-oled-display"
      className="bg-[#070A0F] border border-[#2C3442] rounded-md px-3 py-2 flex flex-col justify-between h-[112px] min-w-[230px] shadow-inner select-none"
    >
      {/* Top OLED Header Strip */}
      <div className="flex items-center justify-between gap-2 text-[10px] font-mono tabular-nums border-b border-slate-800/80 pb-1">
        <span className="text-[#E11D48] font-semibold uppercase tracking-wider">
          {knobMode === 'plugin' ? 'PLUGIN' : knobMode === 'daw' ? 'DAW MIX' : 'MPC PAD'}
        </span>
        <span className="text-slate-400">
          BANK <strong className="text-slate-100">{padBank}</strong>
        </span>
        <span className="text-amber-400">
          {bpm} BPM · {swing}%
        </span>
      </div>

      {/* Middle: Parameter Context + Oscilloscope */}
      <div className="flex items-center justify-between gap-2.5 my-1">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold text-slate-100 truncate">
            {knobMode === 'plugin' ? synthName : kitName}
          </div>
          <div className="text-[10px] font-mono text-slate-400 truncate mt-0.5">
            {lastEventText}
          </div>
        </div>
        <canvas
          ref={canvasRef}
          width={92}
          height={34}
          aria-label="Master audio waveform scope"
          className="rounded border border-slate-800/80 shrink-0"
        />
      </div>

      {/* Bottom OLED Telemetry Row */}
      <div className="flex items-center justify-between gap-2 text-[10px] font-mono tabular-nums text-slate-400 pt-1 border-t border-slate-800/80">
        <span className="truncate">
          OCT {octave >= 0 ? `+${octave}` : octave} · {scale === 'chromatic' ? 'CHR' : scale.slice(0, 3).toUpperCase()}
          {chordMode !== 'off' ? `/${chordMode.toUpperCase()}` : ''}
        </span>
        <span className="whitespace-nowrap text-slate-300">
          {isPlaying ? `1:${beat}:${sub}` : midiDeviceName ? 'MIDI IN' : 'READY'}
        </span>
      </div>
    </div>
  );
};
