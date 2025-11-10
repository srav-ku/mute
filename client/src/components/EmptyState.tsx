import { MessageCircle } from "lucide-react";

export function EmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center">
        <MessageCircle className="w-20 h-20 mx-auto text-muted-foreground/20 mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">
          No messages yet
        </h3>
        <p className="text-sm text-muted-foreground" data-testid="text-empty-state">
          Start chatting by sending your first message!
        </p>
      </div>
    </div>
  );
}
