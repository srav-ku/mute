import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { type ConversationWithDetails, type UserPresence } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { CheckCheck } from "lucide-react";

interface ConversationsListProps {
  conversations: ConversationWithDetails[];
  onlineUsers: Map<string, UserPresence>;
  selectedConversationId?: string;
  userId: string;
  onSelectConversation: (conversationId: string) => void;
}

export function ConversationsList({
  conversations,
  onlineUsers,
  selectedConversationId,
  userId,
  onSelectConversation,
}: ConversationsListProps) {
  const getInitials = (name: string) => {
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar">
      <div className="px-2 py-1">
        {conversations.map((conversation) => {
          const presence = conversation.otherUser ? onlineUsers.get(conversation.otherUser.id) : null;
          const isOnline = presence?.online || false;
          const isSelected = conversation.id === selectedConversationId;
          const lastMessage = conversation.lastMessage;
          const isOwnMessage = lastMessage?.senderId === userId;

          return (
            <button
              key={conversation.id}
              onClick={() => onSelectConversation(conversation.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-lg smooth-transition hover-elevate active-elevate-2 mb-1 ${
                isSelected ? 'bg-sidebar-accent' : ''
              }`}
              data-testid={`button-conversation-${conversation.id}`}
            >
              <div className="relative flex-shrink-0">
                <Avatar className="w-12 h-12">
                  <AvatarFallback className="bg-primary/20 text-primary font-semibold">
                    {conversation.otherUser ? getInitials(conversation.otherUser.username) : "??"}
                  </AvatarFallback>
                </Avatar>
                {isOnline && (
                  <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-sidebar" />
                )}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <div className="flex items-center justify-between mb-1">
                  <p className="font-semibold text-foreground truncate" data-testid={`text-conversation-user-${conversation.id}`}>
                    {conversation.otherUser?.username || "Unknown User"}
                  </p>
                  {lastMessage && (
                    <p className="text-xs text-muted-foreground flex-shrink-0 ml-2" data-testid={`text-last-message-time-${conversation.id}`}>
                      {formatDistanceToNow(lastMessage.timestamp, { addSuffix: false })}
                    </p>
                  )}
                </div>
                {lastMessage && (
                  <div className="flex items-center gap-1">
                    {isOwnMessage && !lastMessage.deleted && (
                      <CheckCheck className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                    )}
                    <p className="text-sm text-muted-foreground truncate" data-testid={`text-last-message-${conversation.id}`}>
                      {lastMessage.deleted 
                        ? "[Message deleted]" 
                        : lastMessage.text || "Media"}
                    </p>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
