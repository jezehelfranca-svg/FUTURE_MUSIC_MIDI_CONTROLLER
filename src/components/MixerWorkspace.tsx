import React, { useEffect, useRef } from 'react';
import { audioEngine } from '../audio/AudioEngine';
import type {
  MasterFxParams,
  SynthPresetId,
  TrackId,
  TrackMixerChannel,
} from '../types/studio';
import { SYNTH_PRESETS, isTrackAudible } from '../engine/sequencer';
import { RotaryKnob } from './RotaryKnob';

interface MixerWorkspaceProps {
  mixer: Record<TrackId, TrackMixerChannel>;
  fx: MasterFxParams;
  onUpdateChannel: (trackId: TrackId, patch: Partial<TrackMixerChannel>) => void;
  onUpdateMasterVolume: (vol: number) => void;
}

const TRACK_ORDER: TrackId[] = ['drums', 'bass', 'keys', 'lead'];

function formatDb(linear: number): string {
  if (linear <= 0.001) return '-∞ dB';
  const db = 20 * Math.log10(linear);
  return `${db >= 0 ? '+' : ''}${db.toFixed(1)} dB`;
}

export const MixerWorkspace: React.FC<MixerWorkspaceProps> = ({
  mixer,
  fx,
  onUpdateChannel,
  onUpdateMasterVolume,
}) => {
  const meterRefs = useRef<Record<TrackId | 'master', HTMLDivElement | null>>({
    drums: null,
    bass: null,
    keys: null,
    lead: null,
    master: null,
  });

  useEffect(() => {
    let rafId = 0;
    const tick = () => {
      const levels = audioEngine.getTrackLevels();
      (['drums', 'bass', 'keys', 'lead', 'master'] as const).forEach((key) => {
        const el = meterRefs.current[key];
        if (el) {
          el.style.transform = `scaleY(${Math.max(0.02, Math.min(1, levels[key]))})`;
        }
      });
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div className="h-full p-4 overflow-y-auto flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold text-slate-100">DAW Studio Mixer</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Channel levels, stereo panning, FX sends, and Mute / Solo routing
          </p>
        </div>
        <span className="text-xs text-slate-400 font-mono hidden sm:inline">
          Switch MPK MK4 Encoder Mode to DAW to mix with K1–K4
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 flex-1">
        {TRACK_ORDER.map((id) => {
          const ch = mixer[id];
          const audible = isTrackAudible(id, mixer);
          return (
            <section
              key={id}
              aria-label={`${ch.name} Mixer Channel`}
              className="bg-[#141820] border border-[#252C38] rounded-lg p-3.5 flex flex-col justify-between gap-3"
            >
              {/* Channel Header */}
              <div className={`space-y-2 pb-2.5 border-b border-[#222835] transition-opacity ${audible ? 'opacity-100' : 'opacity-55'}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-xs shrink-0"
                      style={{ backgroundColor: ch.color }}
                      aria-hidden="true"
                    />
                    <h2 className="text-xs font-bold text-slate-100 truncate">{ch.name}</h2>
                  </div>
                  <span className={`text-[10px] font-mono tabular-nums ${audible ? 'text-teal-400' : 'text-rose-400'}`}>
                    {audible ? 'ON' : 'MUTED'}
                  </span>
                </div>

                {id !== 'drums' ? (
                  <select
                    aria-label={`${ch.name} Instrument Preset`}
                    value={ch.synthPreset}
                    onChange={(e) =>
                      onUpdateChannel(id, { synthPreset: e.target.value as SynthPresetId })
                    }
                    className="w-full bg-[#0E1117] border border-[#2B3342] rounded px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-[#E11D48]"
                  >
                    {(Object.keys(SYNTH_PRESETS) as SynthPresetId[]).map((presetId) => (
                      <option key={presetId} value={presetId}>
                        {SYNTH_PRESETS[presetId].name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="text-[11px] text-slate-400 py-1 px-2 bg-[#0E1117] border border-[#222835] rounded truncate">
                    16-Pad MPC Drum Bus
                  </div>
                )}
              </div>

              {/* Pan & FX Sends */}
              <div className={`flex items-center justify-around py-1 transition-opacity ${audible ? 'opacity-100' : 'opacity-55'}`}>
                <RotaryKnob
                  label="Pan"
                  size={44}
                  value={(ch.pan + 1) / 2}
                  displayValue={
                    ch.pan === 0
                      ? 'C'
                      : ch.pan < 0
                      ? `L${Math.round(Math.abs(ch.pan) * 50)}`
                      : `R${Math.round(ch.pan * 50)}`
                  }
                  onChange={(v) => onUpdateChannel(id, { pan: Number((v * 2 - 1).toFixed(2)) })}
                  accentColor={ch.color}
                />
                <RotaryKnob
                  label="Reverb"
                  size={44}
                  value={ch.reverbSend}
                  displayValue={`${Math.round(ch.reverbSend * 100)}%`}
                  onChange={(v) => onUpdateChannel(id, { reverbSend: v })}
                  accentColor="#F59E0B"
                />
                <RotaryKnob
                  label="Delay"
                  size={44}
                  value={ch.delaySend}
                  displayValue={`${Math.round(ch.delaySend * 100)}%`}
                  onChange={(v) => onUpdateChannel(id, { delaySend: v })}
                  accentColor="#14B8A6"
                />
              </div>

              {/* Volume Fader + Live RMS Meter */}
              <div className={`flex items-center justify-center gap-4 py-2 bg-[#0F1219] border border-[#212734] rounded-md px-3 flex-1 min-h-[155px] transition-opacity ${audible ? 'opacity-100' : 'opacity-55'}`}>
                <div className="flex flex-col items-center gap-2 flex-1">
                  <label htmlFor={`fader-${id}`} className="text-[11px] font-mono tabular-nums text-slate-300">
                    {formatDb(ch.volume)}
                  </label>
                  <input
                    id={`fader-${id}`}
                    type="range"
                    min={0}
                    max={1.2}
                    step={0.01}
                    value={ch.volume}
                    onChange={(e) => onUpdateChannel(id, { volume: Number(e.target.value) })}
                    className="w-full studio-range"
                  />
                  <div className="w-full flex justify-between text-[9px] font-mono text-slate-500">
                    <span>-∞</span>
                    <span>0 dB</span>
                    <span>+1.5</span>
                  </div>
                </div>

                {/* Live Vertical Level Meter */}
                <div
                  className="w-3.5 h-28 bg-[#080A0E] border border-[#252C38] rounded-xs overflow-hidden flex items-end p-0.5 shrink-0"
                  aria-hidden="true"
                >
                  <div
                    ref={(el) => {
                      meterRefs.current[id] = el;
                    }}
                    className="w-full h-full origin-bottom rounded-xs transition-transform duration-75"
                    style={{
                      transform: 'scaleY(0.02)',
                      background: `linear-gradient(to top, #14B8A6 0%, #F59E0B 72%, #E11D48 100%)`,
                    }}
                  />
                </div>
              </div>

              {/* Mute & Solo Switches */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  aria-label={`Mute ${ch.name}`}
                  aria-pressed={ch.muted}
                  onClick={() => onUpdateChannel(id, { muted: !ch.muted })}
                  className={`py-1.5 text-xs font-bold rounded border transition-colors ${
                    ch.muted
                      ? 'bg-[#E11D48] border-[#E11D48] text-white'
                      : 'bg-[#1A1F29] border-[#2C3442] text-slate-300 hover:text-white'
                  }`}
                >
                  Mute
                </button>
                <button
                  type="button"
                  aria-label={`Solo ${ch.name}`}
                  aria-pressed={ch.solo}
                  onClick={() => onUpdateChannel(id, { solo: !ch.solo })}
                  className={`py-1.5 text-xs font-bold rounded border transition-colors ${
                    ch.solo
                      ? 'bg-amber-500 border-amber-500 text-slate-950'
                      : 'bg-[#1A1F29] border-[#2C3442] text-slate-300 hover:text-white'
                  }`}
                >
                  Solo
                </button>
              </div>
            </section>
          );
        })}

        {/* MASTER BUS STRIP */}
        <section
          aria-label="Master Output Bus"
          className="bg-[#181C26] border border-[#353D4F] rounded-lg p-3.5 flex flex-col justify-between gap-3"
        >
          <div className="pb-2.5 border-b border-[#293140]">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-white uppercase tracking-wider">Master Out</h2>
              <span className="text-[10px] font-mono text-[#E11D48]">STEREO BUS</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Bus limiter &amp; global output stage
            </p>
          </div>

          <div className="flex items-center justify-center gap-4 py-3 bg-[#0D1017] border border-[#262E3C] rounded-md px-3 flex-1 min-h-[210px]">
            <div className="flex flex-col items-center gap-3 flex-1">
              <label htmlFor="fader-master" className="text-sm font-mono font-bold tabular-nums text-white">
                {formatDb(fx.masterVolume)}
              </label>
              <input
                id="fader-master"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={fx.masterVolume}
                onChange={(e) => onUpdateMasterVolume(Number(e.target.value))}
                className="w-full studio-range"
              />
              <span className="text-[11px] font-mono text-slate-400">
                {Math.round(fx.masterVolume * 100)}% Gain
              </span>
            </div>

            <div
              className="w-5 h-36 bg-[#07090D] border border-[#293140] rounded-xs overflow-hidden flex items-end p-0.5 shrink-0"
              aria-hidden="true"
            >
              <div
                ref={(el) => {
                  meterRefs.current.master = el;
                }}
                className="w-full h-full origin-bottom rounded-xs transition-transform duration-75"
                style={{
                  transform: 'scaleY(0.02)',
                  background: `linear-gradient(to top, #14B8A6 0%, #F59E0B 75%, #E11D48 100%)`,
                }}
              />
            </div>
          </div>

          <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between pt-1">
            <span>Compressor</span>
            <span className="text-teal-400">Active (-10 dB)</span>
          </div>
        </section>
      </div>
    </div>
  );
};
