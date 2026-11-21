import type {
  ChordMode,
  MidiMappingConfig,
  MidiProfileId,
  ScaleId,
  SixteenLevelsMode,
} from '../types/studio';

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

export const SCALE_INTERVALS: Record<ScaleId, number[]> = {
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  'pentatonic-minor': [0, 3, 5, 7, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
};

export const CHORD_INTERVALS: Record<ChordMode, number[]> = {
  off: [0],
  major: [0, 4, 7],
  minor: [0, 3, 7],
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  sus4: [0, 5, 7],
};

export const MIDI_PROFILES: Record<MidiProfileId, MidiMappingConfig> = {
  'mpk-mk4': {
    profileId: 'mpk-mk4',
    inputChannel: 0, // Omni so both DAW/Keybed ch1 and Pads ch10 work seamlessly
    knobCCs: [24, 25, 26, 27, 28, 29, 30, 31], // Authentic Akai MPK Mini MK4 default CCs
    padNotes: [36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51],
    transportCCs: {
      play: 118,
      stop: 117,
      record: 119,
      loop: 115,
    },
  },
  'mpk-mk3': {
    profileId: 'mpk-mk3',
    inputChannel: 0,
    knobCCs: [70, 71, 72, 73, 74, 75, 76, 77],
    padNotes: [36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51],
    transportCCs: {
      play: 118,
      stop: 117,
      record: 119,
      loop: 115,
    },
  },
  generic: {
    profileId: 'generic',
    inputChannel: 0,
    knobCCs: [16, 17, 18, 19, 20, 21, 22, 23],
    padNotes: [36, 38, 42, 46, 39, 37, 49, 45, 48, 50, 43, 41, 51, 52, 53, 54],
    transportCCs: {
      play: 118,
      stop: 117,
      record: 119,
      loop: 115,
    },
  },
};

export type ParsedMidiMessage =
  | { kind: 'noteon'; channel: number; note: number; velocity: number }
  | { kind: 'noteoff'; channel: number; note: number; velocity: number }
  | { kind: 'cc'; channel: number; cc: number; value: number }
  | { kind: 'pitchbend'; channel: number; value: number; normalized: number } // -1..+1
  | { kind: 'program'; channel: number; program: number }
  | { kind: 'mmc'; action: 'play' | 'stop' | 'record' }
  | { kind: 'unknown'; status: number };

export function parseMidiPacket(data: ArrayLike<number>): ParsedMidiMessage {
  if (!data || data.length === 0) {
    return { kind: 'unknown', status: 0 };
  }

  const status = data[0];

  // MIDI Machine Control (MMC) SysEx: F0 7F <deviceID> 06 <cmd> F7
  if (status === 0xf0 && data.length >= 6 && data[1] === 0x7f && data[3] === 0x06) {
    const cmd = data[4];
    if (cmd === 0x01) return { kind: 'mmc', action: 'stop' };
    if (cmd === 0x02 || cmd === 0x03) return { kind: 'mmc', action: 'play' };
    if (cmd === 0x06 || cmd === 0x07) return { kind: 'mmc', action: 'record' };
  }

  const type = status & 0xf0;
  const channel = (status & 0x0f) + 1; // 1..16
  const d1 = data.length > 1 ? data[1] : 0;
  const d2 = data.length > 2 ? data[2] : 0;

  if (type === 0x90) {
    if (d2 === 0) {
      return { kind: 'noteoff', channel, note: d1, velocity: 0 };
    }
    return { kind: 'noteon', channel, note: d1, velocity: d2 };
  }

  if (type === 0x80) {
    return { kind: 'noteoff', channel, note: d1, velocity: d2 };
  }

  if (type === 0xb0) {
    return { kind: 'cc', channel, cc: d1, value: d2 };
  }

  if (type === 0xe0) {
    const raw14 = (d2 << 7) | d1; // 0..16383, center = 8192
    const normalized = Math.max(-1, Math.min(1, (raw14 - 8192) / 8192));
    return { kind: 'pitchbend', channel, value: raw14, normalized };
  }

  if (type === 0xc0) {
    return { kind: 'program', channel, program: d1 };
  }

  return { kind: 'unknown', status };
}

export function isAkaiMpkDevice(name: string, manufacturer = ''): boolean {
  const combined = `${name} ${manufacturer}`.toLowerCase();
  return (
    combined.includes('mpk') ||
    combined.includes('akai') ||
    combined.includes('mini iv') ||
    combined.includes('mk4')
  );
}

export function midiNoteToName(note: number): string {
  const clamped = Math.max(0, Math.min(127, Math.round(note)));
  const name = NOTE_NAMES[clamped % 12];
  const octave = Math.floor(clamped / 12) - 1;
  return `${name}${octave}`;
}

export function midiNoteToFrequency(note: number, pitchBendSemitones = 0): number {
  return 440 * Math.pow(2, (note + pitchBendSemitones - 69) / 12);
}

/**
 * Snaps an incoming MIDI note to the nearest valid scale degree for the given root (0..11, 0 = C).
 */
export function snapNoteToScale(note: number, scale: ScaleId, rootSemitone = 0): number {
  if (scale === 'chromatic') return note;
  const intervals = SCALE_INTERVALS[scale];
  const relative = ((note - rootSemitone) % 12 + 12) % 12;
  if (intervals.includes(relative)) return note;

  let bestDelta = 12;
  for (const deg of intervals) {
    const diffDown = deg - relative;
    const diffUp = deg + 12 - relative;
    const diffLow = deg - 12 - relative;
    for (const candidate of [diffDown, diffUp, diffLow]) {
      if (Math.abs(candidate) < Math.abs(bestDelta)) {
        bestDelta = candidate;
      }
    }
  }
  return Math.max(0, Math.min(127, note + bestDelta));
}

/**
 * Expands a single played MIDI note using active Scale Lock + Smart Chord Mode.
 */
export function expandPlayedNote(
  note: number,
  scale: ScaleId,
  chordMode: ChordMode,
  rootSemitone = 0
): number[] {
  const root = snapNoteToScale(note, scale, rootSemitone);
  const intervals = CHORD_INTERVALS[chordMode];
  const result = intervals
    .map((offset) => root + offset)
    .filter((n) => n >= 0 && n <= 127);
  return Array.from(new Set(result));
}

/**
 * Computes effective velocity & semitone pitch shift when MPC 16 Levels is enabled.
 */
export function computeSixteenLevels(
  padIndex: number, // 0..15
  baseVelocity: number,
  mode: SixteenLevelsMode
): { velocity: number; pitchOffset: number } {
  if (mode === 'off') {
    return { velocity: Math.max(1, Math.min(127, Math.round(baseVelocity))), pitchOffset: 0 };
  }
  if (mode === 'velocity') {
    const stepped = Math.round(16 + (padIndex / 15) * (127 - 16));
    return { velocity: stepped, pitchOffset: 0 };
  }
  // pitch mode: pad 7 is center (0 st), ranging -7 to +8 semitones
  return {
    velocity: Math.max(1, Math.min(127, Math.round(baseVelocity))),
    pitchOffset: padIndex - 7,
  };
}

/**
 * Resolves a MIDI CC number against the active Akai MPK mapping (or returns -1 if unmapped).
 */
export function resolveKnobIndexForCC(cc: number, mapping: MidiMappingConfig): number {
  const direct = mapping.knobCCs.indexOf(cc);
  if (direct !== -1) return direct;
  // Also support MK3 default CC 70-77 transparently when using MPK MK4 profile for dual compatibility
  if (mapping.profileId === 'mpk-mk4' && cc >= 70 && cc <= 77) {
    return cc - 70;
  }
  return -1;
}

export function resolvePadIndexForNote(note: number, mapping: MidiMappingConfig): number {
  return mapping.padNotes.indexOf(note);
}
