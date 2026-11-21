import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MIDI_PROFILES,
  computeSixteenLevels,
  expandPlayedNote,
  isAkaiMpkDevice,
  midiNoteToFrequency,
  midiNoteToName,
  parseMidiPacket,
  resolveKnobIndexForCC,
  resolvePadIndexForNote,
  snapNoteToScale,
} from './midi';

test('parseMidiPacket decodes Note On, Velocity-0 Note Off, CC, Pitch Bend, and MMC SysEx', () => {
  const noteOn = parseMidiPacket([0x90, 60, 112]);
  assert.deepEqual(noteOn, { kind: 'noteon', channel: 1, note: 60, velocity: 112 });

  const velZeroOff = parseMidiPacket([0x99, 36, 0]);
  assert.deepEqual(velZeroOff, { kind: 'noteoff', channel: 10, note: 36, velocity: 0 });

  const cc24 = parseMidiPacket([0xb0, 24, 96]);
  assert.deepEqual(cc24, { kind: 'cc', channel: 1, cc: 24, value: 96 });

  const pbCenter = parseMidiPacket([0xe0, 0x00, 0x40]);
  assert.equal(pbCenter.kind, 'pitchbend');
  if (pbCenter.kind === 'pitchbend') {
    assert.equal(pbCenter.normalized, 0);
  }

  const mmcPlay = parseMidiPacket([0xf0, 0x7f, 0x7f, 0x06, 0x02, 0xf7]);
  assert.deepEqual(mmcPlay, { kind: 'mmc', action: 'play' });

  const mmcRec = parseMidiPacket([0xf0, 0x7f, 0x7f, 0x06, 0x06, 0xf7]);
  assert.deepEqual(mmcRec, { kind: 'mmc', action: 'record' });
});

test('Akai MPK MK4 device detection and CC 24-31 knob mapping', () => {
  assert.equal(isAkaiMpkDevice('MPK mini IV', 'AKAI Professional'), true);
  assert.equal(isAkaiMpkDevice('AKAI MPK Mini MK4 DAW Port', ''), true);
  assert.equal(isAkaiMpkDevice('Generic USB Keyboard', 'Acme'), false);

  const mk4 = MIDI_PROFILES['mpk-mk4'];
  assert.equal(resolveKnobIndexForCC(24, mk4), 0);
  assert.equal(resolveKnobIndexForCC(31, mk4), 7);
  // Dual compatibility fallback for MK3 encoders (CC 70-77)
  assert.equal(resolveKnobIndexForCC(70, mk4), 0);
  assert.equal(resolveKnobIndexForCC(77, mk4), 7);
  assert.equal(resolveKnobIndexForCC(10, mk4), -1);

  assert.equal(resolvePadIndexForNote(36, mk4), 0);
  assert.equal(resolvePadIndexForNote(51, mk4), 15);
  assert.equal(resolvePadIndexForNote(60, mk4), -1);
});

test('Scale Lock and Smart Chord expansion produce valid MIDI notes', () => {
  // C# (61) snapped to C Major should become C (60) or D (62)
  const snapped = snapNoteToScale(61, 'major', 0);
  assert.equal(snapped === 60 || snapped === 62, true);

  // C Minor chord on C4 (60) -> [60, 63, 67]
  assert.deepEqual(expandPlayedNote(60, 'minor', 'minor', 0), [60, 63, 67]);
  // Maj7 on C4 -> [60, 64, 67, 71]
  assert.deepEqual(expandPlayedNote(60, 'chromatic', 'maj7', 0), [60, 64, 67, 71]);
});

test('MPC 16 Levels calculates monotonic velocity and semitone pitch ladders', () => {
  const vLow = computeSixteenLevels(0, 100, 'velocity');
  const vHigh = computeSixteenLevels(15, 100, 'velocity');
  assert.equal(vLow.velocity, 16);
  assert.equal(vHigh.velocity, 127);

  const pLow = computeSixteenLevels(0, 100, 'pitch');
  const pMid = computeSixteenLevels(7, 100, 'pitch');
  const pHigh = computeSixteenLevels(15, 100, 'pitch');
  assert.equal(pLow.pitchOffset, -7);
  assert.equal(pMid.pitchOffset, 0);
  assert.equal(pHigh.pitchOffset, 8);
});

test('MIDI note name and A4=440Hz frequency math', () => {
  assert.equal(midiNoteToName(60), 'C4');
  assert.equal(midiNoteToName(36), 'C2');
  assert.equal(Math.round(midiNoteToFrequency(69)), 440);
  assert.equal(Math.round(midiNoteToFrequency(69, 12)), 880);
});
