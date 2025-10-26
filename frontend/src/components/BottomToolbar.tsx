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
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50">
      <div className="flex items-center gap-2 px-2 py-1 rounded-full border border-border bg-card shadow-lg">
        <Button
          onClick={() => onQuickAddNode({ label: 'New Node', color: '#22c55e' })}
          size="icon"
          className="rounded-full h-10 w-10"
          title="Add Node"
        >
          <Plus className="w-5 h-5" />
        </Button>
        <Button
          onClick={handleColor}
          size="icon"
          variant="outline"
          className="rounded-full h-10 w-10"
          title="Add Node with Color"
        >
          <Droplet className="w-5 h-5" />
        </Button>
      </div>
    </div>
  );
};

export default BottomToolbar;


