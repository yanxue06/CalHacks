import { RecordingStatus } from '@/types/diagram';
import { Loader2, Mic, CheckCircle2 } from 'lucide-react';

interface StatusBannerProps {
  status: RecordingStatus;
}

const statusConfig = {
  idle: { text: '', icon: null, bgColor: '', textColor: '' },
  listening: { 
    text: 'Listening to conversation...', 
    icon: Mic, 
    bgColor: 'hsl(var(--status-listening) / 0.1)',
    textColor: 'hsl(var(--status-listening))'
  },
  processing: { 
    text: 'Processing updates...', 
    icon: Loader2, 
    bgColor: 'hsl(var(--status-processing) / 0.1)',
    textColor: 'hsl(var(--status-processing))'
  },
  finalizing: { 
    text: 'Finalizing diagram and extracting insights...', 
    icon: Loader2,
    bgColor: 'hsl(var(--status-success) / 0.1)',
    textColor: 'hsl(var(--status-success))'
  }
};

export const StatusBanner = ({ status }: StatusBannerProps) => {
  if (status === 'idle') return null;

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div 
      className="flex items-center gap-3 px-6 py-3 border-b border-border/50 backdrop-blur-xl animate-in fade-in slide-in-from-top-2"
      style={{ backgroundColor: config.bgColor }}
    >
      {Icon && (
        <Icon 
          className={`w-4 h-4 ${Icon === Loader2 ? 'animate-spin' : ''}`}
          style={{ color: config.textColor }}
        />
      )}
      <span className="text-sm font-medium font-mono" style={{ color: config.textColor }}>
        {config.text}
      </span>
    </div>
  );
};
