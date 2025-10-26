import { Button } from '@/components/ui/button';
import { Play, Square, Save, Download, Maximize2, Trash2, Settings, Sun, Moon } from 'lucide-react';
import { RecordingStatus } from '@/types/diagram';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useEffect, useState } from 'react';

interface ToolbarProps {
  status: RecordingStatus;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onSave: () => void;
  onExport: () => void;
  onRecenter: () => void;
  onClear: () => void;
}

export const Toolbar = ({
  status,
  onStartRecording,
  onStopRecording,
  onSave,
  onExport,
  onRecenter,
  onClear
}: ToolbarProps) => {
  const isRecording = status === 'listening' || status === 'processing' || status === 'finalizing';
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    // Check if user has a saved preference
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.classList.toggle('dark', savedTheme === 'dark');
    } else {
      // Default to dark
      document.documentElement.classList.add('dark');
    }
  }, []);

  const toggleTheme = (newTheme: 'light' | 'dark') => {
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
  };

  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-border/50 bg-card/80 backdrop-blur-xl">
      <div className="flex items-center gap-6">
        <h1 className="text-lg font-semibold tracking-tight">ConvoGraph</h1>
        
        <div className="flex items-center gap-3 ml-4">
          {!isRecording ? (
            <Button 
              onClick={onStartRecording}
              className="gap-2 font-medium bg-white text-black hover:bg-white/90"
              size="sm"
            >
              <Play className="w-3.5 h-3.5" />
              Start
            </Button>
          ) : (
            <Button 
              onClick={onStopRecording}
              variant="destructive"
              className="gap-2 font-medium"
              size="sm"
              disabled={status === 'finalizing'}
            >
              <Square className="w-3.5 h-3.5" />
              Stop
            </Button>
          )}

          <div className="h-4 w-px bg-border" />

          <Button
            onClick={onSave}
            variant="ghost"
            size="sm"
            className="gap-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent"
          >
            <Save className="w-3.5 h-3.5" />
            Save
          </Button>

          <Button
            onClick={onExport}
            variant="ghost"
            size="sm"
            className="gap-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent"
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </Button>

          <Button
            onClick={onRecenter}
            variant="ghost"
            size="sm"
            className="gap-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            Recenter
          </Button>

          <Button
            onClick={onClear}
            variant="ghost"
            size="sm"
            className="gap-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear
          </Button>
        </div>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground hover:bg-accent"
          >
            <Settings className="w-5 h-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel>Appearance</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem 
            onClick={() => toggleTheme('light')}
            className="gap-2 cursor-pointer"
          >
            <Sun className="w-4 h-4" />
            <span>Light Mode</span>
            {theme === 'light' && <span className="ml-auto text-xs">✓</span>}
          </DropdownMenuItem>
          <DropdownMenuItem 
            onClick={() => toggleTheme('dark')}
            className="gap-2 cursor-pointer"
          >
            <Moon className="w-4 h-4" />
            <span>Dark Mode</span>
            {theme === 'dark' && <span className="ml-auto text-xs">✓</span>}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
