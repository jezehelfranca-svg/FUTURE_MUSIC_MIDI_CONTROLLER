export type WorkspaceView = 'mpc' | 'sequencer' | 'synth' | 'mixer' | 'midi';

export type TrackId = 'drums' | 'bass' | 'keys' | 'lead';

export type PadBank = 'A' | 'B';

export type KnobMode = 'plugin' | 'daw' | 'pad';

export type KitId = 'boom-bap' | 'trap-808' | 'house-909' | 'lofi-soul';

export type SynthPresetId =
  | 'analog-lead'
  | 'juno-pad'
  | 'fm-epiano'
  | 'sub-808'
  | 'pluck-bell'
  | 'acid-303';

export type ScaleId =
  | 'chromatic'
  | 'minor'
  | 'major'
  | 'dorian'
  | 'pentatonic-minor'
  | 'phrygian';

export type ChordMode = 'off' | 'major' | 'minor' | 'maj7' | 'min7' | 'sus4';

export type ArpMode = 'off' | 'up' | 'down' | 'up-down' | 'random';

export type NoteRepeatRate = '1/4' | '1/8' | '1/16' | '1/32';

export type SixteenLevelsMode = 'off' | 'velocity' | 'pitch';

export type PatternSlotId = 'A' | 'B' | 'C' | 'D';

export type MidiProfileId = 'mpk-mk4' | 'mpk-mk3' | 'generic';

export interface PadConfig {
  id: number; // 0..15 (0..7 Bank A, 8..15 Bank B)
  name: string;
  shortName: string;
  midiNote: number; // 36..51 default Akai/MPC mapping
  color: string; // Hex accent for pad RGB rim/LED
  synthType:
    | 'kick'
    | 'snare'
    | 'clap'
    | 'rim'
    | 'hat-closed'
    | 'hat-open'
    | 'crash'
    | 'perc'
    | 'bass-hit'
    | 'tom-lo'
    | 'tom-hi'
    | 'chord-stab'
    | 'vocal-chop'
    | 'bell'
    | 'fx-riser'
    | 'shaker';
  tune: number; // -12 to +12 semitones
  decay: number; // 0.05 to 2.0 seconds multiplier
  cutoff: number; // 200 to 18000 Hz
  gain: number; // 0 to 1.2
  pan: number; // -1 to +1
  reverbSend: number; // 0 to 1
  delaySend: number; // 0 to 1
  chokeGroup: number; // 0 = none, 1 = hats, 2 = chops
  customSampleName?: string;
}

export interface SynthParams {
  presetId: SynthPresetId;
  waveform: OscillatorType;
  subWaveform: OscillatorType;
  subMix: number; // 0..1
  detune: number; // 0..40 cents
  cutoff: number; // 120..16000 Hz
  resonance: number; // 0.5..18
  attack: number; // 0.005..1.2 s
  decay: number; // 0.05..1.5 s
  sustain: number; // 0..1
  release: number; // 0.05..2.5 s
  lfoDepth: number; // 0..1
  lfoRate: number; // 0.5..12 Hz
}

export interface MasterFxParams {
  filterCutoff: number; // 200..20000 Hz
  filterResonance: number; // 0.5..12
  delayTime: number; // 0.08..0.75 s
  delayFeedback: number; // 0..0.75
  delayMix: number; // 0..0.8
  reverbMix: number; // 0..0.85
  drive: number; // 0..1
  masterVolume: number; // 0..1
}

export interface TrackMixerChannel {
  id: TrackId;
  name: string;
  color: string;
  volume: number; // 0..1.2
  pan: number; // -1..1
  muted: boolean;
  solo: boolean;
  reverbSend: number; // 0..1
  delaySend: number; // 0..1
  synthPreset: SynthPresetId;
}

export interface PianoRollNote {
  id: string;
  step: number; // 0..15
  note: number; // MIDI note 24..84
  velocity: number; // 1..127
  length: number; // in steps (1..8)
}

export interface PatternData {
  id: PatternSlotId;
  name: string;
  steps: number; // 16
  // 16 pads x 16 steps: 0 = off, 1..127 = velocity
  drumGrid: number[][];
  melodicNotes: {
    bass: PianoRollNote[];
    keys: PianoRollNote[];
    lead: PianoRollNote[];
  };
}

export type MidiLearnTarget =
  | { type: 'knob'; index: number }
  | { type: 'pad'; padIndex: number }
  | { type: 'transport'; action: 'play' | 'stop' | 'record' | 'loop' };

export interface MidiMappingConfig {
  profileId: MidiProfileId;
  inputChannel: number; // 0 = Omni, 1..16
  knobCCs: number[]; // length 8 (MK4 default: 24..31)
  padNotes: number[]; // length 16 (36..51)
  transportCCs: {
    play: number;
    stop: number;
    record: number;
    loop: number;
  };
}

export interface MidiLogEntry {
  id: string;
  timestamp: number;
  channel: number;
  type: 'Note On' | 'Note Off' | 'CC' | 'Pitch Bend' | 'Program' | 'Transport';
  data1: number;
  data2: number;
  summary: string;
  source: 'hardware' | 'virtual' | 'simulated';
}

export interface MidiDeviceInfo {
  id: string;
  name: string;
  manufacturer: string;
  state: string;
  isMpkMk4: boolean;
}

export interface StudioProject {
  version: 1;
  name: string;
  bpm: number;
  swing: number; // 50..75 (%)
  kitId: KitId;
  activePattern: PatternSlotId;
  patterns: Record<PatternSlotId, PatternData>;
  pads: PadConfig[];
  synth: SynthParams;
  fx: MasterFxParams;
  mixer: Record<TrackId, TrackMixerChannel>;
  midiMapping: MidiMappingConfig;
}
