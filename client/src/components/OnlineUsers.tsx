import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { type ConversationWithDetails, type UserPresence } from "@shared/schema";

interface OnlineUsersProps {
  conversations: ConversationWithDetails[];
  onlineUsers: Map<string, UserPresence>;
  onSelectConversation: (conversationId: string) => void;
}

export function OnlineUsers({ conversations, onlineUsers, onSelectConversation }: OnlineUsersProps) {
  const getInitials = (name: string) => {
    return name.substring(0, 2).toUpperCase();
  };

  const onlineConversations = conversations.filter(conv => 
    conv.otherUser && onlineUsers.get(conv.otherUser.id)?.online
  );

  if (onlineConversations.length === 0) return null;

  return (
    <div className="px-4 py-3 border-b border-border/50">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Online now</h3>
        <span className="text-xs text-muted-foreground">
          {onlineConversations.length}
        </span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 custom-scrollbar">
        {onlineConversations.map((conversation) => (
          <button
            key={conversation.id}
            onClick={() => onSelectConversation(conversation.id)}
            className="flex flex-col items-center gap-2 min-w-[60px] hover-elevate p-2 rounded-lg smooth-transition"
            data-testid={`button-online-user-${conversation.id}`}
          >
            <div className="relative">
              <Avatar className="w-12 h-12 border-2 border-primary/30">
                <AvatarFallback className="bg-primary/20 text-primary text-sm font-semibold">
                  {conversation.otherUser ? getInitials(conversation.otherUser.username) : "??"}
                </AvatarFallback>
              </Avatar>
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-sidebar online-pulse" />
            </div>
            <p className="text-xs font-medium truncate w-full text-center text-foreground">
              {conversation.otherUser?.username.split(' ')[0] || "Unknown"}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
