import { Button } from '@/components/ui/button';
<<<<<<< HEAD
import { Play, Square, Save, Download, Maximize2, Upload } from 'lucide-react';
=======
import { Play, Square, Save, Download, Maximize2, Trash2 } from 'lucide-react';
>>>>>>> 5ed7b8c6c818a99b5f764f278637967d1caf8350
import { RecordingStatus } from '@/types/diagram';
import { useRef } from 'react';

interface ToolbarProps {
  status: RecordingStatus;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onSave: () => void;
  onExport: () => void;
  onRecenter: () => void;
<<<<<<< HEAD
  onUploadAudio?: (file: File) => void;
=======
  onClear: () => void;
>>>>>>> 5ed7b8c6c818a99b5f764f278637967d1caf8350
}

export const Toolbar = ({
  status,
  onStartRecording,
  onStopRecording,
  onSave,
  onExport,
  onRecenter,
<<<<<<< HEAD
  onUploadAudio
=======
  onClear
>>>>>>> 5ed7b8c6c818a99b5f764f278637967d1caf8350
}: ToolbarProps) => {
  const isRecording = status === 'listening' || status === 'processing' || status === 'finalizing';
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && onUploadAudio) {
      onUploadAudio(file);
    }
    // Reset the input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

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

      {isRecording && onUploadAudio && (
        <>
          <div className="h-6 w-px bg-border mx-2" />
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleFileUpload}
            className="hidden"
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            variant="outline"
            size="sm"
            className="gap-2"
          >
            <Upload className="w-4 h-4" />
            Upload Audio
          </Button>
        </>
      )}

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

      <Button
        onClick={onClear}
        variant="outline"
        size="sm"
        className="gap-2"
      >
        <Trash2 className="w-4 h-4" />
        Clear
      </Button>
    </div>
  );
};
