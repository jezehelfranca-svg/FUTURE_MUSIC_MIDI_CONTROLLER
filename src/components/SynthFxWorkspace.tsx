import React from 'react';
import type {
  MasterFxParams,
  SynthParams,
  SynthPresetId,
} from '../types/studio';
import { SYNTH_PRESETS } from '../engine/sequencer';
import { RotaryKnob } from './RotaryKnob';

interface SynthFxWorkspaceProps {
  synth: SynthParams;
  fx: MasterFxParams;
  onSelectPreset: (presetId: SynthPresetId) => void;
  onUpdateSynth: (patch: Partial<SynthParams>) => void;
  onUpdateFx: (patch: Partial<MasterFxParams>) => void;
  onAuditionChord: () => void;
}

export const SynthFxWorkspace: React.FC<SynthFxWorkspaceProps> = ({
  synth,
  fx,
  onSelectPreset,
  onUpdateSynth,
  onUpdateFx,
  onAuditionChord,
}) => {
  // Compute ADSR SVG curve points (width 240, height 84)
  const w = 240;
  const h = 84;
  const pad = 8;
  const aX = pad + Math.min(60, (synth.attack / 1.2) * 60);
  const dX = aX + Math.min(65, (synth.decay / 1.5) * 65);
  const sY = h - pad - synth.sustain * (h - pad * 2);
  const sEndX = dX + 42;
  const rX = Math.min(w - pad, sEndX + (synth.release / 2.5) * 60);
  const adsrPath = `M ${pad} ${h - pad} L ${aX} ${pad} L ${dX} ${sY} L ${sEndX} ${sY} L ${rX} ${h - pad}`;
  const adsrFill = `${adsrPath} L ${pad} ${h - pad} Z`;

  return (
    <div className="h-full p-4 overflow-y-auto">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* LEFT: Polyphonic Synth Engine (7 cols) */}
        <section
          aria-label="Polyphonic Synthesizer"
          className="xl:col-span-7 bg-[#141820] border border-[#252C38] rounded-lg p-4 flex flex-col gap-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#222835]">
            <div>
              <h1 className="text-base font-bold text-slate-100">Polyphonic Synthesizer</h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Dual-oscillator voice engine mapped to MPK MK4 keybed &amp; Plugin encoders
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                aria-label="Synth Preset"
                value={synth.presetId}
                onChange={(e) => onSelectPreset(e.target.value as SynthPresetId)}
                className="bg-[#0E1117] border border-[#2D3544] rounded px-3 py-1.5 text-xs font-medium text-slate-100 focus:outline-none focus:border-[#E11D48]"
              >
                {(Object.keys(SYNTH_PRESETS) as SynthPresetId[]).map((id) => (
                  <option key={id} value={id}>
                    {SYNTH_PRESETS[id].name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={onAuditionChord}
                className="px-3 py-1.5 text-xs font-semibold bg-[#E11D48] hover:bg-[#BE123C] text-white rounded whitespace-nowrap"
              >
                Test Chord
              </button>
            </div>
          </div>

          {/* Oscillators & Filter */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Oscillators */}
            <div className="bg-[#10131A] border border-[#222835] rounded-md p-3.5 space-y-3">
              <h2 className="text-xs font-semibold text-slate-300">Oscillator Bank</h2>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="osc-main" className="block text-[11px] text-slate-400 mb-1">
                    Main Wave
                  </label>
                  <select
                    id="osc-main"
                    value={synth.waveform}
                    onChange={(e) => onUpdateSynth({ waveform: e.target.value as OscillatorType })}
                    className="w-full bg-[#171C26] border border-[#2B3342] rounded px-2 py-1 text-xs text-slate-200"
                  >
                    <option value="sawtooth">Sawtooth</option>
                    <option value="square">Square</option>
                    <option value="triangle">Triangle</option>
                    <option value="sine">Sine</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="osc-sub" className="block text-[11px] text-slate-400 mb-1">
                    Sub Wave (-1 Oct)
                  </label>
                  <select
                    id="osc-sub"
                    value={synth.subWaveform}
                    onChange={(e) => onUpdateSynth({ subWaveform: e.target.value as OscillatorType })}
                    className="w-full bg-[#171C26] border border-[#2B3342] rounded px-2 py-1 text-xs text-slate-200"
                  >
                    <option value="sine">Sine</option>
                    <option value="triangle">Triangle</option>
                    <option value="square">Square</option>
                    <option value="sawtooth">Sawtooth</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-around pt-1">
                <RotaryKnob
                  label="Sub Mix"
                  value={synth.subMix}
                  displayValue={`${Math.round(synth.subMix * 100)}%`}
                  onChange={(v) => onUpdateSynth({ subMix: v })}
                  accentColor="#E11D48"
                />
                <RotaryKnob
                  label="Detune"
                  value={synth.detune / 40}
                  displayValue={`${Math.round(synth.detune)} ct`}
                  onChange={(v) => onUpdateSynth({ detune: Math.round(v * 40) })}
                  accentColor="#E11D48"
                />
                <RotaryKnob
                  label="Vibrato"
                  value={synth.lfoDepth}
                  displayValue={`${Math.round(synth.lfoDepth * 100)}%`}
                  onChange={(v) => onUpdateSynth({ lfoDepth: v })}
                  accentColor="#14B8A6"
                />
              </div>
            </div>

            {/* Filter & LFO */}
            <div className="bg-[#10131A] border border-[#222835] rounded-md p-3.5 space-y-3">
              <h2 className="text-xs font-semibold text-slate-300">Lowpass Filter &amp; LFO</h2>
              <div className="flex items-center justify-around pt-3">
                <RotaryKnob
                  label="Cutoff"
                  subLabel="CC 24"
                  value={Math.log(synth.cutoff / 120) / Math.log(16000 / 120)}
                  displayValue={
                    synth.cutoff >= 1000
                      ? `${(synth.cutoff / 1000).toFixed(1)}kHz`
                      : `${Math.round(synth.cutoff)}Hz`
                  }
                  onChange={(v) => onUpdateSynth({ cutoff: 120 * Math.pow(16000 / 120, v) })}
                  accentColor="#E11D48"
                />
                <RotaryKnob
                  label="Resonance"
                  subLabel="CC 25"
                  value={(synth.resonance - 0.5) / 17.5}
                  displayValue={synth.resonance.toFixed(1)}
                  onChange={(v) => onUpdateSynth({ resonance: 0.5 + v * 17.5 })}
                  accentColor="#E11D48"
                />
                <RotaryKnob
                  label="LFO Rate"
                  value={(synth.lfoRate - 0.5) / 11.5}
                  displayValue={`${synth.lfoRate.toFixed(1)} Hz`}
                  onChange={(v) => onUpdateSynth({ lfoRate: 0.5 + v * 11.5 })}
                  accentColor="#14B8A6"
                />
              </div>
            </div>
          </div>

          {/* ADSR Amplitude Envelope */}
          <div className="bg-[#10131A] border border-[#222835] rounded-md p-3.5">
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="shrink-0">
                <div className="text-xs font-semibold text-slate-300 mb-2">Amplitude Envelope (ADSR)</div>
                <svg
                  width={w}
                  height={h}
                  viewBox={`0 0 ${w} ${h}`}
                  className="bg-[#090C11] border border-[#232A36] rounded"
                  aria-label="ADSR envelope curve"
                >
                  <path d={adsrFill} fill="rgba(225, 29, 72, 0.16)" />
                  <path d={adsrPath} fill="none" stroke="#E11D48" strokeWidth="2" strokeLinejoin="round" />
                  <circle cx={aX} cy={pad} r="3" fill="#F8FAFC" />
                  <circle cx={dX} cy={sY} r="3" fill="#F8FAFC" />
                  <circle cx={sEndX} cy={sY} r="3" fill="#F8FAFC" />
                </svg>
              </div>

              <div className="flex-1 w-full grid grid-cols-4 gap-2 justify-items-center">
                <RotaryKnob
                  label="Attack"
                  subLabel="CC 26"
                  value={(synth.attack - 0.005) / 1.195}
                  displayValue={`${Math.round(synth.attack * 1000)}ms`}
                  onChange={(v) => onUpdateSynth({ attack: 0.005 + v * 1.195 })}
                />
                <RotaryKnob
                  label="Decay"
                  value={(synth.decay - 0.05) / 1.45}
                  displayValue={`${synth.decay.toFixed(2)}s`}
                  onChange={(v) => onUpdateSynth({ decay: 0.05 + v * 1.45 })}
                />
                <RotaryKnob
                  label="Sustain"
                  value={synth.sustain}
                  displayValue={`${Math.round(synth.sustain * 100)}%`}
                  onChange={(v) => onUpdateSynth({ sustain: v })}
                />
                <RotaryKnob
                  label="Release"
                  subLabel="CC 27"
                  value={(synth.release - 0.05) / 2.45}
                  displayValue={`${synth.release.toFixed(2)}s`}
                  onChange={(v) => onUpdateSynth({ release: 0.05 + v * 2.45 })}
                />
              </div>
            </div>
          </div>
        </section>

        {/* RIGHT: Master Bus FX Rack (5 cols) */}
        <section
          aria-label="Master Effects Rack"
          className="xl:col-span-5 bg-[#141820] border border-[#252C38] rounded-lg p-4 flex flex-col gap-4"
        >
          <div className="pb-3 border-b border-[#222835]">
            <h2 className="text-base font-bold text-slate-100">Master Effects Rack</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Global stereo bus processing, tape saturation, delay, and convolution reverb
            </p>
          </div>

          {/* Stereo Delay */}
          <div className="bg-[#10131A] border border-[#222835] rounded-md p-3.5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-200">Stereo Tape Delay</span>
              <span className="text-[11px] font-mono tabular-nums text-teal-400">
                {Math.round(fx.delayTime * 1000)} ms
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 justify-items-center">
              <RotaryKnob
                label="Time"
                value={(fx.delayTime - 0.08) / 0.67}
                displayValue={`${Math.round(fx.delayTime * 1000)}ms`}
                onChange={(v) => onUpdateFx({ delayTime: 0.08 + v * 0.67 })}
                accentColor="#14B8A6"
              />
              <RotaryKnob
                label="Feedback"
                value={fx.delayFeedback / 0.75}
                displayValue={`${Math.round((fx.delayFeedback / 0.75) * 100)}%`}
                onChange={(v) => onUpdateFx({ delayFeedback: v * 0.75 })}
                accentColor="#14B8A6"
              />
              <RotaryKnob
                label="Mix"
                subLabel="CC 28"
                value={fx.delayMix / 0.8}
                displayValue={`${Math.round((fx.delayMix / 0.8) * 100)}%`}
                onChange={(v) => onUpdateFx({ delayMix: v * 0.8 })}
                accentColor="#14B8A6"
              />
            </div>
          </div>

          {/* Space Reverb & Analog Drive */}
          <div className="bg-[#10131A] border border-[#222835] rounded-md p-3.5">
            <div className="text-xs font-semibold text-slate-200 mb-3">
              Studio Reverb &amp; Analog Color
            </div>
            <div className="grid grid-cols-3 gap-2 justify-items-center">
              <RotaryKnob
                label="Reverb Mix"
                subLabel="CC 29"
                value={fx.reverbMix / 0.85}
                displayValue={`${Math.round((fx.reverbMix / 0.85) * 100)}%`}
                onChange={(v) => onUpdateFx({ reverbMix: v * 0.85 })}
                accentColor="#F59E0B"
              />
              <RotaryKnob
                label="Tape Drive"
                subLabel="CC 30"
                value={fx.drive}
                displayValue={`${Math.round(fx.drive * 100)}%`}
                onChange={(v) => onUpdateFx({ drive: v })}
                accentColor="#F59E0B"
              />
              <RotaryKnob
                label="Master Out"
                subLabel="CC 31"
                value={fx.masterVolume}
                displayValue={`${Math.round(fx.masterVolume * 100)}%`}
                onChange={(v) => onUpdateFx({ masterVolume: v })}
                accentColor="#E11D48"
              />
            </div>
          </div>

          {/* Master DJ Lowpass Filter */}
          <div className="bg-[#10131A] border border-[#222835] rounded-md p-3.5 space-y-2.5">
            <div className="flex justify-between text-xs">
              <label htmlFor="master-lp-cutoff" className="font-semibold text-slate-200">
                Master Lowpass Sweep
              </label>
              <span className="font-mono tabular-nums text-slate-400">
                {fx.filterCutoff >= 1000
                  ? `${(fx.filterCutoff / 1000).toFixed(1)} kHz`
                  : `${Math.round(fx.filterCutoff)} Hz`}
              </span>
            </div>
            <input
              id="master-lp-cutoff"
              type="range"
              min={250}
              max={20000}
              step={50}
              value={fx.filterCutoff}
              onChange={(e) => onUpdateFx({ filterCutoff: Number(e.target.value) })}
              className="w-full studio-range"
            />
          </div>
        </section>
      </div>
    </div>
  );
};
