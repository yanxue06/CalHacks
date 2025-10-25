import { Button } from '@/components/ui/button';
import { Play, Square, Save, Download, Maximize2 } from 'lucide-react';
import { RecordingStatus } from '@/types/diagram';

interface ToolbarProps {
  status: RecordingStatus;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onSave: () => void;
  onExport: () => void;
  onRecenter: () => void;
}

export const Toolbar = ({
  status,
  onStartRecording,
  onStopRecording,
  onSave,
  onExport,
  onRecenter
}: ToolbarProps) => {
  const isRecording = status === 'listening' || status === 'processing' || status === 'finalizing';

  return (
    <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-card">
      <div className="flex items-center gap-2">
        {!isRecording ? (
          <Button 
            onClick={onStartRecording}
            className="gap-2"
            size="sm"
          >
            <Play className="w-4 h-4" />
            Start Recording
          </Button>
        ) : (
          <Button 
            onClick={onStopRecording}
            variant="destructive"
            className="gap-2"
            size="sm"
            disabled={status === 'finalizing'}
          >
            <Square className="w-4 h-4" />
            Stop Recording
          </Button>
        )}
      </div>

      <div className="h-6 w-px bg-border mx-2" />

      <Button
        onClick={onSave}
        variant="outline"
        size="sm"
        className="gap-2"
      >
        <Save className="w-4 h-4" />
        Save
      </Button>

      <Button
        onClick={onExport}
        variant="outline"
        size="sm"
        className="gap-2"
      >
        <Download className="w-4 h-4" />
        Export PNG
      </Button>

      <Button
        onClick={onRecenter}
        variant="outline"
        size="sm"
        className="gap-2"
      >
        <Maximize2 className="w-4 h-4" />
        Recenter
      </Button>
    </div>
  );
};
