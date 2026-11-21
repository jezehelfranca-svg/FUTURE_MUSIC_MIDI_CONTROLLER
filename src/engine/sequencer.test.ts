import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDefaultProject,
  createEmptyPattern,
  getSixteenthDurationMs,
  getStepSwingOffsetSeconds,
  isTrackAudible,
  parseProjectJson,
  recordNoteToPattern,
  toggleDrumStep,
  toggleMelodicNote,
} from './sequencer';

test('MPC swing timing returns zero on even steps and positive offset on odd steps', () => {
  assert.equal(getSixteenthDurationMs(120), 125);
  assert.equal(getStepSwingOffsetSeconds(0, 120, 66), 0);
  assert.equal(getStepSwingOffsetSeconds(1, 120, 50), 0);

  // At 120 BPM (0.125s per 16th) and 75% swing, odd steps shift by +0.0625s
  const offset75 = getStepSwingOffsetSeconds(1, 120, 75);
  assert.ok(Math.abs(offset75 - 0.0625) < 1e-6);
});

test('toggleDrumStep and toggleMelodicNote mutate immutably and toggle accurately', () => {
  const empty = createEmptyPattern('A', 'Test');
  const withKick = toggleDrumStep(empty, 0, 4, 115);
  assert.equal(empty.drumGrid[0][4], 0);
  assert.equal(withKick.drumGrid[0][4], 115);

  const removedKick = toggleDrumStep(withKick, 0, 4, 115);
  assert.equal(removedKick.drumGrid[0][4], 0);

  const withBass = toggleMelodicNote(empty, 'bass', 2, 36, 100, 2);
  assert.equal(withBass.melodicNotes.bass.length, 1);
  assert.equal(withBass.melodicNotes.bass[0].note, 36);

  const removedBass = toggleMelodicNote(withBass, 'bass', 2, 36);
  assert.equal(removedBass.melodicNotes.bass.length, 0);
});

test('recordNoteToPattern quantizes live pad hits and melodic notes into active pattern', () => {
  const empty = createEmptyPattern('B', 'Live Rec');
  const afterPad = recordNoteToPattern(empty, 'drums', 18, 1, 120); // 18 % 16 = 2
  assert.equal(afterPad.drumGrid[1][2], 120);

  const afterKey = recordNoteToPattern(afterPad, 'keys', 5, 60, 95);
  assert.equal(afterKey.melodicNotes.keys.length, 1);
  assert.equal(afterKey.melodicNotes.keys[0].step, 5);
  assert.equal(afterKey.melodicNotes.keys[0].note, 60);
});

test('isTrackAudible respects solo precedence and mute flags', () => {
  const proj = createDefaultProject();
  assert.equal(isTrackAudible('drums', proj.mixer), true);

  const mutedMixer = {
    ...proj.mixer,
    drums: { ...proj.mixer.drums, muted: true },
  };
  assert.equal(isTrackAudible('drums', mutedMixer), false);
  assert.equal(isTrackAudible('bass', mutedMixer), true);

  const soloMixer = {
    ...proj.mixer,
    bass: { ...proj.mixer.bass, solo: true },
  };
  assert.equal(isTrackAudible('bass', soloMixer), true);
  assert.equal(isTrackAudible('drums', soloMixer), false);
  assert.equal(isTrackAudible('keys', soloMixer), false);
});

test('parseProjectJson round-trips a StudioProject and rejects malformed payloads', () => {
  const original = createDefaultProject();
  assert.equal(original.fx.delayMix, 0);
  original.bpm = 128;
  const serialized = JSON.stringify(original);
  const restored = parseProjectJson(serialized);
  assert.ok(restored !== null);
  assert.equal(restored?.bpm, 128);
  assert.equal(restored?.pads.length, 16);

  assert.equal(parseProjectJson('not json'), null);
  assert.equal(parseProjectJson(JSON.stringify({ version: 99 })), null);
});
