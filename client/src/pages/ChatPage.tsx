import { useEffect, useRef, useState, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { startOfDay } from "date-fns";
import { type Message, type Conversation, type TypingIndicator, type UserPresence } from "@shared/schema";
import { ChatInput } from "@/components/ChatInput";
import { MessageBubble } from "@/components/MessageBubble";
import { EmptyState } from "@/components/EmptyState";
import { DateDivider } from "@/components/DateDivider";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Loader2, ArrowLeft, Phone, Video } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { 
  subscribeToConversationMessages,
  subscribeToTypingIndicators,
  setTypingIndicator,
  markConversationMessagesAsRead,
  subscribeToUserPresence 
} from "@/lib/firebase";

export default function ChatPage() {
  const [, params] = useRoute("/chat/:conversationId");
  const [, setLocation] = useLocation();
  const conversationId = params?.conversationId || "";
  
  const [username] = useState(() => {
    return localStorage.getItem("chatUsername") || "";
  });
  const [userId] = useState(() => {
    return localStorage.getItem("chatUserId") || "";
  });
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [typingIndicators, setTypingIndicators] = useState<TypingIndicator[]>([]);
  const [otherUserPresence, setOtherUserPresence] = useState<UserPresence | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { data: conversation } = useQuery<Conversation>({
    queryKey: ["/api/conversations", conversationId],
    enabled: !!conversationId,
  });

  useEffect(() => {
    if (!conversationId) {
      setLocation("/");
      return;
    }

    let unsubscribe: (() => void) | undefined;

    subscribeToConversationMessages(conversationId, (updatedMessages) => {
      setMessages(updatedMessages);
      setIsLoading(false);
      setShouldAutoScroll(true);
    }).then((unsub) => {
      unsubscribe = unsub;
    }).catch((error) => {
      console.error("Error subscribing to messages:", error);
      setIsLoading(false);
    });

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [conversationId, setLocation]);

  useEffect(() => {
    if (!conversationId) return;

    let unsubscribe: (() => void) | undefined;

    subscribeToTypingIndicators(conversationId, (indicators) => {
      const filteredIndicators = indicators.filter(
        indicator => indicator.userId !== userId
      );
      setTypingIndicators(filteredIndicators);
    }).then((unsub) => {
      unsubscribe = unsub;
    }).catch((error) => {
      console.error("Error subscribing to typing indicators:", error);
    });

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [conversationId, userId]);

  useEffect(() => {
    if (!conversationId || messages.length === 0) return;

    const otherUserId = messages.find(msg => msg.senderId !== userId)?.senderId;
    if (!otherUserId) return;

    let unsubscribe: (() => void) | undefined;

    subscribeToUserPresence(otherUserId, (presence) => {
      setOtherUserPresence(presence);
    }).then((unsub) => {
      unsubscribe = unsub;
    }).catch((error) => {
      console.error("Error subscribing to user presence:", error);
    });

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [conversationId, userId, messages]);

  useEffect(() => {
    if (!conversationId || messages.length === 0 || !userId) return;

    markConversationMessagesAsRead(conversationId, userId, messages).catch((error) => {
      console.error("Error marking messages as read:", error);
    });
  }, [conversationId, userId, messages]);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      setTypingIndicator(conversationId, userId, username, false).catch(console.error);
    };
  }, [conversationId, userId, username]);

  const handleTyping = () => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    setTypingIndicator(conversationId, userId, username, true).catch(console.error);

    typingTimeoutRef.current = setTimeout(() => {
      setTypingIndicator(conversationId, userId, username, false).catch(console.error);
    }, 2000);
  };

  const sendMessageMutation = useMutation({
    mutationFn: async (data: { 
      text?: string; 
      mediaUrl?: string; 
      mediaType?: string;
    }) => {
      return apiRequest("POST", `/api/conversations/${conversationId}/messages`, {
        conversationId,
        senderId: userId,
        senderUsername: username,
        text: data.text || "",
        mediaUrl: data.mediaUrl,
        mediaType: data.mediaType,
      });
    },
    onSuccess: () => {
      setShouldAutoScroll(true);
    },
  });

  const handleSendMessage = async (text: string, mediaUrl?: string, mediaType?: string) => {
    setTypingIndicator(conversationId, userId, username, false).catch(console.error);
    await sendMessageMutation.mutateAsync({ 
      text, 
      mediaUrl, 
      mediaType,
    });
  };


  const groupedMessages = useMemo(() => {
    const groups: { date: number; messages: Message[] }[] = [];
    let currentGroup: { date: number; messages: Message[] } | null = null;

    messages.forEach((message) => {
      const messageDate = startOfDay(message.timestamp).getTime();
      
      if (!currentGroup || currentGroup.date !== messageDate) {
        currentGroup = { date: messageDate, messages: [] };
        groups.push(currentGroup);
      }
      
      currentGroup.messages.push(message);
    });

    return groups;
  }, [messages]);

  useEffect(() => {
    if (shouldAutoScroll && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, shouldAutoScroll]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isAtBottom = Math.abs(scrollHeight - scrollTop - clientHeight) < 50;
      setShouldAutoScroll(isAtBottom);
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  let otherUsername = "User";
  let otherUserId: string | undefined;
  
  if (conversation && conversation.participants) {
    otherUserId = conversation.participants.find(id => id !== userId);
  }
  
  const otherUser = messages.find(msg => msg.senderId !== userId);
  if (otherUser) {
    otherUsername = otherUser.senderUsername;
    otherUserId = otherUser.senderId;
  }

  const getInitials = (name: string) => {
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      <div className="border-b bg-background dark:bg-background">
        <div className="py-3 pl-2 pr-4 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation("/")}
              data-testid="button-back"
              className="hover-elevate active-elevate-2 flex-shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="relative flex-shrink-0">
              <Avatar className="w-10 h-10 border-2 border-border">
                <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                  {getInitials(otherUsername)}
                </AvatarFallback>
              </Avatar>
              {otherUserPresence && (
                <div 
                  className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-background ${
                    otherUserPresence.online ? 'bg-green-500 online-pulse' : 'bg-muted-foreground/50'
                  }`}
                  data-testid={otherUserPresence.online ? "status-online" : "status-offline"}
                />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold truncate" data-testid="text-chat-header">{otherUsername}</h2>
              {typingIndicators.length > 0 ? (
                <p className="text-xs text-primary flex items-center gap-1">
                  typing
                  <span className="inline-flex gap-0.5">
                    <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                </p>
              ) : otherUserPresence?.online ? (
                <p className="text-xs text-green-500">Online</p>
              ) : (
                <p className="text-xs text-muted-foreground">Offline</p>
              )}
            </div>
          </div>
        
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="hover-elevate active-elevate-2"
              data-testid="button-video-call"
            >
              <Video className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="hover-elevate active-elevate-2"
              data-testid="button-voice-call"
            >
              <Phone className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div className="px-4 py-2 bg-muted/30 border-t border-border/50">
          <p className="text-xs text-center text-muted-foreground" data-testid="text-auto-delete-notice">
            Messages automatically delete after 24 hours
          </p>
        </div>
      </div>

      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto px-4 py-6 custom-scrollbar bg-gradient-to-b from-background to-background/95"
      >
        <div className="max-w-5xl mx-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : messages.length === 0 ? (
            <EmptyState />
          ) : (
            groupedMessages.map((group) => (
              <div key={group.date} className="fade-in">
                <DateDivider timestamp={group.date} />
                {group.messages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    isOwnMessage={message.senderId === userId}
                  />
                ))}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <ChatInput 
        onSendMessage={handleSendMessage} 
        username={username} 
        onTyping={handleTyping}
      />
    </div>
  );
}
