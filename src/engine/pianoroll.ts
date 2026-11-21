import type { PianoRollNote } from '../types/studio';
import { STEP_COUNT } from './sequencer';

export type PianoRollSnap = '1/8' | '1/16' | '1/32' | 'off';

export type VelocityCurvePreset = 'crescendo' | 'decrescendo' | 'arch' | 'humanize';

export const MIN_MIDI_NOTE = 24;
export const MAX_MIDI_NOTE = 108;
export const MIN_NOTE_LENGTH = 0.25;
export const KEYBED_BASE_C3 = 48;
export const KEYBED_KEY_COUNT = 25;
export const KEYBED_MIN_OCTAVE = -2;
export const KEYBED_MAX_OCTAVE = 3;

export const QWERTY_KEY_LABELS = [
  'Z',
  'S',
  'X',
  'D',
  'C',
  'V',
  'G',
  'B',
  'H',
  'N',
  'J',
  'M',
  ',',
] as const;

export function getSnapUnit(snap: PianoRollSnap): number {
  switch (snap) {
    case '1/8':
      return 2;
    case '1/16':
      return 1;
    case '1/32':
      return 0.5;
    case 'off':
      return 0.125;
  }
}

export function roundStep(val: number): number {
  return Math.round(val * 1000) / 1000;
}

export function snapStepValue(
  rawStep: number,
  snap: PianoRollSnap,
  minStep = 0,
  maxStep = STEP_COUNT
): number {
  const unit = getSnapUnit(snap);
  const snapped = Math.round(rawStep / unit) * unit;
  return roundStep(Math.max(minStep, Math.min(maxStep, snapped)));
}

export function createPianoRollNote(
  track: 'bass' | 'keys' | 'lead',
  step: number,
  note: number,
  length: number,
  velocity = 100
): PianoRollNote {
  const safeNote = Math.max(MIN_MIDI_NOTE, Math.min(MAX_MIDI_NOTE, Math.round(note)));
  const safeStep = roundStep(Math.max(0, Math.min(STEP_COUNT - MIN_NOTE_LENGTH, step)));
  const safeLen = roundStep(
    Math.max(MIN_NOTE_LENGTH, Math.min(STEP_COUNT - safeStep, length))
  );
  const safeVel = Math.max(1, Math.min(127, Math.round(velocity)));

  return {
    id: `${track}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    step: safeStep,
    note: safeNote,
    length: safeLen,
    velocity: safeVel,
  };
}

export function addPianoRollNote(
  notes: PianoRollNote[],
  newNote: PianoRollNote
): PianoRollNote[] {
  return [...notes, newNote];
}

export function deletePianoRollNote(
  notes: PianoRollNote[],
  noteId: string
): PianoRollNote[] {
  return notes.filter((n) => n.id !== noteId);
}

export function movePianoRollNote(
  notes: PianoRollNote[],
  noteId: string,
  rawStep: number,
  rawMidiNote: number,
  snap: PianoRollSnap
): PianoRollNote[] {
  return notes.map((n) => {
    if (n.id !== noteId) return n;
    const maxStart = Math.max(0, STEP_COUNT - n.length);
    const nextStep = snapStepValue(rawStep, snap, 0, maxStart);
    const nextNote = Math.max(MIN_MIDI_NOTE, Math.min(MAX_MIDI_NOTE, Math.round(rawMidiNote)));
    return { ...n, step: nextStep, note: nextNote };
  });
}

export function resizePianoRollNoteEnd(
  notes: PianoRollNote[],
  noteId: string,
  rawEndStep: number,
  snap: PianoRollSnap
): PianoRollNote[] {
  const minUnit = Math.max(MIN_NOTE_LENGTH, getSnapUnit(snap));
  return notes.map((n) => {
    if (n.id !== noteId) return n;
    const minEnd = Math.min(STEP_COUNT, n.step + minUnit);
    const snappedEnd = snapStepValue(rawEndStep, snap, minEnd, STEP_COUNT);
    const nextLength = roundStep(Math.max(MIN_NOTE_LENGTH, snappedEnd - n.step));
    return { ...n, length: nextLength };
  });
}

export function resizePianoRollNoteStart(
  notes: PianoRollNote[],
  noteId: string,
  rawStartStep: number,
  snap: PianoRollSnap
): PianoRollNote[] {
  const minUnit = Math.max(MIN_NOTE_LENGTH, getSnapUnit(snap));
  return notes.map((n) => {
    if (n.id !== noteId) return n;
    const originalEnd = roundStep(n.step + n.length);
    const maxStart = Math.max(0, roundStep(originalEnd - minUnit));
    const nextStart = snapStepValue(rawStartStep, snap, 0, maxStart);
    const nextLength = roundStep(Math.max(MIN_NOTE_LENGTH, originalEnd - nextStart));
    return { ...n, step: nextStart, length: nextLength };
  });
}

export function updateNoteVelocity(
  notes: PianoRollNote[],
  noteId: string,
  velocity: number
): PianoRollNote[] {
  const clamped = Math.max(1, Math.min(127, Math.round(velocity)));
  return notes.map((n) => (n.id === noteId ? { ...n, velocity: clamped } : n));
}

/**
 * Linearly interpolates velocities for all notes whose start time falls within [startStep, endStep]
 * (with a slight +/- 0.35 step pickup tolerance so clicking right over a stem hits reliably).
 */
export function paintVelocityLine(
  notes: PianoRollNote[],
  startStep: number,
  startVelocity: number,
  endStep: number,
  endVelocity: number
): PianoRollNote[] {
  const minS = Math.min(startStep, endStep) - 0.35;
  const maxS = Math.max(startStep, endStep) + 0.35;
  const span = endStep - startStep;

  return notes.map((n) => {
    if (n.step < minS || n.step > maxS) return n;
    let targetVel: number;
    if (Math.abs(span) < 0.05) {
      targetVel = endVelocity;
    } else {
      const t = Math.max(0, Math.min(1, (n.step - startStep) / span));
      targetVel = startVelocity + t * (endVelocity - startVelocity);
    }
    return {
      ...n,
      velocity: Math.max(1, Math.min(127, Math.round(targetVel))),
    };
  });
}

/**
 * Shapes all notes in the track along a musical velocity curve.
 */
export function applyVelocityCurvePreset(
  notes: PianoRollNote[],
  preset: VelocityCurvePreset
): PianoRollNote[] {
  if (notes.length === 0) return notes;
  const sortedSteps = [...notes].map((n) => n.step).sort((a, b) => a - b);
  const firstStep = sortedSteps[0];
  const lastStep = sortedSteps[sortedSteps.length - 1];
  const span = Math.max(0.5, lastStep - firstStep);

  return notes.map((n, idx) => {
    const progress = Math.max(0, Math.min(1, (n.step - firstStep) / span));
    let velocity = n.velocity;

    if (preset === 'crescendo') {
      velocity = Math.round(46 + progress * (124 - 46));
    } else if (preset === 'decrescendo') {
      velocity = Math.round(124 - progress * (124 - 46));
    } else if (preset === 'arch') {
      const curve = Math.sin(progress * Math.PI);
      velocity = Math.round(58 + curve * (124 - 58));
    } else if (preset === 'humanize') {
      // Deterministic musical groove variation (downbeats stronger, offbeats nuanced)
      const isDownbeat = Math.abs(n.step % 4) < 0.2;
      const hash = ((idx * 37 + n.note * 13 + Math.round(n.step * 8) * 19) % 21) - 10;
      const base = isDownbeat ? 110 : 88;
      velocity = Math.max(36, Math.min(126, base + hash));
    }

    return { ...n, velocity };
  });
}

/**
 * Resolves the effective quantization resolution (defaults to 1/16 when Grid Snap is set to Free/'off').
 */
export function getQuantizeResolution(snap: PianoRollSnap): '1/8' | '1/16' | '1/32' {
  return snap === 'off' ? '1/16' : snap;
}

/**
 * Generates sorted grid line positions across [0, maxStep) for the active resolution and MPC swing (50–75%).
 * At 50% swing, all grid lines are straight; above 50%, every odd grid line shifts later by ((swing - 50) / 50) * unit.
 */
export function getSwungGridLines(
  snap: PianoRollSnap,
  swingPct: number,
  maxStep = STEP_COUNT
): number[] {
  const effectiveSnap = getQuantizeResolution(snap);
  const unit = getSnapUnit(effectiveSnap);
  const clampedSwing = Math.max(50, Math.min(75, swingPct));
  const swingRatio = (clampedSwing - 50) / 50;

  const lines: number[] = [];
  const count = Math.ceil(maxStep / unit);
  for (let k = 0; k < count; k++) {
    const base = k * unit;
    const pos = k % 2 === 1 ? base + unit * swingRatio : base;
    const rounded = roundStep(pos);
    if (rounded < maxStep) {
      lines.push(rounded);
    }
  }
  return lines;
}

/**
 * Snaps a raw step value to the nearest grid line accounting for current resolution and MPC swing.
 */
export function snapStepToSwungGrid(
  rawStep: number,
  snap: PianoRollSnap,
  swingPct: number,
  maxStart = STEP_COUNT - MIN_NOTE_LENGTH
): number {
  const lines = getSwungGridLines(snap, swingPct, STEP_COUNT).filter((pos) => pos <= maxStart);
  if (lines.length === 0) return 0;

  let nearest = lines[0];
  let bestDist = Math.abs(rawStep - nearest);
  for (let i = 1; i < lines.length; i++) {
    const dist = Math.abs(rawStep - lines[i]);
    if (dist < bestDist) {
      bestDist = dist;
      nearest = lines[i];
    }
  }
  return roundStep(nearest);
}

/**
 * Quantizes melodic notes in the Piano Roll to the nearest swung grid line for the active resolution,
 * preserving pitch, velocity, and clamping duration cleanly within the 16-step pattern boundary.
 */
export function quantizePianoRollNotes(
  notes: PianoRollNote[],
  snap: PianoRollSnap,
  swingPct: number
): PianoRollNote[] {
  const maxStart = STEP_COUNT - MIN_NOTE_LENGTH;
  return notes.map((n) => {
    const snappedStep = snapStepToSwungGrid(n.step, snap, swingPct, maxStart);
    const clampedLength = roundStep(
      Math.max(MIN_NOTE_LENGTH, Math.min(n.length, STEP_COUNT - snappedStep))
    );
    return {
      ...n,
      step: snappedStep,
      length: clampedLength,
    };
  });
}

/**
 * Returns the recommended MPK MK4 octave offset for a melodic track so its musical register
 * aligns directly with the 25-key keybed (C2-C4 bass, C3-C5 keys, C4-C6 lead).
 */
export function getDefaultOctaveForTrack(track: 'bass' | 'keys' | 'lead'): number {
  if (track === 'bass') return -1;
  if (track === 'lead') return 1;
  return 0;
}

/**
 * Returns the exact 25-key MPK MK4 MIDI note range for a given octave offset (-2..+3).
 */
export function getKeybedMidiRange(octave: number): {
  minMidi: number;
  maxMidi: number;
  keys: number[];
} {
  const safeOct = Math.max(KEYBED_MIN_OCTAVE, Math.min(KEYBED_MAX_OCTAVE, Math.round(octave)));
  const minMidi = KEYBED_BASE_C3 + safeOct * 12;
  const maxMidi = minMidi + KEYBED_KEY_COUNT - 1;
  const keys = Array.from({ length: KEYBED_KEY_COUNT }, (_, i) => minMidi + i);
  return { minMidi, maxMidi, keys };
}

/**
 * Returns the computer keyboard shortcut label (Z..M / ,) assigned to a MIDI note at the given octave,
 * or null if outside the 13-key lower octave shortcut span.
 */
export function getQwertyLabelForMidi(midiNote: number, octave: number): string | null {
  const { minMidi } = getKeybedMidiRange(octave);
  const offset = midiNote - minMidi;
  if (offset < 0 || offset >= QWERTY_KEY_LABELS.length) return null;
  return QWERTY_KEY_LABELS[offset];
}

/**
 * Builds Piano Roll pitch rows (highest MIDI note to lowest) guaranteed to contain a 1:1 match
 * for all 25 active MPK MK4 keys, expanding seamlessly if existing pattern notes sit outside the keybed span.
 */
export function buildKeybedSyncedPianoRows(
  octave: number,
  existingNotes: PianoRollNote[] = []
): number[] {
  const { minMidi, maxMidi } = getKeybedMidiRange(octave);
  let low = minMidi;
  let high = maxMidi;

  for (const n of existingNotes) {
    if (n.note < low) low = Math.max(MIN_MIDI_NOTE, n.note);
    if (n.note > high) high = Math.min(MAX_MIDI_NOTE, n.note);
  }

  const rows: number[] = [];
  for (let midi = high; midi >= low; midi--) {
    rows.push(midi);
  }
  return rows;
}

/**
 * Inserts one or more played MIDI notes (single note or Smart Chord) into the Piano Roll
 * at the current Step Input cursor and returns the updated note list plus the next cursor position.
 */
export function insertStepInputNotes(
  notes: PianoRollNote[],
  track: 'bass' | 'keys' | 'lead',
  midiNotes: number[],
  cursorStep: number,
  snap: PianoRollSnap,
  velocity: number
): { notes: PianoRollNote[]; nextCursor: number } {
  const stepUnit = snap === 'off' ? 1 : getSnapUnit(snap);
  const safeCursor = roundStep(
    Math.max(0, Math.min(STEP_COUNT - MIN_NOTE_LENGTH, cursorStep))
  );
  const noteLength = roundStep(Math.min(stepUnit, STEP_COUNT - safeCursor));

  // Replace any duplicate note at the exact same pitch & step so re-entering stays clean
  const uniquePitches = Array.from(new Set(midiNotes));
  const filtered = notes.filter(
    (n) => !(Math.abs(n.step - safeCursor) < 0.01 && uniquePitches.includes(n.note))
  );

  const inserted = uniquePitches.map((midi) =>
    createPianoRollNote(track, safeCursor, midi, noteLength, velocity)
  );

  const rawNext = roundStep(safeCursor + stepUnit);
  const nextCursor = rawNext >= STEP_COUNT ? 0 : rawNext;

  return {
    notes: [...filtered, ...inserted],
    nextCursor,
  };
}

/**
 * Returns all notes scheduled within the integer step window [stepIndex, stepIndex + 1)
 * along with their sub-step fractional offset (0 <= subOffset < 1).
 */
export function getNotesScheduledInStepWindow(
  notes: PianoRollNote[],
  stepIndex: number
): Array<{ note: PianoRollNote; subStepOffset: number }> {
  const results: Array<{ note: PianoRollNote; subStepOffset: number }> = [];
  for (const note of notes) {
    if (note.step >= stepIndex && note.step < stepIndex + 1) {
      results.push({
        note,
        subStepOffset: roundStep(note.step - stepIndex),
      });
    }
  }
  return results;
}
