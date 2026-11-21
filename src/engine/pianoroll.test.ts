import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyVelocityCurvePreset,
  buildKeybedSyncedPianoRows,
  createPianoRollNote,
  deletePianoRollNote,
  getDefaultOctaveForTrack,
  getKeybedMidiRange,
  getNotesScheduledInStepWindow,
  getQwertyLabelForMidi,
  getSwungGridLines,
  insertStepInputNotes,
  movePianoRollNote,
  paintVelocityLine,
  quantizePianoRollNotes,
  resizePianoRollNoteEnd,
  resizePianoRollNoteStart,
  snapStepToSwungGrid,
  snapStepValue,
  updateNoteVelocity,
} from './pianoroll';
import { createDemoPattern } from './sequencer';

test('snapStepValue respects 1/8, 1/16, 1/32, and off (micro-timing) grids with bounds', () => {
  assert.equal(snapStepValue(2.4, '1/8'), 2);
  assert.equal(snapStepValue(3.1, '1/8'), 4);
  assert.equal(snapStepValue(2.6, '1/16'), 3);
  assert.equal(snapStepValue(2.3, '1/32'), 2.5);
  assert.equal(snapStepValue(1.13, 'off'), 1.125);
  assert.equal(snapStepValue(-2, '1/16', 0, 16), 0);
  assert.equal(snapStepValue(20, '1/16', 0, 16), 16);
});

test('movePianoRollNote repositions start time and MIDI pitch without exceeding pattern bounds', () => {
  const n = createPianoRollNote('bass', 2, 36, 3, 100);
  const moved = movePianoRollNote([n], n.id, 4.4, 41, '1/32');
  assert.equal(moved[0].step, 4.5);
  assert.equal(moved[0].note, 41);

  // Moving past end clamps to STEP_COUNT - length (16 - 3 = 13) and MAX_MIDI_NOTE (108)
  const clamped = movePianoRollNote([n], n.id, 15.5, 120, '1/16');
  assert.equal(clamped[0].step, 13);
  assert.equal(clamped[0].note, 108);
});

test('resizePianoRollNoteEnd and resizePianoRollNoteStart adjust durations accurately', () => {
  const n = createPianoRollNote('keys', 4, 60, 2, 90);

  // Stretch right edge from 6 to 9.5 on 1/32 grid
  const stretched = resizePianoRollNoteEnd([n], n.id, 9.4, '1/32');
  assert.equal(stretched[0].step, 4);
  assert.equal(stretched[0].length, 5.5);

  // Trim left edge from 4 to 5.5 while preserving right end (9.5)
  const trimmed = resizePianoRollNoteStart(stretched, n.id, 5.6, '1/32');
  assert.equal(trimmed[0].step, 5.5);
  assert.equal(trimmed[0].length, 4);
  assert.equal(trimmed[0].step + trimmed[0].length, 9.5);
});

test('paintVelocityLine interpolates velocities smoothly across painted step range', () => {
  const notes = [
    createPianoRollNote('lead', 0, 60, 1, 80),
    createPianoRollNote('lead', 4, 63, 1, 80),
    createPianoRollNote('lead', 8, 67, 1, 80),
    createPianoRollNote('lead', 12, 72, 1, 80),
  ];

  // Sweep from step 0 (vel 40) to step 8 (vel 120) — step 12 should remain untouched
  const painted = paintVelocityLine(notes, 0, 40, 8, 120);
  assert.equal(painted[0].velocity, 40);
  assert.equal(painted[1].velocity, 80);
  assert.equal(painted[2].velocity, 120);
  assert.equal(painted[3].velocity, 80);
});

test('applyVelocityCurvePreset shapes crescendo, decrescendo, arch, and humanize curves', () => {
  const notes = [
    createPianoRollNote('keys', 0, 60, 2, 90),
    createPianoRollNote('keys', 4, 64, 2, 90),
    createPianoRollNote('keys', 8, 67, 2, 90),
  ];

  const up = applyVelocityCurvePreset(notes, 'crescendo');
  assert.ok(up[0].velocity < up[1].velocity && up[1].velocity < up[2].velocity);

  const down = applyVelocityCurvePreset(notes, 'decrescendo');
  assert.ok(down[0].velocity > down[1].velocity && down[1].velocity > down[2].velocity);

  const arch = applyVelocityCurvePreset(notes, 'arch');
  assert.ok(arch[1].velocity > arch[0].velocity && arch[1].velocity > arch[2].velocity);

  const singleUpdated = updateNoteVelocity(notes, notes[0].id, 127);
  assert.equal(singleUpdated[0].velocity, 127);

  const deleted = deletePianoRollNote(notes, notes[1].id);
  assert.equal(deleted.length, 2);
});

test('getNotesScheduledInStepWindow yields exact fractional sub-step offsets', () => {
  const notes = [
    createPianoRollNote('lead', 2, 72, 1, 100),
    createPianoRollNote('lead', 2.5, 74, 0.5, 95),
    createPianoRollNote('lead', 2.75, 75, 0.25, 90),
    createPianoRollNote('lead', 3, 79, 1, 110),
  ];

  const inStep2 = getNotesScheduledInStepWindow(notes, 2);
  assert.equal(inStep2.length, 3);
  assert.deepEqual(
    inStep2.map((x) => x.subStepOffset),
    [0, 0.5, 0.75]
  );

  const inStep3 = getNotesScheduledInStepWindow(notes, 3);
  assert.equal(inStep3.length, 1);
  assert.equal(inStep3[0].subStepOffset, 0);
});

test('getSwungGridLines and snapStepToSwungGrid align to straight and MPC-swung grids across resolutions', () => {
  // Straight 1/16 grid (50% swing)
  const straight16 = getSwungGridLines('1/16', 50);
  assert.equal(straight16.length, 16);
  assert.deepEqual(straight16.slice(0, 4), [0, 1, 2, 3]);

  // 66% MPC triplet swing on 1/16 shifts odd steps by +0.32
  const swung16 = getSwungGridLines('1/16', 66);
  assert.deepEqual(swung16.slice(0, 4), [0, 1.32, 2, 3.32]);

  // 75% swing on 1/8 shifts odd 8th-note grid lines (step 2 -> 3, step 6 -> 7)
  const swung8 = getSwungGridLines('1/8', 75);
  assert.deepEqual(swung8.slice(0, 4), [0, 3, 4, 7]);

  // 66% swing on 1/32 shifts odd 32nd-note grid lines by +0.16 (0.5 -> 0.66)
  const swung32 = getSwungGridLines('1/32', 66);
  assert.deepEqual(swung32.slice(0, 4), [0, 0.66, 1, 1.66]);

  // Snapping off-grid steps picks nearest swung grid line
  assert.equal(snapStepToSwungGrid(1.15, '1/16', 66), 1.32);
  assert.equal(snapStepToSwungGrid(3.45, '1/16', 66), 3.32);
  // Free/'off' falls back to 1/16 grid for quantize
  assert.equal(snapStepToSwungGrid(1.15, 'off', 66), 1.32);
});

test('quantizePianoRollNotes snaps melodic notes with swing & resolution while preserving bounds', () => {
  const notes = [
    createPianoRollNote('bass', 0.125, 36, 2, 110),
    createPianoRollNote('bass', 3.125, 39, 1.5, 96),
    createPianoRollNote('bass', 15.125, 43, 0.875, 100),
  ];

  // Quantize to 1/16 at 66% swing: 0.125 -> 0, 3.125 -> 3.32, 15.125 -> 15.32 (length clamped to 0.68)
  const quantizedSwung = quantizePianoRollNotes(notes, '1/16', 66);
  assert.deepEqual(
    quantizedSwung.map((n) => n.step),
    [0, 3.32, 15.32]
  );
  assert.equal(quantizedSwung[0].length, 2);
  assert.equal(quantizedSwung[1].length, 1.5);
  assert.equal(quantizedSwung[2].length, 0.68);
  assert.equal(quantizedSwung[0].velocity, 110);

  // Re-quantize to straight 1/8 (50% swing): 0 -> 0, 3.32 -> 4, 15.32 -> 14
  const quantizedStraight8 = quantizePianoRollNotes(quantizedSwung, '1/8', 50);
  assert.deepEqual(
    quantizedStraight8.map((n) => n.step),
    [0, 4, 14]
  );
});

test('25-key MPK MK4 keybed maps 1:1 to Piano Roll rows across all octaves and demo tracks', () => {
  for (let oct = -2; oct <= 3; oct++) {
    const { minMidi, maxMidi, keys } = getKeybedMidiRange(oct);
    assert.equal(keys.length, 25);
    assert.equal(maxMidi - minMidi, 24);

    const rows = buildKeybedSyncedPianoRows(oct);
    assert.equal(rows.length, 25);
    assert.equal(rows[0], maxMidi);
    assert.equal(rows[rows.length - 1], minMidi);
    // Every single keybed MIDI note must exist in Piano Roll rows
    for (const midi of keys) {
      assert.ok(rows.includes(midi), `Missing MIDI ${midi} at octave ${oct}`);
    }
  }

  // Verify default track octaves cover 100% of seeded boom-bap demo notes
  const demo = createDemoPattern('A', 'boom-bap');
  (['bass', 'keys', 'lead'] as const).forEach((track) => {
    const oct = getDefaultOctaveForTrack(track);
    const { keys } = getKeybedMidiRange(oct);
    for (const note of demo.melodicNotes[track]) {
      assert.ok(
        keys.includes(note.note),
        `Track ${track} note ${note.note} should fall inside 25-key keybed at oct ${oct}`
      );
    }
  });

  // QWERTY shortcut labels align with base octave keys (Z = root C, M = B, , = C+12)
  assert.equal(getQwertyLabelForMidi(36, -1), 'Z');
  assert.equal(getQwertyLabelForMidi(37, -1), 'S');
  assert.equal(getQwertyLabelForMidi(48, -1), ',');
  assert.equal(getQwertyLabelForMidi(49, -1), null);
});

test('insertStepInputNotes assigns played keys/chords to Piano Roll and advances cursor cleanly', () => {
  const step1 = insertStepInputNotes([], 'keys', [60, 63, 67], 0, '1/8', 105);
  assert.equal(step1.notes.length, 3);
  assert.deepEqual(
    step1.notes.map((n) => n.note),
    [60, 63, 67]
  );
  assert.equal(step1.notes[0].step, 0);
  assert.equal(step1.notes[0].length, 2);
  assert.equal(step1.nextCursor, 2);

  // Cursor wraps back to 0 when reaching step 16
  const wrap = insertStepInputNotes(step1.notes, 'keys', [72], 14, '1/8', 110);
  assert.equal(wrap.notes.length, 4);
  assert.equal(wrap.notes[3].step, 14);
  assert.equal(wrap.nextCursor, 0);
});
