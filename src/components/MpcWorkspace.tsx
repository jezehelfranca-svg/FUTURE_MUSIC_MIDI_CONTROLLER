import React, { useRef, useState } from 'react';
import { Trash2, Upload, Volume2 } from 'lucide-react';
import type {
  KitId,
  PadBank,
  PadConfig,
  PatternData,
  SixteenLevelsMode,
} from '../types/studio';
import { KIT_LABELS } from '../engine/sequencer';
import { computeSixteenLevels, midiNoteToName } from '../engine/midi';

interface MpcWorkspaceProps {
  kitId: KitId;
  onSelectKit: (kitId: KitId) => void;
  pads: PadConfig[];
  padBank: PadBank;
  onPadBankChange: (bank: PadBank) => void;
  selectedPadIndex: number;
  onSelectPad: (index: number) => void;
  activePadFlashes: Record<number, number>; // padIndex -> velocity
  fullLevel: boolean;
  sixteenLevels: SixteenLevelsMode;
  noteRepeat: boolean;
  onPadPress: (padIndex: number, velocity: number) => void;
  onPadRelease: (padIndex: number) => void;
  onUpdatePad: (padIndex: number, patch: Partial<PadConfig>) => void;
  onUploadPadSample: (padIndex: number, file: File) => Promise<void>;
  onClearPadSample: (padIndex: number) => void;
  pattern: PatternData;
  currentStep: number;
  isPlaying: boolean;
  onToggleDrumStep: (padIndex: number, stepIndex: number) => void;
}

const PAD_HOTKEYS_8 = ['1', '2', '3', '4', 'Q', 'W', 'E', 'R'];

export const MpcWorkspace: React.FC<MpcWorkspaceProps> = ({
  kitId,
  onSelectKit,
  pads,
  padBank,
  onPadBankChange,
  selectedPadIndex,
  onSelectPad,
  activePadFlashes,
  fullLevel,
  sixteenLevels,
  noteRepeat,
  onPadPress,
  onPadRelease,
  onUpdatePad,
  onUploadPadSample,
  onClearPadSample,
  pattern,
  currentStep,
  isPlaying,
  onToggleDrumStep,
}) => {
  const [gridLayout, setGridLayout] = useState<'8-mk4' | '16-mpc'>('8-mk4');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const selectedPad = pads[selectedPadIndex] ?? pads[0];

  const visiblePads =
    gridLayout === '16-mpc'
      ? pads
      : padBank === 'A'
      ? pads.slice(0, 8)
      : pads.slice(8, 16);

  const handlePadPointerDown = (
    e: React.PointerEvent<HTMLButtonElement>,
    padIndex: number
  ) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    // Bottom of pad = soft (55), top/center = loud (127)
    const verticalRatio = 1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const velocity = fullLevel ? 127 : Math.round(58 + verticalRatio * 69);
    onPadPress(padIndex, velocity);
  };

  return (
    <div className="h-full flex flex-col lg:flex-row gap-4 p-4 overflow-y-auto">
      {/* LEFT / CENTER: Primary Focal Anchor — MPC RGB Performance Pads & Quick Step Strip */}
      <div className="flex-1 min-w-0 flex flex-col gap-3">
        {/* Kit & Pad Layout Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-base font-bold text-slate-100 tracking-tight whitespace-nowrap">
              MPC Pad Studio
            </h1>
            <select
              aria-label="Select MPC Drum Kit"
              value={kitId}
              onChange={(e) => onSelectKit(e.target.value as KitId)}
              className="bg-[#161A22] border border-[#2C3442] rounded-md px-3 py-1.5 text-xs font-medium text-slate-100 focus:outline-none focus:border-[#E11D48]"
            >
              {(Object.keys(KIT_LABELS) as KitId[]).map((id) => (
                <option key={id} value={id}>
                  {KIT_LABELS[id].name}
                </option>
              ))}
            </select>
            <span className="text-xs text-slate-400 hidden xl:inline truncate">
              {KIT_LABELS[kitId].subtitle}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {gridLayout === '8-mk4' && (
              <div className="flex items-center bg-[#141820] border border-[#282F3C] rounded-md p-0.5">
                <button
                  type="button"
                  onClick={() => onPadBankChange('A')}
                  className={`px-3 py-1 text-xs font-semibold rounded-xs transition-colors whitespace-nowrap ${
                    padBank === 'A'
                      ? 'bg-[#E11D48] text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Bank A (1–8)
                </button>
                <button
                  type="button"
                  onClick={() => onPadBankChange('B')}
                  className={`px-3 py-1 text-xs font-semibold rounded-xs transition-colors whitespace-nowrap ${
                    padBank === 'B'
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Bank B (9–16)
                </button>
              </div>
            )}

            <div className="flex items-center bg-[#141820] border border-[#282F3C] rounded-md p-0.5">
              <button
                type="button"
                onClick={() => setGridLayout('8-mk4')}
                className={`px-2.5 py-1 text-xs font-medium rounded-xs transition-colors whitespace-nowrap ${
                  gridLayout === '8-mk4'
                    ? 'bg-[#262D3B] text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                8 Pads (MK4)
              </button>
              <button
                type="button"
                onClick={() => setGridLayout('16-mpc')}
                className={`px-2.5 py-1 text-xs font-medium rounded-xs transition-colors whitespace-nowrap ${
                  gridLayout === '16-mpc'
                    ? 'bg-[#262D3B] text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                16 Pads (MPC)
              </button>
            </div>
          </div>
        </div>

        {/* Active Performance Modifiers Context Bar (clean unboxed text) */}
        <div className="flex items-center justify-between text-xs text-slate-400 px-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span>Hit pads with mouse, USB Akai MPK MK4, or keys 1–4 / Q–R</span>
            {sixteenLevels !== 'off' && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-teal-300 font-medium">
                  16 Levels Active ({sixteenLevels === 'velocity' ? 'Velocity Ladder' : 'Chromatic Pitch'} on {selectedPad.shortName})
                </span>
              </>
            )}
            {noteRepeat && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-rose-400 font-medium">Note Repeat Armed (hold pad)</span>
              </>
            )}
          </div>
          <span className="font-mono tabular-nums text-slate-500 hidden sm:inline">
            MIDI Notes {visiblePads[0]?.midiNote}–{visiblePads[visiblePads.length - 1]?.midiNote}
          </span>
        </div>

        {/* Tactile RGB Backlit MPC Pad Grid */}
        <div
          data-testid="mpc-pad-grid"
          className={`grid gap-3 flex-1 ${
            gridLayout === '8-mk4'
              ? 'grid-cols-2 sm:grid-cols-4'
              : 'grid-cols-4'
          }`}
        >
          {visiblePads.map((pad, visualIdx) => {
            const padIndex = pad.id;
            const flashVel = activePadFlashes[padIndex] ?? 0;
            const isTriggered = flashVel > 0;
            const isSelected = selectedPadIndex === padIndex;
            const activeStepsCount = pattern.drumGrid[padIndex].filter((v) => v > 0).length;
            const levelInfo =
              sixteenLevels !== 'off'
                ? computeSixteenLevels(padIndex, 110, sixteenLevels)
                : null;
            const hotkey = gridLayout === '8-mk4' ? PAD_HOTKEYS_8[visualIdx] : null;

            return (
              <button
                key={pad.id}
                type="button"
                aria-label={`Pad ${padIndex + 1} ${pad.name}`}
                onPointerDown={(e) => handlePadPointerDown(e, padIndex)}
                onPointerUp={() => onPadRelease(padIndex)}
                onPointerCancel={() => onPadRelease(padIndex)}
                onFocus={() => onSelectPad(padIndex)}
                className={`relative rounded-lg border-2 text-left p-3 flex flex-col justify-between transition-all duration-75 select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                  gridLayout === '8-mk4' ? 'min-h-[116px]' : 'min-h-[82px]'
                } ${
                  isTriggered
                    ? 'scale-[0.97]'
                    : 'hover:bg-[#222733]'
                }`}
                style={{
                  touchAction: 'none',
                  backgroundColor: isTriggered ? `${pad.color}38` : '#191D26',
                  borderColor: isTriggered
                    ? pad.color
                    : isSelected
                    ? `${pad.color}CC`
                    : '#2B3240',
                  boxShadow: isTriggered
                    ? `0 0 22px -4px ${pad.color}99, inset 0 0 18px ${pad.color}33`
                    : isSelected
                    ? `inset 0 0 0 1px ${pad.color}55`
                    : 'inset 0 1px 0 rgba(255,255,255,0.04)',
                }}
              >
                {/* Top row: Pad number + MIDI note + Hotkey */}
                <div className="flex items-center justify-between gap-1 w-full">
                  <span
                    className="text-[11px] font-mono tabular-nums font-bold"
                    style={{ color: isTriggered ? '#FFFFFF' : pad.color }}
                  >
                    PAD {padIndex + 1}
                  </span>
                  <span className="text-[10px] font-mono tabular-nums text-slate-400">
                    {midiNoteToName(pad.midiNote)}
                    {hotkey ? ` · ${hotkey}` : ''}
                  </span>
                </div>

                {/* Center: Pad Name & Custom Sample/16-Levels tag */}
                <div className="my-1">
                  <div className="text-sm font-bold text-slate-100 leading-tight truncate">
                    {sixteenLevels !== 'off' ? selectedPad.shortName : pad.name}
                  </div>
                  <div className="text-[11px] font-mono text-slate-400 truncate mt-0.5">
                    {sixteenLevels === 'velocity' && levelInfo
                      ? `Vel ${levelInfo.velocity}`
                      : sixteenLevels === 'pitch' && levelInfo
                      ? `${levelInfo.pitchOffset >= 0 ? '+' : ''}${levelInfo.pitchOffset} st`
                      : pad.customSampleName
                      ? pad.customSampleName
                      : `${activeStepsCount} ${activeStepsCount === 1 ? 'step' : 'steps'}`}
                  </div>
                </div>

                {/* Bottom RGB LED bar */}
                <div className="w-full h-1.5 rounded-full bg-[#0E1117] overflow-hidden">
                  <div
                    className="h-full transition-all duration-75"
                    style={{
                      width: isTriggered ? `${Math.round((flashVel / 127) * 100)}%` : isSelected ? '35%' : '18%',
                      backgroundColor: pad.color,
                      opacity: isTriggered ? 1 : isSelected ? 0.85 : 0.4,
                    }}
                  />
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected Pad Quick 16-Step Pattern Strip */}
        <div className="bg-[#141820] border border-[#252C38] rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-slate-100">
                16-Step Lane: Pad {selectedPad.id + 1} — {selectedPad.name}
              </span>
              <span className="text-slate-500">·</span>
              <span className="text-slate-400 font-mono tabular-nums">
                Pattern {pattern.id}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onPadPress(selectedPad.id, 118)}
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-200 bg-[#1E2430] hover:bg-[#283040] rounded border border-[#313A4B] whitespace-nowrap"
            >
              <Volume2 className="w-3.5 h-3.5" /> Audition
            </button>
          </div>

          <div className="grid grid-cols-16 gap-1">
            {pattern.drumGrid[selectedPad.id].map((vel, stepIdx) => {
              const active = vel > 0;
              const isHead = isPlaying && currentStep === stepIdx;
              const isBeat = stepIdx % 4 === 0;
              return (
                <button
                  key={stepIdx}
                  type="button"
                  aria-label={`${selectedPad.name} Step ${stepIdx + 1}`}
                  aria-pressed={active}
                  onClick={() => onToggleDrumStep(selectedPad.id, stepIdx)}
                  className={`h-8 rounded-sm border text-[10px] font-mono tabular-nums flex flex-col items-center justify-center transition-colors ${
                    isHead ? 'ring-1 ring-white' : ''
                  }`}
                  style={{
                    backgroundColor: active
                      ? selectedPad.color
                      : isBeat
                      ? '#1F2531'
                      : '#161A22',
                    borderColor: isHead
                      ? '#FFFFFF'
                      : active
                      ? selectedPad.color
                      : '#2A313F',
                    color: active ? '#FFFFFF' : '#64748B',
                  }}
                >
                  {stepIdx + 1}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* RIGHT PANEL: MPC Selected Pad Sampler & Sound Inspector */}
      <aside
        aria-label="MPC Pad Inspector"
        className="w-full lg:w-[310px] shrink-0 bg-[#141820] border border-[#252C38] rounded-lg p-3.5 flex flex-col justify-between gap-3"
      >
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-[#232936]">
            <div className="min-w-0">
              <div className="text-[11px] font-mono text-slate-400">
                PAD {selectedPad.id + 1} · MIDI {selectedPad.midiNote} ({midiNoteToName(selectedPad.midiNote)})
              </div>
              <h2 className="text-base font-bold text-slate-100 truncate mt-0.5">
                {selectedPad.name}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onPadPress(selectedPad.id, 120)}
              className="px-2.5 py-1.5 text-xs font-semibold rounded bg-[#E11D48] hover:bg-[#BE123C] text-white shrink-0 whitespace-nowrap"
            >
              Trigger
            </button>
          </div>

          {/* Custom WAV/MP3 Sample Loader */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-300">Sample Source</span>
              <span className="font-mono text-[11px] text-slate-400 truncate max-w-[145px]">
                {selectedPad.customSampleName || `Synth (${selectedPad.synthType})`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    void onUploadPadSample(selectedPad.id, file);
                  }
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-medium bg-[#1C212C] hover:bg-[#252C3A] border border-[#30394A] rounded text-slate-200 whitespace-nowrap"
              >
                <Upload className="w-3.5 h-3.5" /> Load WAV / MP3
              </button>
              {selectedPad.customSampleName && (
                <button
                  type="button"
                  onClick={() => onClearPadSample(selectedPad.id)}
                  aria-label="Revert to built-in synth sample"
                  className="p-1.5 text-slate-400 hover:text-rose-400 bg-[#1C212C] border border-[#30394A] rounded"
                  title="Revert to built-in drum engine"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Pad Sound Shaping Sliders */}
          <div className="space-y-2.5 pt-0.5">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <label htmlFor="pad-tune" className="text-slate-300">Tune / Pitch</label>
                <span className="font-mono tabular-nums text-slate-400">
                  {selectedPad.tune > 0 ? `+${selectedPad.tune}` : selectedPad.tune} st
                </span>
              </div>
              <input
                id="pad-tune"
                type="range"
                min={-12}
                max={12}
                step={1}
                value={selectedPad.tune}
                onChange={(e) => onUpdatePad(selectedPad.id, { tune: Number(e.target.value) })}
                className="w-full studio-range"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <label htmlFor="pad-decay" className="text-slate-300">Decay Envelope</label>
                <span className="font-mono tabular-nums text-slate-400">
                  {selectedPad.decay.toFixed(2)} s
                </span>
              </div>
              <input
                id="pad-decay"
                type="range"
                min={0.08}
                max={2.0}
                step={0.02}
                value={selectedPad.decay}
                onChange={(e) => onUpdatePad(selectedPad.id, { decay: Number(e.target.value) })}
                className="w-full studio-range"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <label htmlFor="pad-cutoff" className="text-slate-300">Filter Cutoff</label>
                <span className="font-mono tabular-nums text-slate-400">
                  {selectedPad.cutoff >= 1000
                    ? `${(selectedPad.cutoff / 1000).toFixed(1)} kHz`
                    : `${Math.round(selectedPad.cutoff)} Hz`}
                </span>
              </div>
              <input
                id="pad-cutoff"
                type="range"
                min={300}
                max={18000}
                step={100}
                value={selectedPad.cutoff}
                onChange={(e) => onUpdatePad(selectedPad.id, { cutoff: Number(e.target.value) })}
                className="w-full studio-range"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <label htmlFor="pad-gain" className="text-slate-300">Level</label>
                  <span className="font-mono tabular-nums text-slate-400">
                    {Math.round(selectedPad.gain * 100)}%
                  </span>
                </div>
                <input
                  id="pad-gain"
                  type="range"
                  min={0}
                  max={1.2}
                  step={0.02}
                  value={selectedPad.gain}
                  onChange={(e) => onUpdatePad(selectedPad.id, { gain: Number(e.target.value) })}
                  className="w-full studio-range"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <label htmlFor="pad-pan" className="text-slate-300">Pan</label>
                  <span className="font-mono tabular-nums text-slate-400">
                    {selectedPad.pan === 0
                      ? 'C'
                      : selectedPad.pan < 0
                      ? `L${Math.round(Math.abs(selectedPad.pan) * 50)}`
                      : `R${Math.round(selectedPad.pan * 50)}`}
                  </span>
                </div>
                <input
                  id="pad-pan"
                  type="range"
                  min={-1}
                  max={1}
                  step={0.05}
                  value={selectedPad.pan}
                  onChange={(e) => onUpdatePad(selectedPad.id, { pan: Number(e.target.value) })}
                  className="w-full studio-range"
                />
              </div>
            </div>

            <div>
              <label htmlFor="pad-choke" className="block text-xs text-slate-300 mb-1">
                Mute / Choke Group
              </label>
              <select
                id="pad-choke"
                value={selectedPad.chokeGroup}
                onChange={(e) =>
                  onUpdatePad(selectedPad.id, { chokeGroup: Number(e.target.value) })
                }
                className="w-full bg-[#0E1117] border border-[#2D3544] rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-[#E11D48]"
              >
                <option value={0}>Off (Polyphonic)</option>
                <option value={1}>Group 1 — Hi-Hat Choke</option>
                <option value={2}>Group 2 — Sample Chop Cut</option>
              </select>
            </div>
          </div>
        </div>

        <div className="pt-2 border-t border-[#232936] text-[11px] text-slate-400">
          Encoder Mode <strong className="text-slate-200">Pad</strong> maps K1–K7 to this voice.
        </div>
      </aside>
    </div>
  );
};
