import { memo, useCallback } from 'react';
import { Handle, Position, NodeProps, useReactFlow } from 'reactflow';
import { NodeType } from '@/types/diagram';
import { Database, Lightbulb, CheckCircle2, Server, MoreVertical } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const nodeConfig = {
  service: { icon: Server, color: 'hsl(var(--node-service))', label: 'Service' },
  database: { icon: Database, color: 'hsl(var(--node-database))', label: 'Database' },
  decision: { icon: Lightbulb, color: 'hsl(var(--node-decision))', label: 'Decision' },
  action: { icon: CheckCircle2, color: 'hsl(var(--node-action))', label: 'Action' }
};

export const DiagramNode = memo(({ id, data, selected }: NodeProps) => {
  const nodeType = data.nodeType as NodeType || 'service';
  const config = nodeConfig[nodeType];
  const Icon = config.icon;
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
        relative px-4 py-3 rounded-lg bg-card border-2 shadow-lg
        transition-all duration-300 min-w-[180px]
        ${selected ? 'ring-2 ring-primary ring-offset-2' : ''}
        ${isDraft ? 'border-dashed border-muted-foreground/40' : 'border-border'}
      `}
      style={{
        borderColor: selected ? (data.color || config.color) : (data.color || undefined),
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
      
      <div className="flex items-start gap-2">
        <div 
          className="p-1.5 rounded-md shrink-0"
          style={{ backgroundColor: `${config.color}20` }}
        >
          <Icon className="w-4 h-4" style={{ color: config.color }} />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="text-xs text-muted-foreground mb-1">{config.label}</div>
          <div className="font-medium text-sm text-foreground leading-tight">
            {data.label}
          </div>
          {isDraft && (
            <div className="text-xs text-muted-foreground mt-1">Draft</div>
          )}
        </div>
      </div>
      
      <Handle type="source" position={Position.Bottom} className="!bg-primary" />
    </div>
  );
});

DiagramNode.displayName = 'DiagramNode';
