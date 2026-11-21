import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Cable,
  Circle,
  Play,
  Repeat,
  Square,
  Timer,
} from 'lucide-react';
import { audioEngine } from './audio/AudioEngine';
import {
  MIDI_PROFILES,
  computeSixteenLevels,
  expandPlayedNote,
  isAkaiMpkDevice,
  midiNoteToName,
  parseMidiPacket,
  resolveKnobIndexForCC,
  resolvePadIndexForNote,
} from './engine/midi';
import {
  KIT_LABELS,
  STEP_COUNT,
  SYNTH_PRESETS,
  createDefaultProject,
  createDemoPattern,
  createEmptyPattern,
  createKitPads,
  getSixteenthDurationMs,
  getStepSwingOffsetSeconds,
  parseProjectJson,
  recordNoteToPattern,
  toggleDrumStep,
  toggleMelodicNote,
} from './engine/sequencer';
import {
  type PianoRollSnap,
  getDefaultOctaveForTrack,
  getNotesScheduledInStepWindow,
  getSnapUnit,
  insertStepInputNotes,
  roundStep,
} from './engine/pianoroll';
import type {
  ArpMode,
  ChordMode,
  KitId,
  KnobMode,
  MidiDeviceInfo,
  MidiLearnTarget,
  MidiLogEntry,
  MidiProfileId,
  NoteRepeatRate,
  PadBank,
  PadConfig,
  PatternSlotId,
  PianoRollNote,
  ScaleId,
  SixteenLevelsMode,
  StudioProject,
  SynthParams,
  SynthPresetId,
  TrackId,
  TrackMixerChannel,
  WorkspaceView,
} from './types/studio';
import { MpcWorkspace } from './components/MpcWorkspace';
import { SequencerWorkspace } from './components/SequencerWorkspace';
import { SynthFxWorkspace } from './components/SynthFxWorkspace';
import { MixerWorkspace } from './components/MixerWorkspace';
import { MidiMapWorkspace } from './components/MidiMapWorkspace';
import { MpkHardwareDeck } from './components/MpkHardwareDeck';
import { ExportModal } from './components/ExportModal';

const STORAGE_KEY = 'mpk_studio_iv_project_v1';

const PAD_KEY_MAP: Record<string, number> = {
  Digit1: 0,
  Digit2: 1,
  Digit3: 2,
  Digit4: 3,
  KeyQ: 4,
  KeyW: 5,
  KeyE: 6,
  KeyR: 7,
};

const PIANO_KEY_OFFSETS: Record<string, number> = {
  KeyZ: 0,
  KeyS: 1,
  KeyX: 2,
  KeyD: 3,
  KeyC: 4,
  KeyV: 5,
  KeyG: 6,
  KeyB: 7,
  KeyH: 8,
  KeyN: 9,
  KeyJ: 10,
  KeyM: 11,
  Comma: 12,
};

const NOTE_REPEAT_DIVISORS: Record<NoteRepeatRate, number> = {
  '1/4': 1,
  '1/8': 2,
  '1/16': 4,
  '1/32': 8,
};

function loadInitialProject(): StudioProject {
  if (typeof window !== 'undefined') {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = parseProjectJson(saved);
        if (parsed) return parsed;
      }
    } catch {
      // ignore storage errors
    }
  }
  return createDefaultProject();
}

export default function App() {
  const [project, setProject] = useState<StudioProject>(loadInitialProject);
  const [activeView, setActiveView] = useState<WorkspaceView>('mpc');
  const [activeTrack, setActiveTrack] = useState<TrackId>('drums');
  const [deckCollapsed, setDeckCollapsed] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);

  // Transport & Sequencer State
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [loopEnabled, setLoopEnabled] = useState(true);
  const [metronomeEnabled, setMetronomeEnabled] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [pianoRollSnap, setPianoRollSnap] = useState<PianoRollSnap>('1/16');
  const [stepInputEnabled, setStepInputEnabled] = useState(false);
  const [stepInputCursor, setStepInputCursor] = useState(0);

  // MPK MK4 Performance Controls
  const [padBank, setPadBank] = useState<PadBank>('A');
  const [selectedPadIndex, setSelectedPadIndex] = useState(0);
  const [knobMode, setKnobMode] = useState<KnobMode>('plugin');
  const [octave, setOctave] = useState(0);
  const [scale, setScale] = useState<ScaleId>('chromatic');
  const [chordMode, setChordMode] = useState<ChordMode>('off');
  const [arpMode, setArpMode] = useState<ArpMode>('off');
  const [fullLevel, setFullLevel] = useState(false);
  const [sixteenLevels, setSixteenLevels] = useState<SixteenLevelsMode>('off');
  const [noteRepeat, setNoteRepeat] = useState(false);
  const [noteRepeatRate, setNoteRepeatRate] = useState<NoteRepeatRate>('1/16');
  const [pitchBend, setPitchBend] = useState(0);
  const [modWheel, setModWheel] = useState(0);

  // Live visual feedback
  const [activePadFlashes, setActivePadFlashes] = useState<Record<number, number>>({});
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const [lastEventText, setLastEventText] = useState('Ready — Play Pads or Press Play');

  // Web MIDI State
  const [midiSupported, setMidiSupported] = useState(false);
  const [midiError, setMidiError] = useState<string | null>(null);
  const [midiDevices, setMidiDevices] = useState<MidiDeviceInfo[]>([]);
  const [selectedMidiDeviceId, setSelectedMidiDeviceId] = useState<string>('all');
  const [midiLearnTarget, setMidiLearnTarget] = useState<MidiLearnTarget | null>(null);
  const [midiLog, setMidiLog] = useState<MidiLogEntry[]>([]);

  // Mutable refs for real-time audio clock, note repeat, arpeggiator, and MIDI callbacks
  const projectRef = useRef(project);
  projectRef.current = project;

  const currentStepRef = useRef(currentStep);
  currentStepRef.current = currentStep;

  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  const isRecordingRef = useRef(isRecording);
  isRecordingRef.current = isRecording;

  const loopEnabledRef = useRef(loopEnabled);
  loopEnabledRef.current = loopEnabled;

  const metronomeRef = useRef(metronomeEnabled);
  metronomeRef.current = metronomeEnabled;

  const activeTrackRef = useRef(activeTrack);
  activeTrackRef.current = activeTrack;

  const activeViewRef = useRef(activeView);
  activeViewRef.current = activeView;

  const pianoRollSnapRef = useRef(pianoRollSnap);
  pianoRollSnapRef.current = pianoRollSnap;

  const stepInputEnabledRef = useRef(stepInputEnabled);
  stepInputEnabledRef.current = stepInputEnabled;

  const stepInputCursorRef = useRef(stepInputCursor);
  stepInputCursorRef.current = stepInputCursor;

  const handleActiveTrackChange = useCallback((nextTrack: TrackId) => {
    setActiveTrack(nextTrack);
    if (nextTrack !== 'drums') {
      setOctave(getDefaultOctaveForTrack(nextTrack));
    }
  }, []);

  const knobModeRef = useRef(knobMode);
  knobModeRef.current = knobMode;

  const selectedPadIndexRef = useRef(selectedPadIndex);
  selectedPadIndexRef.current = selectedPadIndex;

  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  const chordModeRef = useRef(chordMode);
  chordModeRef.current = chordMode;

  const fullLevelRef = useRef(fullLevel);
  fullLevelRef.current = fullLevel;

  const sixteenLevelsRef = useRef(sixteenLevels);
  sixteenLevelsRef.current = sixteenLevels;

  const midiLearnRef = useRef(midiLearnTarget);
  midiLearnRef.current = midiLearnTarget;

  const selectedMidiDeviceRef = useRef(selectedMidiDeviceId);
  selectedMidiDeviceRef.current = selectedMidiDeviceId;

  const tapTimesRef = useRef<number[]>([]);
  const noteRepeatTimersRef = useRef<Map<number, number>>(new Map());
  const arpHeldNotesRef = useRef<number[]>([]);
  const arpStepCounterRef = useRef(0);
  const arpModeRef = useRef(arpMode);
  arpModeRef.current = arpMode;
  const expandedKeyMapRef = useRef<Map<number, { track: TrackId; notes: number[] }>>(new Map());
  const pianoRollKeyTrackRef = useRef<Map<number, TrackId>>(new Map());
  const downKeysRef = useRef<
    Map<string, { kind: 'pad'; padIndex: number } | { kind: 'key'; midiNote: number }>
  >(new Map());
  const octaveRef = useRef(octave);
  octaveRef.current = octave;
  const padBankRef = useRef(padBank);
  padBankRef.current = padBank;

  const activePattern = project.patterns[project.activePattern];

  // Sync audio engine master FX & mixer on change
  useEffect(() => {
    audioEngine.updateMasterFx(project.fx);
  }, [project.fx]);

  useEffect(() => {
    audioEngine.updateMixer(project.mixer);
  }, [project.mixer]);

  const appendMidiLog = useCallback(
    (entry: Omit<MidiLogEntry, 'id' | 'timestamp'>) => {
      setMidiLog((prev) => [
        {
          ...entry,
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: Date.now(),
        },
        ...prev.slice(0, 39),
      ]);
    },
    []
  );

  const flashPad = useCallback((padIndex: number, velocity: number) => {
    setActivePadFlashes((prev) => ({ ...prev, [padIndex]: velocity }));
    window.setTimeout(() => {
      setActivePadFlashes((prev) => {
        if (!prev[padIndex]) return prev;
        const copy = { ...prev };
        delete copy[padIndex];
        return copy;
      });
    }, 130);
  }, []);

  // Trigger MPC Pad (supports Full Level, 16 Levels, Live Record, and Choke Groups)
  const triggerMpcPad = useCallback(
    (padIndex: number, rawVelocity: number, fromSequencer = false) => {
      const proj = projectRef.current;
      const lvlMode = fromSequencer ? 'off' : sixteenLevelsRef.current;
      const targetPadIdx = lvlMode !== 'off' ? selectedPadIndexRef.current : padIndex;
      const pad = proj.pads[targetPadIdx];
      if (!pad) return;

      const baseVel = !fromSequencer && fullLevelRef.current ? 127 : rawVelocity;
      const { velocity, pitchOffset } = computeSixteenLevels(padIndex, baseVel, lvlMode);

      audioEngine.ensureContext();
      audioEngine.updateMasterFx(proj.fx);
      audioEngine.updateMixer(proj.mixer);
      audioEngine.triggerPad(pad, velocity, undefined, pitchOffset);

      flashPad(padIndex, velocity);

      if (!fromSequencer) {
        if (lvlMode === 'off') {
          setSelectedPadIndex(padIndex);
        }
        setLastEventText(
          `PAD ${padIndex + 1} · ${pad.shortName} · Vel ${velocity}${
            pitchOffset !== 0 ? ` (${pitchOffset > 0 ? '+' : ''}${pitchOffset}st)` : ''
          }`
        );

        // Live Overdub Recording into active pattern!
        if (isPlayingRef.current && isRecordingRef.current) {
          setProject((prev) => {
            const pat = prev.patterns[prev.activePattern];
            const updated = recordNoteToPattern(
              pat,
              'drums',
              currentStepRef.current,
              targetPadIdx,
              velocity
            );
            return {
              ...prev,
              patterns: { ...prev.patterns, [prev.activePattern]: updated },
            };
          });
        }
      }
    },
    [flashPad]
  );

  const handlePadPress = useCallback(
    (padIndex: number, velocity: number) => {
      triggerMpcPad(padIndex, velocity, false);
      if (noteRepeat) {
        const existing = noteRepeatTimersRef.current.get(padIndex);
        if (existing) window.clearInterval(existing);
        const intervalMs = Math.max(
          45,
          60_000 / projectRef.current.bpm / NOTE_REPEAT_DIVISORS[noteRepeatRate]
        );
        const timerId = window.setInterval(() => {
          triggerMpcPad(padIndex, velocity, false);
        }, intervalMs);
        noteRepeatTimersRef.current.set(padIndex, timerId);
      }
    },
    [noteRepeat, noteRepeatRate, triggerMpcPad]
  );

  const handlePadRelease = useCallback((padIndex: number) => {
    const existing = noteRepeatTimersRef.current.get(padIndex);
    if (existing) {
      window.clearInterval(existing);
      noteRepeatTimersRef.current.delete(padIndex);
    }
  }, []);

  // Clean up note repeat timers on unmount
  useEffect(() => {
    return () => {
      noteRepeatTimersRef.current.forEach((id) => window.clearInterval(id));
      noteRepeatTimersRef.current.clear();
    };
  }, []);

  const getSynthForMelodicTrack = useCallback(
    (track: TrackId, proj: StudioProject): SynthParams => {
      if (track === 'lead' || track === 'drums') return proj.synth;
      return SYNTH_PRESETS[proj.mixer[track].synthPreset].params;
    },
    []
  );

  // Trigger Keybed Note On (with Scale Lock + Smart Chord + Arpeggiator + Live Overdub)
  const handleKeyDownNote = useCallback(
    (rawMidiNote: number, rawVelocity: number) => {
      const proj = projectRef.current;
      const targetTrack: TrackId = activeTrackRef.current === 'drums' ? 'keys' : activeTrackRef.current;
      const vel = fullLevelRef.current ? 127 : rawVelocity;
      const expanded = expandPlayedNote(rawMidiNote, scaleRef.current, chordModeRef.current, 0);
      expandedKeyMapRef.current.set(rawMidiNote, { track: targetTrack, notes: expanded });

      audioEngine.ensureContext();
      audioEngine.updateMasterFx(proj.fx);
      audioEngine.updateMixer(proj.mixer);

      if (arpModeRef.current !== 'off') {
        const nextSet = new Set([...arpHeldNotesRef.current, ...expanded]);
        arpHeldNotesRef.current = Array.from(nextSet).sort((a, b) => a - b);
        setActiveNotes(new Set(arpHeldNotesRef.current));
        setLastEventText(`ARP · ${midiNoteToName(expanded[0])} · ${arpModeRef.current.toUpperCase()}`);
        return;
      }

      const synthParams = getSynthForMelodicTrack(targetTrack, proj);
      expanded.forEach((n) => {
        audioEngine.noteOn(n, vel, targetTrack, synthParams);
      });

      setActiveNotes((prev) => {
        const next = new Set(prev);
        expanded.forEach((n) => next.add(n));
        return next;
      });
      setLastEventText(
        `KEY · ${expanded.map(midiNoteToName).join(' ')} · Vel ${vel}`
      );

      if (isPlayingRef.current && isRecordingRef.current) {
        setProject((prev) => {
          let pat = prev.patterns[prev.activePattern];
          expanded.forEach((n) => {
            pat = recordNoteToPattern(pat, targetTrack, currentStepRef.current, n, vel);
          });
          return {
            ...prev,
            patterns: { ...prev.patterns, [prev.activePattern]: pat },
          };
        });
      } else if (
        stepInputEnabledRef.current &&
        activeViewRef.current === 'sequencer' &&
        !isPlayingRef.current
      ) {
        const cursor = stepInputCursorRef.current;
        const snap = pianoRollSnapRef.current;
        const stepUnit = snap === 'off' ? 1 : getSnapUnit(snap);
        const rawNext = roundStep(cursor + stepUnit);
        const nextCursor = rawNext >= STEP_COUNT ? 0 : rawNext;
        stepInputCursorRef.current = nextCursor;
        setStepInputCursor(nextCursor);

        setProject((prev) => {
          const pat = prev.patterns[prev.activePattern];
          const { notes: updatedNotes } = insertStepInputNotes(
            pat.melodicNotes[targetTrack],
            targetTrack,
            expanded,
            cursor,
            snap,
            vel
          );
          return {
            ...prev,
            patterns: {
              ...prev.patterns,
              [prev.activePattern]: {
                ...pat,
                melodicNotes: {
                  ...pat.melodicNotes,
                  [targetTrack]: updatedNotes,
                },
              },
            },
          };
        });
        setLastEventText(
          `STEP IN · ${expanded.map(midiNoteToName).join(' ')} @ Step ${(cursor + 1).toFixed(cursor % 1 === 0 ? 0 : 1)}`
        );
      }
    },
    [getSynthForMelodicTrack]
  );

  const handleKeyUpNote = useCallback((rawMidiNote: number) => {
    const entry = expandedKeyMapRef.current.get(rawMidiNote);
    const targetTrack: TrackId =
      entry?.track ?? (activeTrackRef.current === 'drums' ? 'keys' : activeTrackRef.current);
    const expanded = entry?.notes ?? [rawMidiNote];
    expandedKeyMapRef.current.delete(rawMidiNote);

    if (arpModeRef.current !== 'off') {
      arpHeldNotesRef.current = arpHeldNotesRef.current.filter((n) => !expanded.includes(n));
      setActiveNotes(new Set(arpHeldNotesRef.current));
      return;
    }

    expanded.forEach((n) => {
      audioEngine.noteOff(n, targetTrack);
    });
    setActiveNotes((prev) => {
      let changed = false;
      const next = new Set(prev);
      expanded.forEach((n) => {
        if (next.delete(n)) changed = true;
      });
      return changed ? next : prev;
    });
  }, []);

  // Bidirectional Piano Roll vertical piano strip audition (highlights matching key on MPK MK4 keybed)
  const handlePianoRollKeyDown = useCallback(
    (midiNote: number) => {
      const proj = projectRef.current;
      const targetTrack: TrackId = activeTrackRef.current === 'drums' ? 'keys' : activeTrackRef.current;
      pianoRollKeyTrackRef.current.set(midiNote, targetTrack);
      audioEngine.ensureContext();
      audioEngine.updateMasterFx(proj.fx);
      audioEngine.updateMixer(proj.mixer);
      const synthParams = getSynthForMelodicTrack(targetTrack, proj);
      audioEngine.noteOn(midiNote, 102, targetTrack, synthParams);
      setActiveNotes((prev) => {
        const next = new Set(prev);
        next.add(midiNote);
        return next;
      });
      setLastEventText(`ROLL · ${midiNoteToName(midiNote)} (MIDI ${midiNote})`);
    },
    [getSynthForMelodicTrack]
  );

  const handlePianoRollKeyUp = useCallback((midiNote: number) => {
    const targetTrack: TrackId =
      pianoRollKeyTrackRef.current.get(midiNote) ??
      (activeTrackRef.current === 'drums' ? 'keys' : activeTrackRef.current);
    pianoRollKeyTrackRef.current.delete(midiNote);
    audioEngine.noteOff(midiNote, targetTrack);
    setActiveNotes((prev) => {
      if (!prev.has(midiNote)) return prev;
      const next = new Set(prev);
      next.delete(midiNote);
      return next;
    });
  }, []);

  // Release all held notes, pads, repeat timers, and visual key highlights (prevents any stuck state)
  const releaseAllHeldNotes = useCallback(() => {
    downKeysRef.current.clear();
    expandedKeyMapRef.current.clear();
    pianoRollKeyTrackRef.current.clear();
    arpHeldNotesRef.current = [];
    noteRepeatTimersRef.current.forEach((id) => window.clearInterval(id));
    noteRepeatTimersRef.current.clear();
    audioEngine.stopAllVoices();
    setActiveNotes((prev) => (prev.size === 0 ? prev : new Set()));
  }, []);

  // Arpeggiator clock (1/16th synced to BPM)
  useEffect(() => {
    if (arpMode === 'off') {
      arpHeldNotesRef.current = [];
      return;
    }
    const stepMs = getSixteenthDurationMs(project.bpm);
    const id = window.setInterval(() => {
      const held = arpHeldNotesRef.current;
      if (held.length === 0) return;

      let chosenNote = held[0];
      const idx = arpStepCounterRef.current;
      if (arpMode === 'up') {
        chosenNote = held[idx % held.length];
      } else if (arpMode === 'down') {
        chosenNote = held[held.length - 1 - (idx % held.length)];
      } else if (arpMode === 'up-down') {
        const cycle = held.length > 1 ? held.length * 2 - 2 : 1;
        const pos = idx % cycle;
        chosenNote = pos < held.length ? held[pos] : held[cycle - pos];
      } else {
        chosenNote = held[Math.floor(Math.random() * held.length)];
      }
      arpStepCounterRef.current += 1;

      const proj = projectRef.current;
      const track: TrackId = activeTrackRef.current === 'drums' ? 'lead' : activeTrackRef.current;
      const synthParams = getSynthForMelodicTrack(track, proj);
      const ctx = audioEngine.ensureContext();
      if (ctx) {
        audioEngine.playScheduledSynthNote(
          chosenNote,
          104,
          track,
          synthParams,
          ctx.currentTime + 0.005,
          (stepMs / 1000) * 0.8
        );
      }
    }, stepMs);

    return () => window.clearInterval(id);
  }, [arpMode, project.bpm, getSynthForMelodicTrack]);

  // Apply Encoder K1-K8 change (from UI RotaryKnob OR Akai MPK MK4 MIDI CC 24-31)
  const applyKnobChange = useCallback((knobIndex: number, normalized: number) => {
    const v = Math.max(0, Math.min(1, normalized));
    const mode = knobModeRef.current;

    if (mode === 'plugin') {
      if (knobIndex === 0) {
        const cutoff = Math.round(120 * Math.pow(16000 / 120, v));
        setProject((p) => ({ ...p, synth: { ...p.synth, cutoff } }));
        setLastEventText(`K1 · Cutoff · ${cutoff >= 1000 ? `${(cutoff / 1000).toFixed(1)}kHz` : `${cutoff}Hz`}`);
      } else if (knobIndex === 1) {
        const resonance = Number((0.5 + v * 17.5).toFixed(1));
        setProject((p) => ({ ...p, synth: { ...p.synth, resonance } }));
        setLastEventText(`K2 · Resonance · ${resonance}`);
      } else if (knobIndex === 2) {
        const attack = Number((0.005 + v * 1.195).toFixed(3));
        setProject((p) => ({ ...p, synth: { ...p.synth, attack } }));
        setLastEventText(`K3 · Attack · ${Math.round(attack * 1000)}ms`);
      } else if (knobIndex === 3) {
        const release = Number((0.05 + v * 2.45).toFixed(2));
        setProject((p) => ({ ...p, synth: { ...p.synth, release } }));
        setLastEventText(`K4 · Release · ${release}s`);
      } else if (knobIndex === 4) {
        const delayMix = Number((v * 0.8).toFixed(2));
        setProject((p) => ({ ...p, fx: { ...p.fx, delayMix } }));
        setLastEventText(`K5 · Delay Mix · ${Math.round(v * 100)}%`);
      } else if (knobIndex === 5) {
        const reverbMix = Number((v * 0.85).toFixed(2));
        setProject((p) => ({ ...p, fx: { ...p.fx, reverbMix } }));
        setLastEventText(`K6 · Reverb Mix · ${Math.round(v * 100)}%`);
      } else if (knobIndex === 6) {
        const drive = Number(v.toFixed(2));
        setProject((p) => ({ ...p, fx: { ...p.fx, drive } }));
        setLastEventText(`K7 · Tape Drive · ${Math.round(v * 100)}%`);
      } else if (knobIndex === 7) {
        const masterVolume = Number(v.toFixed(2));
        setProject((p) => ({ ...p, fx: { ...p.fx, masterVolume } }));
        setLastEventText(`K8 · Master Vol · ${Math.round(v * 100)}%`);
      }
      return;
    }

    if (mode === 'daw') {
      const trackMap: TrackId[] = ['drums', 'bass', 'keys', 'lead'];
      if (knobIndex < 4) {
        const trackId = trackMap[knobIndex];
        const volume = Number((v * 1.2).toFixed(2));
        setProject((p) => ({
          ...p,
          mixer: { ...p.mixer, [trackId]: { ...p.mixer[trackId], volume } },
        }));
        setLastEventText(`K${knobIndex + 1} · ${trackId.toUpperCase()} Vol · ${Math.round(volume * 100)}%`);
      } else if (knobIndex === 4) {
        const swing = Math.round(50 + v * 25);
        setProject((p) => ({ ...p, swing }));
        setLastEventText(`K5 · MPC Swing · ${swing}%`);
      } else if (knobIndex === 5) {
        const filterCutoff = Math.round(200 * Math.pow(20000 / 200, v));
        setProject((p) => ({ ...p, fx: { ...p.fx, filterCutoff } }));
        setLastEventText(`K6 · Master Filter · ${filterCutoff}Hz`);
      } else if (knobIndex === 6) {
        const delayFeedback = Number((v * 0.75).toFixed(2));
        setProject((p) => ({ ...p, fx: { ...p.fx, delayFeedback } }));
        setLastEventText(`K7 · Delay FB · ${Math.round(v * 100)}%`);
      } else if (knobIndex === 7) {
        const masterVolume = Number(v.toFixed(2));
        setProject((p) => ({ ...p, fx: { ...p.fx, masterVolume } }));
        setLastEventText(`K8 · Master Vol · ${Math.round(v * 100)}%`);
      }
      return;
    }

    // Pad mode: sculpt currently selected MPC pad
    const padIdx = selectedPadIndexRef.current;
    setProject((p) => {
      const nextPads = [...p.pads];
      const target = { ...nextPads[padIdx] };
      if (knobIndex === 0) target.tune = Math.round(-12 + v * 24);
      else if (knobIndex === 1) target.decay = Number((0.05 + v * 1.95).toFixed(2));
      else if (knobIndex === 2) target.cutoff = Math.round(200 * Math.pow(18000 / 200, v));
      else if (knobIndex === 3) target.gain = Number((v * 1.2).toFixed(2));
      else if (knobIndex === 4) target.pan = Number((v * 2 - 1).toFixed(2));
      else if (knobIndex === 5) target.reverbSend = Number(v.toFixed(2));
      else if (knobIndex === 6) target.delaySend = Number(v.toFixed(2));
      else if (knobIndex === 7) {
        return { ...p, fx: { ...p.fx, masterVolume: Number(v.toFixed(2)) } };
      }
      nextPads[padIdx] = target;
      return { ...p, pads: nextPads };
    });
    setLastEventText(`K${knobIndex + 1} · Pad ${padIdx + 1} Param · ${Math.round(v * 100)}%`);
  }, []);

  // Transport controls
  const startPlayback = useCallback(() => {
    audioEngine.ensureContext();
    audioEngine.updateMasterFx(projectRef.current.fx);
    audioEngine.updateMixer(projectRef.current.mixer);
    setIsPlaying(true);
  }, []);

  const stopPlayback = useCallback(() => {
    setIsPlaying(false);
    setIsRecording(false);
    setCurrentStep(0);
    releaseAllHeldNotes();
  }, [releaseAllHeldNotes]);

  const togglePlay = useCallback(() => {
    if (isPlayingRef.current) stopPlayback();
    else startPlayback();
  }, [startPlayback, stopPlayback]);

  const handleTapTempo = useCallback(() => {
    const now = performance.now();
    const history = tapTimesRef.current.filter((t) => now - t < 2200);
    history.push(now);
    tapTimesRef.current = history.slice(-5);
    if (history.length >= 2) {
      let sum = 0;
      for (let i = 1; i < history.length; i++) {
        sum += history[i] - history[i - 1];
      }
      const avgMs = sum / (history.length - 1);
      const nextBpm = Math.max(60, Math.min(200, Math.round(60_000 / avgMs)));
      setProject((p) => ({ ...p, bpm: nextBpm }));
      setLastEventText(`Tap Tempo · ${nextBpm} BPM`);
    }
  }, []);

  // Lookahead Web Audio DAW Sequencer Clock
  useEffect(() => {
    if (!isPlaying) return;
    const ctx = audioEngine.ensureContext();
    if (!ctx) return;

    let nextStepIndex = Math.max(0, Math.min(STEP_COUNT - 1, currentStepRef.current));
    let nextNoteTime = ctx.currentTime + 0.04;
    let finished = false;
    const scheduleAheadTime = 0.1;
    const lookaheadMs = 25;

    const scheduleStep = (step: number, time: number) => {
      const proj = projectRef.current;
      const pat = proj.patterns[proj.activePattern];
      const swingSec = getStepSwingOffsetSeconds(step, proj.bpm, proj.swing);
      const scheduledTime = time + swingSec;
      const stepSec = 60 / proj.bpm / 4;

      // Metronome click on quarter notes
      if (metronomeRef.current && step % 4 === 0) {
        audioEngine.playMetronomeClick(step === 0, scheduledTime);
      }

      // Schedule MPC Drum pads
      for (let padIdx = 0; padIdx < 16; padIdx++) {
        const vel = pat.drumGrid[padIdx][step];
        if (vel > 0) {
          audioEngine.triggerPad(proj.pads[padIdx], vel, scheduledTime, 0);
          const delayMs = Math.max(0, (scheduledTime - ctx.currentTime) * 1000);
          window.setTimeout(() => {
            if (isPlayingRef.current) flashPad(padIdx, vel);
          }, delayMs);
        }
      }

      // Schedule melodic DAW tracks (Bass, Keys, Lead) with sub-step micro-timing support
      (['bass', 'keys', 'lead'] as const).forEach((track) => {
        const synthParams =
          track === 'lead'
            ? proj.synth
            : SYNTH_PRESETS[proj.mixer[track].synthPreset].params;
        const dueNotes = getNotesScheduledInStepWindow(pat.melodicNotes[track], step);
        dueNotes.forEach(({ note: n, subStepOffset }) => {
          // Integer-step notes inherit live transport swing; micro-timed / swing-quantized notes use exact sub-step offset
          const noteTime =
            subStepOffset > 0.001
              ? time + subStepOffset * stepSec
              : scheduledTime;
          audioEngine.playScheduledSynthNote(
            n.note,
            n.velocity,
            track,
            synthParams,
            noteTime,
            Math.max(0.06, n.length * stepSec * 0.92)
          );
        });
      });

      // Visual playhead update synced to audio clock
      const uiDelay = Math.max(0, (scheduledTime - ctx.currentTime) * 1000);
      window.setTimeout(() => {
        if (isPlayingRef.current) {
          setCurrentStep(step);
        }
      }, uiDelay);
    };

    const timerId = window.setInterval(() => {
      if (finished) return;
      if (ctx.state === 'suspended') {
        void ctx.resume().catch(() => {});
        nextNoteTime = ctx.currentTime + 0.04;
        return;
      }
      // Recover cleanly if tab was backgrounded or clock jumped ahead
      if (ctx.currentTime - nextNoteTime > 0.35) {
        nextNoteTime = ctx.currentTime + 0.04;
      }

      while (nextNoteTime < ctx.currentTime + scheduleAheadTime) {
        scheduleStep(nextStepIndex, nextNoteTime);
        const stepSec = 60 / projectRef.current.bpm / 4;
        nextNoteTime += stepSec;
        nextStepIndex += 1;
        if (nextStepIndex >= STEP_COUNT) {
          if (loopEnabledRef.current) {
            nextStepIndex = 0;
          } else {
            finished = true;
            window.setTimeout(() => stopPlayback(), 80);
            break;
          }
        }
      }
    }, lookaheadMs);

    return () => window.clearInterval(timerId);
  }, [isPlaying, flashPad, stopPlayback]);

  // Unified Incoming MIDI Packet Router (Hardware Web MIDI + Simulator)
  const handleIncomingMidiBytes = useCallback(
    (bytes: ArrayLike<number>, source: 'hardware' | 'simulated' = 'hardware') => {
      const msg = parseMidiPacket(bytes);
      const proj = projectRef.current;
      const map = proj.midiMapping;

      if (msg.kind === 'mmc') {
        appendMidiLog({
          channel: 1,
          type: 'Transport',
          data1: 0,
          data2: 0,
          summary: `MMC ${msg.action.toUpperCase()}`,
          source,
        });
        if (msg.action === 'play') startPlayback();
        else if (msg.action === 'stop') stopPlayback();
        else if (msg.action === 'record') {
          setIsRecording((r) => !r);
          if (!isPlayingRef.current) startPlayback();
        }
        return;
      }

      if (msg.kind === 'unknown') return;

      // Filter by configured MIDI input channel (0 = Omni)
      if (map.inputChannel !== 0 && msg.channel !== map.inputChannel) {
        return;
      }

      if (msg.kind === 'cc') {
        // Check MIDI Learn capture first!
        const learn = midiLearnRef.current;
        if (learn) {
          if (learn.type === 'knob') {
            setProject((p) => {
              const nextKnobCCs = [...p.midiMapping.knobCCs];
              nextKnobCCs[learn.index] = msg.cc;
              return { ...p, midiMapping: { ...p.midiMapping, knobCCs: nextKnobCCs } };
            });
            setMidiLearnTarget(null);
            setLastEventText(`Learned Knob K${learn.index + 1} -> CC ${msg.cc}`);
            appendMidiLog({
              channel: msg.channel,
              type: 'CC',
              data1: msg.cc,
              data2: msg.value,
              summary: `Mapped K${learn.index + 1} = CC ${msg.cc}`,
              source,
            });
            return;
          }
          if (learn.type === 'transport') {
            setProject((p) => ({
              ...p,
              midiMapping: {
                ...p.midiMapping,
                transportCCs: { ...p.midiMapping.transportCCs, [learn.action]: msg.cc },
              },
            }));
            setMidiLearnTarget(null);
            setLastEventText(`Learned ${learn.action.toUpperCase()} -> CC ${msg.cc}`);
            appendMidiLog({
              channel: msg.channel,
              type: 'CC',
              data1: msg.cc,
              data2: msg.value,
              summary: `Mapped ${learn.action.toUpperCase()} = CC ${msg.cc}`,
              source,
            });
            return;
          }
        }

        // Standard Mod Wheel (CC 1) & Sustain Pedal (CC 64)
        if (msg.cc === 1) {
          const norm = msg.value / 127;
          setModWheel(norm);
          audioEngine.setModWheel(norm);
          setLastEventText(`Mod Wheel (CC 1) · ${Math.round(norm * 100)}%`);
        } else if (msg.cc === 64) {
          const down = msg.value >= 64;
          audioEngine.setSustainPedal(down);
          setLastEventText(`Sustain Pedal · ${down ? 'ON' : 'OFF'}`);
        } else if (msg.cc === map.transportCCs.play && msg.value > 0) {
          togglePlay();
        } else if (msg.cc === map.transportCCs.stop && msg.value > 0) {
          stopPlayback();
        } else if (msg.cc === map.transportCCs.record && msg.value > 0) {
          setIsRecording((r) => !r);
        } else if (msg.cc === map.transportCCs.loop && msg.value > 0) {
          setLoopEnabled((l) => !l);
        } else {
          const knobIdx = resolveKnobIndexForCC(msg.cc, map);
          if (knobIdx !== -1) {
            applyKnobChange(knobIdx, msg.value / 127);
          }
        }

        appendMidiLog({
          channel: msg.channel,
          type: 'CC',
          data1: msg.cc,
          data2: msg.value,
          summary: `CC ${msg.cc} = ${msg.value}`,
          source,
        });
        return;
      }

      if (msg.kind === 'pitchbend') {
        setPitchBend(msg.normalized);
        audioEngine.setPitchBend(msg.normalized);
        appendMidiLog({
          channel: msg.channel,
          type: 'Pitch Bend',
          data1: msg.value,
          data2: 0,
          summary: `Pitch ${(msg.normalized * 100).toFixed(0)}%`,
          source,
        });
        return;
      }

      if (msg.kind === 'noteon') {
        const padIdx = resolvePadIndexForNote(msg.note, map);
        // Route Akai MPK drum channel (Ch 10) or mapped pad notes (36-51) when in MPC view / drums track
        if (padIdx !== -1 && (msg.channel === 10 || activeTrackRef.current === 'drums')) {
          triggerMpcPad(padIdx, msg.velocity, false);
        } else {
          handleKeyDownNote(msg.note, msg.velocity);
        }
        appendMidiLog({
          channel: msg.channel,
          type: 'Note On',
          data1: msg.note,
          data2: msg.velocity,
          summary: `${midiNoteToName(msg.note)} (Vel ${msg.velocity})`,
          source,
        });
        return;
      }

      if (msg.kind === 'noteoff') {
        const padIdx = resolvePadIndexForNote(msg.note, map);
        if (padIdx !== -1 && (msg.channel === 10 || activeTrackRef.current === 'drums')) {
          handlePadRelease(padIdx);
        } else {
          handleKeyUpNote(msg.note);
        }
      }
    },
    [
      appendMidiLog,
      applyKnobChange,
      handleKeyDownNote,
      handleKeyUpNote,
      handlePadRelease,
      startPlayback,
      stopPlayback,
      togglePlay,
      triggerMpcPad,
    ]
  );

  // Initialize Real Web MIDI API Access for Akai MPK MK4
  const connectWebMidi = useCallback(async () => {
    if (typeof navigator === 'undefined' || typeof navigator.requestMIDIAccess !== 'function') {
      setMidiSupported(false);
      setMidiError(null);
      return;
    }
    setMidiSupported(true);
    try {
      const access = await navigator.requestMIDIAccess({ sysex: false });
      const bindInputs = () => {
        const found: MidiDeviceInfo[] = [];
        access.inputs.forEach((input) => {
          found.push({
            id: input.id,
            name: input.name || 'USB MIDI Input',
            manufacturer: input.manufacturer || '',
            state: input.state,
            isMpkMk4: isAkaiMpkDevice(input.name || '', input.manufacturer || ''),
          });
          input.onmidimessage = (event) => {
            const targetId = selectedMidiDeviceRef.current;
            if (targetId !== 'all' && input.id !== targetId) return;
            if (event.data) {
              handleIncomingMidiBytes(event.data, 'hardware');
            }
          };
        });
        setMidiDevices(found);
        setMidiError(null);
      };

      bindInputs();
      access.onstatechange = () => bindInputs();
    } catch {
      setMidiError('Web MIDI permission was denied or unavailable in this browser frame.');
    }
  }, [handleIncomingMidiBytes]);

  useEffect(() => {
    void connectWebMidi();
  }, [connectWebMidi]);

  // Computer Keyboard Shortcuts for Pads (1-4, Q-R), Piano (Z-M), Transport (Space), and All-Notes-Off (Escape)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.code === 'Escape') {
        releaseAllHeldNotes();
        return;
      }

      if (e.repeat || downKeysRef.current.has(e.code)) return;

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
        return;
      }

      if (e.code in PAD_KEY_MAP) {
        e.preventDefault();
        const bankOffset = padBankRef.current === 'B' ? 8 : 0;
        const padIndex = bankOffset + PAD_KEY_MAP[e.code];
        downKeysRef.current.set(e.code, { kind: 'pad', padIndex });
        handlePadPress(padIndex, 116);
        return;
      }

      if (e.code in PIANO_KEY_OFFSETS) {
        e.preventDefault();
        const midiNote = 48 + octaveRef.current * 12 + PIANO_KEY_OFFSETS[e.code];
        downKeysRef.current.set(e.code, { kind: 'key', midiNote });
        handleKeyDownNote(midiNote, 108);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const held = downKeysRef.current.get(e.code);
      if (!held) return;
      downKeysRef.current.delete(e.code);
      if (held.kind === 'pad') {
        handlePadRelease(held.padIndex);
      } else {
        handleKeyUpNote(held.midiNote);
      }
    };

    const onBlur = () => {
      releaseAllHeldNotes();
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        releaseAllHeldNotes();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      releaseAllHeldNotes();
    };
  }, [togglePlay, handlePadPress, handlePadRelease, handleKeyDownNote, handleKeyUpNote, releaseAllHeldNotes]);

  // Project Mutations
  const handleSelectKit = (kitId: KitId) => {
    setProject((p) => ({ ...p, kitId, pads: createKitPads(kitId) }));
    setLastEventText(`Kit Loaded · ${KIT_LABELS[kitId].name}`);
  };

  const handleUpdatePad = (padIndex: number, patch: Partial<PadConfig>) => {
    setProject((p) => ({
      ...p,
      pads: p.pads.map((pad, i) => (i === padIndex ? { ...pad, ...patch } : pad)),
    }));
  };

  const handleUploadPadSample = async (padIndex: number, file: File) => {
    const ok = await audioEngine.loadCustomSample(padIndex, file);
    if (ok) {
      handleUpdatePad(padIndex, { customSampleName: file.name });
      setLastEventText(`Loaded Sample · ${file.name}`);
    }
  };

  const handleClearPadSample = (padIndex: number) => {
    audioEngine.clearCustomSample(padIndex);
    handleUpdatePad(padIndex, { customSampleName: undefined });
  };

  const handleToggleDrumStep = (padIndex: number, stepIndex: number) => {
    setProject((p) => {
      const current = p.patterns[p.activePattern];
      const next = toggleDrumStep(current, padIndex, stepIndex, 114);
      return { ...p, patterns: { ...p.patterns, [p.activePattern]: next } };
    });
  };

  const handleToggleMelodicNote = (
    track: 'bass' | 'keys' | 'lead',
    step: number,
    note: number,
    length: number
  ) => {
    setProject((p) => {
      const current = p.patterns[p.activePattern];
      const next = toggleMelodicNote(current, track, step, note, 102, length);
      return { ...p, patterns: { ...p.patterns, [p.activePattern]: next } };
    });
  };

  const handleUpdateMelodicNotes = (
    track: 'bass' | 'keys' | 'lead',
    nextNotes: PianoRollNote[]
  ) => {
    setProject((p) => {
      const current = p.patterns[p.activePattern];
      const nextPattern = {
        ...current,
        melodicNotes: {
          ...current.melodicNotes,
          [track]: nextNotes,
        },
      };
      return { ...p, patterns: { ...p.patterns, [p.activePattern]: nextPattern } };
    });
  };

  const handleClearPattern = () => {
    setProject((p) => ({
      ...p,
      patterns: {
        ...p.patterns,
        [p.activePattern]: createEmptyPattern(p.activePattern, `Pattern ${p.activePattern}`),
      },
    }));
    setLastEventText(`Cleared Pattern ${project.activePattern}`);
  };

  const handleDuplicatePatternToNext = () => {
    const order: PatternSlotId[] = ['A', 'B', 'C', 'D'];
    const nextSlot = order[(order.indexOf(project.activePattern) + 1) % order.length];
    const source = project.patterns[project.activePattern];
    const cloned = {
      ...source,
      id: nextSlot,
      name: `${source.name} (Copy)`,
      drumGrid: source.drumGrid.map((r) => [...r]),
      melodicNotes: {
        bass: source.melodicNotes.bass.map((n) => ({ ...n })),
        keys: source.melodicNotes.keys.map((n) => ({ ...n })),
        lead: source.melodicNotes.lead.map((n) => ({ ...n })),
      },
    };
    setProject((p) => ({
      ...p,
      activePattern: nextSlot,
      patterns: { ...p.patterns, [nextSlot]: cloned },
    }));
    setLastEventText(`Duplicated to Pattern ${nextSlot}`);
  };

  const handleLoadGroovePreset = (style: KitId) => {
    setProject((p) => ({
      ...p,
      kitId: style,
      pads: createKitPads(style),
      bpm: style === 'trap-808' ? 140 : style === 'house-909' ? 124 : style === 'lofi-soul' ? 84 : 94,
      patterns: {
        ...p.patterns,
        [p.activePattern]: createDemoPattern(p.activePattern, style),
      },
    }));
    setLastEventText(`Loaded Groove · ${KIT_LABELS[style].name}`);
  };

  const handleSelectSynthPreset = (presetId: SynthPresetId) => {
    setProject((p) => ({ ...p, synth: { ...SYNTH_PRESETS[presetId].params } }));
    setLastEventText(`Synth · ${SYNTH_PRESETS[presetId].name}`);
  };

  const handleUpdateChannel = (trackId: TrackId, patch: Partial<TrackMixerChannel>) => {
    setProject((p) => ({
      ...p,
      mixer: { ...p.mixer, [trackId]: { ...p.mixer[trackId], ...patch } },
    }));
  };

  const handleSelectMidiProfile = (profileId: MidiProfileId) => {
    setProject((p) => ({ ...p, midiMapping: { ...MIDI_PROFILES[profileId] } }));
    setLastEventText(`MIDI Profile · ${profileId.toUpperCase()}`);
  };

  const handleSaveLocal = () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    setLastEventText(`Saved "${project.name}" locally`);
  };

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.mpkstudio.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJson = (raw: string): boolean => {
    const parsed = parseProjectJson(raw);
    if (!parsed) return false;
    setProject(parsed);
    setLastEventText(`Imported "${parsed.name}"`);
    return true;
  };

  const handleExportWav = async () => {
    const wavBlob = await audioEngine.renderPatternToWav(
      activePattern,
      project.pads,
      project.mixer,
      project.fx,
      project.bpm,
      project.swing,
      project.synth
    );
    const url = URL.createObjectURL(wavBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-pattern-${project.activePattern}.wav`;
    a.click();
    URL.revokeObjectURL(url);
    setLastEventText(`Exported 2-Bar WAV · Pattern ${project.activePattern}`);
  };

  const mpkDevice = midiDevices.find((d) => d.isMpkMk4) ?? midiDevices[0] ?? null;
  const barBeat = `1:${Math.floor(currentStep / 4) + 1}:${(currentStep % 4) + 1}`;

  const NAV_ITEMS: Array<{ id: WorkspaceView; label: string }> = [
    { id: 'mpc', label: 'MPC Pads' },
    { id: 'sequencer', label: 'Sequencer' },
    { id: 'synth', label: 'Synth & FX' },
    { id: 'mixer', label: 'Mixer' },
    { id: 'midi', label: 'MIDI Map' },
  ];

  return (
    <div
      data-playing={isPlaying ? 'true' : 'false'}
      className="h-screen w-full flex flex-col bg-[#0D0F13] text-[#F1F3F5] overflow-hidden"
    >
      {/* ZONE 1-2-3 TOP BAR CONTRACT: Single-line Wordmark — 5 Nav Tabs — 1 Primary Action */}
      <header className="h-[52px] px-5 bg-[#12151C] border-b border-[#232936] flex items-center justify-between gap-8 shrink-0">
        <span className="text-base font-extrabold tracking-tight text-white whitespace-nowrap shrink-0">
          MPK Studio <span className="text-[#E11D48]">IV</span>
        </span>

        <nav
          aria-label="DAW Workspace Navigation"
          className="flex items-center gap-5 sm:gap-7 overflow-x-auto"
        >
          {NAV_ITEMS.map((item) => {
            const active = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => setActiveView(item.id)}
                className={`relative py-3.5 text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                  active ? 'text-white' : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                {item.label}
                {active && (
                  <span
                    className="absolute inset-x-0 bottom-0 h-0.5 bg-[#E11D48]"
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </nav>

        <button
          type="button"
          onClick={() => setExportModalOpen(true)}
          className="px-4 py-2 text-xs font-semibold bg-[#E11D48] hover:bg-[#BE123C] text-white rounded-md transition-colors whitespace-nowrap shrink-0"
        >
          Save &amp; Export
        </button>
      </header>

      {/* DAW TRANSPORT RIBBON */}
      <div
        role="region"
        aria-label="DAW Transport Controls"
        className="px-5 py-2 bg-[#101319] border-b border-[#202632] flex flex-wrap items-center justify-between gap-3 shrink-0"
      >
        {/* Left: Transport Buttons (Play, Stop, Rec, Loop, Metro) */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label={isPlaying ? 'Pause Playback' : 'Play Sequence'}
            aria-pressed={isPlaying}
            onClick={togglePlay}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded border transition-colors whitespace-nowrap ${
              isPlaying
                ? 'bg-teal-500 border-teal-400 text-slate-950'
                : 'bg-[#191E28] hover:bg-[#222937] border-[#2C3442] text-slate-100'
            }`}
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            {isPlaying ? 'Playing' : 'Play'}
          </button>

          <button
            type="button"
            aria-label="Stop Sequence"
            onClick={stopPlayback}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded bg-[#191E28] hover:bg-[#222937] border border-[#2C3442] text-slate-200 whitespace-nowrap"
          >
            <Square className="w-3.5 h-3.5 fill-current" /> Stop
          </button>

          <button
            type="button"
            aria-label="Toggle Live Overdub Record"
            aria-pressed={isRecording}
            onClick={() => {
              const next = !isRecording;
              setIsRecording(next);
              if (next && !isPlaying) startPlayback();
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded border transition-colors whitespace-nowrap ${
              isRecording
                ? 'bg-[#E11D48] border-[#FB7185] text-white'
                : 'bg-[#191E28] hover:bg-[#222937] border-[#2C3442] text-slate-200'
            }`}
          >
            <Circle className="w-3 h-3 fill-current" /> Rec
          </button>

          <button
            type="button"
            aria-label="Toggle Loop"
            aria-pressed={loopEnabled}
            onClick={() => setLoopEnabled((l) => !l)}
            className={`p-1.5 rounded border transition-colors ${
              loopEnabled
                ? 'bg-[#222937] border-slate-500 text-white'
                : 'bg-[#151921] border-[#262D3B] text-slate-500 hover:text-slate-300'
            }`}
            title="Loop Pattern"
          >
            <Repeat className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            aria-label="Toggle Metronome"
            aria-pressed={metronomeEnabled}
            onClick={() => setMetronomeEnabled((m) => !m)}
            className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded border transition-colors whitespace-nowrap ${
              metronomeEnabled
                ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                : 'bg-[#151921] border-[#262D3B] text-slate-400 hover:text-slate-200'
            }`}
          >
            <Timer className="w-3.5 h-3.5" /> Click
          </button>
        </div>

        {/* Center: Clock Position, BPM, Tap Tempo, Swing */}
        <div className="flex flex-wrap items-center gap-4 text-xs font-mono tabular-nums">
          <div
            data-testid="transport-clock"
            className="px-2.5 py-1 bg-[#090B0F] border border-[#252C38] rounded text-slate-100 font-semibold min-w-[66px] text-center"
          >
            {barBeat}
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="bpm-input" className="text-slate-400">
              BPM
            </label>
            <input
              id="bpm-input"
              type="number"
              min={60}
              max={200}
              value={project.bpm}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isNaN(n)) {
                  setProject((p) => ({ ...p, bpm: Math.max(60, Math.min(200, n)) }));
                }
              }}
              className="w-14 bg-[#090B0F] border border-[#28303E] rounded px-2 py-1 text-slate-100 text-center focus:outline-none focus:border-[#E11D48]"
            />
            <button
              type="button"
              onClick={handleTapTempo}
              className="px-2 py-1 bg-[#181D27] hover:bg-[#232A38] border border-[#2C3442] rounded text-[11px] font-sans font-medium text-slate-200 whitespace-nowrap"
            >
              Tap
            </button>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="swing-range" className="text-slate-400">
              Swing
            </label>
            <input
              id="swing-range"
              type="range"
              min={50}
              max={75}
              step={1}
              value={project.swing}
              onChange={(e) => setProject((p) => ({ ...p, swing: Number(e.target.value) }))}
              className="w-20 studio-range"
            />
            <span className="text-slate-200 w-8">{project.swing}%</span>
          </div>
        </div>

        {/* Right: Quick Pattern Switcher + Hardware MIDI Link */}
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center bg-[#0C0F14] border border-[#252C38] rounded p-0.5">
            {(['A', 'B', 'C', 'D'] as PatternSlotId[]).map((slot) => (
              <button
                key={slot}
                type="button"
                aria-label={`Select Pattern ${slot}`}
                onClick={() => setProject((p) => ({ ...p, activePattern: slot }))}
                className={`px-2 py-0.5 text-[11px] font-mono font-semibold rounded-xs transition-colors ${
                  project.activePattern === slot
                    ? 'bg-[#E11D48] text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {slot}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setActiveView('midi')}
            className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white transition-colors whitespace-nowrap"
          >
            <Cable
              className={`w-3.5 h-3.5 ${mpkDevice ? 'text-teal-400' : 'text-slate-400'}`}
              aria-hidden="true"
            />
            <span>{mpkDevice ? mpkDevice.name : 'MPK MK4 MIDI'}</span>
          </button>
        </div>
      </div>

      {/* MAIN WORKSPACE STAGE */}
      <main className="flex-1 min-h-0 overflow-hidden bg-[#0E1116]">
        {activeView === 'mpc' && (
          <MpcWorkspace
            kitId={project.kitId}
            onSelectKit={handleSelectKit}
            pads={project.pads}
            padBank={padBank}
            onPadBankChange={setPadBank}
            selectedPadIndex={selectedPadIndex}
            onSelectPad={setSelectedPadIndex}
            activePadFlashes={activePadFlashes}
            fullLevel={fullLevel}
            sixteenLevels={sixteenLevels}
            noteRepeat={noteRepeat}
            onPadPress={handlePadPress}
            onPadRelease={handlePadRelease}
            onUpdatePad={handleUpdatePad}
            onUploadPadSample={handleUploadPadSample}
            onClearPadSample={handleClearPadSample}
            pattern={activePattern}
            currentStep={currentStep}
            isPlaying={isPlaying}
            onToggleDrumStep={handleToggleDrumStep}
          />
        )}

        {activeView === 'sequencer' && (
          <SequencerWorkspace
            activeTrack={activeTrack}
            onActiveTrackChange={handleActiveTrackChange}
            activePatternId={project.activePattern}
            patterns={project.patterns}
            onSelectPattern={(slot) => setProject((p) => ({ ...p, activePattern: slot }))}
            onClearPattern={handleClearPattern}
            onDuplicatePatternToNext={handleDuplicatePatternToNext}
            onLoadGroovePreset={handleLoadGroovePreset}
            pads={project.pads}
            padBank={padBank}
            onPadBankChange={setPadBank}
            currentStep={currentStep}
            isPlaying={isPlaying}
            swing={project.swing}
            octave={octave}
            onOctaveChange={setOctave}
            activeNotes={activeNotes}
            pianoRollSnap={pianoRollSnap}
            onPianoRollSnapChange={setPianoRollSnap}
            stepInputEnabled={stepInputEnabled}
            onToggleStepInput={() => setStepInputEnabled((v) => !v)}
            stepInputCursor={stepInputCursor}
            onStepInputCursorChange={setStepInputCursor}
            onToggleDrumStep={handleToggleDrumStep}
            onToggleMelodicNote={handleToggleMelodicNote}
            onUpdateMelodicNotes={handleUpdateMelodicNotes}
            onAuditionPad={(idx) => triggerMpcPad(idx, 114, false)}
            onAuditionSynthNote={(track, note, vel = 102) => {
              const ctx = audioEngine.ensureContext();
              if (!ctx) return;
              const synth = getSynthForMelodicTrack(track, project);
              audioEngine.playScheduledSynthNote(note, vel, track, synth, ctx.currentTime + 0.005, 0.25);
            }}
            onPianoKeyDown={handlePianoRollKeyDown}
            onPianoKeyUp={handlePianoRollKeyUp}
          />
        )}

        {activeView === 'synth' && (
          <SynthFxWorkspace
            synth={project.synth}
            fx={project.fx}
            onSelectPreset={handleSelectSynthPreset}
            onUpdateSynth={(patch) => setProject((p) => ({ ...p, synth: { ...p.synth, ...patch } }))}
            onUpdateFx={(patch) => setProject((p) => ({ ...p, fx: { ...p.fx, ...patch } }))}
            onAuditionChord={() => {
              const ctx = audioEngine.ensureContext();
              if (!ctx) return;
              [60, 63, 67, 70].forEach((n) => {
                audioEngine.playScheduledSynthNote(n, 98, 'lead', project.synth, ctx.currentTime + 0.01, 0.65);
              });
              setLastEventText(`Audition · Cm7 (${SYNTH_PRESETS[project.synth.presetId].name})`);
            }}
          />
        )}

        {activeView === 'mixer' && (
          <MixerWorkspace
            mixer={project.mixer}
            fx={project.fx}
            onUpdateChannel={handleUpdateChannel}
            onUpdateMasterVolume={(masterVolume) =>
              setProject((p) => ({ ...p, fx: { ...p.fx, masterVolume } }))
            }
          />
        )}

        {activeView === 'midi' && (
          <MidiMapWorkspace
            midiSupported={midiSupported}
            midiError={midiError}
            devices={midiDevices}
            selectedDeviceId={selectedMidiDeviceId}
            onSelectDevice={setSelectedMidiDeviceId}
            onRefreshMidi={() => void connectWebMidi()}
            mapping={project.midiMapping}
            onSelectProfile={handleSelectMidiProfile}
            onChangeChannel={(inputChannel) =>
              setProject((p) => ({ ...p, midiMapping: { ...p.midiMapping, inputChannel } }))
            }
            midiLearnTarget={midiLearnTarget}
            onSetMidiLearnTarget={setMidiLearnTarget}
            onSimulateMidiPacket={(bytes, label) => {
              setLastEventText(`Sim · ${label}`);
              handleIncomingMidiBytes(bytes, 'simulated');
            }}
            midiLog={midiLog}
            onClearLog={() => setMidiLog([])}
          />
        )}
      </main>

      {/* DOCKED INTERACTIVE AKAI MPK MINI MK4 HARDWARE DECK */}
      <MpkHardwareDeck
        collapsed={deckCollapsed}
        onToggleCollapsed={() => setDeckCollapsed((c) => !c)}
        bpm={project.bpm}
        swing={project.swing}
        isPlaying={isPlaying}
        isRecording={isRecording}
        currentStep={currentStep}
        kitName={KIT_LABELS[project.kitId].name}
        synthName={SYNTH_PRESETS[project.synth.presetId].name}
        knobMode={knobMode}
        onKnobModeChange={setKnobMode}
        padBank={padBank}
        onPadBankChange={setPadBank}
        octave={octave}
        onOctaveChange={setOctave}
        scale={scale}
        onScaleChange={setScale}
        chordMode={chordMode}
        onChordModeChange={setChordMode}
        arpMode={arpMode}
        onArpModeChange={setArpMode}
        fullLevel={fullLevel}
        onToggleFullLevel={() => setFullLevel((f) => !f)}
        sixteenLevels={sixteenLevels}
        onCycleSixteenLevels={() =>
          setSixteenLevels((m) =>
            m === 'off' ? 'velocity' : m === 'velocity' ? 'pitch' : 'off'
          )
        }
        noteRepeat={noteRepeat}
        onToggleNoteRepeat={() => setNoteRepeat((n) => !n)}
        noteRepeatRate={noteRepeatRate}
        onNoteRepeatRateChange={setNoteRepeatRate}
        pitchBend={pitchBend}
        onPitchBendChange={(val) => {
          setPitchBend(val);
          audioEngine.setPitchBend(val);
        }}
        modWheel={modWheel}
        onModWheelChange={(val) => {
          setModWheel(val);
          audioEngine.setModWheel(val);
        }}
        activeNotes={activeNotes}
        onKeyDownNote={handleKeyDownNote}
        onKeyUpNote={handleKeyUpNote}
        synth={project.synth}
        fx={project.fx}
        mixer={project.mixer}
        selectedPad={project.pads[selectedPadIndex] ?? project.pads[0]}
        midiMapping={project.midiMapping}
        midiLearnTarget={midiLearnTarget}
        onKnobValueChange={applyKnobChange}
        lastEventText={lastEventText}
        midiDeviceName={mpkDevice?.name ?? null}
        activeTrack={activeTrack}
        onActiveTrackChange={handleActiveTrackChange}
      />

      {exportModalOpen && (
        <ExportModal
          projectName={project.name}
          onRenameProject={(name) => setProject((p) => ({ ...p, name }))}
          onSaveLocal={handleSaveLocal}
          onExportJson={handleExportJson}
          onImportJson={handleImportJson}
          onExportWav={handleExportWav}
          onResetProject={() => {
            const fresh = createDefaultProject();
            setProject(fresh);
            setLastEventText('Reset to default MPC 3000 session');
          }}
          onClose={() => setExportModalOpen(false)}
        />
      )}
    </div>
  );
}
