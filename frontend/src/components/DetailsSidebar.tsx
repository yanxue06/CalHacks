import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { DiagramNode, DiagramEdge, Decision, ActionItem } from '@/types/diagram';
import { Clock, User, MessageSquareQuote, CheckCircle2, Lightbulb, Mic } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface DetailsSidebarProps {
  selectedNode: DiagramNode | null;
  selectedEdge: DiagramEdge | null;
  decisions: Decision[];
  actionItems: ActionItem[];
  transcriptions?: Array<{
    id: string;
    text: string;
    timestamp: string;
    confidence: number;
    duration: number;
  }>;
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
  actionItems,
  transcriptions = []
}: DetailsSidebarProps) => {
  const hasSelection = selectedNode || selectedEdge;
  const sourceRefs = (selectedNode?.data.sourceRefs || selectedEdge?.data.sourceRefs || []);

  return (
    <div className="w-96 border-l border-border bg-card flex flex-col">
      <Tabs defaultValue="details" className="flex-1 flex flex-col">
        <TabsList className="w-full rounded-none border-b border-border bg-transparent p-0">
          <TabsTrigger 
            value="details" 
            className="flex-1 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary"
          >
            Details
          </TabsTrigger>
          <TabsTrigger 
            value="transcriptions"
            className="flex-1 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary"
          >
            <Mic className="w-4 h-4 mr-1" />
            Voice
          </TabsTrigger>
          <TabsTrigger 
            value="next-steps"
            className="flex-1 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary"
          >
            Next Steps
          </TabsTrigger>
        </TabsList>

        <ScrollArea className="flex-1">
          <TabsContent value="details" className="m-0 p-4 space-y-4">
            {!hasSelection ? (
              <div className="text-center py-12 text-muted-foreground">
                <MessageSquareQuote className="w-12 h-12 mx-auto mb-3 opacity-40" />
                <p className="text-sm">Select a node or edge to view details</p>
              </div>
            ) : (
              <>
                <div>
                  <h3 className="font-semibold mb-2">
                    {selectedNode ? selectedNode.data.label : 'Connection'}
                  </h3>
                  {selectedNode && (
                    <p className="text-sm text-muted-foreground capitalize">
                      {selectedNode.type}
                    </p>
                  )}
                  {selectedEdge && (
                    <p className="text-sm text-muted-foreground capitalize">
                      {selectedEdge.type}
                    </p>
                  )}
                </div>

                <div>
                  <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <MessageSquareQuote className="w-4 h-4" />
                    Source Quotes
                  </h4>
                  <div className="space-y-3">
                    {sourceRefs.map((ref, idx) => (
                      <Card key={idx} className="p-3 space-y-2">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <User className="w-3 h-3" />
                          <span className="font-medium">{ref.speaker}</span>
                          <span>•</span>
                          <Clock className="w-3 h-3" />
                          <span>{formatTimestamp(ref.timestamp)}</span>
                        </div>
                        <p className="text-sm italic text-foreground">
                          "{ref.quote}"
                        </p>
                      </Card>
                    ))}
                  </div>
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="transcriptions" className="m-0 p-4 space-y-4">
            {transcriptions.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Mic className="w-12 h-12 mx-auto mb-3 opacity-40" />
                <p className="text-sm">No transcriptions yet</p>
                <p className="text-xs mt-1">Upload audio files to see transcriptions here</p>
              </div>
            ) : (
              <div className="space-y-3">
                <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Mic className="w-4 h-4" />
                  Voice Transcriptions ({transcriptions.length})
                </h4>
                {transcriptions.map((transcription) => (
                  <Card key={transcription.id} className="p-3 space-y-2">
                    <p className="text-sm">{transcription.text}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      <span>{new Date(transcription.timestamp).toLocaleTimeString()}</span>
                      <span>•</span>
                      <span>{transcription.duration.toFixed(1)}s</span>
                      <span>•</span>
                      <span>Confidence: {Math.round(transcription.confidence * 100)}%</span>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="next-steps" className="m-0 p-4 space-y-4">
            {decisions.length === 0 && actionItems.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-40" />
                <p className="text-sm">Stop recording to see decisions and action items</p>
              </div>
            ) : (
              <>
                {decisions.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                      <Lightbulb className="w-4 h-4" />
                      Decisions ({decisions.length})
                    </h4>
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
                  </div>
                )}

                {actionItems.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      Action Items ({actionItems.length})
                    </h4>
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
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );
};
