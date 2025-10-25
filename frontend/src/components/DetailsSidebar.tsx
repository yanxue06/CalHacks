import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { DiagramNode, DiagramEdge, Decision, ActionItem } from '@/types/diagram';
import { Clock, User, CheckCircle2, Lightbulb } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface DetailsSidebarProps {
  selectedNode: DiagramNode | null;
  selectedEdge: DiagramEdge | null;
  decisions: Decision[];
  actionItems: ActionItem[];
}

const formatTimestamp = (timestamp: number) => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export const DetailsSidebar = ({ 
  selectedNode, 
  selectedEdge, 
  decisions, 
  actionItems 
}: DetailsSidebarProps) => {
  // The new panel focuses on Key Actionables; selection is not displayed

  return (
    <div className="w-96 border-l border-border bg-card flex flex-col">
      <Tabs defaultValue="key" className="flex-1 flex flex-col">
        <TabsList className="w-full rounded-none border-b border-border bg-transparent p-0">
          <TabsTrigger 
            value="key" 
            className="flex-1 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary"
          >
            Key Actionables
          </TabsTrigger>
        </TabsList>

        <ScrollArea className="flex-1">
          <TabsContent value="key" className="m-0 p-4 space-y-4">
            <div>
              <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Actionables ({actionItems.length})
              </h4>
              {actionItems.length === 0 ? (
                <Card className="p-3 text-sm text-muted-foreground">No actionables yet. Stop recording to generate them.</Card>
              ) : (
                <div className="space-y-2">
                  {actionItems.map((item, idx) => (
                    <Card key={idx} className="p-3 space-y-2">
                      <p className="text-sm font-medium">{item.text}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {item.owner && (
                          <>
                            <User className="w-3 h-3" />
                            <span className="font-medium">{item.owner}</span>
                            <span>•</span>
                          </>
                        )}
                        <Clock className="w-3 h-3" />
                        <span>{formatTimestamp(item.sourceRef.timestamp)}</span>
                      </div>
                      {item.confidence < 0.85 && (
                        <div className="text-xs text-muted-foreground">
                          Confidence: {Math.round(item.confidence * 100)}%
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                <Lightbulb className="w-4 h-4" />
                Decisions ({decisions.length})
              </h4>
              {decisions.length === 0 ? (
                <Card className="p-3 text-sm text-muted-foreground">No decisions yet. Stop recording to generate them.</Card>
              ) : (
                <div className="space-y-2">
                  {decisions.map((decision, idx) => (
                    <Card key={idx} className="p-3 space-y-2">
                      <p className="text-sm font-medium">{decision.text}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <User className="w-3 h-3" />
                        <span>{decision.sourceRef.speaker}</span>
                        <span>•</span>
                        <Clock className="w-3 h-3" />
                        <span>{formatTimestamp(decision.sourceRef.timestamp)}</span>
                      </div>
                      {decision.confidence < 0.85 && (
                        <div className="text-xs text-muted-foreground">
                          Confidence: {Math.round(decision.confidence * 100)}%
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );
};
