import type {
  MasterFxParams,
  PadConfig,
  PatternData,
  SynthParams,
  TrackId,
  TrackMixerChannel,
} from '../types/studio';
import { midiNoteToFrequency } from '../engine/midi';
import { SYNTH_PRESETS, getStepSwingOffsetSeconds, isTrackAudible } from '../engine/sequencer';
import { getNotesScheduledInStepWindow } from '../engine/pianoroll';

interface ActiveVoice {
  note: number;
  track: TrackId;
  osc1: OscillatorNode;
  osc2: OscillatorNode;
  lfo: OscillatorNode;
  lfoGain: GainNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  release: number;
  baseFreq: number;
}

interface TrackAudioNodes {
  input: GainNode;
  pan: StereoPannerNode;
  reverbSend: GainNode;
  delaySend: GainNode;
  analyser: AnalyserNode;
}

function createDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
  const k = amount * 60;
  const samples = 256;
  const buffer = new ArrayBuffer(samples * 4);
  const curve = new Float32Array(buffer);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = k <= 0.001 ? x : ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

function createReverbImpulse(ctx: BaseAudioContext, duration = 2.0, decay = 2.6): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * duration);
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const channelData = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const env = Math.pow(1 - i / length, decay);
      channelData[i] = (Math.random() * 2 - 1) * env * 0.6;
    }
  }
  return impulse;
}

function createNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const length = ctx.sampleRate * 1.5;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

export class StudioAudioEngine {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private customSamples = new Map<number, AudioBuffer>();
  private chokeGroups = new Map<number, Array<() => void>>();

  private trackNodes: Record<TrackId, TrackAudioNodes> | null = null;
  private masterFilter: BiquadFilterNode | null = null;
  private masterDrive: WaveShaperNode | null = null;
  private delayNode: DelayNode | null = null;
  private delayFeedback: GainNode | null = null;
  private delayWet: GainNode | null = null;
  private reverbConvolver: ConvolverNode | null = null;
  private reverbWet: GainNode | null = null;
  private masterGain: GainNode | null = null;
  private masterAnalyser: AnalyserNode | null = null;

  private activeVoices = new Map<string, ActiveVoice>();
  private sustainedVoices = new Set<string>();
  private sustainPedalDown = false;
  private pitchBendSemitones = 0;
  private modWheelAmount = 0; // 0..1

  private timeDomainData = new Float32Array(256);
  private meterBuffer = new Float32Array(128);

  public ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.buildGraph(this.ctx);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public getCurrentTime(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  private buildGraph(ctx: AudioContext) {
    this.noiseBuffer = createNoiseBuffer(ctx);

    const masterBus = ctx.createGain();
    masterBus.gain.value = 1.0;

    this.masterDrive = ctx.createWaveShaper();
    this.masterDrive.curve = createDistortionCurve(0.14);
    this.masterDrive.oversample = '2x';

    this.masterFilter = ctx.createBiquadFilter();
    this.masterFilter.type = 'lowpass';
    this.masterFilter.frequency.value = 18500;
    this.masterFilter.Q.value = 1.0;

    // Delay FX Send (starts dry so notes never repeat unless Delay Mix is turned up)
    this.delayNode = ctx.createDelay(1.5);
    this.delayNode.delayTime.value = 0.32;
    this.delayFeedback = ctx.createGain();
    this.delayFeedback.gain.value = 0;
    this.delayWet = ctx.createGain();
    this.delayWet.gain.value = 0;
    const delayFilter = ctx.createBiquadFilter();
    delayFilter.type = 'lowpass';
    delayFilter.frequency.value = 4200;

    this.delayNode.connect(delayFilter);
    delayFilter.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delayNode);
    delayFilter.connect(this.delayWet);

    // Reverb FX Send
    this.reverbConvolver = ctx.createConvolver();
    this.reverbConvolver.buffer = createReverbImpulse(ctx, 2.0, 2.6);
    this.reverbWet = ctx.createGain();
    this.reverbWet.gain.value = 0.24;
    this.reverbConvolver.connect(this.reverbWet);

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -10;
    compressor.knee.value = 12;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.16;

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 0.85;

    this.masterAnalyser = ctx.createAnalyser();
    this.masterAnalyser.fftSize = 512;
    this.masterAnalyser.smoothingTimeConstant = 0.8;

    masterBus.connect(this.masterDrive);
    this.masterDrive.connect(this.masterFilter);
    this.masterFilter.connect(compressor);
    this.delayWet.connect(compressor);
    this.reverbWet.connect(compressor);
    compressor.connect(this.masterGain);
    this.masterGain.connect(this.masterAnalyser);
    this.masterAnalyser.connect(ctx.destination);

    // Build 4 DAW Track channels
    const trackIds: TrackId[] = ['drums', 'bass', 'keys', 'lead'];
    const tracks = {} as Record<TrackId, TrackAudioNodes>;

    for (const id of trackIds) {
      const input = ctx.createGain();
      const pan = ctx.createStereoPanner();
      const reverbSend = ctx.createGain();
      const delaySend = ctx.createGain();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;

      reverbSend.gain.value = 0.2;
      delaySend.gain.value = 0.15;

      input.connect(pan);
      pan.connect(analyser);
      analyser.connect(masterBus);
      pan.connect(reverbSend);
      reverbSend.connect(this.reverbConvolver);
      pan.connect(delaySend);
      delaySend.connect(this.delayNode);

      tracks[id] = { input, pan, reverbSend, delaySend, analyser };
    }
    this.trackNodes = tracks;
  }

  public updateMasterFx(fx: MasterFxParams) {
    if (!this.ctx || !this.masterFilter || !this.masterDrive || !this.delayNode || !this.delayFeedback || !this.delayWet || !this.reverbWet || !this.masterGain) {
      return;
    }
    const now = this.ctx.currentTime;
    this.masterFilter.frequency.setTargetAtTime(fx.filterCutoff, now, 0.015);
    this.masterFilter.Q.setTargetAtTime(fx.filterResonance, now, 0.015);
    this.masterDrive.curve = createDistortionCurve(fx.drive);
    const delayActive = fx.delayMix > 0.001;
    this.delayNode.delayTime.setTargetAtTime(fx.delayTime, now, 0.02);
    this.delayFeedback.gain.setTargetAtTime(delayActive ? fx.delayFeedback : 0, now, 0.02);
    this.delayWet.gain.setTargetAtTime(delayActive ? fx.delayMix : 0, now, 0.02);
    this.reverbWet.gain.setTargetAtTime(fx.reverbMix, now, 0.02);
    this.masterGain.gain.setTargetAtTime(fx.masterVolume, now, 0.015);
  }

  public updateMixer(mixer: Record<TrackId, TrackMixerChannel>) {
    if (!this.ctx || !this.trackNodes) return;
    const now = this.ctx.currentTime;
    (Object.keys(mixer) as TrackId[]).forEach((id) => {
      const ch = mixer[id];
      const nodes = this.trackNodes![id];
      const audible = isTrackAudible(id, mixer);
      nodes.input.gain.setTargetAtTime(audible ? ch.volume : 0, now, 0.012);
      nodes.pan.pan.setTargetAtTime(ch.pan, now, 0.012);
      nodes.reverbSend.gain.setTargetAtTime(audible ? ch.reverbSend : 0, now, 0.02);
      nodes.delaySend.gain.setTargetAtTime(audible ? ch.delaySend : 0, now, 0.02);
    });
  }

  public setPitchBend(normalized: number) {
    // Standard +/- 2 semitones
    this.pitchBendSemitones = Math.max(-1, Math.min(1, normalized)) * 2;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.activeVoices.forEach((voice) => {
      const freq = midiNoteToFrequency(voice.note, this.pitchBendSemitones);
      voice.osc1.frequency.setTargetAtTime(freq, now, 0.008);
      voice.osc2.frequency.setTargetAtTime(freq * 0.5, now, 0.008);
    });
  }

  public setModWheel(normalized: number) {
    this.modWheelAmount = Math.max(0, Math.min(1, normalized));
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.activeVoices.forEach((voice) => {
      voice.lfoGain.gain.setTargetAtTime(this.modWheelAmount * 35, now, 0.015);
    });
  }

  public setSustainPedal(down: boolean) {
    this.sustainPedalDown = down;
    if (!down) {
      this.sustainedVoices.forEach((key) => {
        const [track, noteStr] = key.split(':');
        this.noteOff(Number(noteStr), track as TrackId, true);
      });
      this.sustainedVoices.clear();
    }
  }

  public async loadCustomSample(padIndex: number, file: File): Promise<boolean> {
    const ctx = this.ensureContext();
    if (!ctx) return false;
    try {
      const arrayBuf = await file.arrayBuffer();
      const decoded = await ctx.decodeAudioData(arrayBuf);
      this.customSamples.set(padIndex, decoded);
      return true;
    } catch {
      return false;
    }
  }

  public clearCustomSample(padIndex: number) {
    this.customSamples.delete(padIndex);
  }

  public playMetronomeClick(accent: boolean, time?: number) {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const t = time ?? ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(accent ? 1320 : 880, t);
    gain.gain.setValueAtTime(accent ? 0.22 : 0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.05);
  }

  public triggerPad(
    pad: PadConfig,
    velocity = 110,
    time?: number,
    extraPitchSemitones = 0
  ) {
    const ctx = this.ensureContext();
    if (!ctx || !this.trackNodes) return;
    const t = time ?? ctx.currentTime;

    // Enforce choke group (e.g., closed hat cuts off open hat)
    if (pad.chokeGroup > 0) {
      const activeStoppers = this.chokeGroups.get(pad.chokeGroup);
      if (activeStoppers) {
        activeStoppers.forEach((stop) => stop());
        this.chokeGroups.set(pad.chokeGroup, []);
      }
    }

    const customBuf = this.customSamples.get(pad.id);
    const stopHandle = this.renderPadIntoGraph(
      ctx,
      this.trackNodes.drums.input,
      this.noiseBuffer!,
      pad,
      velocity,
      t,
      extraPitchSemitones,
      customBuf
    );

    if (pad.chokeGroup > 0 && stopHandle) {
      const list = this.chokeGroups.get(pad.chokeGroup) ?? [];
      list.push(stopHandle);
      this.chokeGroups.set(pad.chokeGroup, list);
    }
  }

  private renderPadIntoGraph(
    ctx: BaseAudioContext,
    dest: AudioNode,
    noiseBuffer: AudioBuffer,
    pad: PadConfig,
    velocity: number,
    t: number,
    extraPitchSemitones: number,
    customBuffer?: AudioBuffer
  ): (() => void) | null {
    const velGain = Math.max(0.06, Math.min(1.2, (velocity / 127) * pad.gain));
    const totalTune = pad.tune + extraPitchSemitones;
    const pitchRatio = Math.pow(2, totalTune / 12);

    const outGain = ctx.createGain();
    outGain.gain.setValueAtTime(velGain, t);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(pad.cutoff, t);

    const panner = ctx.createStereoPanner();
    panner.pan.setValueAtTime(pad.pan, t);

    filter.connect(outGain);
    outGain.connect(panner);
    panner.connect(dest);

    const stopNodes: AudioScheduledSourceNode[] = [];
    const choke = () => {
      try {
        const now = ctx.currentTime;
        outGain.gain.cancelScheduledValues(now);
        outGain.gain.setValueAtTime(outGain.gain.value, now);
        outGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.02);
        stopNodes.forEach((n) => {
          try {
            n.stop(now + 0.025);
          } catch {
            // already stopped
          }
        });
      } catch {
        // ignore
      }
    };

    // Custom loaded WAV/MP3 sample
    if (customBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = customBuffer;
      src.playbackRate.setValueAtTime(pitchRatio, t);
      const env = ctx.createGain();
      const dur = Math.min(customBuffer.duration / pitchRatio, Math.max(0.08, pad.decay * 1.8));
      env.gain.setValueAtTime(1, t);
      env.gain.setValueAtTime(1, t + Math.max(0.01, dur - 0.04));
      env.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(env);
      env.connect(filter);
      src.start(t);
      src.stop(t + dur + 0.02);
      stopNodes.push(src);
      return choke;
    }

    const d = Math.max(0.06, pad.decay);

    switch (pad.synthType) {
      case 'kick': {
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(155 * pitchRatio, t);
        osc.frequency.exponentialRampToValueAtTime(46 * pitchRatio, t + 0.055);
        osc.frequency.exponentialRampToValueAtTime(34 * pitchRatio, t + 0.28 * d);
        env.gain.setValueAtTime(1.15, t);
        env.gain.exponentialRampToValueAtTime(0.001, t + 0.42 * d);

        // Click transient
        const clickOsc = ctx.createOscillator();
        const clickEnv = ctx.createGain();
        clickOsc.type = 'triangle';
        clickOsc.frequency.setValueAtTime(920 * pitchRatio, t);
        clickOsc.frequency.exponentialRampToValueAtTime(120, t + 0.018);
        clickEnv.gain.setValueAtTime(0.45, t);
        clickEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.02);

        osc.connect(env);
        env.connect(filter);
        clickOsc.connect(clickEnv);
        clickEnv.connect(filter);
        osc.start(t);
        osc.stop(t + 0.45 * d);
        clickOsc.start(t);
        clickOsc.stop(t + 0.025);
        stopNodes.push(osc, clickOsc);
        break;
      }

      case 'snare': {
        const tone = ctx.createOscillator();
        const toneEnv = ctx.createGain();
        tone.type = 'triangle';
        tone.frequency.setValueAtTime(215 * pitchRatio, t);
        tone.frequency.exponentialRampToValueAtTime(128 * pitchRatio, t + 0.08);
        toneEnv.gain.setValueAtTime(0.75, t);
        toneEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.16 * d);
        tone.connect(toneEnv);
        toneEnv.connect(filter);

        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuffer;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.setValueAtTime(1100 * pitchRatio, t);
        const nEnv = ctx.createGain();
        nEnv.gain.setValueAtTime(0.95, t);
        nEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.28 * d);
        noise.connect(hp);
        hp.connect(nEnv);
        nEnv.connect(filter);

        tone.start(t);
        tone.stop(t + 0.18 * d);
        noise.start(t);
        noise.stop(t + 0.3 * d);
        stopNodes.push(tone, noise);
        break;
      }

      case 'clap': {
        const offsets = [0, 0.011, 0.022, 0.036];
        offsets.forEach((off, i) => {
          const noise = ctx.createBufferSource();
          noise.buffer = noiseBuffer;
          const bp = ctx.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.setValueAtTime(1350 * pitchRatio, t + off);
          bp.Q.value = 1.8;
          const env = ctx.createGain();
          const tail = i === offsets.length - 1 ? 0.24 * d : 0.024;
          env.gain.setValueAtTime(i === offsets.length - 1 ? 0.9 : 0.65, t + off);
          env.gain.exponentialRampToValueAtTime(0.001, t + off + tail);
          noise.connect(bp);
          bp.connect(env);
          env.connect(filter);
          noise.start(t + off);
          noise.stop(t + off + tail + 0.01);
          stopNodes.push(noise);
        });
        break;
      }

      case 'rim': {
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(520 * pitchRatio, t);
        osc.frequency.exponentialRampToValueAtTime(310 * pitchRatio, t + 0.03);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(1750 * pitchRatio, t);
        bp.Q.value = 4;
        env.gain.setValueAtTime(0.85, t);
        env.gain.exponentialRampToValueAtTime(0.001, t + 0.075 * d);
        osc.connect(bp);
        bp.connect(env);
        env.connect(filter);
        osc.start(t);
        osc.stop(t + 0.09 * d);
        stopNodes.push(osc);
        break;
      }

      case 'hat-closed':
      case 'hat-open':
      case 'crash':
      case 'shaker': {
        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuffer;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.setValueAtTime(
          pad.synthType === 'shaker' ? 5200 : pad.synthType === 'crash' ? 4200 : 7200 * pitchRatio,
          t
        );
        const env = ctx.createGain();
        const dur =
          pad.synthType === 'hat-closed'
            ? 0.09 * d * 2.2
            : pad.synthType === 'shaker'
            ? 0.11 * d * 2
            : pad.synthType === 'hat-open'
            ? 0.42 * d
            : 1.05 * d;
        env.gain.setValueAtTime(pad.synthType === 'shaker' ? 0.5 : 0.72, t);
        env.gain.exponentialRampToValueAtTime(0.001, t + dur);
        noise.connect(hp);
        hp.connect(env);
        env.connect(filter);
        noise.start(t);
        noise.stop(t + dur + 0.02);
        stopNodes.push(noise);
        break;
      }

      case 'bass-hit': {
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(92 * pitchRatio, t);
        osc.frequency.exponentialRampToValueAtTime(43.65 * pitchRatio, t + 0.06);
        env.gain.setValueAtTime(1.1, t);
        env.gain.exponentialRampToValueAtTime(0.001, t + 0.85 * d);
        osc.connect(env);
        env.connect(filter);
        osc.start(t);
        osc.stop(t + 0.9 * d);
        stopNodes.push(osc);
        break;
      }

      case 'tom-lo':
      case 'tom-hi': {
        const base = pad.synthType === 'tom-lo' ? 115 : 185;
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(base * 1.45 * pitchRatio, t);
        osc.frequency.exponentialRampToValueAtTime(base * 0.72 * pitchRatio, t + 0.22 * d);
        env.gain.setValueAtTime(0.9, t);
        env.gain.exponentialRampToValueAtTime(0.001, t + 0.36 * d);
        osc.connect(env);
        env.connect(filter);
        osc.start(t);
        osc.stop(t + 0.4 * d);
        stopNodes.push(osc);
        break;
      }

      case 'chord-stab': {
        // Warm minor 9th Rhodes / MPC soul chop
        const notes = [60, 63, 67, 70, 74];
        notes.forEach((n, idx) => {
          const osc = ctx.createOscillator();
          osc.type = idx % 2 === 0 ? 'triangle' : 'sawtooth';
          osc.frequency.setValueAtTime(midiNoteToFrequency(n + totalTune), t);
          osc.detune.setValueAtTime((idx - 2) * 5, t);
          const env = ctx.createGain();
          env.gain.setValueAtTime(0.001, t);
          env.gain.linearRampToValueAtTime(0.22, t + 0.012);
          env.gain.exponentialRampToValueAtTime(0.001, t + 0.58 * d);
          osc.connect(env);
          env.connect(filter);
          osc.start(t);
          osc.stop(t + 0.62 * d);
          stopNodes.push(osc);
        });
        break;
      }

      case 'vocal-chop': {
        // Dual-formant filtered saw synth chop
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(293.66 * pitchRatio, t);
        osc.frequency.exponentialRampToValueAtTime(329.63 * pitchRatio, t + 0.09);
        const f1 = ctx.createBiquadFilter();
        f1.type = 'bandpass';
        f1.frequency.setValueAtTime(820 * pitchRatio, t);
        f1.Q.value = 5;
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.001, t);
        env.gain.linearRampToValueAtTime(0.85, t + 0.02);
        env.gain.exponentialRampToValueAtTime(0.001, t + 0.48 * d);
        osc.connect(f1);
        f1.connect(env);
        env.connect(filter);
        osc.start(t);
        osc.stop(t + 0.52 * d);
        stopNodes.push(osc);
        break;
      }

      case 'bell': {
        [1, 2.756, 5.404].forEach((mult, i) => {
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(523.25 * mult * pitchRatio, t);
          const env = ctx.createGain();
          env.gain.setValueAtTime(0.42 / (i + 1), t);
          env.gain.exponentialRampToValueAtTime(0.001, t + (0.72 / (i + 1)) * d);
          osc.connect(env);
          env.connect(filter);
          osc.start(t);
          osc.stop(t + 0.78 * d);
          stopNodes.push(osc);
        });
        break;
      }

      case 'perc': {
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(760 * pitchRatio, t);
        osc.frequency.exponentialRampToValueAtTime(420 * pitchRatio, t + 0.055);
        env.gain.setValueAtTime(0.85, t);
        env.gain.exponentialRampToValueAtTime(0.001, t + 0.14 * d);
        osc.connect(env);
        env.connect(filter);
        osc.start(t);
        osc.stop(t + 0.16 * d);
        stopNodes.push(osc);
        break;
      }

      case 'fx-riser': {
        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuffer;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(420 * pitchRatio, t);
        bp.frequency.exponentialRampToValueAtTime(4600 * pitchRatio, t + 0.65 * d);
        bp.Q.value = 3.5;
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.02, t);
        env.gain.linearRampToValueAtTime(0.75, t + 0.5 * d);
        env.gain.exponentialRampToValueAtTime(0.001, t + 0.85 * d);
        noise.connect(bp);
        bp.connect(env);
        env.connect(filter);
        noise.start(t);
        noise.stop(t + 0.9 * d);
        stopNodes.push(noise);
        break;
      }
    }

    return choke;
  }

  public noteOn(
    note: number,
    velocity: number,
    track: TrackId,
    synth: SynthParams
  ) {
    const ctx = this.ensureContext();
    if (!ctx || !this.trackNodes) return;
    const key = `${track}:${note}`;
    // Retrigger existing voice cleanly
    if (this.activeVoices.has(key)) {
      this.noteOff(note, track, true);
    }

    const now = ctx.currentTime;
    const freq = midiNoteToFrequency(note, this.pitchBendSemitones);
    const velScale = Math.max(0.08, (velocity / 127) * 0.42);

    const osc1 = ctx.createOscillator();
    osc1.type = synth.waveform;
    osc1.frequency.setValueAtTime(freq, now);
    osc1.detune.setValueAtTime(synth.detune, now);

    const osc2 = ctx.createOscillator();
    osc2.type = synth.subWaveform;
    osc2.frequency.setValueAtTime(freq * 0.5, now);
    osc2.detune.setValueAtTime(-synth.detune, now);

    const subGain = ctx.createGain();
    subGain.gain.value = synth.subMix;

    const lfo = ctx.createOscillator();
    lfo.frequency.setValueAtTime(synth.lfoRate, now);
    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime((synth.lfoDepth + this.modWheelAmount * 0.8) * 28, now);
    lfo.connect(lfoGain);
    lfoGain.connect(osc1.detune);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(18000, synth.cutoff * (0.65 + (velocity / 127) * 0.7)), now);
    filter.Q.setValueAtTime(synth.resonance, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(velScale, now + synth.attack);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.001, velScale * Math.max(0.05, synth.sustain)),
      now + synth.attack + synth.decay
    );

    osc1.connect(filter);
    osc2.connect(subGain);
    subGain.connect(filter);
    filter.connect(gain);
    gain.connect(this.trackNodes[track].input);

    osc1.start(now);
    osc2.start(now);
    lfo.start(now);

    this.activeVoices.set(key, {
      note,
      track,
      osc1,
      osc2,
      lfo,
      lfoGain,
      filter,
      gain,
      release: synth.release,
      baseFreq: freq,
    });
  }

  public noteOff(note: number, track: TrackId, force = false) {
    const key = `${track}:${note}`;
    if (!force && this.sustainPedalDown) {
      this.sustainedVoices.add(key);
      return;
    }
    let resolvedKey = key;
    let voice = this.activeVoices.get(key);
    // Fallback: if active track switched while key was held, release matching note on whichever track owns it
    if (!voice) {
      for (const [k, v] of this.activeVoices.entries()) {
        if (v.note === note) {
          resolvedKey = k;
          voice = v;
          break;
        }
      }
    }
    if (!voice || !this.ctx) return;
    this.activeVoices.delete(resolvedKey);

    const now = this.ctx.currentTime;
    const rel = Math.max(0.03, voice.release);
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(Math.max(0.0001, voice.gain.gain.value), now);
    voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + rel);

    const stopAt = now + rel + 0.03;
    try {
      voice.osc1.stop(stopAt);
      voice.osc2.stop(stopAt);
      voice.lfo.stop(stopAt);
    } catch {
      // already stopped
    }
  }

  public playScheduledSynthNote(
    note: number,
    velocity: number,
    track: TrackId,
    synth: SynthParams,
    startTime: number,
    durationSec: number
  ) {
    const ctx = this.ensureContext();
    if (!ctx || !this.trackNodes) return;
    this.renderSynthIntoGraph(
      ctx,
      this.trackNodes[track].input,
      note,
      velocity,
      synth,
      startTime,
      durationSec
    );
  }

  private renderSynthIntoGraph(
    ctx: BaseAudioContext,
    dest: AudioNode,
    note: number,
    velocity: number,
    synth: SynthParams,
    startTime: number,
    durationSec: number
  ) {
    const freq = midiNoteToFrequency(note, 0);
    const velScale = Math.max(0.08, (velocity / 127) * 0.36);

    const osc1 = ctx.createOscillator();
    osc1.type = synth.waveform;
    osc1.frequency.setValueAtTime(freq, startTime);
    osc1.detune.setValueAtTime(synth.detune, startTime);

    const osc2 = ctx.createOscillator();
    osc2.type = synth.subWaveform;
    osc2.frequency.setValueAtTime(freq * 0.5, startTime);
    osc2.detune.setValueAtTime(-synth.detune, startTime);

    const subGain = ctx.createGain();
    subGain.gain.value = synth.subMix;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(18000, synth.cutoff), startTime);
    filter.Q.setValueAtTime(synth.resonance, startTime);

    const gain = ctx.createGain();
    const atkEnd = startTime + Math.min(synth.attack, durationSec * 0.45);
    const relStart = startTime + durationSec;
    const relEnd = relStart + Math.min(synth.release, 0.85);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(velScale, atkEnd);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.001, velScale * Math.max(0.08, synth.sustain)),
      Math.min(relStart, atkEnd + synth.decay)
    );
    gain.gain.setValueAtTime(Math.max(0.001, velScale * Math.max(0.08, synth.sustain)), relStart);
    gain.gain.exponentialRampToValueAtTime(0.0001, relEnd);

    osc1.connect(filter);
    osc2.connect(subGain);
    subGain.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    osc1.start(startTime);
    osc2.start(startTime);
    osc1.stop(relEnd + 0.02);
    osc2.stop(relEnd + 0.02);
  }

  public stopAllVoices() {
    this.sustainPedalDown = false;
    Array.from(this.activeVoices.values()).forEach((v) => {
      this.noteOff(v.note, v.track, true);
    });
    this.sustainedVoices.clear();
  }

  public getWaveformSamples(): Float32Array {
    if (!this.masterAnalyser) {
      this.timeDomainData.fill(0);
      return this.timeDomainData;
    }
    this.masterAnalyser.getFloatTimeDomainData(this.timeDomainData);
    return this.timeDomainData;
  }

  public getTrackLevels(): Record<TrackId | 'master', number> {
    const levels: Record<TrackId | 'master', number> = {
      drums: 0,
      bass: 0,
      keys: 0,
      lead: 0,
      master: 0,
    };

    const readRms = (analyser: AnalyserNode | null): number => {
      if (!analyser) return 0;
      analyser.getFloatTimeDomainData(this.meterBuffer);
      let sum = 0;
      for (let i = 0; i < this.meterBuffer.length; i++) {
        sum += this.meterBuffer[i] * this.meterBuffer[i];
      }
      const rms = Math.sqrt(sum / this.meterBuffer.length);
      return Math.min(1, rms * 3.2);
    };

    if (this.trackNodes) {
      levels.drums = readRms(this.trackNodes.drums.analyser);
      levels.bass = readRms(this.trackNodes.bass.analyser);
      levels.keys = readRms(this.trackNodes.keys.analyser);
      levels.lead = readRms(this.trackNodes.lead.analyser);
    }
    levels.master = readRms(this.masterAnalyser);
    return levels;
  }

  /**
   * Renders 2 full bars of the active pattern offline and returns a 16-bit stereo WAV Blob.
   */
  public async renderPatternToWav(
    pattern: PatternData,
    pads: PadConfig[],
    mixer: Record<TrackId, TrackMixerChannel>,
    fx: MasterFxParams,
    bpm: number,
    swing: number,
    leadSynth: SynthParams
  ): Promise<Blob> {
    const sampleRate = 44100;
    const stepSec = 60 / bpm / 4;
    const totalSteps = pattern.steps * 2; // 2 bars
    const totalDuration = totalSteps * stepSec + 1.5; // + reverb tail
    const offline = new OfflineAudioContext(2, Math.ceil(totalDuration * sampleRate), sampleRate);
    const offlineNoise = createNoiseBuffer(offline);

    const masterBus = offline.createGain();
    const filter = offline.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = fx.filterCutoff;
    filter.Q.value = fx.filterResonance;

    const masterGain = offline.createGain();
    masterGain.gain.value = fx.masterVolume;

    masterBus.connect(filter);
    filter.connect(masterGain);
    masterGain.connect(offline.destination);

    const trackGains: Record<TrackId, GainNode> = {
      drums: offline.createGain(),
      bass: offline.createGain(),
      keys: offline.createGain(),
      lead: offline.createGain(),
    };

    (['drums', 'bass', 'keys', 'lead'] as TrackId[]).forEach((id) => {
      const ch = mixer[id];
      const audible = isTrackAudible(id, mixer);
      trackGains[id].gain.value = audible ? ch.volume : 0;
      const pan = offline.createStereoPanner();
      pan.pan.value = ch.pan;
      trackGains[id].connect(pan);
      pan.connect(masterBus);
    });

    for (let bar = 0; bar < 2; bar++) {
      for (let step = 0; step < pattern.steps; step++) {
        const swingOffset = getStepSwingOffsetSeconds(step, bpm, swing);
        const baseStepTime = (bar * pattern.steps + step) * stepSec + 0.02;
        const t = baseStepTime + swingOffset;

        // Schedule drums
        for (let p = 0; p < 16; p++) {
          const vel = pattern.drumGrid[p][step];
          if (vel > 0) {
            this.renderPadIntoGraph(
              offline,
              trackGains.drums,
              offlineNoise,
              pads[p],
              vel,
              t,
              0,
              this.customSamples.get(p)
            );
          }
        }

        // Schedule melodic tracks with sub-step micro-timing support
        (['bass', 'keys', 'lead'] as const).forEach((track) => {
          const preset =
            track === 'lead'
              ? leadSynth
              : SYNTH_PRESETS[mixer[track].synthPreset].params;
          const dueNotes = getNotesScheduledInStepWindow(pattern.melodicNotes[track], step);
          dueNotes.forEach(({ note: n, subStepOffset }) => {
            const noteTime =
              subStepOffset > 0.001
                ? baseStepTime + subStepOffset * stepSec
                : t;
            this.renderSynthIntoGraph(
              offline,
              trackGains[track],
              n.note,
              n.velocity,
              preset,
              noteTime,
              Math.max(0.06, n.length * stepSec)
            );
          });
        });
      }
    }

    const rendered = await offline.startRendering();
    return audioBufferToWavBlob(rendered);
  }
}

function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length * numChannels * 2;
  const arrayBuffer = new ArrayBuffer(44 + length);
  const view = new DataView(arrayBuffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + length, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, length, true);

  let offset = 44;
  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(buffer.getChannelData(c));
  }

  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

export const audioEngine = new StudioAudioEngine();
