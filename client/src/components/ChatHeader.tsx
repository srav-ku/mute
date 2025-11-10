import { MessageCircle } from "lucide-react";

export function ChatHeader() {
  return (
    <header className="h-16 border-b border-border bg-card flex items-center justify-between px-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
          <MessageCircle className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground" data-testid="text-app-title">
            Chat Room
          </h1>
          <p className="text-xs text-muted-foreground">Real-time messaging</p>
        </div>
      </div>
    </header>
  );
}
