import React, { useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type {
  ArpMode,
  ChordMode,
  KnobMode,
  MasterFxParams,
  MidiLearnTarget,
  MidiMappingConfig,
  NoteRepeatRate,
  PadBank,
  PadConfig,
  ScaleId,
  SixteenLevelsMode,
  SynthParams,
  TrackId,
  TrackMixerChannel,
} from '../types/studio';
import { midiNoteToName, snapNoteToScale } from '../engine/midi';
import { OledDisplay } from './OledDisplay';
import { RotaryKnob } from './RotaryKnob';

interface MpkHardwareDeckProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  bpm: number;
  swing: number;
  isPlaying: boolean;
  isRecording: boolean;
  currentStep: number;
  kitName: string;
  synthName: string;
  knobMode: KnobMode;
  onKnobModeChange: (mode: KnobMode) => void;
  padBank: PadBank;
  onPadBankChange: (bank: PadBank) => void;
  octave: number;
  onOctaveChange: (nextOctave: number) => void;
  scale: ScaleId;
  onScaleChange: (scale: ScaleId) => void;
  chordMode: ChordMode;
  onChordModeChange: (mode: ChordMode) => void;
  arpMode: ArpMode;
  onArpModeChange: (mode: ArpMode) => void;
  fullLevel: boolean;
  onToggleFullLevel: () => void;
  sixteenLevels: SixteenLevelsMode;
  onCycleSixteenLevels: () => void;
  noteRepeat: boolean;
  onToggleNoteRepeat: () => void;
  noteRepeatRate: NoteRepeatRate;
  onNoteRepeatRateChange: (rate: NoteRepeatRate) => void;
  pitchBend: number; // -1..1
  onPitchBendChange: (val: number) => void;
  modWheel: number; // 0..1
  onModWheelChange: (val: number) => void;
  activeNotes: Set<number>;
  onKeyDownNote: (midiNote: number, velocity: number) => void;
  onKeyUpNote: (midiNote: number) => void;
  synth: SynthParams;
  fx: MasterFxParams;
  mixer: Record<TrackId, TrackMixerChannel>;
  selectedPad: PadConfig;
  midiMapping: MidiMappingConfig;
  midiLearnTarget: MidiLearnTarget | null;
  onKnobValueChange: (knobIndex: number, normalized: number) => void;
  onStartMidiLearn?: (target: MidiLearnTarget) => void;
  lastEventText: string;
  midiDeviceName: string | null;
  activeTrack: TrackId;
  onActiveTrackChange: (track: TrackId) => void;
}

const WHITE_KEY_OFFSETS = [0, 2, 4, 5, 7, 9, 11];
const BLACK_KEY_AFTER_WHITE: Record<number, number> = {
  0: 1,
  1: 3,
  3: 6,
  4: 8,
  5: 10,
};

export const MpkHardwareDeck: React.FC<MpkHardwareDeckProps> = ({
  collapsed,
  onToggleCollapsed,
  bpm,
  swing,
  isPlaying,
  isRecording,
  currentStep,
  kitName,
  synthName,
  knobMode,
  onKnobModeChange,
  padBank,
  onPadBankChange,
  octave,
  onOctaveChange,
  scale,
  onScaleChange,
  chordMode,
  onChordModeChange,
  arpMode,
  onArpModeChange,
  fullLevel,
  onToggleFullLevel,
  sixteenLevels,
  onCycleSixteenLevels,
  noteRepeat,
  onToggleNoteRepeat,
  noteRepeatRate,
  onNoteRepeatRateChange,
  pitchBend,
  onPitchBendChange,
  modWheel,
  onModWheelChange,
  activeNotes,
  onKeyDownNote,
  onKeyUpNote,
  synth,
  fx,
  mixer,
  selectedPad,
  midiMapping,
  midiLearnTarget,
  onKnobValueChange,
  lastEventText,
  midiDeviceName,
  activeTrack,
  onActiveTrackChange,
}) => {
  const [draggingWheel, setDraggingWheel] = useState<'pitch' | 'mod' | null>(null);
  const wheelRef = useRef<{ startY: number; startVal: number }>({ startY: 0, startVal: 0 });

  // Build the 8 contextual MPK MK4 encoders based on PLUGIN / DAW / PAD mode
  const knobs = useMemo(() => {
    const ccs = midiMapping.knobCCs;
    if (knobMode === 'plugin') {
      return [
        {
          label: 'Cutoff',
          cc: ccs[0],
          val: Math.log(synth.cutoff / 120) / Math.log(16000 / 120),
          display: synth.cutoff >= 1000 ? `${(synth.cutoff / 1000).toFixed(1)}k` : `${Math.round(synth.cutoff)}Hz`,
          def: 0.65,
        },
        {
          label: 'Reso',
          cc: ccs[1],
          val: (synth.resonance - 0.5) / 17.5,
          display: synth.resonance.toFixed(1),
          def: 0.15,
        },
        {
          label: 'Attack',
          cc: ccs[2],
          val: (synth.attack - 0.005) / 1.195,
          display: `${Math.round(synth.attack * 1000)}ms`,
          def: 0.02,
        },
        {
          label: 'Release',
          cc: ccs[3],
          val: (synth.release - 0.05) / 2.45,
          display: `${synth.release.toFixed(2)}s`,
          def: 0.25,
        },
        {
          label: 'Delay',
          cc: ccs[4],
          val: fx.delayMix / 0.8,
          display: `${Math.round((fx.delayMix / 0.8) * 100)}%`,
          def: 0,
        },
        {
          label: 'Reverb',
          cc: ccs[5],
          val: fx.reverbMix / 0.85,
          display: `${Math.round((fx.reverbMix / 0.85) * 100)}%`,
          def: 0.28,
        },
        {
          label: 'Drive',
          cc: ccs[6],
          val: fx.drive,
          display: `${Math.round(fx.drive * 100)}%`,
          def: 0.14,
        },
        {
          label: 'Master',
          cc: ccs[7],
          val: fx.masterVolume,
          display: `${Math.round(fx.masterVolume * 100)}%`,
          def: 0.85,
        },
      ];
    }

    if (knobMode === 'daw') {
      return [
        {
          label: 'Drums Vol',
          cc: ccs[0],
          val: mixer.drums.volume / 1.2,
          display: `${Math.round(mixer.drums.volume * 100)}%`,
          def: 0.76,
        },
        {
          label: 'Bass Vol',
          cc: ccs[1],
          val: mixer.bass.volume / 1.2,
          display: `${Math.round(mixer.bass.volume * 100)}%`,
          def: 0.7,
        },
        {
          label: 'Keys Vol',
          cc: ccs[2],
          val: mixer.keys.volume / 1.2,
          display: `${Math.round(mixer.keys.volume * 100)}%`,
          def: 0.63,
        },
        {
          label: 'Lead Vol',
          cc: ccs[3],
          val: mixer.lead.volume / 1.2,
          display: `${Math.round(mixer.lead.volume * 100)}%`,
          def: 0.6,
        },
        {
          label: 'Swing',
          cc: ccs[4],
          val: (swing - 50) / 25,
          display: `${swing}%`,
          def: 0.32,
        },
        {
          label: 'Mst Filter',
          cc: ccs[5],
          val: Math.log(fx.filterCutoff / 200) / Math.log(20000 / 200),
          display: fx.filterCutoff >= 1000 ? `${(fx.filterCutoff / 1000).toFixed(1)}k` : `${Math.round(fx.filterCutoff)}Hz`,
          def: 0.98,
        },
        {
          label: 'Delay FB',
          cc: ccs[6],
          val: fx.delayFeedback / 0.75,
          display: `${Math.round((fx.delayFeedback / 0.75) * 100)}%`,
          def: 0.45,
        },
        {
          label: 'Master',
          cc: ccs[7],
          val: fx.masterVolume,
          display: `${Math.round(fx.masterVolume * 100)}%`,
          def: 0.85,
        },
      ];
    }

    // Pad mode: controls selected MPC pad
    return [
      {
        label: 'Pad Tune',
        cc: ccs[0],
        val: (selectedPad.tune + 12) / 24,
        display: `${selectedPad.tune > 0 ? '+' : ''}${selectedPad.tune}st`,
        def: 0.5,
      },
      {
        label: 'Decay',
        cc: ccs[1],
        val: (selectedPad.decay - 0.05) / 1.95,
        display: `${selectedPad.decay.toFixed(2)}s`,
        def: 0.35,
      },
      {
        label: 'Cutoff',
        cc: ccs[2],
        val: Math.log(selectedPad.cutoff / 200) / Math.log(18000 / 200),
        display: selectedPad.cutoff >= 1000 ? `${(selectedPad.cutoff / 1000).toFixed(1)}k` : `${Math.round(selectedPad.cutoff)}Hz`,
        def: 0.8,
      },
      {
        label: 'Level',
        cc: ccs[3],
        val: selectedPad.gain / 1.2,
        display: `${Math.round(selectedPad.gain * 100)}%`,
        def: 0.75,
      },
      {
        label: 'Pan',
        cc: ccs[4],
        val: (selectedPad.pan + 1) / 2,
        display: selectedPad.pan === 0 ? 'C' : selectedPad.pan < 0 ? `L${Math.round(Math.abs(selectedPad.pan) * 50)}` : `R${Math.round(selectedPad.pan * 50)}`,
        def: 0.5,
      },
      {
        label: 'Rev Send',
        cc: ccs[5],
        val: selectedPad.reverbSend,
        display: `${Math.round(selectedPad.reverbSend * 100)}%`,
        def: 0.2,
      },
      {
        label: 'Dly Send',
        cc: ccs[6],
        val: selectedPad.delaySend,
        display: `${Math.round(selectedPad.delaySend * 100)}%`,
        def: 0.1,
      },
      {
        label: 'Master',
        cc: ccs[7],
        val: fx.masterVolume,
        display: `${Math.round(fx.masterVolume * 100)}%`,
        def: 0.85,
      },
    ];
  }, [knobMode, midiMapping.knobCCs, synth, fx, mixer, swing, selectedPad]);

  // 25 keys: C3 (48) + octave*12 up to C5 (72) + octave*12
  const baseMidiNote = 48 + octave * 12;
  const whiteKeys = useMemo(() => {
    const keys: Array<{ midi: number; octaveOffset: number; whiteIdxInOctave: number }> = [];
    for (let oct = 0; oct < 2; oct++) {
      for (let w = 0; w < 7; w++) {
        keys.push({
          midi: baseMidiNote + oct * 12 + WHITE_KEY_OFFSETS[w],
          octaveOffset: oct,
          whiteIdxInOctave: w,
        });
      }
    }
    // 25th key: top C
    keys.push({ midi: baseMidiNote + 24, octaveOffset: 2, whiteIdxInOctave: 0 });
    return keys;
  }, [baseMidiNote]);

  const blackKeys = useMemo(() => {
    const keys: Array<{ midi: number; leftPct: number }> = [];
    const totalWhites = 15;
    for (let oct = 0; oct < 2; oct++) {
      Object.entries(BLACK_KEY_AFTER_WHITE).forEach(([wStr, semitone]) => {
        const w = Number(wStr);
        const globalWhiteIdx = oct * 7 + w;
        const leftPct = ((globalWhiteIdx + 0.68) / totalWhites) * 100;
        keys.push({ midi: baseMidiNote + oct * 12 + semitone, leftPct });
      });
    }
    return keys;
  }, [baseMidiNote]);

  const startWheelDrag = (kind: 'pitch' | 'mod', e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore if capture is unavailable
    }
    setDraggingWheel(kind);
    wheelRef.current = {
      startY: e.clientY,
      startVal: kind === 'pitch' ? pitchBend : modWheel,
    };
  };

  const moveWheelDrag = (kind: 'pitch' | 'mod', e: React.PointerEvent<HTMLButtonElement>) => {
    if (draggingWheel !== kind) return;
    const dy = wheelRef.current.startY - e.clientY;
    if (kind === 'pitch') {
      const next = Math.max(-1, Math.min(1, wheelRef.current.startVal + dy * 0.022));
      onPitchBendChange(next);
    } else {
      const next = Math.max(0, Math.min(1, wheelRef.current.startVal + dy * 0.012));
      onModWheelChange(next);
    }
  };

  const endWheelDrag = (kind: 'pitch' | 'mod', e: React.PointerEvent<HTMLButtonElement>) => {
    if (draggingWheel !== kind) return;
    setDraggingWheel(null);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    // Mechanical pitch wheel springs back to center!
    if (kind === 'pitch') {
      onPitchBendChange(0);
    }
  };

  const computeKeyVelocity = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (fullLevel) return 127;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0.25, Math.min(1, (e.clientY - rect.top) / rect.height));
    return Math.round(45 + ratio * 82);
  };

  return (
    <section
      aria-label="Akai MPK Mini MK4 Hardware Controller"
      className="bg-[#12151B] border-t border-[#262C37] shrink-0"
    >
      {/* Hardware Deck Bar with Signature Akai Crimson Edge */}
      <div className="h-9 px-4 border-b border-[#1E232D] flex items-center justify-between gap-4 bg-[#151921]">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-1.5 h-4 rounded-xs bg-[#E11D48] shrink-0" aria-hidden="true" />
          <span className="text-xs font-bold tracking-wide text-slate-100 whitespace-nowrap">
            AKAI MPK MK4
          </span>
          <span className="text-xs text-slate-500 hidden sm:inline whitespace-nowrap">
            25-Key Controller · 8 Encoders (CC 24–31) · Smart Scale &amp; Chord
          </span>
        </div>

        {/* Keybed Target Track + Hardware Utility Toggles */}
        <div className="flex items-center gap-2 overflow-x-auto">
          <div className="flex items-center bg-[#0E1116] rounded p-0.5 border border-[#252B36]">
            {(['bass', 'keys', 'lead'] as const).map((tr) => (
              <button
                key={tr}
                type="button"
                onClick={() => onActiveTrackChange(tr)}
                className={`px-2 py-0.5 text-[11px] font-medium rounded-xs transition-colors whitespace-nowrap ${
                  activeTrack === tr
                    ? 'bg-[#E11D48] text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tr === 'bass' ? 'Bass' : tr === 'keys' ? 'Keys' : 'Lead'}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand MPK MK4 Hardware Deck' : 'Collapse MPK MK4 Hardware Deck'}
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:text-white bg-[#1B2029] hover:bg-[#232A36] border border-[#2A313E] rounded transition-colors whitespace-nowrap shrink-0"
          >
            {collapsed ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" /> Show Deck
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" /> Hide Deck
              </>
            )}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="px-4 py-3 flex flex-col xl:flex-row gap-4 items-stretch">
          {/* LEFT: OLED + Mode Switches + Performance Buttons */}
          <div className="flex flex-col sm:flex-row xl:flex-col gap-2.5 xl:w-[270px] shrink-0">
            <OledDisplay
              bpm={bpm}
              swing={swing}
              isPlaying={isPlaying}
              isRecording={isRecording}
              currentStep={currentStep}
              knobMode={knobMode}
              padBank={padBank}
              kitName={kitName}
              synthName={synthName}
              scale={scale}
              chordMode={chordMode}
              octave={octave}
              lastEventText={lastEventText}
              midiDeviceName={midiDeviceName}
            />

            {/* MPK MK4 Function Switches */}
            <div className="grid grid-cols-4 gap-1.5">
              <button
                type="button"
                onClick={() => onPadBankChange(padBank === 'A' ? 'B' : 'A')}
                className={`py-1.5 px-1.5 rounded text-[11px] font-semibold border transition-colors whitespace-nowrap ${
                  padBank === 'B'
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                    : 'bg-[#1A1E27] border-[#2C3340] text-slate-200 hover:border-slate-500'
                }`}
              >
                Bank {padBank}
              </button>
              <button
                type="button"
                onClick={onToggleFullLevel}
                aria-pressed={fullLevel}
                className={`py-1.5 px-1.5 rounded text-[11px] font-semibold border transition-colors whitespace-nowrap ${
                  fullLevel
                    ? 'bg-[#E11D48]/20 border-[#E11D48] text-rose-200'
                    : 'bg-[#1A1E27] border-[#2C3340] text-slate-300 hover:border-slate-500'
                }`}
              >
                Full Lvl
              </button>
              <button
                type="button"
                onClick={onCycleSixteenLevels}
                className={`py-1.5 px-1.5 rounded text-[11px] font-semibold border transition-colors whitespace-nowrap ${
                  sixteenLevels !== 'off'
                    ? 'bg-teal-500/20 border-teal-500 text-teal-200'
                    : 'bg-[#1A1E27] border-[#2C3340] text-slate-300 hover:border-slate-500'
                }`}
                title="Cycle MPC 16 Levels: Off, Velocity, Pitch"
              >
                {sixteenLevels === 'off' ? '16 Lvls' : sixteenLevels === 'velocity' ? '16: Vel' : '16: Pitch'}
              </button>
              <button
                type="button"
                onClick={onToggleNoteRepeat}
                aria-pressed={noteRepeat}
                className={`py-1.5 px-1.5 rounded text-[11px] font-semibold border transition-colors whitespace-nowrap ${
                  noteRepeat
                    ? 'bg-[#E11D48] border-[#E11D48] text-white'
                    : 'bg-[#1A1E27] border-[#2C3340] text-slate-300 hover:border-slate-500'
                }`}
              >
                Repeat
              </button>
            </div>
          </div>

          {/* CENTER-RIGHT: 8 Endless Encoders + Pitch/Mod Wheels + 25-Key Keybed */}
          <div className="flex-1 min-w-0 flex flex-col gap-3">
            {/* Top Strip: Encoder Mode Switch + 8 Rotary Encoders (K1..K8) */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-[#161A22] border border-[#252C38] rounded-lg px-3 py-2">
              <div className="flex flex-col gap-1 shrink-0">
                <span className="text-[10px] font-medium text-slate-400">Encoder Mode</span>
                <div className="flex items-center bg-[#0D1015] p-0.5 rounded border border-[#252C38]">
                  {(
                    [
                      { id: 'plugin', label: 'Plugin' },
                      { id: 'daw', label: 'DAW' },
                      { id: 'pad', label: 'Pad' },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => onKnobModeChange(m.id)}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded-xs transition-colors whitespace-nowrap ${
                        knobMode === m.id
                          ? 'bg-[#E11D48] text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                {noteRepeat && (
                  <div className="flex items-center gap-1 mt-0.5">
                    {(['1/4', '1/8', '1/16', '1/32'] as NoteRepeatRate[]).map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => onNoteRepeatRateChange(rate)}
                        className={`px-1.5 py-0.5 text-[10px] font-mono rounded-xs ${
                          noteRepeatRate === rate
                            ? 'bg-rose-500/30 text-rose-200 border border-rose-500/60'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {rate}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 8 Endless Rotary Encoders */}
              <div className="flex-1 grid grid-cols-4 sm:grid-cols-8 gap-1.5 justify-items-center">
                {knobs.map((k, idx) => {
                  const learningThis =
                    midiLearnTarget?.type === 'knob' && midiLearnTarget.index === idx;
                  return (
                    <RotaryKnob
                      key={`${knobMode}-${idx}`}
                      label={k.label}
                      subLabel={`K${idx + 1}·CC${k.cc}`}
                      value={k.val}
                      displayValue={k.display}
                      defaultValue={k.def}
                      accentColor={knobMode === 'plugin' ? '#E11D48' : knobMode === 'daw' ? '#14B8A6' : '#F59E0B'}
                      size={46}
                      isLearning={learningThis}
                      ariaLabel={`Knob ${idx + 1} ${k.label} CC ${k.cc}`}
                      onChange={(nextVal) => onKnobValueChange(idx, nextVal)}
                    />
                  );
                })}
              </div>
            </div>

            {/* Bottom Strip: Pitch/Mod Wheels + Smart Controls + 25-Key Keybed */}
            <div className="flex items-stretch gap-3">
              {/* Pitch & Mod Wheels + Octave/Scale/Chord */}
              <div className="flex items-stretch gap-2.5 bg-[#161A22] border border-[#252C38] rounded-lg px-2.5 py-2 shrink-0">
                {/* Mechanical Pitch & Mod Wheels */}
                <div className="flex items-center gap-2">
                  {/* Pitch Wheel */}
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] font-mono text-slate-400 mb-1">PITCH</span>
                    <button
                      type="button"
                      aria-label="Pitch Bend Wheel"
                      onPointerDown={(e) => startWheelDrag('pitch', e)}
                      onPointerMove={(e) => moveWheelDrag('pitch', e)}
                      onPointerUp={(e) => endWheelDrag('pitch', e)}
                      onPointerCancel={(e) => endWheelDrag('pitch', e)}
                      onLostPointerCapture={(e) => endWheelDrag('pitch', e)}
                      className="relative w-7 h-[78px] rounded bg-[#0A0C10] border border-[#2C3442] overflow-hidden focus-visible:outline-2 focus-visible:outline-[#E11D48]"
                      style={{ touchAction: 'none' }}
                    >
                      <div
                        className="absolute inset-x-0.5 h-3.5 rounded-xs bg-gradient-to-b from-slate-300 to-slate-500 border border-slate-700"
                        style={{
                          top: `${((1 - pitchBend) / 2) * 60 + 2}px`,
                        }}
                      />
                      <div className="absolute inset-x-0 top-1/2 h-px bg-[#E11D48]/60 pointer-events-none" />
                    </button>
                  </div>

                  {/* Mod Wheel */}
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] font-mono text-slate-400 mb-1">MOD</span>
                    <button
                      type="button"
                      aria-label="Modulation Wheel"
                      onPointerDown={(e) => startWheelDrag('mod', e)}
                      onPointerMove={(e) => moveWheelDrag('mod', e)}
                      onPointerUp={(e) => endWheelDrag('mod', e)}
                      onPointerCancel={(e) => endWheelDrag('mod', e)}
                      onLostPointerCapture={(e) => endWheelDrag('mod', e)}
                      className="relative w-7 h-[78px] rounded bg-[#0A0C10] border border-[#2C3442] overflow-hidden focus-visible:outline-2 focus-visible:outline-[#E11D48]"
                      style={{ touchAction: 'none' }}
                    >
                      <div
                        className="absolute inset-x-0.5 h-3.5 rounded-xs bg-gradient-to-b from-teal-300 to-teal-500 border border-teal-800"
                        style={{
                          top: `${(1 - modWheel) * 60 + 2}px`,
                        }}
                      />
                    </button>
                  </div>
                </div>

                {/* Octave, Scale, Chord, Arp Controls */}
                <div className="flex flex-col justify-between gap-1.5 w-[204px]">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onOctaveChange(Math.max(-2, octave - 1))}
                      disabled={octave <= -2}
                      aria-label="Octave Down"
                      className="flex-1 py-1 text-[11px] font-semibold bg-[#1E232E] hover:bg-[#272E3C] disabled:opacity-40 border border-[#303847] rounded text-slate-200 whitespace-nowrap"
                    >
                      Oct -
                    </button>
                    <span
                      data-testid="keybed-range-label"
                      className="text-[10px] font-mono tabular-nums text-slate-300 px-1.5 text-center whitespace-nowrap"
                      title={`Octave offset ${octave >= 0 ? `+${octave}` : octave}`}
                    >
                      {midiNoteToName(baseMidiNote)}–{midiNoteToName(baseMidiNote + 24)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onOctaveChange(Math.min(3, octave + 1))}
                      disabled={octave >= 3}
                      aria-label="Octave Up"
                      className="flex-1 py-1 text-[11px] font-semibold bg-[#1E232E] hover:bg-[#272E3C] disabled:opacity-40 border border-[#303847] rounded text-slate-200 whitespace-nowrap"
                    >
                      Oct +
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    <select
                      aria-label="Scale Lock"
                      value={scale}
                      onChange={(e) => onScaleChange(e.target.value as ScaleId)}
                      className="bg-[#0E1117] border border-[#2D3544] rounded px-1.5 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-[#E11D48]"
                    >
                      <option value="chromatic">Chromatic</option>
                      <option value="minor">C Minor</option>
                      <option value="major">C Major</option>
                      <option value="dorian">D Dorian</option>
                      <option value="pentatonic-minor">Min Pent</option>
                      <option value="phrygian">Phrygian</option>
                    </select>
                    <select
                      aria-label="Smart Chord Mode"
                      value={chordMode}
                      onChange={(e) => onChordModeChange(e.target.value as ChordMode)}
                      className="bg-[#0E1117] border border-[#2D3544] rounded px-1.5 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-[#E11D48]"
                    >
                      <option value="off">Chord Off</option>
                      <option value="major">Major</option>
                      <option value="minor">Minor</option>
                      <option value="maj7">Maj 7th</option>
                      <option value="min7">Min 7th</option>
                      <option value="sus4">Sus 4th</option>
                    </select>
                  </div>

                  <select
                    aria-label="Arpeggiator Mode"
                    value={arpMode}
                    onChange={(e) => onArpModeChange(e.target.value as ArpMode)}
                    className="bg-[#0E1117] border border-[#2D3544] rounded px-1.5 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-[#E11D48]"
                  >
                    <option value="off">Arpeggiator: Off</option>
                    <option value="up">Arp: Up (1/16)</option>
                    <option value="down">Arp: Down (1/16)</option>
                    <option value="up-down">Arp: Up/Down</option>
                    <option value="random">Arp: Random</option>
                  </select>
                </div>
              </div>

              {/* 25-Key Expressive Keybed */}
              <div
                data-testid="mpk-keybed"
                className="relative flex-1 min-w-[340px] h-[106px] bg-[#0B0D11] border border-[#2A313E] rounded-lg p-1 select-none overflow-hidden"
              >
                {/* White keys (15) */}
                <div className="grid grid-cols-15 gap-[2px] h-full">
                  {whiteKeys.map((wk) => {
                    const isActive = activeNotes.has(wk.midi);
                    const inScale = scale === 'chromatic' || snapNoteToScale(wk.midi, scale, 0) === wk.midi;
                    const label = midiNoteToName(wk.midi);
                    return (
                      <button
                        key={wk.midi}
                        type="button"
                        data-keybed-midi={wk.midi}
                        data-active={isActive ? 'true' : 'false'}
                        aria-label={`Piano Key ${label}`}
                        aria-pressed={isActive}
                        onPointerDown={(e) => {
                          if (e.button !== 0) return;
                          try {
                            e.currentTarget.setPointerCapture(e.pointerId);
                          } catch {
                            // ignore
                          }
                          onKeyDownNote(wk.midi, computeKeyVelocity(e));
                        }}
                        onPointerUp={(e) => {
                          try {
                            e.currentTarget.releasePointerCapture(e.pointerId);
                          } catch {
                            // ignore
                          }
                          onKeyUpNote(wk.midi);
                        }}
                        onPointerCancel={() => onKeyUpNote(wk.midi)}
                        onLostPointerCapture={() => onKeyUpNote(wk.midi)}
                        className={`relative h-full rounded-b-sm flex flex-col justify-end items-center pb-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-[#E11D48] ${
                          isActive
                            ? 'bg-[#E11D48] text-white'
                            : 'bg-[#ECEFF4] hover:bg-white text-slate-600'
                        }`}
                      >
                        {scale !== 'chromatic' && inScale && !isActive && (
                          <span
                            className="w-1.5 h-1.5 rounded-full bg-teal-600/70 mb-1"
                            aria-hidden="true"
                          />
                        )}
                        {label.startsWith('C') && (
                          <span
                            className={`text-[9px] font-mono font-bold ${
                              isActive ? 'text-white' : 'text-slate-500'
                            }`}
                          >
                            {label}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Black keys (10) */}
                {blackKeys.map((bk) => {
                  const isActive = activeNotes.has(bk.midi);
                  const label = midiNoteToName(bk.midi);
                  return (
                    <button
                      key={bk.midi}
                      type="button"
                      data-keybed-midi={bk.midi}
                      data-active={isActive ? 'true' : 'false'}
                      aria-label={`Piano Key ${label}`}
                      aria-pressed={isActive}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        if (e.button !== 0) return;
                        try {
                          e.currentTarget.setPointerCapture(e.pointerId);
                        } catch {
                          // ignore
                        }
                        onKeyDownNote(bk.midi, computeKeyVelocity(e));
                      }}
                      onPointerUp={(e) => {
                        e.stopPropagation();
                        try {
                          e.currentTarget.releasePointerCapture(e.pointerId);
                        } catch {
                          // ignore
                        }
                        onKeyUpNote(bk.midi);
                      }}
                      onPointerCancel={() => onKeyUpNote(bk.midi)}
                      onLostPointerCapture={() => onKeyUpNote(bk.midi)}
                      style={{
                        left: `${bk.leftPct}%`,
                        width: '4.5%',
                      }}
                      className={`absolute top-1 h-[60%] z-10 rounded-b-sm border border-[#090B0E] transition-colors focus-visible:outline-2 focus-visible:outline-[#E11D48] ${
                        isActive
                          ? 'bg-[#E11D48] shadow-md'
                          : 'bg-[#171A21] hover:bg-[#232833]'
                      }`}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
