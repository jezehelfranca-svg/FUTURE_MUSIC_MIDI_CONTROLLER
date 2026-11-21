import type {
  KitId,
  MasterFxParams,
  PadConfig,
  PatternData,
  PatternSlotId,
  PianoRollNote,
  StudioProject,
  SynthParams,
  SynthPresetId,
  TrackId,
  TrackMixerChannel,
} from '../types/studio';
import { MIDI_PROFILES } from './midi';

export const STEP_COUNT = 16;

export const KIT_LABELS: Record<KitId, { name: string; subtitle: string }> = {
  'boom-bap': { name: 'MPC 3000 Boom Bap', subtitle: 'Dusty 12-bit punch & soulful chops' },
  'trap-808': { name: '808 Trap & Drill', subtitle: 'Deep sub 808s & crisp hi-hat rolls' },
  'house-909': { name: '909 Club & Techno', subtitle: 'Analog house punch & dub chords' },
  'lofi-soul': { name: 'Lo-Fi Neo Soul', subtitle: 'Warm tape drums & Rhodes stabs' },
};

export const SYNTH_PRESETS: Record<SynthPresetId, { name: string; params: SynthParams }> = {
  'analog-lead': {
    name: 'Analog Saw Lead',
    params: {
      presetId: 'analog-lead',
      waveform: 'sawtooth',
      subWaveform: 'square',
      subMix: 0.25,
      detune: 12,
      cutoff: 4200,
      resonance: 3.5,
      attack: 0.015,
      decay: 0.28,
      sustain: 0.65,
      release: 0.35,
      lfoDepth: 0.12,
      lfoRate: 5.2,
    },
  },
  'juno-pad': {
    name: 'Juno Warm Pad',
    params: {
      presetId: 'juno-pad',
      waveform: 'sawtooth',
      subWaveform: 'triangle',
      subMix: 0.45,
      detune: 24,
      cutoff: 2200,
      resonance: 1.8,
      attack: 0.22,
      decay: 0.65,
      sustain: 0.8,
      release: 1.15,
      lfoDepth: 0.22,
      lfoRate: 2.1,
    },
  },
  'fm-epiano': {
    name: 'Rhodes Electric Piano',
    params: {
      presetId: 'fm-epiano',
      waveform: 'triangle',
      subWaveform: 'sine',
      subMix: 0.55,
      detune: 6,
      cutoff: 3400,
      resonance: 1.2,
      attack: 0.01,
      decay: 0.55,
      sustain: 0.35,
      release: 0.65,
      lfoDepth: 0.16,
      lfoRate: 4.0,
    },
  },
  'sub-808': {
    name: 'Deep 808 Sub Bass',
    params: {
      presetId: 'sub-808',
      waveform: 'sine',
      subWaveform: 'triangle',
      subMix: 0.35,
      detune: 2,
      cutoff: 680,
      resonance: 2.2,
      attack: 0.008,
      decay: 0.42,
      sustain: 0.55,
      release: 0.45,
      lfoDepth: 0,
      lfoRate: 2.0,
    },
  },
  'pluck-bell': {
    name: 'MPC Bell Pluck',
    params: {
      presetId: 'pluck-bell',
      waveform: 'triangle',
      subWaveform: 'square',
      subMix: 0.2,
      detune: 9,
      cutoff: 5800,
      resonance: 2.5,
      attack: 0.006,
      decay: 0.32,
      sustain: 0.12,
      release: 0.55,
      lfoDepth: 0.05,
      lfoRate: 6.0,
    },
  },
  'acid-303': {
    name: 'Acid 303 Bass',
    params: {
      presetId: 'acid-303',
      waveform: 'sawtooth',
      subWaveform: 'square',
      subMix: 0.2,
      detune: 4,
      cutoff: 1350,
      resonance: 11.5,
      attack: 0.006,
      decay: 0.24,
      sustain: 0.25,
      release: 0.18,
      lfoDepth: 0.08,
      lfoRate: 3.5,
    },
  },
};

export function createKitPads(kitId: KitId): PadConfig[] {
  const baseTemplates: Array<Omit<PadConfig, 'id' | 'midiNote'>> = [
    // Bank A (Pads 1..8)
    {
      name: kitId === 'trap-808' ? '808 Sub Kick' : kitId === 'house-909' ? '909 Kick' : 'MPC Kick',
      shortName: 'KICK',
      color: '#E11D48',
      synthType: 'kick',
      tune: kitId === 'trap-808' ? -2 : 0,
      decay: kitId === 'trap-808' ? 1.35 : 0.75,
      cutoff: 6000,
      gain: 1.0,
      pan: 0,
      reverbSend: 0.04,
      delaySend: 0,
      chokeGroup: 0,
    },
    {
      name: kitId === 'lofi-soul' ? 'Brush Snare' : kitId === 'trap-808' ? 'Trap Snare' : 'Crisp Snare',
      shortName: 'SNARE',
      color: '#F59E0B',
      synthType: 'snare',
      tune: kitId === 'trap-808' ? 2 : 0,
      decay: 0.6,
      cutoff: 9500,
      gain: 0.92,
      pan: 0,
      reverbSend: 0.22,
      delaySend: 0.08,
      chokeGroup: 0,
    },
    {
      name: kitId === 'lofi-soul' ? 'Finger Snap' : 'MPC Clap',
      shortName: 'CLAP',
      color: '#F97316',
      synthType: 'clap',
      tune: 0,
      decay: 0.55,
      cutoff: 8200,
      gain: 0.85,
      pan: -0.1,
      reverbSend: 0.28,
      delaySend: 0.12,
      chokeGroup: 0,
    },
    {
      name: 'Side Rim',
      shortName: 'RIM',
      color: '#EAB308',
      synthType: 'rim',
      tune: 0,
      decay: 0.3,
      cutoff: 7000,
      gain: 0.78,
      pan: 0.18,
      reverbSend: 0.18,
      delaySend: 0.15,
      chokeGroup: 0,
    },
    {
      name: 'Closed Hat',
      shortName: 'CH HAT',
      color: '#14B8A6',
      synthType: 'hat-closed',
      tune: kitId === 'trap-808' ? 3 : 0,
      decay: 0.22,
      cutoff: 14000,
      gain: 0.72,
      pan: -0.22,
      reverbSend: 0.08,
      delaySend: 0.06,
      chokeGroup: 1,
    },
    {
      name: 'Open Hat',
      shortName: 'OP HAT',
      color: '#06B6D4',
      synthType: 'hat-open',
      tune: 0,
      decay: 0.72,
      cutoff: 14000,
      gain: 0.68,
      pan: 0.22,
      reverbSend: 0.16,
      delaySend: 0.1,
      chokeGroup: 1,
    },
    {
      name: kitId === 'house-909' ? 'Ride Cymbal' : 'Crash Cymbal',
      shortName: 'CRASH',
      color: '#38BDF8',
      synthType: 'crash',
      tune: 0,
      decay: 1.2,
      cutoff: 13000,
      gain: 0.62,
      pan: 0.3,
      reverbSend: 0.32,
      delaySend: 0.12,
      chokeGroup: 0,
    },
    {
      name: kitId === 'lofi-soul' ? 'Vinyl Shaker' : 'Perc Wood',
      shortName: 'PERC',
      color: '#818CF8',
      synthType: kitId === 'lofi-soul' ? 'shaker' : 'perc',
      tune: 0,
      decay: 0.38,
      cutoff: 8800,
      gain: 0.75,
      pan: -0.28,
      reverbSend: 0.2,
      delaySend: 0.22,
      chokeGroup: 0,
    },
    // Bank B (Pads 9..16)
    {
      name: 'Sub 808 Hit',
      shortName: '808 HIT',
      color: '#FB7185',
      synthType: 'bass-hit',
      tune: 0,
      decay: 1.3,
      cutoff: 900,
      gain: 0.95,
      pan: 0,
      reverbSend: 0.02,
      delaySend: 0,
      chokeGroup: 2,
    },
    {
      name: 'Low Tom',
      shortName: 'TOM LO',
      color: '#F472B6',
      synthType: 'tom-lo',
      tune: -3,
      decay: 0.65,
      cutoff: 3200,
      gain: 0.84,
      pan: -0.25,
      reverbSend: 0.18,
      delaySend: 0.05,
      chokeGroup: 0,
    },
    {
      name: 'High Tom',
      shortName: 'TOM HI',
      color: '#C084FC',
      synthType: 'tom-hi',
      tune: 3,
      decay: 0.55,
      cutoff: 4500,
      gain: 0.82,
      pan: 0.25,
      reverbSend: 0.18,
      delaySend: 0.05,
      chokeGroup: 0,
    },
    {
      name: 'Soul Chop 1',
      shortName: 'CHOP 1',
      color: '#A78BFA',
      synthType: 'chord-stab',
      tune: 0,
      decay: 0.85,
      cutoff: 4200,
      gain: 0.82,
      pan: -0.1,
      reverbSend: 0.35,
      delaySend: 0.28,
      chokeGroup: 2,
    },
    {
      name: 'Soul Chop 2',
      shortName: 'CHOP 2',
      color: '#60A5FA',
      synthType: 'chord-stab',
      tune: 3,
      decay: 0.85,
      cutoff: 4600,
      gain: 0.82,
      pan: 0.1,
      reverbSend: 0.35,
      delaySend: 0.28,
      chokeGroup: 2,
    },
    {
      name: 'Vox Chop',
      shortName: 'VOX',
      color: '#34D399',
      synthType: 'vocal-chop',
      tune: 0,
      decay: 0.7,
      cutoff: 5200,
      gain: 0.78,
      pan: 0,
      reverbSend: 0.4,
      delaySend: 0.32,
      chokeGroup: 2,
    },
    {
      name: 'MPC Bell',
      shortName: 'BELL',
      color: '#2DD4BF',
      synthType: 'bell',
      tune: 0,
      decay: 1.0,
      cutoff: 10000,
      gain: 0.7,
      pan: 0.2,
      reverbSend: 0.42,
      delaySend: 0.35,
      chokeGroup: 0,
    },
    {
      name: 'FX Sweep',
      shortName: 'FX HIT',
      color: '#FBBF24',
      synthType: 'fx-riser',
      tune: 0,
      decay: 1.1,
      cutoff: 7500,
      gain: 0.72,
      pan: 0,
      reverbSend: 0.5,
      delaySend: 0.4,
      chokeGroup: 0,
    },
  ];

  return baseTemplates.map((tpl, idx) => ({
    ...tpl,
    id: idx,
    midiNote: 36 + idx,
  }));
}

export function createEmptyDrumGrid(): number[][] {
  return Array.from({ length: 16 }, () => Array.from({ length: STEP_COUNT }, () => 0));
}

export function createEmptyPattern(id: PatternSlotId, name: string): PatternData {
  return {
    id,
    name,
    steps: STEP_COUNT,
    drumGrid: createEmptyDrumGrid(),
    melodicNotes: {
      bass: [],
      keys: [],
      lead: [],
    },
  };
}

export function createDemoPattern(slot: PatternSlotId, style: KitId): PatternData {
  const grid = createEmptyDrumGrid();

  if (style === 'boom-bap' || style === 'lofi-soul') {
    // Classic MPC boom-bap pocket
    [0, 7, 10].forEach((s) => (grid[0][s] = s === 0 ? 122 : 104)); // Kick
    [4, 12].forEach((s) => (grid[1][s] = 118)); // Snare
    [12].forEach((s) => (grid[2][s] = 86)); // Layered clap on beat 4
    [0, 2, 4, 6, 8, 10, 12, 14].forEach((s) => (grid[4][s] = s % 4 === 0 ? 96 : 68)); // Closed hat
    [14].forEach((s) => (grid[5][s] = 88)); // Open hat pickup
    [3, 15].forEach((s) => (grid[7][s] = 74)); // Perc/shaker
    [0, 8].forEach((s) => (grid[11][s] = 92)); // Soul chop 1
    [12].forEach((s) => (grid[12][s] = 88)); // Soul chop 2

    return {
      id: slot,
      name: style === 'boom-bap' ? 'MPC 3000 Groove' : 'Late Night Rhodes',
      steps: STEP_COUNT,
      drumGrid: grid,
      melodicNotes: {
        bass: [
          { id: 'b1', step: 0, note: 36, velocity: 112, length: 3 },
          { id: 'b2', step: 6, note: 39, velocity: 98, length: 2 },
          { id: 'b3', step: 8, note: 41, velocity: 108, length: 3 },
          { id: 'b4', step: 14, note: 43, velocity: 96, length: 2 },
        ],
        keys: [
          { id: 'k1', step: 0, note: 60, velocity: 84, length: 4 },
          { id: 'k2', step: 0, note: 63, velocity: 82, length: 4 },
          { id: 'k3', step: 0, note: 67, velocity: 80, length: 4 },
          { id: 'k4', step: 0, note: 70, velocity: 76, length: 4 },
          { id: 'k5', step: 8, note: 58, velocity: 82, length: 4 },
          { id: 'k6', step: 8, note: 62, velocity: 80, length: 4 },
          { id: 'k7', step: 8, note: 65, velocity: 78, length: 4 },
          { id: 'k8', step: 8, note: 69, velocity: 76, length: 4 },
        ],
        lead: [
          { id: 'l1', step: 4, note: 72, velocity: 86, length: 2 },
          { id: 'l2', step: 10, note: 75, velocity: 90, length: 2 },
          { id: 'l3', step: 14, note: 74, velocity: 82, length: 2 },
        ],
      },
    };
  }

  if (style === 'trap-808') {
    [0, 6, 10].forEach((s) => (grid[0][s] = 124)); // 808 Kick
    [8].forEach((s) => (grid[1][s] = 120)); // Half-time snare
    [8].forEach((s) => (grid[2][s] = 104)); // Clap
    for (let s = 0; s < 16; s++) {
      grid[4][s] = s % 2 === 0 ? 92 : s === 7 || s === 15 ? 105 : 64;
    }
    [4, 14].forEach((s) => (grid[5][s] = 86));
    [0, 10].forEach((s) => (grid[8][s] = 112)); // Sub 808 hit
    return {
      id: slot,
      name: '808 Dark Bounce',
      steps: STEP_COUNT,
      drumGrid: grid,
      melodicNotes: {
        bass: [
          { id: 'tb1', step: 0, note: 36, velocity: 120, length: 4 },
          { id: 'tb2', step: 6, note: 36, velocity: 108, length: 2 },
          { id: 'tb3', step: 10, note: 39, velocity: 115, length: 4 },
        ],
        keys: [
          { id: 'tk1', step: 0, note: 60, velocity: 80, length: 6 },
          { id: 'tk2', step: 0, note: 63, velocity: 78, length: 6 },
          { id: 'tk3', step: 8, note: 60, velocity: 80, length: 6 },
          { id: 'tk4', step: 8, note: 65, velocity: 78, length: 6 },
        ],
        lead: [
          { id: 'tl1', step: 2, note: 72, velocity: 85, length: 1 },
          { id: 'tl2', step: 6, note: 75, velocity: 88, length: 1 },
          { id: 'tl3', step: 12, note: 79, velocity: 90, length: 2 },
        ],
      },
    };
  }

  // House 909 four-on-the-floor
  [0, 4, 8, 12].forEach((s) => (grid[0][s] = 122));
  [4, 12].forEach((s) => (grid[2][s] = 108));
  [2, 6, 10, 14].forEach((s) => (grid[5][s] = 94)); // Off-beat open hats
  [0, 1, 4, 5, 8, 9, 12, 13].forEach((s) => (grid[4][s] = 70));
  [7, 15].forEach((s) => (grid[3][s] = 82));

  return {
    id: slot,
    name: '909 Warehouse Dub',
    steps: STEP_COUNT,
    drumGrid: grid,
    melodicNotes: {
      bass: [
        { id: 'hb1', step: 0, note: 36, velocity: 112, length: 2 },
        { id: 'hb2', step: 3, note: 36, velocity: 98, length: 1 },
        { id: 'hb3', step: 6, note: 39, velocity: 108, length: 2 },
        { id: 'hb4', step: 10, note: 41, velocity: 106, length: 2 },
        { id: 'hb5', step: 14, note: 43, velocity: 100, length: 2 },
      ],
      keys: [
        { id: 'hk1', step: 2, note: 60, velocity: 88, length: 2 },
        { id: 'hk2', step: 2, note: 63, velocity: 86, length: 2 },
        { id: 'hk3', step: 2, note: 67, velocity: 84, length: 2 },
        { id: 'hk4', step: 10, note: 58, velocity: 86, length: 2 },
        { id: 'hk5', step: 10, note: 62, velocity: 84, length: 2 },
        { id: 'hk6', step: 10, note: 65, velocity: 82, length: 2 },
      ],
      lead: [],
    },
  };
}

export function createDefaultProject(): StudioProject {
  const defaultFx: MasterFxParams = {
    filterCutoff: 18500,
    filterResonance: 1.0,
    delayTime: 0.32,
    delayFeedback: 0.34,
    delayMix: 0,
    reverbMix: 0.24,
    drive: 0.14,
    masterVolume: 0.85,
  };

  const defaultMixer: Record<TrackId, TrackMixerChannel> = {
    drums: {
      id: 'drums',
      name: 'MPC Drums',
      color: '#E11D48',
      volume: 0.92,
      pan: 0,
      muted: false,
      solo: false,
      reverbSend: 0.18,
      delaySend: 0.1,
      synthPreset: 'sub-808',
    },
    bass: {
      id: 'bass',
      name: 'Bass Synth',
      color: '#F59E0B',
      volume: 0.84,
      pan: 0,
      muted: false,
      solo: false,
      reverbSend: 0.05,
      delaySend: 0.04,
      synthPreset: 'sub-808',
    },
    keys: {
      id: 'keys',
      name: 'Keys / Chords',
      color: '#14B8A6',
      volume: 0.76,
      pan: -0.1,
      muted: false,
      solo: false,
      reverbSend: 0.36,
      delaySend: 0.22,
      synthPreset: 'fm-epiano',
    },
    lead: {
      id: 'lead',
      name: 'Lead / Arp',
      color: '#38BDF8',
      volume: 0.72,
      pan: 0.12,
      muted: false,
      solo: false,
      reverbSend: 0.32,
      delaySend: 0.3,
      synthPreset: 'analog-lead',
    },
  };

  return {
    version: 1,
    name: 'Studio Session 01',
    bpm: 94,
    swing: 58,
    kitId: 'boom-bap',
    activePattern: 'A',
    patterns: {
      A: createDemoPattern('A', 'boom-bap'),
      B: createDemoPattern('B', 'trap-808'),
      C: createDemoPattern('C', 'house-909'),
      D: createEmptyPattern('D', 'Empty Pattern D'),
    },
    pads: createKitPads('boom-bap'),
    synth: { ...SYNTH_PRESETS['fm-epiano'].params },
    fx: defaultFx,
    mixer: defaultMixer,
    midiMapping: { ...MIDI_PROFILES['mpk-mk4'] },
  };
}

/**
 * Calculates the duration of a single 16th-note step in milliseconds.
 */
export function getSixteenthDurationMs(bpm: number): number {
  const safeBpm = Math.max(40, Math.min(240, bpm));
  return (60_000 / safeBpm) / 4;
}

/**
 * Calculates MPC swing timing offset in seconds for a given step index (0..15).
 * Swing 50% = straight (0 delay). Swing 66% = classic triplet swing on odd 16th steps.
 */
export function getStepSwingOffsetSeconds(stepIndex: number, bpm: number, swingPct: number): number {
  if (stepIndex % 2 === 0) return 0;
  const clampedSwing = Math.max(50, Math.min(75, swingPct));
  const sixteenthSec = (60 / Math.max(40, Math.min(240, bpm))) / 4;
  // At 50% -> 0 offset; at 75% -> +0.5 of a 16th step (3:1 ratio)
  const ratio = (clampedSwing - 50) / 50;
  return sixteenthSec * ratio;
}

/**
 * Toggles a drum step cleanly without mutating the original pattern.
 */
export function toggleDrumStep(
  pattern: PatternData,
  padIndex: number,
  stepIndex: number,
  velocity = 110
): PatternData {
  if (padIndex < 0 || padIndex >= 16 || stepIndex < 0 || stepIndex >= pattern.steps) {
    return pattern;
  }
  const nextGrid = pattern.drumGrid.map((row, rIdx) => {
    if (rIdx !== padIndex) return row;
    return row.map((val, cIdx) => (cIdx === stepIndex ? (val > 0 ? 0 : velocity) : val));
  });
  return { ...pattern, drumGrid: nextGrid };
}

/**
 * Toggles a melodic note in a piano roll track (bass, keys, or lead).
 */
export function toggleMelodicNote(
  pattern: PatternData,
  track: 'bass' | 'keys' | 'lead',
  step: number,
  note: number,
  velocity = 96,
  length = 2
): PatternData {
  const existing = pattern.melodicNotes[track];
  const foundIdx = existing.findIndex((n) => n.step === step && n.note === note);
  let nextList: PianoRollNote[];
  if (foundIdx !== -1) {
    nextList = existing.filter((_, i) => i !== foundIdx);
  } else {
    nextList = [
      ...existing,
      {
        id: `${track}-${step}-${note}-${Date.now().toString(36)}`,
        step,
        note,
        velocity,
        length: Math.max(1, Math.min(pattern.steps - step, length)),
      },
    ];
  }
  return {
    ...pattern,
    melodicNotes: {
      ...pattern.melodicNotes,
      [track]: nextList,
    },
  };
}

/**
 * Records a live-played drum pad or melodic note into the quantized step of the active pattern.
 */
export function recordNoteToPattern(
  pattern: PatternData,
  track: TrackId,
  step: number,
  noteOrPadIndex: number,
  velocity: number
): PatternData {
  const safeStep = ((step % pattern.steps) + pattern.steps) % pattern.steps;
  if (track === 'drums') {
    if (noteOrPadIndex < 0 || noteOrPadIndex >= 16) return pattern;
    const nextGrid = pattern.drumGrid.map((row, idx) => {
      if (idx !== noteOrPadIndex) return row;
      const copy = [...row];
      copy[safeStep] = Math.max(1, Math.min(127, Math.round(velocity)));
      return copy;
    });
    return { ...pattern, drumGrid: nextGrid };
  }

  const existing = pattern.melodicNotes[track];
  const already = existing.some((n) => n.step === safeStep && n.note === noteOrPadIndex);
  if (already) return pattern;

  return {
    ...pattern,
    melodicNotes: {
      ...pattern.melodicNotes,
      [track]: [
        ...existing,
        {
          id: `rec-${track}-${safeStep}-${noteOrPadIndex}-${Math.random().toString(36).slice(2, 6)}`,
          step: safeStep,
          note: noteOrPadIndex,
          velocity: Math.max(1, Math.min(127, Math.round(velocity))),
          length: 2,
        },
      ],
    },
  };
}

/**
 * Checks whether a mixer channel is currently audible given mute and solo states across all channels.
 */
export function isTrackAudible(
  trackId: TrackId,
  mixer: Record<TrackId, TrackMixerChannel>
): boolean {
  const anySolo = (Object.values(mixer) as TrackMixerChannel[]).some((ch) => ch.solo);
  const channel = mixer[trackId];
  if (!channel) return false;
  if (anySolo) return channel.solo && !channel.muted;
  return !channel.muted;
}

/**
 * Safely validates and parses an imported JSON studio project string.
 */
export function parseProjectJson(raw: string): StudioProject | null {
  try {
    const parsed = JSON.parse(raw) as Partial<StudioProject>;
    if (
      !parsed ||
      parsed.version !== 1 ||
      typeof parsed.bpm !== 'number' ||
      !parsed.patterns ||
      !Array.isArray(parsed.pads) ||
      parsed.pads.length !== 16
    ) {
      return null;
    }
    const base = createDefaultProject();
    return {
      ...base,
      ...parsed,
      fx: { ...base.fx, ...(parsed.fx || {}) },
      synth: { ...base.synth, ...(parsed.synth || {}) },
      midiMapping: { ...base.midiMapping, ...(parsed.midiMapping || {}) },
      mixer: { ...base.mixer, ...(parsed.mixer || {}) },
      patterns: { ...base.patterns, ...(parsed.patterns || {}) },
    };
  } catch {
    return null;
  }
}
