import { Button } from '@/components/ui/button';
import { Plus, Droplet } from 'lucide-react';

interface BottomToolbarProps {
  onQuickAddNode: (opts: { label: string; color: string }) => void;
}

export const BottomToolbar = ({ onQuickAddNode }: BottomToolbarProps) => {
  const handleColor = () => {
    const color = prompt('Hex color (e.g. #22c55e)', '#22c55e') || '#22c55e';
    const label = prompt('Node label', 'New Node') || 'New Node';
    onQuickAddNode({ label, color });
  };

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50">
      <div className="flex items-center gap-2 px-3 py-2 rounded-full border border-border/80 bg-card/90 backdrop-blur-xl shadow-2xl">
        <Button
          onClick={() => onQuickAddNode({ label: 'New Node', color: '#22c55e' })}
          size="icon"
          className="rounded-full h-10 w-10 bg-white text-black hover:bg-white/90 transition-all"
          title="Add Node"
        >
          <Plus className="w-5 h-5" />
        </Button>
        <Button
          onClick={handleColor}
          size="icon"
          variant="ghost"
          className="rounded-full h-10 w-10 text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
          title="Add Node with Color"
        >
          <Droplet className="w-5 h-5" />
        </Button>
      </div>
    </div>
  );
};

export default BottomToolbar;


