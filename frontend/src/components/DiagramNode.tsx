import { memo, useCallback } from 'react';
import { Handle, Position, NodeProps, useReactFlow } from 'reactflow';
import { NodeType } from '@/types/diagram';
import { MoreVertical } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const nodeConfig = {
  service: { color: 'hsl(var(--node-service))' },
  database: { color: 'hsl(var(--node-database))' },
  decision: { color: 'hsl(var(--node-decision))' },
  action: { color: 'hsl(var(--node-action))' }
};

export const DiagramNode = memo(({ id, data, selected }: NodeProps) => {
  const nodeType = data.nodeType as NodeType || 'service';
  const config = nodeConfig[nodeType];
  const isDraft = (data.confidence || 1) < 0.85;
  const { setNodes } = useReactFlow();

  const sizeScale: number = typeof (data as any).sizeScale === 'number' ? (data as any).sizeScale : 1;

  // Map levels 1-5 into a tighter 1.0 → 3.0 range (no larger sizes), evenly spaced
  const levelToScale = (level: number) => 1 + (Math.max(1, Math.min(5, level)) - 1) * 0.5; // 1.0,1.5,2.0,2.5,3.0

  const handleSelectSize = useCallback((level: number) => {
    const scale = levelToScale(level);
    setNodes((nodes) => nodes.map((n) => {
      if (n.id !== id) return n;
      return { ...n, data: { ...n.data, sizeScale: scale, sizeLevel: level } } as any;
    }));
  }, [id, setNodes]);

  return (
    <div 
      className={`
        relative px-4 py-3 rounded-lg bg-card/90 backdrop-blur-sm border-2 shadow-2xl
        transition-all duration-300 min-w-[180px]
        ${selected ? 'ring-2 ring-primary/60 ring-offset-2 ring-offset-background' : ''}
        ${isDraft ? 'border-dashed border-muted-foreground/40' : ''}
      `}
      style={{
        borderColor: selected 
          ? (data.color || config.color) 
          : (data.color || 'hsl(var(--border))'),
        transform: `scale(${sizeScale})`,
        transformOrigin: 'center',
      }}
    >
      {/* Edit dropdown */}
      <div className="absolute top-1 right-1 z-10">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-accent text-muted-foreground">
              <MoreVertical className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuLabel>Edit</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => handleSelectSize(1)}>Size: 1</DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleSelectSize(2)}>Size: 2</DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleSelectSize(3)}>Size: 3</DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleSelectSize(4)}>Size: 4</DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleSelectSize(5)}>Size: 5</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Handle type="target" position={Position.Top} className="!bg-primary" />
      
      {/* Speaker banner */}
      <div className="-mx-4 -mt-3 mb-2 px-4 py-2 rounded-t-lg bg-accent/40 border-b border-border flex items-center gap-2">
        <Avatar className="h-6 w-6">
          {/* Optional image placeholder; fallback shows initials */}
          <AvatarImage src="" alt="Speaker" />
          <AvatarFallback className="text-[10px]">AC</AvatarFallback>
        </Avatar>
        <div className="text-xs font-medium tracking-wide text-foreground/80">Alex Chen</div>
      </div>
      
      <div className="flex-1 min-w-0">
        {/* Summary only */}
        <div className="text-sm text-muted-foreground mt-1.5 leading-relaxed" title={data.summary || 'Talked about the topic and next steps.'}>
          {data.summary || 'Talked about building the Knowledge Graph service and next steps.'}
        </div>
        {isDraft && (
          <div className="text-xs font-mono text-yellow-500/80 mt-1.5">DRAFT</div>
        )}
      </div>
      
      <Handle type="source" position={Position.Bottom} className="!bg-primary" />
    </div>
  );
});

DiagramNode.displayName = 'DiagramNode';
