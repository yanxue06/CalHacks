import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { NodeType } from '@/types/diagram';
import { Database, Lightbulb, CheckCircle2, Server } from 'lucide-react';

const nodeConfig = {
  service: { icon: Server, color: 'hsl(var(--node-service))', label: 'Service' },
  database: { icon: Database, color: 'hsl(var(--node-database))', label: 'Database' },
  decision: { icon: Lightbulb, color: 'hsl(var(--node-decision))', label: 'Decision' },
  action: { icon: CheckCircle2, color: 'hsl(var(--node-action))', label: 'Action' }
};

export const DiagramNode = memo(({ data, selected }: NodeProps) => {
  const nodeType = data.nodeType as NodeType || 'service';
  const config = nodeConfig[nodeType];
  const Icon = config.icon;
  const isDraft = (data.confidence || 1) < 0.85;

  return (
    <div 
      className={`
        relative px-4 py-3 rounded-lg bg-card border-2 shadow-lg
        transition-all duration-300 min-w-[180px]
        ${selected ? 'ring-2 ring-primary ring-offset-2' : ''}
        ${isDraft ? 'border-dashed border-muted-foreground/40' : 'border-border'}
      `}
      style={{
        borderColor: selected ? config.color : undefined,
      }}
    >
      <Handle type="target" position={Position.Left} className="!bg-primary" />
      
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
      
      <Handle type="source" position={Position.Right} className="!bg-primary" />
    </div>
  );
});

DiagramNode.displayName = 'DiagramNode';
