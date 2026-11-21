import React, { useRef, useState } from 'react';
import { Download, FileJson, Music, Save, Upload, X } from 'lucide-react';

interface ExportModalProps {
  projectName: string;
  onRenameProject: (name: string) => void;
  onSaveLocal: () => void;
  onExportJson: () => void;
  onImportJson: (text: string) => boolean;
  onExportWav: () => Promise<void>;
  onResetProject: () => void;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  projectName,
  onRenameProject,
  onSaveLocal,
  onExportJson,
  onImportJson,
  onExportWav,
  onResetProject,
  onClose,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [renderingWav, setRenderingWav] = useState(false);

  const handleWavClick = async () => {
    setRenderingWav(true);
    setStatusMessage('Rendering 2-bar stereo WAV mixdown...');
    try {
      await onExportWav();
      setStatusMessage('WAV mixdown exported successfully.');
    } catch {
      setStatusMessage('Could not export WAV in this browser context.');
    } finally {
      setRenderingWav(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Save and Export Studio Project"
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[#141820] border border-[#2C3442] rounded-lg p-5 space-y-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-[#232A36]">
          <h2 className="text-base font-bold text-slate-100">Project &amp; Audio Export</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Export Dialog"
            className="p-1 text-slate-400 hover:text-white rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="project-name-input" className="block text-xs font-medium text-slate-300">
            Session Name
          </label>
          <input
            id="project-name-input"
            type="text"
            value={projectName}
            onChange={(e) => onRenameProject(e.target.value)}
            className="w-full bg-[#0E1117] border border-[#2D3544] rounded px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-[#E11D48]"
          />
        </div>

        <div className="space-y-2.5">
          <button
            type="button"
            disabled={renderingWav}
            onClick={handleWavClick}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-semibold bg-[#E11D48] hover:bg-[#BE123C] disabled:opacity-60 text-white rounded-md transition-colors"
          >
            <Music className="w-4 h-4" />
            {renderingWav ? 'Bouncing 16-bit WAV...' : 'Bounce 2-Bar Loop to WAV Audio'}
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                onSaveLocal();
                setStatusMessage('Session saved to browser storage.');
              }}
              className="flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-medium bg-[#1C222D] hover:bg-[#252D3B] border border-[#2E3748] text-slate-100 rounded-md"
            >
              <Save className="w-3.5 h-3.5" /> Save Local
            </button>
            <button
              type="button"
              onClick={() => {
                onExportJson();
                setStatusMessage('Project JSON downloaded.');
              }}
              className="flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-medium bg-[#1C222D] hover:bg-[#252D3B] border border-[#2E3748] text-slate-100 rounded-md"
            >
              <FileJson className="w-3.5 h-3.5" /> Export JSON
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              file.text().then((txt) => {
                const ok = onImportJson(txt);
                setStatusMessage(
                  ok ? 'Project imported successfully.' : 'Invalid MPK Studio project file.'
                );
              });
              e.target.value = '';
            }}
          />

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-medium bg-[#161A22] hover:bg-[#202633] border border-[#293140] text-slate-300 rounded-md"
            >
              <Upload className="w-3.5 h-3.5" /> Import JSON
            </button>
            <button
              type="button"
              onClick={() => {
                onResetProject();
                setStatusMessage('Session reset to default MPC 3000 groove.');
              }}
              className="flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-medium bg-[#161A22] hover:bg-rose-950/50 border border-[#293140] hover:border-rose-800/60 text-slate-300 rounded-md"
            >
              <Download className="w-3.5 h-3.5 rotate-180" /> Reset Default
            </button>
          </div>
        </div>

        {statusMessage && (
          <p className="text-xs font-mono text-teal-300 bg-[#0D1317] border border-teal-900/60 rounded px-3 py-2">
            {statusMessage}
          </p>
        )}
      </div>
    </div>
  );
};
