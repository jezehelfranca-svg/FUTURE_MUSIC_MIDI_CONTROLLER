import React from 'react';
import { Cable, Radio, RefreshCw, Sliders, Zap } from 'lucide-react';
import type {
  MidiDeviceInfo,
  MidiLearnTarget,
  MidiLogEntry,
  MidiMappingConfig,
  MidiProfileId,
} from '../types/studio';

interface MidiMapWorkspaceProps {
  midiSupported: boolean;
  midiError: string | null;
  devices: MidiDeviceInfo[];
  selectedDeviceId: string;
  onSelectDevice: (id: string) => void;
  onRefreshMidi: () => void;
  mapping: MidiMappingConfig;
  onSelectProfile: (profile: MidiProfileId) => void;
  onChangeChannel: (ch: number) => void;
  midiLearnTarget: MidiLearnTarget | null;
  onSetMidiLearnTarget: (target: MidiLearnTarget | null) => void;
  onSimulateMidiPacket: (bytes: number[], label: string) => void;
  midiLog: MidiLogEntry[];
  onClearLog: () => void;
}

const KNOB_DEFAULT_LABELS = [
  'K1 · Cutoff / Drums / Tune',
  'K2 · Reso / Bass / Decay',
  'K3 · Attack / Keys / Cutoff',
  'K4 · Release / Lead / Level',
  'K5 · Delay / Swing / Pan',
  'K6 · Reverb / Mst Flt / Rev',
  'K7 · Drive / Dly FB / Dly',
  'K8 · Master Output',
];

export const MidiMapWorkspace: React.FC<MidiMapWorkspaceProps> = ({
  midiSupported,
  midiError,
  devices,
  selectedDeviceId,
  onSelectDevice,
  onRefreshMidi,
  mapping,
  onSelectProfile,
  onChangeChannel,
  midiLearnTarget,
  onSetMidiLearnTarget,
  onSimulateMidiPacket,
  midiLog,
  onClearLog,
}) => {
  const mpkDetected = devices.some((d) => d.isMpkMk4);

  return (
    <div className="h-full p-4 overflow-y-auto">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* LEFT: Hardware Connection + Akai MPK MK4 Profile + Simulator */}
        <section
          aria-label="Akai MPK MK4 Web MIDI Connection"
          className="xl:col-span-5 bg-[#141820] border border-[#252C38] rounded-lg p-3.5 flex flex-col gap-2.5"
        >
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#222835]">
            <div>
              <h1 className="text-sm font-bold text-slate-100">Akai MPK MK4 MIDI Setup</h1>
              <p className="text-[11px] text-slate-400">
                USB-C Web MIDI routing &amp; hardware MIDI Learn
              </p>
            </div>
            <button
              type="button"
              onClick={onRefreshMidi}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold bg-[#1D2330] hover:bg-[#273041] border border-[#313B4F] rounded text-slate-100 whitespace-nowrap"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Scan USB MIDI
            </button>
          </div>

          {/* Connection Status */}
          <div className="bg-[#0F131A] border border-[#232A37] rounded-md p-2.5 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                <Cable className="w-3.5 h-3.5 text-[#E11D48]" aria-hidden="true" />
                Web MIDI Input Device
              </span>
              <span className="font-mono text-[11px] text-slate-400">
                {!midiSupported
                  ? 'Web MIDI Unavailable'
                  : mpkDetected
                  ? 'Akai MPK Detected'
                  : `${devices.length} device${devices.length === 1 ? '' : 's'}`}
              </span>
            </div>

            {midiError && (
              <p className="text-[11px] text-amber-300 bg-amber-950/40 border border-amber-800/50 rounded px-2 py-1">
                {midiError}
              </p>
            )}

            <select
              aria-label="Select USB MIDI Input Device"
              value={selectedDeviceId}
              onChange={(e) => onSelectDevice(e.target.value)}
              className="w-full bg-[#161B25] border border-[#2D3646] rounded px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-[#E11D48]"
            >
              <option value="all">All Connected MIDI Inputs (Recommended for MPK MK4)</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} {d.manufacturer ? `— ${d.manufacturer}` : ''}
                </option>
              ))}
            </select>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="midi-profile" className="block text-[10px] text-slate-400 mb-0.5">
                  Hardware Profile
                </label>
                <select
                  id="midi-profile"
                  value={mapping.profileId}
                  onChange={(e) => onSelectProfile(e.target.value as MidiProfileId)}
                  className="w-full bg-[#161B25] border border-[#2D3646] rounded px-2 py-1 text-xs text-slate-100"
                >
                  <option value="mpk-mk4">Akai MPK Mini MK4 (CC 24–31)</option>
                  <option value="mpk-mk3">Akai MPK Mini MK3 (CC 70–77)</option>
                  <option value="generic">Generic MIDI Controller</option>
                </select>
              </div>
              <div>
                <label htmlFor="midi-channel" className="block text-[10px] text-slate-400 mb-0.5">
                  MIDI Input Channel
                </label>
                <select
                  id="midi-channel"
                  value={mapping.inputChannel}
                  onChange={(e) => onChangeChannel(Number(e.target.value))}
                  className="w-full bg-[#161B25] border border-[#2D3646] rounded px-2 py-1 text-xs text-slate-100"
                >
                  <option value={0}>Omni (All Ch 1–16)</option>
                  {Array.from({ length: 16 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      Channel {i + 1}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Hardware MIDI Test / Simulator for MPK MK4 */}
          <div className="bg-[#0F131A] border border-[#232A37] rounded-md p-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                Test MPK MK4 MIDI Signals
              </span>
              <span className="text-[10px] text-slate-400">No USB cable required</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => onSimulateMidiPacket([0xb0, 24, 92], 'MPK MK4 Knob 1 (CC 24)')}
                className="px-2 py-1 text-[11px] font-medium bg-[#1A202B] hover:bg-[#242C3A] border border-[#2D3646] rounded text-slate-200 whitespace-nowrap"
              >
                Send CC 24 (K1 = 92)
              </button>
              <button
                type="button"
                onClick={() => onSimulateMidiPacket([0xb0, 74, 108], 'Custom Encoder (CC 74)')}
                className="px-2 py-1 text-[11px] font-medium bg-[#1A202B] hover:bg-[#242C3A] border border-[#2D3646] rounded text-slate-200 whitespace-nowrap"
              >
                Send CC 74 (Learn Test)
              </button>
              <button
                type="button"
                onClick={() => onSimulateMidiPacket([0x99, 36, 120], 'MPK Pad 1 (Note 36)')}
                className="px-2 py-1 text-[11px] font-medium bg-[#1A202B] hover:bg-[#242C3A] border border-[#2D3646] rounded text-slate-200 whitespace-nowrap"
              >
                Send Pad 1 (Note 36)
              </button>
              <button
                type="button"
                onClick={() => onSimulateMidiPacket([0xf0, 0x7f, 0x7f, 0x06, 0x02, 0xf7], 'MMC Play SysEx')}
                className="px-2 py-1 text-[11px] font-medium bg-[#1A202B] hover:bg-[#242C3A] border border-[#2D3646] rounded text-slate-200 whitespace-nowrap"
              >
                Send MMC Play
              </button>
            </div>
          </div>

          {/* Live MIDI Monitor Log */}
          <div className="bg-[#0C0F14] border border-[#232A37] rounded-md p-2.5 flex flex-col gap-1.5 flex-1 min-h-[104px]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-teal-400" aria-hidden="true" />
                Live MIDI Monitor
              </span>
              <button
                type="button"
                onClick={onClearLog}
                className="text-[11px] text-slate-400 hover:text-slate-200"
              >
                Clear Log
              </button>
            </div>

            <div
              data-testid="midi-monitor-log"
              className="flex-1 overflow-y-auto max-h-[115px] font-mono text-[11px] space-y-1"
            >
              {midiLog.length === 0 ? (
                <div className="text-slate-500 py-3 text-center">
                  Waiting for MIDI input from Akai MPK MK4 or test buttons...
                </div>
              ) : (
                midiLog.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-[#141821] border border-[#1E2430] tabular-nums"
                  >
                    <span className="text-slate-400 shrink-0">
                      CH{entry.channel} · {entry.type}
                    </span>
                    <span className="text-slate-100 truncate flex-1 text-right">
                      {entry.summary}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        {/* RIGHT: Interactive CC Mapping & MIDI Learn Matrix */}
        <section
          aria-label="MIDI Learn Mapping Matrix"
          className="xl:col-span-7 bg-[#141820] border border-[#252C38] rounded-lg p-4 flex flex-col gap-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#222835]">
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-[#E11D48]" aria-hidden="true" />
                Encoder &amp; Transport MIDI Learn
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Click &ldquo;Learn&rdquo; on any control, then turn a knob or press a button on your Akai MPK MK4.
              </p>
            </div>
            {midiLearnTarget && (
              <button
                type="button"
                onClick={() => onSetMidiLearnTarget(null)}
                className="px-3 py-1 text-xs font-semibold bg-amber-500/20 border border-amber-400 text-amber-200 rounded"
              >
                Cancel Learn Mode
              </button>
            )}
          </div>

          {/* 8 Rotary Encoder Mappings */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-300">
              8 Continuous Rotary Encoders (Default MK4: CC 24–31)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {mapping.knobCCs.map((cc, idx) => {
                const isLearning =
                  midiLearnTarget?.type === 'knob' && midiLearnTarget.index === idx;
                return (
                  <div
                    key={idx}
                    className={`flex items-center justify-between gap-2 px-3 py-2 rounded-md border ${
                      isLearning
                        ? 'bg-amber-950/30 border-amber-400'
                        : 'bg-[#10131A] border-[#222835]'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-200 truncate">
                        {KNOB_DEFAULT_LABELS[idx]}
                      </div>
                      <div className="text-[11px] font-mono tabular-nums text-slate-400">
                        Assigned: CC {cc}
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label={`MIDI Learn Knob ${idx + 1}`}
                      onClick={() =>
                        onSetMidiLearnTarget(
                          isLearning ? null : { type: 'knob', index: idx }
                        )
                      }
                      className={`px-3 py-1 text-xs font-semibold rounded transition-colors whitespace-nowrap shrink-0 ${
                        isLearning
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-[#1C222E] hover:bg-[#272F3F] border border-[#30394B] text-slate-200'
                      }`}
                    >
                      {isLearning ? 'Listening...' : 'Learn'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Dedicated MK4 Transport Mappings */}
          <div className="space-y-2 pt-2 border-t border-[#222835]">
            <h3 className="text-xs font-semibold text-slate-300">
              Dedicated MK4 Transport Controls (CC + MMC SysEx Supported)
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(['play', 'stop', 'record', 'loop'] as const).map((action) => {
                const isLearning =
                  midiLearnTarget?.type === 'transport' &&
                  midiLearnTarget.action === action;
                const ccNum = mapping.transportCCs[action];
                return (
                  <div
                    key={action}
                    className={`p-2.5 rounded-md border flex flex-col justify-between gap-2 ${
                      isLearning
                        ? 'bg-amber-950/30 border-amber-400'
                        : 'bg-[#10131A] border-[#222835]'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-semibold text-slate-100 capitalize">
                        {action}
                      </div>
                      <div className="text-[11px] font-mono tabular-nums text-slate-400">
                        CC {ccNum}
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label={`MIDI Learn Transport ${action}`}
                      onClick={() =>
                        onSetMidiLearnTarget(
                          isLearning ? null : { type: 'transport', action }
                        )
                      }
                      className={`w-full py-1 text-xs font-semibold rounded transition-colors ${
                        isLearning
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-[#1C222E] hover:bg-[#272F3F] border border-[#30394B] text-slate-200'
                      }`}
                    >
                      {isLearning ? 'Listening...' : 'Learn'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick Setup Guide */}
          <div className="bg-[#0F131A] border border-[#222835] rounded-md p-3 text-xs text-slate-400 leading-relaxed">
            <strong className="text-slate-200">Akai MPK Mini MK4 Quick Setup:</strong> Connect via USB-C in Chrome or Edge, set your MPK MK4 to <strong className="text-slate-200">User / DAW Mode</strong>, and leave input on <strong className="text-slate-200">All Connected MIDI Inputs</strong>. Pads trigger Bank A/B (MIDI 36–51), keys drive the active melodic track with pitch/mod wheels &amp; sustain pedal (CC 64), and encoders K1–K8 map directly to CC 24–31.
          </div>
        </section>
      </div>
    </div>
  );
};
