import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Magnet, Trash2, TrendingDown, TrendingUp, Activity, Waves } from 'lucide-react';
import type { PianoRollNote } from '../types/studio';
import { midiNoteToName } from '../engine/midi';
import { STEP_COUNT } from '../engine/sequencer';
import {
  type PianoRollSnap,
  type VelocityCurvePreset,
  addPianoRollNote,
  applyVelocityCurvePreset,
  createPianoRollNote,
  deletePianoRollNote,
  getKeybedMidiRange,
  getQuantizeResolution,
  getQwertyLabelForMidi,
  getSnapUnit,
  getSwungGridLines,
  movePianoRollNote,
  paintVelocityLine,
  quantizePianoRollNotes,
  resizePianoRollNoteEnd,
  resizePianoRollNoteStart,
  updateNoteVelocity,
} from '../engine/pianoroll';

interface PianoRollEditorProps {
  track: 'bass' | 'keys' | 'lead';
  trackColor: string;
  notes: PianoRollNote[];
  pianoRows: number[]; // ordered highest MIDI note to lowest
  currentStep: number;
  isPlaying: boolean;
  swing: number;
  octave: number;
  activeNotes: Set<number>;
  snap: PianoRollSnap;
  onSnapChange: (snap: PianoRollSnap) => void;
  stepInputEnabled: boolean;
  onToggleStepInput: () => void;
  stepInputCursor: number;
  onStepInputCursorChange: (step: number) => void;
  onChangeNotes: (nextNotes: PianoRollNote[]) => void;
  onAuditionNote: (midiNote: number, velocity?: number) => void;
  onPianoKeyDown: (midiNote: number) => void;
  onPianoKeyUp: (midiNote: number) => void;
}

type DragSession =
  | {
      kind: 'draw';
      noteId: string;
      anchorStep: number;
      midiNote: number;
    }
  | {
      kind: 'move';
      noteId: string;
      grabStepOffset: number;
      lastAuditionPitch: number;
    }
  | {
      kind: 'resize-end';
      noteId: string;
    }
  | {
      kind: 'resize-start';
      noteId: string;
    };

interface VelocityBrushState {
  startStep: number;
  startVel: number;
  endStep: number;
  endVel: number;
  activeNoteId?: string;
}

const ROW_HEIGHT = 24;

export const PianoRollEditor: React.FC<PianoRollEditorProps> = ({
  track,
  trackColor,
  notes,
  pianoRows,
  currentStep,
  isPlaying,
  swing,
  octave,
  activeNotes,
  snap,
  onSnapChange,
  stepInputEnabled,
  onToggleStepInput,
  stepInputCursor,
  onStepInputCursorChange,
  onChangeNotes,
  onAuditionNote,
  onPianoKeyDown,
  onPianoKeyUp,
}) => {
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [dragSession, setDragSession] = useState<DragSession | null>(null);
  const [velBrush, setVelBrush] = useState<VelocityBrushState | null>(null);
  const [quantizePulse, setQuantizePulse] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const velLaneRef = useRef<HTMLDivElement | null>(null);
  const quantizeTimerRef = useRef<number | null>(null);
  const notesRef = useRef(notes);
  notesRef.current = notes;

  const keybedRange = useMemo(() => getKeybedMidiRange(octave), [octave]);

  useEffect(() => {
    const clearStuckInteractions = () => {
      setDragSession(null);
      setVelBrush(null);
    };
    window.addEventListener('blur', clearStuckInteractions);
    return () => {
      window.removeEventListener('blur', clearStuckInteractions);
      if (quantizeTimerRef.current !== null) {
        window.clearTimeout(quantizeTimerRef.current);
      }
    };
  }, []);

  // Center the scroll viewport on the track's existing notes when switching tracks or octaves
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || pianoRows.length === 0) return;

    const targetMidi =
      notes.length > 0
        ? Math.round(notes.reduce((sum, n) => sum + n.note, 0) / notes.length)
        : Math.round((keybedRange.minMidi + keybedRange.maxMidi) / 2);

    const rowIdx = pianoRows.indexOf(targetMidi);
    if (rowIdx !== -1) {
      const targetTop = rowIdx * ROW_HEIGHT - container.clientHeight / 2 + ROW_HEIGHT / 2;
      container.scrollTop = Math.max(0, targetTop);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track, octave]);

  // Smoothly keep actively played MPK MK4 keys scrolled into view on the Piano Roll
  useEffect(() => {
    if (activeNotes.size === 0) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    const firstActive = Array.from(activeNotes)[0];
    const rowIdx = pianoRows.indexOf(firstActive);
    if (rowIdx === -1) return;

    const rowTop = rowIdx * ROW_HEIGHT;
    const rowBottom = rowTop + ROW_HEIGHT;
    if (rowTop < container.scrollTop) {
      container.scrollTop = Math.max(0, rowTop - ROW_HEIGHT);
    } else if (rowBottom > container.scrollTop + container.clientHeight) {
      container.scrollTop = rowBottom - container.clientHeight + ROW_HEIGHT;
    }
  }, [activeNotes, pianoRows]);

  const selectedNote = useMemo(
    () => notes.find((n) => n.id === selectedNoteId) ?? null,
    [notes, selectedNoteId]
  );

  // Clear selection if switching track/pattern and selected note no longer exists
  useEffect(() => {
    if (selectedNoteId && !notes.some((n) => n.id === selectedNoteId)) {
      setSelectedNoteId(null);
    }
  }, [notes, selectedNoteId]);

  // Keyboard Backspace/Delete removes selected note
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!selectedNoteId) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        onChangeNotes(deletePianoRollNote(notesRef.current, selectedNoteId));
        setSelectedNoteId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedNoteId, onChangeNotes]);

  const clientXToStep = (clientX: number, container: HTMLElement | null): number => {
    if (!container) return 0;
    const rect = container.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * STEP_COUNT;
  };

  const clientYToMidiNote = (clientY: number): number => {
    const grid = gridRef.current;
    if (!grid) return pianoRows[0] ?? 60;
    const rect = grid.getBoundingClientRect();
    const relY = clientY - rect.top;
    const rowIdx = Math.max(0, Math.min(pianoRows.length - 1, Math.floor(relY / ROW_HEIGHT)));
    return pianoRows[rowIdx];
  };

  // Start drawing a new note on empty grid canvas
  const handleGridPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    // Only create when clicking directly on the grid backdrop, not on an existing note element
    if ((e.target as HTMLElement).closest('[data-note-id]')) return;

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    const rawStep = clientXToStep(e.clientX, gridRef.current);
    const unit = getSnapUnit(snap);
    const startStep = Math.floor(rawStep / unit) * unit;
    const midiNote = clientYToMidiNote(e.clientY);
    const initialLen = Math.max(unit, 1);

    const created = createPianoRollNote(track, startStep, midiNote, initialLen, 102);
    const nextNotes = addPianoRollNote(notesRef.current, created);
    onChangeNotes(nextNotes);
    setSelectedNoteId(created.id);
    onAuditionNote(midiNote, created.velocity);

    setDragSession({
      kind: 'draw',
      noteId: created.id,
      anchorStep: created.step,
      midiNote,
    });
  };

  const handleNoteBodyPointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    note: PianoRollNote
  ) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    try {
      gridRef.current?.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    const rawStep = clientXToStep(e.clientX, gridRef.current);
    setSelectedNoteId(note.id);
    onAuditionNote(note.note, note.velocity);

    setDragSession({
      kind: 'move',
      noteId: note.id,
      grabStepOffset: rawStep - note.step,
      lastAuditionPitch: note.note,
    });
  };

  const handleNoteResizePointerDown = (
    e: React.PointerEvent<HTMLButtonElement>,
    note: PianoRollNote,
    edge: 'start' | 'end'
  ) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    try {
      gridRef.current?.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    setSelectedNoteId(note.id);
    setDragSession({
      kind: edge === 'end' ? 'resize-end' : 'resize-start',
      noteId: note.id,
    });
  };

  const handleGridPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragSession) return;
    const rawStep = clientXToStep(e.clientX, gridRef.current);

    if (dragSession.kind === 'draw') {
      const unit = getSnapUnit(snap);
      const targetEnd = Math.max(dragSession.anchorStep + unit, rawStep);
      onChangeNotes(
        resizePianoRollNoteEnd(notesRef.current, dragSession.noteId, targetEnd, snap)
      );
      return;
    }

    if (dragSession.kind === 'move') {
      const nextStep = rawStep - dragSession.grabStepOffset;
      const nextMidi = clientYToMidiNote(e.clientY);
      if (nextMidi !== dragSession.lastAuditionPitch) {
        onAuditionNote(nextMidi, 100);
        setDragSession({ ...dragSession, lastAuditionPitch: nextMidi });
      }
      onChangeNotes(
        movePianoRollNote(notesRef.current, dragSession.noteId, nextStep, nextMidi, snap)
      );
      return;
    }

    if (dragSession.kind === 'resize-end') {
      onChangeNotes(
        resizePianoRollNoteEnd(notesRef.current, dragSession.noteId, rawStep, snap)
      );
      return;
    }

    if (dragSession.kind === 'resize-start') {
      onChangeNotes(
        resizePianoRollNoteStart(notesRef.current, dragSession.noteId, rawStep, snap)
      );
    }
  };

  const handleGridPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragSession) return;
    setDragSession(null);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  // Velocity Lane Curve Painting & Direct Stem Editing
  const clientYToVelocity = (clientY: number): number => {
    const lane = velLaneRef.current;
    if (!lane) return 100;
    const rect = lane.getBoundingClientRect();
    const ratio = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    return Math.max(12, Math.min(127, Math.round(12 + ratio * (127 - 12))));
  };

  const handleVelLanePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    const step = clientXToStep(e.clientX, velLaneRef.current);
    const vel = clientYToVelocity(e.clientY);

    // Check if pointer clicked directly onto a velocity stem handle
    const handleEl = (e.target as HTMLElement).closest('[data-vel-note-id]') as HTMLElement | null;
    const directNoteId = handleEl?.dataset.velNoteId;

    if (directNoteId) {
      setSelectedNoteId(directNoteId);
      onChangeNotes(updateNoteVelocity(notesRef.current, directNoteId, vel));
      setVelBrush({
        startStep: step,
        startVel: vel,
        endStep: step,
        endVel: vel,
        activeNoteId: directNoteId,
      });
    } else {
      onChangeNotes(paintVelocityLine(notesRef.current, step, vel, step, vel));
      setVelBrush({
        startStep: step,
        startVel: vel,
        endStep: step,
        endVel: vel,
      });
    }
  };

  const handleVelLanePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!velBrush) return;
    const step = clientXToStep(e.clientX, velLaneRef.current);
    const vel = clientYToVelocity(e.clientY);

    const movedFar = Math.abs(step - velBrush.startStep) > 0.35;
    if (velBrush.activeNoteId && !movedFar) {
      onChangeNotes(updateNoteVelocity(notesRef.current, velBrush.activeNoteId, vel));
      setVelBrush({ ...velBrush, endStep: step, endVel: vel });
    } else {
      onChangeNotes(
        paintVelocityLine(notesRef.current, velBrush.startStep, velBrush.startVel, step, vel)
      );
      setVelBrush({ ...velBrush, activeNoteId: undefined, endStep: step, endVel: vel });
    }
  };

  const handleVelLanePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!velBrush) return;
    setVelBrush(null);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handleApplyCurve = (preset: VelocityCurvePreset) => {
    onChangeNotes(applyVelocityCurvePreset(notes, preset));
  };

  const quantizeResolution = getQuantizeResolution(snap);

  const handleQuantize = () => {
    if (notes.length === 0) return;
    onChangeNotes(quantizePianoRollNotes(notes, snap, swing));
    setQuantizePulse(true);
    if (quantizeTimerRef.current !== null) {
      window.clearTimeout(quantizeTimerRef.current);
    }
    quantizeTimerRef.current = window.setTimeout(() => {
      setQuantizePulse(false);
    }, 650);
  };

  const gridLines = useMemo(() => getSwungGridLines(snap, swing, STEP_COUNT), [snap, swing]);
  const visibleRowSet = useMemo(() => new Set(pianoRows), [pianoRows]);
  const visibleNotes = useMemo(
    () => notes.filter((n) => visibleRowSet.has(n.note)),
    [notes, visibleRowSet]
  );

  return (
    <div
      data-testid="pro-piano-roll"
      className="flex-1 min-h-0 flex flex-col gap-2 overflow-hidden"
    >
      {/* Piano Roll Precision Control Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 shrink-0">
        {/* Snap Resolution Selector */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-slate-400">Grid Snap</span>
          <div
            role="group"
            aria-label="Piano Roll Grid Snap"
            className="flex items-center bg-[#141820] border border-[#262D3B] rounded p-0.5"
          >
            {(
              [
                { id: '1/8', label: '1/8' },
                { id: '1/16', label: '1/16' },
                { id: '1/32', label: '1/32' },
                { id: 'off', label: 'Free' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                aria-pressed={snap === opt.id}
                onClick={() => onSnapChange(opt.id)}
                className={`px-2 py-0.5 text-[11px] font-mono font-medium rounded-xs transition-colors whitespace-nowrap ${
                  snap === opt.id
                    ? 'bg-[#E11D48] text-white'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Quantize Melodic Notes to Current Resolution & Swing */}
          <button
            type="button"
            onClick={handleQuantize}
            disabled={notes.length === 0}
            aria-label={`Quantize notes to ${quantizeResolution} grid at ${swing}% swing`}
            title={`Snap melodic notes to nearest ${quantizeResolution} grid line (${swing}% swing)`}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded border transition-colors whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed ${
              quantizePulse
                ? 'bg-teal-500/20 border-teal-400 text-teal-200'
                : 'bg-[#161B24] hover:bg-[#222938] border-[#2C3546] hover:border-[#E11D48]/60 text-slate-100'
            }`}
          >
            <Magnet
              className={`w-3.5 h-3.5 ${quantizePulse ? 'text-teal-300' : 'text-[#E11D48]'}`}
              aria-hidden="true"
            />
            <span>Quantize</span>
            <span className="font-mono text-[10px] text-slate-400 tabular-nums">
              {quantizeResolution} · {swing}%
            </span>
          </button>

          {/* Direct Keybed Step-Input Mode */}
          <button
            type="button"
            onClick={onToggleStepInput}
            aria-pressed={stepInputEnabled}
            aria-label={
              stepInputEnabled
                ? `Disable Key Input step entry (cursor at step ${stepInputCursor + 1})`
                : 'Enable Key Input step entry from MPK MK4 keys'
            }
            title="When enabled, playing keys on the MPK MK4 keybed, QWERTY (Z-M), or USB MIDI inserts notes at the teal step cursor"
            className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded border transition-colors whitespace-nowrap ${
              stepInputEnabled
                ? 'bg-teal-500/20 border-teal-400 text-teal-200'
                : 'bg-[#161B24] hover:bg-[#222938] border-[#2C3546] text-slate-200'
            }`}
          >
            <Keyboard
              className={`w-3.5 h-3.5 ${stepInputEnabled ? 'text-teal-300' : 'text-slate-400'}`}
              aria-hidden="true"
            />
            <span>Key Input</span>
            {stepInputEnabled && (
              <span
                data-testid="step-input-cursor-badge"
                className="font-mono text-[10px] text-teal-200 tabular-nums"
              >
                Step {(stepInputCursor + 1).toFixed(stepInputCursor % 1 === 0 ? 0 : 1)}
              </span>
            )}
          </button>

          {/* Selected Note Inspector Readout */}
          {selectedNote ? (
            <div
              data-testid="selected-note-readout"
              className="hidden md:flex items-center gap-2.5 text-[11px] font-mono tabular-nums text-slate-300 bg-[#141821] border border-[#252D3B] rounded px-2.5 py-1"
            >
              <span className="font-semibold text-white">
                {midiNoteToName(selectedNote.note)}
              </span>
              <span className="text-slate-500">·</span>
              <span>Start {(selectedNote.step + 1).toFixed(2)}</span>
              <span className="text-slate-500">·</span>
              <span>Len {selectedNote.length.toFixed(2)}</span>
              <span className="text-slate-500">·</span>
              <span>Vel {selectedNote.velocity}</span>
              <button
                type="button"
                aria-label="Delete selected note"
                onClick={() => {
                  onChangeNotes(deletePianoRollNote(notes, selectedNote.id));
                  setSelectedNoteId(null);
                }}
                className="ml-1 text-slate-400 hover:text-rose-400 transition-colors"
                title="Delete selected note (Backspace)"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <span className="hidden 2xl:inline text-[11px] text-slate-400">
              Drag empty grid to draw · Drag note to move · Drag edges to resize · Double-click to delete
            </span>
          )}
        </div>

        {/* Velocity Curve Presets */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-slate-400 hidden sm:inline">Velocity Curve</span>
          <button
            type="button"
            onClick={() => handleApplyCurve('crescendo')}
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium bg-[#161B24] hover:bg-[#222938] border border-[#293140] rounded text-slate-200 whitespace-nowrap"
            title="Shape notes along a rising crescendo curve"
          >
            <TrendingUp className="w-3 h-3 text-teal-400" /> Ramp Up
          </button>
          <button
            type="button"
            onClick={() => handleApplyCurve('decrescendo')}
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium bg-[#161B24] hover:bg-[#222938] border border-[#293140] rounded text-slate-200 whitespace-nowrap"
            title="Shape notes along a falling decrescendo curve"
          >
            <TrendingDown className="w-3 h-3 text-amber-400" /> Ramp Down
          </button>
          <button
            type="button"
            onClick={() => handleApplyCurve('arch')}
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium bg-[#161B24] hover:bg-[#222938] border border-[#293140] rounded text-slate-200 whitespace-nowrap"
            title="Accent the middle of the phrase with a smooth arch"
          >
            <Waves className="w-3 h-3 text-sky-400" /> Arch
          </button>
          <button
            type="button"
            onClick={() => handleApplyCurve('humanize')}
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium bg-[#161B24] hover:bg-[#222938] border border-[#293140] rounded text-slate-200 whitespace-nowrap"
            title="Apply musical MPC groove velocity humanization"
          >
            <Activity className="w-3 h-3 text-[#E11D48]" /> Humanize
          </button>
        </div>
      </div>

      {/* MAIN SCROLLABLE PIANO ROLL SURFACE + BOTTOM VELOCITY LANE */}
      <div className="flex-1 min-h-0 flex flex-col bg-[#10141B] border border-[#252C38] rounded-lg overflow-hidden select-none">
        {/* Timeline Ruler Row (click step to move Key Input cursor) */}
        <div className="flex items-stretch border-b border-[#242B38] bg-[#131720] shrink-0">
          <div className="w-[96px] shrink-0 px-2.5 py-1.5 text-[10px] font-mono text-slate-400 border-r border-[#242B38] flex items-center justify-between">
            <span>PITCH</span>
            <span className="text-[9px] text-slate-500">KEY</span>
          </div>
          <div className="relative flex-1 grid grid-cols-16">
            {Array.from({ length: STEP_COUNT }, (_, stepIdx) => {
              const isBeat = stepIdx % 4 === 0;
              const isHead = isPlaying && currentStep === stepIdx;
              const isStepCursor = stepInputEnabled && Math.floor(stepInputCursor) === stepIdx;
              return (
                <button
                  key={stepIdx}
                  type="button"
                  aria-label={`Set Key Input cursor to step ${stepIdx + 1}`}
                  onClick={() => onStepInputCursorChange(stepIdx)}
                  className={`py-1 text-center text-[10px] font-mono tabular-nums border-r border-[#1D232F] transition-colors ${
                    isHead
                      ? 'bg-[#E11D48] text-white font-bold'
                      : isStepCursor
                      ? 'bg-teal-500/25 text-teal-200 font-bold'
                      : isBeat
                      ? 'text-slate-200 font-semibold hover:bg-[#1C2230]'
                      : 'text-slate-500 hover:bg-[#191F2C]'
                  }`}
                >
                  {isBeat ? `${Math.floor(stepIdx / 4) + 1}.1` : `.${(stepIdx % 4) + 1}`}
                </button>
              );
            })}
          </div>
        </div>

        {/* Pitch Keys + Continuous Drag-Edit Grid */}
        <div
          ref={scrollContainerRef}
          className="flex-1 min-h-0 overflow-y-auto flex items-start"
        >
          {/* Left Vertical Piano Strip (Synced 1:1 with MPK MK4 25-Key Keybed) */}
          <div
            data-testid="piano-roll-key-strip"
            className="w-[96px] shrink-0 border-r border-[#242B38] bg-[#12161E]"
          >
            {pianoRows.map((midiNote) => {
              const label = midiNoteToName(midiNote);
              const isSharp = label.includes('#');
              const isC = label.startsWith('C') && !isSharp;
              const isActive = activeNotes.has(midiNote);
              const inKeybed =
                midiNote >= keybedRange.minMidi && midiNote <= keybedRange.maxMidi;
              const qwerty = getQwertyLabelForMidi(midiNote, octave);

              return (
                <button
                  key={midiNote}
                  type="button"
                  data-piano-key-midi={midiNote}
                  data-in-keybed={inKeybed ? 'true' : 'false'}
                  data-active={isActive ? 'true' : 'false'}
                  aria-label={`Audition ${label}`}
                  aria-pressed={isActive}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    try {
                      e.currentTarget.setPointerCapture(e.pointerId);
                    } catch {
                      // ignore
                    }
                    onPianoKeyDown(midiNote);
                  }}
                  onPointerUp={(e) => {
                    try {
                      e.currentTarget.releasePointerCapture(e.pointerId);
                    } catch {
                      // ignore
                    }
                    onPianoKeyUp(midiNote);
                  }}
                  onPointerCancel={() => onPianoKeyUp(midiNote)}
                  onLostPointerCapture={() => onPianoKeyUp(midiNote)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.repeat) {
                      e.preventDefault();
                      onPianoKeyDown(midiNote);
                    }
                  }}
                  onKeyUp={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      onPianoKeyUp(midiNote);
                    }
                  }}
                  style={{ height: ROW_HEIGHT }}
                  className={`w-full px-2 flex items-center justify-between text-[11px] font-mono border-b border-[#1D232F] border-l-2 transition-colors ${
                    isActive
                      ? 'bg-[#E11D48] text-white font-bold border-l-white'
                      : isSharp
                      ? `bg-[#10131A] text-slate-400 hover:bg-[#1C212E] ${
                          inKeybed ? 'border-l-[#E11D48]/60' : 'border-l-transparent'
                        }`
                      : isC
                      ? `bg-[#202634] text-white font-semibold hover:bg-[#2A3244] ${
                          inKeybed ? 'border-l-[#E11D48]' : 'border-l-transparent'
                        }`
                      : `bg-[#181D27] text-slate-300 hover:bg-[#222938] ${
                          inKeybed ? 'border-l-[#E11D48]/45' : 'border-l-transparent'
                        }`
                  }`}
                >
                  <span className="truncate">{label}</span>
                  <span className="flex items-center gap-1 shrink-0">
                    {qwerty && (
                      <span
                        className={`text-[9px] px-1 rounded-xs leading-tight ${
                          isActive
                            ? 'bg-white/25 text-white'
                            : 'bg-[#0B0E14] text-slate-400 border border-[#252D3D]'
                        }`}
                      >
                        {qwerty}
                      </span>
                    )}
                    <span
                      className={`text-[9px] tabular-nums ${
                        isActive ? 'text-white/90' : 'text-slate-500'
                      }`}
                    >
                      {midiNote}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* Interactive Note Grid Surface */}
          <div
            ref={gridRef}
            data-testid="piano-roll-canvas"
            onPointerDown={handleGridPointerDown}
            onPointerMove={handleGridPointerMove}
            onPointerUp={handleGridPointerUp}
            onPointerCancel={handleGridPointerUp}
            onLostPointerCapture={handleGridPointerUp}
            style={{
              height: pianoRows.length * ROW_HEIGHT,
              touchAction: 'none',
            }}
            className="relative flex-1 cursor-crosshair overflow-hidden"
          >
            {/* Horizontal Pitch Row Shading (Illuminates live when corresponding key is held) */}
            {pianoRows.map((midiNote, rowIdx) => {
              const label = midiNoteToName(midiNote);
              const isSharp = label.includes('#');
              const isC = label.startsWith('C') && !isSharp;
              const isActive = activeNotes.has(midiNote);
              return (
                <div
                  key={midiNote}
                  data-piano-lane-midi={midiNote}
                  data-active={isActive ? 'true' : 'false'}
                  style={{ top: rowIdx * ROW_HEIGHT, height: ROW_HEIGHT }}
                  className={`absolute inset-x-0 border-b pointer-events-none transition-colors ${
                    isActive
                      ? 'bg-[#E11D48]/20 border-[#E11D48]/50'
                      : isSharp
                      ? 'bg-[#0D1016] border-[#1A202B]'
                      : isC
                      ? 'bg-[#161B25] border-[#262E3D]'
                      : 'bg-[#12161F] border-[#1C222E]'
                  }`}
                />
              );
            })}

            {/* Vertical Grid Lines (Beat, Even, and Swing-Shifted Subdivisions) */}
            {gridLines.map((stepPos, idx) => {
              const leftPct = (stepPos / STEP_COUNT) * 100;
              const isBeat = Math.abs(stepPos % 4) < 0.001;
              const isSwungOdd = idx % 2 === 1 && swing > 50;
              const isSixteenth = Math.abs(stepPos % 1) < 0.001;
              return (
                <div
                  key={`${idx}-${stepPos}`}
                  style={{ left: `${leftPct}%` }}
                  className={`absolute top-0 bottom-0 w-px pointer-events-none ${
                    isBeat
                      ? 'bg-[#2F3748]'
                      : isSwungOdd
                      ? 'bg-amber-400/20'
                      : isSixteenth
                      ? 'bg-[#1E2431]'
                      : 'bg-[#171C26]'
                  }`}
                />
              );
            })}

            {/* Step Input Cursor Line */}
            {stepInputEnabled && (
              <div
                data-testid="step-input-cursor-line"
                style={{ left: `${(stepInputCursor / STEP_COUNT) * 100}%` }}
                className="absolute top-0 bottom-0 w-0.5 bg-teal-400 z-20 pointer-events-none"
                aria-hidden="true"
              />
            )}

            {/* Live Playhead Cursor */}
            {isPlaying && (
              <div
                style={{ left: `${(currentStep / STEP_COUNT) * 100}%` }}
                className="absolute top-0 bottom-0 w-0.5 bg-[#E11D48] z-20 pointer-events-none"
                aria-hidden="true"
              />
            )}

            {/* Interactive Melodic Note Bars */}
            {visibleNotes.map((note) => {
              const rowIdx = pianoRows.indexOf(note.note);
              if (rowIdx === -1) return null;
              const leftPct = (note.step / STEP_COUNT) * 100;
              const widthPct = Math.max(1.2, (note.length / STEP_COUNT) * 100);
              const isSelected = selectedNoteId === note.id;
              const velRatio = Math.max(0.28, note.velocity / 127);
              const pitchLabel = midiNoteToName(note.note);

              return (
                <div
                  key={note.id}
                  data-note-id={note.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Note ${pitchLabel} step ${note.step} length ${note.length} velocity ${note.velocity}`}
                  onPointerDown={(e) => handleNoteBodyPointerDown(e, note)}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    onChangeNotes(deletePianoRollNote(notes, note.id));
                    if (selectedNoteId === note.id) setSelectedNoteId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Delete' || e.key === 'Backspace') {
                      e.preventDefault();
                      onChangeNotes(deletePianoRollNote(notes, note.id));
                      setSelectedNoteId(null);
                    } else if (e.key === 'ArrowRight') {
                      e.preventDefault();
                      onChangeNotes(
                        movePianoRollNote(
                          notes,
                          note.id,
                          note.step + getSnapUnit(snap),
                          note.note,
                          snap
                        )
                      );
                    } else if (e.key === 'ArrowLeft') {
                      e.preventDefault();
                      onChangeNotes(
                        movePianoRollNote(
                          notes,
                          note.id,
                          note.step - getSnapUnit(snap),
                          note.note,
                          snap
                        )
                      );
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      onChangeNotes(
                        movePianoRollNote(notes, note.id, note.step, note.note + 1, snap)
                      );
                    } else if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      onChangeNotes(
                        movePianoRollNote(notes, note.id, note.step, note.note - 1, snap)
                      );
                    }
                  }}
                  style={{
                    top: rowIdx * ROW_HEIGHT + 2,
                    height: ROW_HEIGHT - 4,
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                    backgroundColor: trackColor,
                    opacity: 0.45 + velRatio * 0.55,
                  }}
                  className={`absolute z-10 rounded-[3px] flex items-center justify-between px-1.5 cursor-grab active:cursor-grabbing border transition-shadow focus-visible:outline-2 focus-visible:outline-white ${
                    isSelected
                      ? 'border-white ring-1 ring-white/90 shadow-md z-20'
                      : 'border-black/40 hover:border-white/70'
                  }`}
                >
                  {/* Left Start-Time Resize Handle */}
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={`Resize start of ${pitchLabel}`}
                    onPointerDown={(e) => handleNoteResizePointerDown(e, note, 'start')}
                    className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 rounded-l-[3px]"
                  />

                  <span className="text-[10px] font-mono font-bold text-slate-950 truncate pointer-events-none pl-0.5">
                    {pitchLabel}
                  </span>

                  {note.length >= 1.5 && (
                    <span className="text-[9px] font-mono text-slate-950/80 pointer-events-none pr-1 hidden sm:inline">
                      {note.velocity}
                    </span>
                  )}

                  {/* Right Duration Resize Handle */}
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={`Resize duration of ${pitchLabel}`}
                    onPointerDown={(e) => handleNoteResizePointerDown(e, note, 'end')}
                    className="absolute right-0 top-0 bottom-0 w-2.5 cursor-ew-resize hover:bg-white/40 rounded-r-[3px] flex items-center justify-center"
                  >
                    <span className="w-0.5 h-2.5 bg-slate-950/50 rounded-full pointer-events-none" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* SYNCHRONIZED VELOCITY CURVE LANE */}
        <div className="h-[86px] shrink-0 border-t border-[#283040] bg-[#0C0F15] flex items-stretch">
          <div className="w-[96px] shrink-0 border-r border-[#242B38] px-2.5 py-2 flex flex-col justify-between text-[10px] font-mono text-slate-400">
            <span className="font-semibold text-slate-300">VELOCITY</span>
            <span className="text-[9px] text-slate-500">Drag curve</span>
            <div className="flex justify-between text-[9px] text-slate-500">
              <span>0</span>
              <span>127</span>
            </div>
          </div>

          <div
            ref={velLaneRef}
            data-testid="velocity-curve-lane"
            onPointerDown={handleVelLanePointerDown}
            onPointerMove={handleVelLanePointerMove}
            onPointerUp={handleVelLanePointerUp}
            onPointerCancel={handleVelLanePointerUp}
            onLostPointerCapture={handleVelLanePointerUp}
            style={{ touchAction: 'none' }}
            className="relative flex-1 cursor-crosshair overflow-hidden"
          >
            {/* Subtle horizontal reference guides (25%, 50%, 75%) */}
            {[25, 50, 75].map((pct) => (
              <div
                key={pct}
                style={{ bottom: `${pct}%` }}
                className="absolute inset-x-0 h-px bg-[#181E29] pointer-events-none"
              />
            ))}

            {/* Beat markers */}
            {[0, 4, 8, 12].map((b) => (
              <div
                key={b}
                style={{ left: `${(b / STEP_COUNT) * 100}%` }}
                className="absolute top-0 bottom-0 w-px bg-[#1E2533] pointer-events-none"
              />
            ))}

            {/* Velocity Stems (one per note in clip) */}
            {notes.map((note) => {
              const leftPct = (note.step / STEP_COUNT) * 100;
              const heightPct = Math.max(8, (note.velocity / 127) * 92);
              const isSelected = selectedNoteId === note.id;
              return (
                <div
                  key={note.id}
                  data-vel-note-id={note.id}
                  style={{
                    left: `${leftPct}%`,
                    height: `${heightPct}%`,
                  }}
                  title={`${midiNoteToName(note.note)} · Velocity ${note.velocity}`}
                  className="absolute bottom-0 w-3 -ml-1 flex flex-col items-center justify-start group"
                >
                  <div
                    className={`w-2.5 h-2.5 rounded-full border shrink-0 transition-transform group-hover:scale-125 ${
                      isSelected ? 'border-white scale-110' : 'border-black/60'
                    }`}
                    style={{ backgroundColor: trackColor }}
                  />
                  <div
                    className="w-[3px] flex-1 rounded-t-xs"
                    style={{
                      backgroundColor: trackColor,
                      opacity: isSelected ? 1 : 0.72,
                    }}
                  />
                </div>
              );
            })}

            {/* Live Velocity Brush Ramp Guide Line */}
            {velBrush && (
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none z-20"
                preserveAspectRatio="none"
                viewBox="0 0 100 100"
              >
                <line
                  x1={(velBrush.startStep / STEP_COUNT) * 100}
                  y1={100 - (velBrush.startVel / 127) * 100}
                  x2={(velBrush.endStep / STEP_COUNT) * 100}
                  y2={100 - (velBrush.endVel / 127) * 100}
                  stroke="#F8FAFC"
                  strokeWidth="1.5"
                  strokeDasharray="2 2"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
