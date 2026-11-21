import React, { useMemo, useState } from 'react';
import { Copy, Eraser, Grid3X3, Music2, Sparkles } from 'lucide-react';
import type {
  KitId,
  PadBank,
  PadConfig,
  PatternData,
  PatternSlotId,
  PianoRollNote,
  TrackId,
} from '../types/studio';
import { midiNoteToName } from '../engine/midi';
import {
  type PianoRollSnap,
  KEYBED_MAX_OCTAVE,
  KEYBED_MIN_OCTAVE,
  buildKeybedSyncedPianoRows,
  getKeybedMidiRange,
} from '../engine/pianoroll';
import { PianoRollEditor } from './PianoRollEditor';

interface SequencerWorkspaceProps {
  activeTrack: TrackId;
  onActiveTrackChange: (track: TrackId) => void;
  activePatternId: PatternSlotId;
  patterns: Record<PatternSlotId, PatternData>;
  onSelectPattern: (slot: PatternSlotId) => void;
  onClearPattern: () => void;
  onDuplicatePatternToNext: () => void;
  onLoadGroovePreset: (style: KitId) => void;
  pads: PadConfig[];
  padBank: PadBank;
  onPadBankChange: (bank: PadBank) => void;
  currentStep: number;
  isPlaying: boolean;
  swing: number;
  octave: number;
  onOctaveChange: (nextOctave: number) => void;
  activeNotes: Set<number>;
  pianoRollSnap: PianoRollSnap;
  onPianoRollSnapChange: (snap: PianoRollSnap) => void;
  stepInputEnabled: boolean;
  onToggleStepInput: () => void;
  stepInputCursor: number;
  onStepInputCursorChange: (step: number) => void;
  onToggleDrumStep: (padIndex: number, stepIndex: number) => void;
  onToggleMelodicNote: (
    track: 'bass' | 'keys' | 'lead',
    step: number,
    note: number,
    length: number
  ) => void;
  onUpdateMelodicNotes: (
    track: 'bass' | 'keys' | 'lead',
    nextNotes: PianoRollNote[]
  ) => void;
  onAuditionPad: (padIndex: number) => void;
  onAuditionSynthNote: (track: 'bass' | 'keys' | 'lead', note: number, velocity?: number) => void;
  onPianoKeyDown: (midiNote: number) => void;
  onPianoKeyUp: (midiNote: number) => void;
}

const TRACK_META: Array<{ id: TrackId; label: string; color: string }> = [
  { id: 'drums', label: '1. MPC Drums', color: '#E11D48' },
  { id: 'bass', label: '2. Bass Synth', color: '#F59E0B' },
  { id: 'keys', label: '3. Keys / Chords', color: '#14B8A6' },
  { id: 'lead', label: '4. Lead / Arp', color: '#38BDF8' },
];

export const SequencerWorkspace: React.FC<SequencerWorkspaceProps> = ({
  activeTrack,
  onActiveTrackChange,
  activePatternId,
  patterns,
  onSelectPattern,
  onClearPattern,
  onDuplicatePatternToNext,
  onLoadGroovePreset,
  pads,
  padBank,
  onPadBankChange,
  currentStep,
  isPlaying,
  swing,
  octave,
  onOctaveChange,
  activeNotes,
  pianoRollSnap,
  onPianoRollSnapChange,
  stepInputEnabled,
  onToggleStepInput,
  stepInputCursor,
  onStepInputCursorChange,
  onToggleDrumStep,
  onToggleMelodicNote,
  onUpdateMelodicNotes,
  onAuditionPad,
  onAuditionSynthNote,
  onPianoKeyDown,
  onPianoKeyUp,
}) => {
  const [melodicView, setMelodicView] = useState<'pianoroll' | 'grid'>('pianoroll');
  const [noteLength, setNoteLength] = useState<number>(2);

  const pattern = patterns[activePatternId];
  const isPianoRollActive = activeTrack !== 'drums' && melodicView === 'pianoroll';

  const keybedRange = useMemo(() => getKeybedMidiRange(octave), [octave]);

  // 1:1 synced pitch rows covering all 25 MPK MK4 keys (plus any out-of-range notes on the track)
  const pianoNotes = useMemo(() => {
    const trackNotes = activeTrack === 'drums' ? [] : pattern.melodicNotes[activeTrack];
    return buildKeybedSyncedPianoRows(octave, trackNotes);
  }, [activeTrack, octave, pattern.melodicNotes]);

  const visiblePads = padBank === 'A' ? pads.slice(0, 8) : pads.slice(8, 16);
  const trackColor =
    activeTrack === 'bass' ? '#F59E0B' : activeTrack === 'keys' ? '#14B8A6' : '#38BDF8';

  const handleSelectEditorView = (mode: 'pianoroll' | 'grid') => {
    setMelodicView(mode);
    if (mode === 'pianoroll' && activeTrack === 'drums') {
      onActiveTrackChange('bass');
    }
  };

  return (
    <div className="h-full flex flex-col gap-2.5 p-4 overflow-hidden">
      {/* Sequencer Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 shrink-0">
        {/* Track Tabs + View Mode Toggle */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-[#141820] border border-[#252C38] rounded-md p-1 overflow-x-auto">
            {TRACK_META.map((t) => {
              const active = activeTrack === t.id;
              const noteCount =
                t.id === 'drums'
                  ? pattern.drumGrid.reduce((acc, row) => acc + row.filter((v) => v > 0).length, 0)
                  : pattern.melodicNotes[t.id].length;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onActiveTrackChange(t.id)}
                  className={`px-3 py-1 text-xs font-semibold rounded-xs transition-colors flex items-center gap-2 whitespace-nowrap ${
                    active
                      ? 'bg-[#232A37] text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-xs shrink-0"
                    style={{ backgroundColor: t.color }}
                    aria-hidden="true"
                  />
                  <span>{t.label}</span>
                  <span className="font-mono tabular-nums text-[10px] text-slate-400">
                    {noteCount}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Step Grid vs Piano Roll View Switcher */}
          <div
            role="group"
            aria-label="Sequencer Editor View"
            className="flex items-center bg-[#141820] border border-[#252C38] rounded-md p-0.5"
          >
            <button
              type="button"
              aria-pressed={!isPianoRollActive}
              onClick={() => handleSelectEditorView('grid')}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-xs transition-colors whitespace-nowrap ${
                !isPianoRollActive
                  ? 'bg-[#262E3D] text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Grid3X3 className="w-3.5 h-3.5" aria-hidden="true" />
              Step Grid
            </button>
            <button
              type="button"
              aria-pressed={isPianoRollActive}
              onClick={() => handleSelectEditorView('pianoroll')}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-xs transition-colors whitespace-nowrap ${
                isPianoRollActive
                  ? 'bg-[#E11D48] text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Music2 className="w-3.5 h-3.5" aria-hidden="true" />
              Piano Roll
            </button>
          </div>
        </div>

        {/* Pattern Slots & Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-[#141820] border border-[#252C38] rounded-md p-0.5">
            {(['A', 'B', 'C', 'D'] as PatternSlotId[]).map((slot) => (
              <button
                key={slot}
                type="button"
                onClick={() => onSelectPattern(slot)}
                aria-pressed={activePatternId === slot}
                className={`px-2.5 py-1 text-xs font-mono font-semibold rounded-xs transition-colors whitespace-nowrap ${
                  activePatternId === slot
                    ? 'bg-[#E11D48] text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Pat {slot}
              </button>
            ))}
          </div>

          <select
            aria-label="Load Preset Groove"
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) {
                onLoadGroovePreset(e.target.value as KitId);
                e.target.value = '';
              }
            }}
            className="bg-[#161A22] border border-[#2C3442] rounded px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-[#E11D48]"
          >
            <option value="" disabled>
              Load Groove...
            </option>
            <option value="boom-bap">MPC Boom Bap</option>
            <option value="trap-808">808 Trap Bounce</option>
            <option value="house-909">909 Club Dub</option>
            <option value="lofi-soul">Lo-Fi Rhodes</option>
          </select>

          <button
            type="button"
            onClick={onDuplicatePatternToNext}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-[#181D26] hover:bg-[#232A37] border border-[#2C3442] rounded text-slate-200 whitespace-nowrap"
            title="Duplicate active pattern into the next pattern slot"
          >
            <Copy className="w-3.5 h-3.5" /> Duplicate
          </button>

          <button
            type="button"
            onClick={onClearPattern}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-[#181D26] hover:bg-rose-950/60 border border-[#2C3442] hover:border-rose-700/60 rounded text-slate-200 whitespace-nowrap"
          >
            <Eraser className="w-3.5 h-3.5" /> Clear
          </button>
        </div>
      </div>

      {/* Editor Sub-toolbar */}
      <div className="flex items-center justify-between text-xs text-slate-400 px-1 shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
          <span>
            {activeTrack === 'drums'
              ? `MPC 16-Step Drum Grid — Bank ${padBank} (${pattern.name})`
              : isPianoRollActive
              ? `Piano Roll — ${TRACK_META.find((t) => t.id === activeTrack)?.label} (${pattern.name})`
              : `Step Matrix — ${TRACK_META.find((t) => t.id === activeTrack)?.label}`}
          </span>
        </div>

        {activeTrack === 'drums' ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onPadBankChange('A')}
              className={`px-2.5 py-0.5 rounded text-[11px] font-medium ${
                padBank === 'A'
                  ? 'bg-[#E11D48] text-white'
                  : 'bg-[#171B24] text-slate-400 hover:text-slate-200'
              }`}
            >
              Bank A (1–8)
            </button>
            <button
              type="button"
              onClick={() => onPadBankChange('B')}
              className={`px-2.5 py-0.5 rounded text-[11px] font-medium ${
                padBank === 'B'
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-[#171B24] text-slate-400 hover:text-slate-200'
              }`}
            >
              Bank B (9–16)
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            {!isPianoRollActive && (
              <div className="flex items-center gap-1">
                <span>Note Length:</span>
                {[
                  { val: 1, label: '1/16' },
                  { val: 2, label: '1/8' },
                  { val: 4, label: '1/4' },
                ].map((len) => (
                  <button
                    key={len.val}
                    type="button"
                    onClick={() => setNoteLength(len.val)}
                    className={`px-2 py-0.5 font-mono text-[11px] rounded ${
                      noteLength === len.val
                        ? 'bg-teal-500/25 text-teal-200 border border-teal-500/50'
                        : 'bg-[#161A22] text-slate-400'
                    }`}
                  >
                    {len.label}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <span
                data-testid="pianoroll-keybed-sync-badge"
                className="font-mono text-[11px] text-slate-300 tabular-nums"
              >
                MPK Keys: {midiNoteToName(keybedRange.minMidi)}–{midiNoteToName(keybedRange.maxMidi)}
              </span>
              <button
                type="button"
                aria-label="Piano Roll Octave Down"
                disabled={octave <= KEYBED_MIN_OCTAVE}
                onClick={() => onOctaveChange(Math.max(KEYBED_MIN_OCTAVE, octave - 1))}
                className="px-2 py-0.5 bg-[#161A22] border border-[#2B3240] rounded text-slate-300 hover:text-white disabled:opacity-40"
              >
                Oct -
              </button>
              <button
                type="button"
                aria-label="Piano Roll Octave Up"
                disabled={octave >= KEYBED_MAX_OCTAVE}
                onClick={() => onOctaveChange(Math.min(KEYBED_MAX_OCTAVE, octave + 1))}
                className="px-2 py-0.5 bg-[#161A22] border border-[#2B3240] rounded text-slate-300 hover:text-white disabled:opacity-40"
              >
                Oct +
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MAIN EDITOR STAGE */}
      {isPianoRollActive ? (
        <PianoRollEditor
          track={activeTrack}
          trackColor={trackColor}
          notes={pattern.melodicNotes[activeTrack]}
          pianoRows={pianoNotes}
          currentStep={currentStep}
          isPlaying={isPlaying}
          swing={swing}
          octave={octave}
          activeNotes={activeNotes}
          snap={pianoRollSnap}
          onSnapChange={onPianoRollSnapChange}
          stepInputEnabled={stepInputEnabled}
          onToggleStepInput={onToggleStepInput}
          stepInputCursor={stepInputCursor}
          onStepInputCursorChange={onStepInputCursorChange}
          onChangeNotes={(nextNotes) => onUpdateMelodicNotes(activeTrack, nextNotes)}
          onAuditionNote={(midiNote, vel) => onAuditionSynthNote(activeTrack, midiNote, vel)}
          onPianoKeyDown={onPianoKeyDown}
          onPianoKeyUp={onPianoKeyUp}
        />
      ) : (
        <div className="flex-1 min-h-0 bg-[#12161E] border border-[#252C38] rounded-lg overflow-auto p-3">
          {/* Step Ruler */}
          <div className="grid grid-cols-[150px_repeat(16,minmax(28px,1fr))] gap-1 mb-2 pb-1.5 border-b border-[#222834] sticky top-0 bg-[#12161E] z-10">
            <div className="text-[11px] font-mono text-slate-500 flex items-center px-2">
              {activeTrack === 'drums' ? 'PAD / VOICE' : 'PITCH'}
            </div>
            {Array.from({ length: 16 }, (_, stepIdx) => {
              const isHead = isPlaying && currentStep === stepIdx;
              const isBeat = stepIdx % 4 === 0;
              return (
                <div
                  key={stepIdx}
                  className={`text-center text-[11px] font-mono tabular-nums py-0.5 rounded-xs ${
                    isHead
                      ? 'bg-[#E11D48] text-white font-bold'
                      : isBeat
                      ? 'text-slate-200 font-semibold'
                      : 'text-slate-500'
                  }`}
                >
                  {stepIdx + 1}
                </div>
              );
            })}
          </div>

          {/* TRACK 1: MPC DRUM MATRIX */}
          {activeTrack === 'drums' ? (
            <div data-testid="drum-sequencer-grid" className="space-y-1.5">
              {visiblePads.map((pad) => (
                <div
                  key={pad.id}
                  className="grid grid-cols-[150px_repeat(16,minmax(28px,1fr))] gap-1 items-center"
                >
                  <button
                    type="button"
                    onClick={() => onAuditionPad(pad.id)}
                    className="flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-[#181D27] hover:bg-[#222836] border border-[#262D3B] text-left transition-colors"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2 h-2 rounded-xs shrink-0"
                        style={{ backgroundColor: pad.color }}
                      />
                      <span className="text-xs font-medium text-slate-200 truncate">
                        {pad.name}
                      </span>
                    </span>
                    <span className="text-[10px] font-mono text-slate-500 shrink-0">
                      P{pad.id + 1}
                    </span>
                  </button>

                  {pattern.drumGrid[pad.id].map((vel, stepIdx) => {
                    const active = vel > 0;
                    const isHead = isPlaying && currentStep === stepIdx;
                    const isGroupAlt = Math.floor(stepIdx / 4) % 2 === 1;
                    return (
                      <button
                        key={stepIdx}
                        type="button"
                        aria-label={`Drum ${pad.name} Step ${stepIdx + 1}`}
                        aria-pressed={active}
                        onClick={() => onToggleDrumStep(pad.id, stepIdx)}
                        className={`h-8 rounded-xs border transition-colors ${
                          isHead ? 'ring-1 ring-white/90' : ''
                        }`}
                        style={{
                          backgroundColor: active
                            ? pad.color
                            : isGroupAlt
                            ? '#191E28'
                            : '#141821',
                          borderColor: isHead
                            ? '#FFFFFF'
                            : active
                            ? pad.color
                            : '#252C39',
                          opacity: active ? Math.max(0.6, vel / 127) : 1,
                        }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          ) : (
            /* TRACKS 2-4: STEP MATRIX FALLBACK VIEW */
            <div data-testid="piano-roll-grid" className="space-y-1">
              {pianoNotes.map((midiNote) => {
                const name = midiNoteToName(midiNote);
                const isSharp = name.includes('#');
                const rowNotes = pattern.melodicNotes[activeTrack].filter(
                  (n) => n.note === midiNote
                );

                return (
                  <div
                    key={midiNote}
                    className="grid grid-cols-[150px_repeat(16,minmax(28px,1fr))] gap-1 items-center"
                  >
                    <button
                      type="button"
                      onClick={() => onAuditionSynthNote(activeTrack, midiNote)}
                      className={`flex items-center justify-between px-2.5 py-1 rounded-xs border text-xs font-mono transition-colors ${
                        isSharp
                          ? 'bg-[#14171F] border-[#232936] text-slate-400 hover:bg-[#1D222D]'
                          : 'bg-[#1D222E] border-[#2C3444] text-slate-200 hover:bg-[#262D3C]'
                      }`}
                    >
                      <span>{name}</span>
                      <span className="text-[10px] text-slate-500">{midiNote}</span>
                    </button>

                    {Array.from({ length: 16 }, (_, stepIdx) => {
                      const startingNote = rowNotes.find(
                        (n) => Math.floor(n.step) === stepIdx
                      );
                      const coveredByNote = rowNotes.find(
                        (n) => stepIdx > n.step && stepIdx < n.step + n.length
                      );
                      const isHead = isPlaying && currentStep === stepIdx;
                      const isBeat = stepIdx % 4 === 0;

                      return (
                        <button
                          key={stepIdx}
                          type="button"
                          aria-label={`${activeTrack} ${name} Step ${stepIdx + 1}`}
                          aria-pressed={Boolean(startingNote)}
                          onClick={() => {
                            onToggleMelodicNote(activeTrack, stepIdx, midiNote, noteLength);
                            if (!startingNote) {
                              onAuditionSynthNote(activeTrack, midiNote);
                            }
                          }}
                          className={`h-6 rounded-xs border transition-colors ${
                            isHead ? 'ring-1 ring-white/80' : ''
                          }`}
                          style={{
                            backgroundColor: startingNote
                              ? trackColor
                              : coveredByNote
                              ? `${trackColor}66`
                              : isSharp
                              ? '#11141B'
                              : isBeat
                              ? '#1A202B'
                              : '#151922',
                            borderColor: isHead
                              ? '#FFFFFF'
                              : startingNote || coveredByNote
                              ? trackColor
                              : '#222835',
                          }}
                        />
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

