import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { startOfDay } from "date-fns";
import { type ConversationWithDetails, type User, type UserPresence, type Message, type TypingIndicator, type Call, type GroupWithDetails } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  subscribeToUserPresence,
  subscribeToConversationMessages,
  subscribeToTypingIndicators,
  setTypingIndicator,
  markConversationMessagesAsRead
} from "@/lib/firebase";
import { 
  WebRTCService, 
  subscribeToIncomingCalls, 
  removeIncomingCall, 
  sendIncomingCall,
  initializeCallState,
  subscribeToCallStateWithRemoval 
} from "@/lib/webrtc";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ChatInput } from "@/components/ChatInput";
import { MessageBubble } from "@/components/MessageBubble";
import { DateDivider } from "@/components/DateDivider";
import { IncomingCallModal } from "@/components/IncomingCallModal";
import { ActiveCallUI } from "@/components/ActiveCallUI";
import { SettingsView } from "@/components/SettingsView";
import { ExitConfirmDialog } from "@/components/ExitConfirmDialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  Search, 
  Loader2, 
  Plus,
  Mail,
  Users,
  Settings,
  Phone,
  Video,
  MoreHorizontal,
  MessageCircle,
  X,
  LogOut,
  Trash2,
  Menu,
  ArrowLeft
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useNavigationManager } from "@/hooks/useNavigationManager";
import { setUserPresence } from "@/lib/firebase";

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function ConversationsListPage() {
  const [, setLocation] = useLocation();
  const [matchChat, paramsChat] = useRoute("/chat/:conversationId");
  const [matchGroup, paramsGroup] = useRoute("/group/:groupId");
  const selectedConversationId = matchChat && paramsChat ? paramsChat.conversationId : matchGroup && paramsGroup ? paramsGroup.groupId : null;
  const isGroupChat = matchGroup && paramsGroup ? true : false;
  
  const navigationManager = useNavigationManager();
  const { navState, showExitDialog, openChat, openGroup, openGroups, openSettings, goToInbox, handleExitResponse } = navigationManager;
  
  const [currentView, setCurrentView] = useState<"inbox" | "groups" | "settings">("inbox");
  const [searchQuery, setSearchQuery] = useState("");
  const [onlineUsers, setOnlineUsers] = useState<Map<string, UserPresence>>(new Map());
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [typingIndicators, setTypingIndicators] = useState<TypingIndicator[]>([]);
  const [otherUserPresence, setOtherUserPresence] = useState<UserPresence | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const [incomingCall, setIncomingCall] = useState<Call | null>(null);
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const [webrtcService, setWebrtcService] = useState<WebRTCService | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const isEndingCallRef = useRef(false);
  
  const [groupsTab, setGroupsTab] = useState<"my-groups" | "discover">("my-groups");
  const [groupsSearchQuery, setGroupsSearchQuery] = useState("");
  const [showCreateGroupDialog, setShowCreateGroupDialog] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDescription, setNewGroupDescription] = useState("");
  const [showGroupMembersSheet, setShowGroupMembersSheet] = useState(false);
  const [pendingMemberNavigation, setPendingMemberNavigation] = useState<User | null>(null);
  const [showDeleteGroupDialog, setShowDeleteGroupDialog] = useState(false);
  
  const userId = localStorage.getItem("chatUserId");
  const username = localStorage.getItem("chatUsername");
  const { toast } = useToast();

  useEffect(() => {
    if (!userId || !username) {
      setLocation("/login");
    }
  }, [userId, username, setLocation]);

  useEffect(() => {
    const handleNavigationChange = (event: Event) => {
      const customEvent = event as CustomEvent;
      const newView = customEvent.detail?.view;
      
      if (newView === "inbox") {
        setCurrentView("inbox");
      } else if (newView === "groups") {
        setCurrentView("groups");
      } else if (newView === "settings") {
        setCurrentView("settings");
      }
    };

    window.addEventListener("navigation-change", handleNavigationChange);
    return () => window.removeEventListener("navigation-change", handleNavigationChange);
  }, []);

  useEffect(() => {
    if (pendingMemberNavigation && !showGroupMembersSheet) {
      handleStartConversation(pendingMemberNavigation);
      setPendingMemberNavigation(null);
    }
  }, [pendingMemberNavigation, showGroupMembersSheet]);

  const { data: conversations = [], isLoading: loadingConversations } = useQuery<ConversationWithDetails[]>({
    queryKey: [`/api/conversations?userId=${userId}`],
    enabled: !!userId,
  });

  const { data: searchResults = [], isLoading: searchLoading } = useQuery<User[]>({
    queryKey: [`/api/users/search?q=${encodeURIComponent(searchQuery)}`],
    enabled: searchQuery.trim().length > 0,
  });

  // Filter existing conversations by username match
  const matchingConversations = useMemo(() => {
    if (!searchQuery.trim()) return [];
    
    const searchLower = searchQuery.toLowerCase();
    
    return conversations.filter(conv => 
      conv.otherUser?.username.toLowerCase().includes(searchLower)
    );
  }, [conversations, searchQuery]);

  // Get IDs of users who already have conversations
  const existingConversationUserIds = useMemo(() => {
    return new Set(conversations.map(conv => conv.otherUser?.id).filter(Boolean));
  }, [conversations]);

  // Filter search results to exclude current user and users with existing conversations
  const filteredSearchResults = useMemo(() => {
    return searchResults.filter(user => 
      user.id !== userId && !existingConversationUserIds.has(user.id)
    );
  }, [searchResults, userId, existingConversationUserIds]);

  const { data: myGroups = [], isLoading: loadingMyGroups } = useQuery<GroupWithDetails[]>({
    queryKey: ["/api/groups/my"],
    enabled: !!userId,
  });

  const { data: selectedGroupData, isLoading: isLoadingGroupData } = useQuery<GroupWithDetails>({
    queryKey: ["/api/groups", selectedConversationId],
    enabled: !!selectedConversationId && isGroupChat,
    staleTime: 0,
    refetchOnMount: 'always',
    placeholderData: undefined,
  });

  const { data: groupMembers = [], isLoading: isLoadingGroupMembers } = useQuery<User[]>({
    queryKey: ["/api/groups", selectedConversationId, "members"],
    queryFn: async () => {
      const response = await fetch(`/api/groups/${selectedConversationId}/members`);
      if (!response.ok) throw new Error("Failed to fetch group members");
      return response.json();
    },
    enabled: !!selectedConversationId && isGroupChat,
    staleTime: 0,
    refetchOnMount: 'always',
    placeholderData: undefined,
  });

  const { data: allGroups = [], isLoading: loadingAllGroups } = useQuery<GroupWithDetails[]>({
    queryKey: ["/api/groups", groupsSearchQuery],
    queryFn: async () => {
      const url = groupsSearchQuery ? `/api/groups?q=${encodeURIComponent(groupsSearchQuery)}` : "/api/groups";
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to fetch groups");
      return response.json();
    },
    enabled: currentView === "groups" && groupsTab === "discover",
  });

  const createGroupMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      return await apiRequest("POST", "/api/groups", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups/my"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      toast({
        title: "Success",
        description: "Group created successfully",
      });
      setShowCreateGroupDialog(false);
      setNewGroupName("");
      setNewGroupDescription("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create group",
        variant: "destructive",
      });
    },
  });

  const joinGroupMutation = useMutation({
    mutationFn: async (groupId: string) => {
      return await apiRequest("POST", `/api/groups/${groupId}/join`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups/my"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      toast({
        title: "Success",
        description: "Joined group successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to join group",
        variant: "destructive",
      });
    },
  });

  const leaveGroupMutation = useMutation({
    mutationFn: async (groupId: string) => {
      return await apiRequest("DELETE", `/api/groups/${groupId}/leave`, {});
    },
    onSuccess: (_, groupId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups/my"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      toast({
        title: "Success",
        description: "Left group successfully",
      });
      if (selectedConversationId === groupId) {
        goToInbox();
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to leave group",
        variant: "destructive",
      });
    },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: async (groupId: string) => {
      return await apiRequest("DELETE", `/api/groups/${groupId}`, {});
    },
    onSuccess: (_, groupId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups/my"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      toast({
        title: "Success",
        description: "Group deleted successfully",
      });
      if (selectedConversationId === groupId) {
        goToInbox();
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete group",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (!userId) return;

    let unsubscribe: (() => void) | undefined;

    subscribeToIncomingCalls(userId, (call) => {
      if (call.status === "ringing" && call.receiverId === userId) {
        setIncomingCall(call);
      }
    }).then((unsub) => {
      unsubscribe = unsub;
    }).catch((error) => {
      console.error("Error subscribing to incoming calls:", error);
    });

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [userId]);

  useEffect(() => {
    if (!incomingCall) return;

    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    const callId = incomingCall.id;

    (async () => {
      try {
        const unsub = await subscribeToCallStateWithRemoval(callId, (state) => {
          if (cancelled) return;
          
          if (state === null || state.status === "ended" || state.status === "rejected") {
            setIncomingCall(null);
            if (userId) {
              removeIncomingCall(userId, callId).catch((error) => {
                console.error("Error removing incoming call:", error);
              });
            }
          }
        });
        
        if (cancelled) {
          unsub();
        } else {
          unsubscribe = unsub;
        }
      } catch (error) {
        console.error("Error subscribing to call state:", error);
      }
    })();

    return () => {
      cancelled = true;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [incomingCall, userId]);

  useEffect(() => {
    const unsubscribes: (() => void)[] = [];
    
    conversations.forEach(conv => {
      if (conv.otherUser) {
        subscribeToUserPresence(conv.otherUser.id, (presence) => {
          if (presence) {
            setOnlineUsers(prev => new Map(prev).set(conv.otherUser!.id, presence));
          }
        }).then((unsubscribe) => {
          unsubscribes.push(unsubscribe);
        }).catch((error) => {
          console.error("Error subscribing to user presence:", error);
        });
      }
    });

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [conversations]);

  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([]);
      setIsLoadingMessages(false);
      return;
    }

    setIsLoadingMessages(true);
    let unsubscribe: (() => void) | undefined;

    subscribeToConversationMessages(selectedConversationId, (updatedMessages) => {
      setMessages(updatedMessages);
      setIsLoadingMessages(false);
      setShouldAutoScroll(true);
    }).then((unsub) => {
      unsubscribe = unsub;
    }).catch((error) => {
      console.error("Error subscribing to messages:", error);
      setIsLoadingMessages(false);
    });

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [selectedConversationId]);

  useEffect(() => {
    if (!selectedConversationId) return;

    let unsubscribe: (() => void) | undefined;

    subscribeToTypingIndicators(selectedConversationId, (indicators) => {
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
  }, [selectedConversationId, userId]);

  const selectedConversation = useMemo(() => {
    return conversations.find(c => c.id === selectedConversationId);
  }, [conversations, selectedConversationId]);

  const selectedGroup = useMemo(() => {
    if (!isGroupChat || !selectedConversationId) return null;
    
    // Only return data if it matches the currently selected group ID
    if (selectedGroupData && selectedGroupData.id === selectedConversationId) {
      return selectedGroupData;
    }
    
    // Fallback to myGroups only if it matches the selected ID
    const groupFromList = myGroups.find(g => g.id === selectedConversationId);
    if (groupFromList && groupFromList.id === selectedConversationId) {
      return groupFromList;
    }
    
    return null;
  }, [isGroupChat, selectedGroupData, myGroups, selectedConversationId]);

  const otherUser = selectedConversation?.otherUser;
  const otherUsername = isGroupChat && selectedGroup ? selectedGroup.name : (otherUser?.username || "");

  useEffect(() => {
    if (!otherUser) {
      setOtherUserPresence(null);
      return;
    }

    let unsubscribe: (() => void) | undefined;

    subscribeToUserPresence(otherUser.id, (presence) => {
      setOtherUserPresence(presence);
    }).then((unsub) => {
      unsubscribe = unsub;
    }).catch((error) => {
      console.error("Error subscribing to other user presence:", error);
    });

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [otherUser]);

  useEffect(() => {
    if (!selectedConversationId || !userId) return;

    const unreadMessages = messages.filter(
      (msg) => msg.senderId !== userId && !msg.readAt
    );

    if (unreadMessages.length > 0) {
      markConversationMessagesAsRead(selectedConversationId, userId, unreadMessages).catch(
        console.error
      );
    }
  }, [messages, selectedConversationId, userId]);

  useEffect(() => {
    if (shouldAutoScroll && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
      setShouldAutoScroll(false);
    }
  }, [messages, shouldAutoScroll]);

  const groupedMessages = useMemo(() => {
    const groups: Array<{ date: number; messages: Message[] }> = [];
    let currentGroup: Message[] = [];
    let currentDate: number | null = null;

    messages.forEach((message) => {
      const messageDate = startOfDay(new Date(message.timestamp)).getTime();

      if (currentDate === null || currentDate !== messageDate) {
        if (currentGroup.length > 0) {
          groups.push({ date: currentDate!, messages: currentGroup });
        }
        currentDate = messageDate;
        currentGroup = [message];
      } else {
        currentGroup.push(message);
      }
    });

    if (currentGroup.length > 0 && currentDate !== null) {
      groups.push({ date: currentDate, messages: currentGroup });
    }

    return groups;
  }, [messages]);

  const sendMessageMutation = useMutation({
    mutationFn: async (data: { text: string; mediaUrl?: string; mediaType?: string; fileName?: string; fileSize?: number }) => {
      if (!selectedConversationId) throw new Error("No conversation selected");
      
      const endpoint = isGroupChat 
        ? `/api/groups/${selectedConversationId}/messages`
        : `/api/conversations/${selectedConversationId}/messages`;
      
      const response = await apiRequest("POST", endpoint, {
        senderId: userId,
        senderUsername: username,
        text: data.text,
        mediaUrl: data.mediaUrl,
        mediaType: data.mediaType,
        fileName: data.fileName,
        fileSize: data.fileSize,
      });
      
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/conversations?userId=${userId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups/my"] });
      setShouldAutoScroll(true);
    },
  });

  const createConversationMutation = useMutation({
    mutationFn: async (otherUserId: string) => {
      const response = await apiRequest("POST", "/api/conversations", {
        user1Id: userId,
        user2Id: otherUserId,
      });
      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/conversations?userId=${userId}`] });
      setSearchQuery("");
      openChat(data.id);
    },
  });

  const handleSendMessage = async (text: string, mediaUrl?: string, mediaType?: string) => {
    await sendMessageMutation.mutateAsync({
      text,
      mediaUrl,
      mediaType,
    });
  };

  const handleStartConversation = (user: User) => {
    const existingConversation = conversations.find(
      conv => conv.otherUser?.id === user.id
    );

    if (existingConversation) {
      setSearchQuery("");
      openChat(existingConversation.id);
    } else {
      createConversationMutation.mutate(user.id);
    }
  };

  const handleConversationClick = (conversationId: string) => {
    openChat(conversationId);
  };

  const handleClickSender = async (senderId: string, senderUsername: string) => {
    const existingConversation = conversations.find(
      conv => conv.otherUser?.id === senderId
    );

    if (existingConversation) {
      openChat(existingConversation.id);
    } else {
      try {
        const data = await createConversationMutation.mutateAsync(senderId);
        openChat(data.id);
      } catch (error) {
        console.error("Error creating conversation:", error);
      }
    }
  };

  const handleTyping = () => {
    if (!selectedConversationId || !userId || !username) return;

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    setTypingIndicator(selectedConversationId, userId, username, true).catch(console.error);

    typingTimeoutRef.current = setTimeout(() => {
      setTypingIndicator(selectedConversationId, userId, username, false).catch(console.error);
    }, 3000);
  };

  const handleLogout = async () => {
    if (userId && username) {
      await setUserPresence(userId, username, false).catch(console.error);
    }
    localStorage.removeItem("chatUserId");
    localStorage.removeItem("chatUsername");
    sessionStorage.removeItem("authToken");
    queryClient.clear();
    setLocation("/login");
  };

  const handleStartCall = async (type: "voice" | "video") => {
    if (!selectedConversationId || !otherUser || !userId || !username) return;

    try {
      const callId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const call: Call = {
        id: callId,
        conversationId: selectedConversationId,
        callerId: userId,
        callerUsername: username,
        receiverId: otherUser.id,
        receiverUsername: otherUser.username,
        type,
        status: "ringing",
        timestamp: Date.now(),
      };

      // Initialize call state in Firebase
      await initializeCallState(call);
      await sendIncomingCall(call);

      const service = new WebRTCService(userId);
      service.setHandlers({
        onRemoteStream: (stream) => {
          setRemoteStream(stream);
        },
        onCallEnded: async () => {
          // Only trigger handleEndCall if not already ending
          if (!isEndingCallRef.current) {
            await handleEndCall();
          }
        },
        onCallStateChange: (state) => {
          // Update activeCall when state changes to "active"
          if (state.status === "active" && state.startedAt) {
            setActiveCall(prev => prev ? { ...prev, status: "active", startedAt: state.startedAt } : null);
          }
        },
        onError: (error) => {
          toast({
            title: "Call Error",
            description: error.message,
            variant: "destructive",
          });
          if (!isEndingCallRef.current) {
            handleEndCall();
          }
        },
      });

      await service.initializeCall(
        callId,
        otherUser.id,
        { audio: true, video: type === "video" },
        true
      );

      setWebrtcService(service);
      setLocalStream(service.getLocalStream());
      setActiveCall(call); // Set with ringing status initially

      await apiRequest("POST", "/api/calls", call);
    } catch (error: any) {
      toast({
        title: "Call Failed",
        description: error.message || "Failed to start call",
        variant: "destructive",
      });
    }
  };

  const handleAcceptCall = async () => {
    if (!incomingCall || !userId) return;

    try {
      const service = new WebRTCService(userId);
      service.setHandlers({
        onRemoteStream: (stream) => {
          setRemoteStream(stream);
        },
        onCallEnded: async () => {
          // Only trigger handleEndCall if not already ending
          if (!isEndingCallRef.current) {
            await handleEndCall();
          }
        },
        onCallStateChange: (state) => {
          // Update activeCall when state changes to "active"
          if (state.status === "active" && state.startedAt) {
            setActiveCall(prev => prev ? { ...prev, status: "active", startedAt: state.startedAt } : null);
          }
        },
        onError: (error) => {
          toast({
            title: "Call Error",
            description: error.message,
            variant: "destructive",
          });
          if (!isEndingCallRef.current) {
            handleEndCall();
          }
        },
      });

      await service.initializeCall(
        incomingCall.id,
        incomingCall.callerId,
        { audio: true, video: incomingCall.type === "video" },
        false
      );

      // Accept the call - this will update Firebase state to "active"
      await service.acceptCall();

      setWebrtcService(service);
      setLocalStream(service.getLocalStream());
      setActiveCall(incomingCall); // Will be updated to "active" by onCallStateChange
      setIncomingCall(null);

      await removeIncomingCall(userId, incomingCall.id);
      await apiRequest("PATCH", `/api/calls/${incomingCall.id}`, {
        status: "active",
        startedAt: Date.now(),
      });
    } catch (error: any) {
      toast({
        title: "Failed to Accept Call",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleRejectCall = async () => {
    if (!incomingCall || !userId) return;

    try {
      await removeIncomingCall(userId, incomingCall.id);
      await apiRequest("PATCH", `/api/calls/${incomingCall.id}`, {
        status: "rejected",
        endedAt: Date.now(),
      });
      setIncomingCall(null);
    } catch (error) {
      console.error("Error rejecting call:", error);
    }
  };

  const handleEndCall = async () => {
    console.log(`[UI] handleEndCall() called, activeCall:`, activeCall?.id, `isEnding:`, isEndingCallRef.current);
    
    if (!activeCall || !userId) {
      console.log(`[UI] Cannot end call: no active call or user ID`);
      return;
    }

    // Idempotent: prevent multiple simultaneous end call operations
    if (isEndingCallRef.current) {
      console.log("[UI] Call already being ended, skipping duplicate request");
      return;
    }

    console.log(`[UI] Starting end call process for call ${activeCall.id}...`);
    isEndingCallRef.current = true;

    try {
      const duration = activeCall.startedAt 
        ? Math.floor((Date.now() - activeCall.startedAt) / 1000)
        : 0;

      console.log(`[UI] Call duration: ${duration} seconds`);

      // End WebRTC call immediately (this stops media and cleans up peer connection)
      if (webrtcService) {
        console.log(`[UI] Calling webrtcService.endCall()...`);
        await webrtcService.endCall();
        console.log(`[UI] webrtcService.endCall() completed`);
      }

      // Clear UI state immediately for instant feedback
      console.log(`[UI] Clearing call state in UI...`);
      const callToSave = { ...activeCall };
      setWebrtcService(null);
      setLocalStream(null);
      setRemoteStream(null);
      setActiveCall(null);
      isEndingCallRef.current = false;

      // Save recording and update database in background (non-blocking)
      (async () => {
        try {
          let recordingUrl: string | undefined;
          
          if (webrtcService) {
            console.log(`[UI] Getting recording from WebRTC service...`);
            const recording = await webrtcService.getRecording();
            if (recording) {
              console.log(`[UI] Recording blob obtained, size: ${recording.size} bytes`);
              const formData = new FormData();
              formData.append("file", recording, `call-${callToSave.id}.webm`);

              console.log(`[UI] Uploading recording...`);
              const response = await fetch("/api/upload-call-recording", {
                method: "POST",
                body: formData,
              });

              if (response.ok) {
                const data = await response.json();
                recordingUrl = data.url;
                console.log(`[UI] Recording uploaded successfully: ${recordingUrl}`);
              } else {
                console.error("[UI] Failed to upload recording:", await response.text());
              }
            } else {
              console.log(`[UI] No recording available`);
            }
          }

          // Send all required fields for ended call
          console.log(`[UI] Updating call status in database...`);
          await apiRequest("PATCH", `/api/calls/${callToSave.id}`, {
            conversationId: callToSave.conversationId,
            callerId: callToSave.callerId,
            callerUsername: callToSave.callerUsername,
            receiverId: callToSave.receiverId,
            receiverUsername: callToSave.receiverUsername,
            type: callToSave.type,
            status: "ended" as const,
            startedAt: callToSave.startedAt || Date.now(),
            endedAt: Date.now(),
            duration,
            recordingUrl,
            timestamp: callToSave.timestamp,
          });
          console.log(`[UI] Call status updated in database`);

          if (selectedConversationId) {
            console.log(`[UI] Creating call end message in conversation...`);
            await apiRequest("POST", `/api/conversations/${selectedConversationId}/messages`, {
              senderId: userId,
              senderUsername: username,
              text: `${callToSave.type === "video" ? "Video" : "Voice"} call (${Math.floor(duration / 60)}m ${duration % 60}s)`,
            });
          }

          console.log(`[UI] Background save completed successfully`);
        } catch (error: any) {
          console.error("[UI] Error in background save:", error);
        }
      })();
      
      console.log(`[UI] Call ended successfully (UI updated immediately)`);
    } catch (error: any) {
      console.error("[UI] Error ending call:", error);
      
      // Force cleanup even if there were errors
      setWebrtcService(null);
      setLocalStream(null);
      setRemoteStream(null);
      setActiveCall(null);
      
      toast({
        title: "Call Ended with Errors",
        description: error.message || "The call has ended but there were issues saving the recording or logging data",
        variant: "destructive",
      });
      
      isEndingCallRef.current = false;
    }
  };

  const handleToggleAudio = (enabled: boolean) => {
    webrtcService?.toggleAudio(enabled);
  };

  const handleToggleVideo = (enabled: boolean) => {
    webrtcService?.toggleVideo(enabled);
  };

  const unreadCount = conversations.filter(c => (c.unreadCount || 0) > 0).length;

  if (activeCall) {
    return (
      <ActiveCallUI
        call={activeCall}
        localStream={localStream}
        remoteStream={remoteStream}
        onEndCall={handleEndCall}
        onToggleAudio={handleToggleAudio}
        onToggleVideo={handleToggleVideo}
      />
    );
  }

  return (
    <div className="h-screen flex bg-background dark:bg-background overflow-hidden">
      <ExitConfirmDialog
        open={showExitDialog}
        onResponse={handleExitResponse}
      />
      <IncomingCallModal
        call={incomingCall}
        onAccept={handleAcceptCall}
        onReject={handleRejectCall}
      />


      {/* Sidebar - Hidden on mobile, visible on tablet and above */}
      <div className="hidden md:flex w-16 bg-sidebar dark:bg-sidebar border-r border-border dark:border-border flex-col items-center py-4">
        <div className="flex-1 flex flex-col justify-center gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            className={`hover-elevate active-elevate-2 relative ${currentView === "inbox" ? "bg-primary/10 dark:bg-primary/10" : ""}`}
            onClick={goToInbox}
            data-testid="button-inbox"
          >
            <Mail className={`w-5 h-5 ${currentView === "inbox" ? "text-primary dark:text-primary" : ""}`} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center bg-primary text-primary-foreground text-[10px] font-bold rounded-full px-1" data-testid="badge-unread-count">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className={`hover-elevate active-elevate-2 ${currentView === "groups" ? "bg-primary/10 dark:bg-primary/10" : ""}`}
            onClick={openGroups}
            data-testid="button-groups"
          >
            <Users className={`w-5 h-5 ${currentView === "groups" ? "text-primary dark:text-primary" : ""}`} />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className={`hover-elevate active-elevate-2 ${currentView === "settings" ? "bg-primary/10 dark:bg-primary/10" : ""}`}
            onClick={openSettings}
            data-testid="button-settings"
          >
            <Settings className={`w-5 h-5 ${currentView === "settings" ? "text-primary dark:text-primary" : ""}`} />
          </Button>
        </div>
        <div className="mt-auto flex flex-col items-center gap-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className={`hover-elevate active-elevate-2 ${currentView === "groups" ? "" : "invisible"}`}
                onClick={() => setShowCreateGroupDialog(true)}
                data-testid="button-create-group-sidebar"
                aria-label="Create group"
              >
                <Plus className="w-5 h-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>Create group</p>
            </TooltipContent>
          </Tooltip>
          <Avatar className="w-10 h-10" data-testid="avatar-user">
            <AvatarFallback className="bg-primary dark:bg-primary text-primary-foreground dark:text-primary-foreground text-sm font-semibold">
              {getInitials(username || "")}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>

      {currentView === "inbox" && (
        <div className={`w-full md:w-[340px] border-r border-border dark:border-border bg-sidebar dark:bg-sidebar flex flex-col pb-16 md:pb-0 ${selectedConversationId ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-4 border-b border-border dark:border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-foreground dark:text-foreground text-lg">Inbox</h2>
            {unreadCount > 0 && (
              <span className="text-sm text-muted-foreground dark:text-muted-foreground">({unreadCount})</span>
            )}
          </div>
        </div>

        <div className="px-3 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground dark:text-muted-foreground" />
            <Input
              type="text"
              placeholder="Find user"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-background dark:bg-background border-border/50 dark:border-border/50 text-sm h-9 rounded-md"
              data-testid="input-search-users"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {searchQuery.trim().length > 0 ? (
            <div className="px-2">
              {searchLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Existing conversations with matches */}
                  {matchingConversations.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground px-3 mb-2">CONVERSATIONS</p>
                      <div className="space-y-0.5">
                        {matchingConversations.map((conv) => {
                          const isOnline = conv.otherUser && onlineUsers.get(conv.otherUser.id)?.online;
                          const isSelected = conv.id === selectedConversationId;

                          return (
                            <button
                              key={conv.id}
                              onClick={() => handleConversationClick(conv.id)}
                              className={`w-full flex items-center gap-3 p-3 rounded-md hover-elevate active-elevate-2 ${
                                isSelected ? 'bg-sidebar-accent' : ''
                              }`}
                              data-testid={`conversation-${conv.id}`}
                            >
                              <div className="relative flex-shrink-0">
                                <Avatar className="w-11 h-11">
                                  <AvatarFallback className="bg-primary/20 text-primary font-medium text-sm">
                                    {getInitials(conv.otherUser?.username || "")}
                                  </AvatarFallback>
                                </Avatar>
                                {isOnline && (
                                  <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-sidebar" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0 text-left">
                                <div className="flex items-center justify-between mb-1">
                                  <p className="font-semibold text-sm text-foreground truncate">
                                    {conv.otherUser?.username}
                                  </p>
                                  <span className="text-xs text-muted-foreground flex-shrink-0 ml-2">
                                    {conv.lastMessage?.timestamp 
                                      ? new Date(conv.lastMessage.timestamp).toLocaleTimeString('en-US', {
                                          hour: 'numeric',
                                          minute: '2-digit',
                                        })
                                      : ''
                                    }
                                  </span>
                                </div>
                                <p className="text-xs text-muted-foreground truncate">
                                  {conv.lastMessage?.text || 'No messages yet'}
                                </p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* New users to start conversations with */}
                  {filteredSearchResults.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground px-3 mb-2">NEW USERS</p>
                      <div className="space-y-0.5">
                        {filteredSearchResults.map((user) => (
                          <button
                            key={user.id}
                            onClick={() => handleStartConversation(user)}
                            className="w-full flex items-center gap-3 p-3 rounded-md hover-elevate active-elevate-2"
                            data-testid={`user-${user.id}`}
                          >
                            <Avatar className="w-11 h-11">
                              <AvatarFallback className="bg-primary/20 text-primary font-medium text-sm">
                                {getInitials(user.username)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 text-left">
                              <p className="font-medium text-sm text-foreground">{user.username}</p>
                              <p className="text-xs text-muted-foreground">Start conversation</p>
                            </div>
                            <Plus className="w-4 h-4 text-muted-foreground" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* No results */}
                  {matchingConversations.length === 0 && filteredSearchResults.length === 0 && (
                    <p className="text-center text-muted-foreground py-8 text-sm">No users found</p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="px-2">
              {loadingConversations ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                </div>
              ) : conversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                  <MessageCircle className="w-10 h-10 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">No conversations yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Search for users to start chatting</p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {conversations.map((conv) => {
                    const isOnline = conv.otherUser && onlineUsers.get(conv.otherUser.id)?.online;
                    const isSelected = conv.id === selectedConversationId;

                    return (
                      <button
                        key={conv.id}
                        onClick={() => handleConversationClick(conv.id)}
                        className={`w-full flex items-center gap-3 p-3 rounded-md hover-elevate active-elevate-2 ${
                          isSelected ? 'bg-sidebar-accent' : ''
                        }`}
                        data-testid={`conversation-${conv.id}`}
                      >
                        <div className="relative flex-shrink-0">
                          <Avatar className="w-11 h-11">
                            <AvatarFallback className="bg-primary/20 text-primary font-medium text-sm">
                              {getInitials(conv.otherUser?.username || "")}
                            </AvatarFallback>
                          </Avatar>
                          {isOnline && (
                            <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-sidebar" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                          <div className="flex items-center justify-between mb-1">
                            <p className="font-semibold text-sm text-foreground truncate">
                              {conv.otherUser?.username}
                            </p>
                            <span className="text-xs text-muted-foreground flex-shrink-0 ml-2">
                              {conv.lastMessage?.timestamp 
                                ? new Date(conv.lastMessage.timestamp).toLocaleTimeString('en-US', {
                                    hour: 'numeric',
                                    minute: '2-digit',
                                  })
                                : ''
                              }
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {conv.lastMessage?.text || 'No messages yet'}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
        </div>
      )}

      <Sheet open={showGroupMembersSheet} onOpenChange={setShowGroupMembersSheet}>
        <SheetContent side="right" className="w-full sm:w-[400px] md:w-[500px] p-0 flex flex-col">
          <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Users className="w-6 h-6 text-primary" />
              </div>
              <div>
                <SheetTitle className="text-xl">Group Members</SheetTitle>
                <SheetDescription className="text-sm text-muted-foreground">
                  {groupMembers.length} {groupMembers.length === 1 ? "member" : "members"} in {selectedGroup?.name}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>
          
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {groupMembers.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-sm text-muted-foreground">No members found</p>
              </div>
            ) : (
              <div className="space-y-2">
                {groupMembers.map((member) => {
                  const isCreator = member.id === selectedGroup?.creatorId;
                  const isCurrentUser = member.id === userId;
                  
                  return (
                    <div
                      key={member.id}
                      className={`flex items-center gap-3 p-3 rounded-md ${
                        !isCurrentUser ? 'hover-elevate active-elevate-2 cursor-pointer' : ''
                      }`}
                      onClick={() => {
                        if (!isCurrentUser) {
                          setPendingMemberNavigation(member);
                          setShowGroupMembersSheet(false);
                        }
                      }}
                      data-testid={`member-${member.id}`}
                    >
                      <Avatar className="w-11 h-11">
                        <AvatarFallback className="bg-primary/20 text-primary font-medium text-sm">
                          {getInitials(member.username)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-sm text-foreground truncate">
                            {member.username}
                          </p>
                          {isCreator && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                              Creator
                            </span>
                          )}
                          {isCurrentUser && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                              You
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {member.name}
                        </p>
                      </div>
                      {!isCurrentUser && (
                        <MessageCircle className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {selectedGroup && userId && selectedGroup.creatorId !== userId && (
            <div className="px-6 py-4 border-t border-border bg-sidebar/50">
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => {
                  if (selectedConversationId) {
                    setShowGroupMembersSheet(false);
                    leaveGroupMutation.mutate(selectedConversationId);
                  }
                }}
                disabled={leaveGroupMutation.isPending}
                data-testid="button-leave-group-sheet"
              >
                {leaveGroupMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Leaving...
                  </>
                ) : (
                  <>
                    <LogOut className="w-4 h-4 mr-2" />
                    Leave Group
                  </>
                )}
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={showCreateGroupDialog} onOpenChange={setShowCreateGroupDialog}>
        <SheetContent side="right" className="w-full sm:w-[400px] md:w-[500px] p-0 flex flex-col">
          <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Users className="w-6 h-6 text-primary" />
              </div>
              <div>
                <SheetTitle className="text-xl">Create New Group</SheetTitle>
                <SheetDescription className="text-sm text-muted-foreground">
                  Start a new group conversation
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>
          
          <div className="flex-1 overflow-y-auto px-6 py-6">
            <div className="space-y-6">
              <div className="space-y-3">
                <Label htmlFor="group-name" className="text-sm font-medium">
                  Group Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="group-name"
                  placeholder="Enter a unique group name..."
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  data-testid="input-group-name"
                  className="h-11 text-base"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  Choose a descriptive name for your group
                </p>
              </div>

              <div className="space-y-3">
                <Label htmlFor="group-description" className="text-sm font-medium">
                  Description <span className="text-muted-foreground text-xs">(optional)</span>
                </Label>
                <Textarea
                  id="group-description"
                  placeholder="What is this group about?"
                  value={newGroupDescription}
                  onChange={(e) => setNewGroupDescription(e.target.value)}
                  data-testid="input-group-description"
                  rows={4}
                  className="resize-none text-base"
                />
                <p className="text-xs text-muted-foreground">
                  Help others understand the purpose of this group
                </p>
              </div>
            </div>
          </div>

          <div className="px-6 py-4 border-t border-border bg-sidebar/50">
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setShowCreateGroupDialog(false)}
                className="flex-1"
                disabled={createGroupMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (!newGroupName.trim()) {
                    toast({
                      title: "Error",
                      description: "Group name is required",
                      variant: "destructive",
                    });
                    return;
                  }
                  createGroupMutation.mutate({
                    name: newGroupName.trim(),
                    description: newGroupDescription.trim() || undefined,
                  });
                }}
                disabled={createGroupMutation.isPending}
                className="flex-1"
                data-testid="button-submit-create-group"
              >
                {createGroupMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Create Group
                  </>
                )}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {currentView === "groups" && (
        <div className={`w-full md:w-[340px] border-r border-border dark:border-border bg-sidebar dark:bg-sidebar flex flex-col pb-16 md:pb-0 ${selectedConversationId ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-4 border-b border-border dark:border-border">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="font-semibold text-foreground dark:text-foreground text-lg">Groups</h2>
            </div>
            
            <div className="flex gap-1 mb-3">
              <Button
                variant={groupsTab === "my-groups" ? "default" : "ghost"}
                size="sm"
                onClick={() => setGroupsTab("my-groups")}
                className="flex-1 h-8"
                data-testid="button-my-groups-tab"
              >
                My Groups
              </Button>
              <Button
                variant={groupsTab === "discover" ? "default" : "ghost"}
                size="sm"
                onClick={() => setGroupsTab("discover")}
                className="flex-1 h-8"
                data-testid="button-discover-tab"
              >
                Discover
              </Button>
            </div>

            {groupsTab === "discover" && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground dark:text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search groups"
                  value={groupsSearchQuery}
                  onChange={(e) => setGroupsSearchQuery(e.target.value)}
                  className="pl-9 bg-background dark:bg-background border-border/50 dark:border-border/50 text-sm h-9 rounded-md"
                  data-testid="input-search-groups"
                />
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar px-2">
            {(groupsTab === "my-groups" ? loadingMyGroups : loadingAllGroups) ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
            ) : (groupsTab === "my-groups" ? myGroups : allGroups).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <Users className="w-10 h-10 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">
                  {groupsTab === "my-groups" 
                    ? "You haven't joined any groups yet" 
                    : "No groups found"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {groupsTab === "my-groups"
                    ? "Discover and join groups to get started"
                    : "Try a different search term"}
                </p>
              </div>
            ) : (
              <div className="space-y-0.5">
                {(groupsTab === "my-groups" ? myGroups : allGroups).map((group) => {
                  const isMember = myGroups.some(g => g.id === group.id);
                  const isSelected = group.id === selectedConversationId && isGroupChat;
                  const isCreator = group.creatorId === userId;

                  return (
                    <div
                      key={group.id}
                      className={`w-full flex items-center gap-3 p-3 rounded-md hover-elevate active-elevate-2 cursor-pointer ${
                        isSelected ? 'bg-sidebar-accent' : ''
                      }`}
                      onClick={() => openGroup(group.id)}
                      data-testid={`group-${group.id}`}
                    >
                      <Avatar className="w-11 h-11">
                        <AvatarFallback className="bg-primary/20 text-primary font-medium text-sm">
                          {getInitials(group.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0 text-left">
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-semibold text-sm text-foreground truncate">
                            {group.name}
                          </p>
                          {groupsTab === "my-groups" && !isCreator && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 hover-elevate active-elevate-2"
                                  data-testid={`button-group-menu-${group.id}`}
                                >
                                  <MoreHorizontal className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive-foreground focus:bg-destructive"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    leaveGroupMutation.mutate(group.id);
                                  }}
                                  disabled={leaveGroupMutation.isPending}
                                  data-testid={`button-leave-${group.id}`}
                                >
                                  <LogOut className="w-4 h-4 mr-2" />
                                  Leave Group
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                          {!isMember && groupsTab === "discover" && (
                            <Button
                              variant="default"
                              size="sm"
                              className="h-6 text-xs px-2 ml-2"
                              onClick={(e) => {
                                e.stopPropagation();
                                joinGroupMutation.mutate(group.id);
                              }}
                              disabled={joinGroupMutation.isPending}
                              data-testid={`button-join-${group.id}`}
                            >
                              {joinGroupMutation.isPending ? "..." : "Join"}
                            </Button>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {group.description || `${group.memberCount || 0} members`}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <div className={`flex-1 flex flex-col bg-background dark:bg-background ${selectedConversationId ? 'md:pb-0' : 'pb-16 md:pb-0'} ${selectedConversationId ? 'relative' : ''}`}>
        {currentView === "settings" ? (
          <SettingsView userId={userId!} username={username!} onLogout={handleLogout} />
        ) : !selectedConversationId ? (
          <div className="hidden md:flex flex-1 items-center justify-center">
            <div className="text-center">
              <div className="w-20 h-20 rounded-full bg-primary/10 dark:bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <MessageCircle className="w-10 h-10 text-primary dark:text-primary" />
              </div>
              <h2 className="text-xl font-semibold mb-2 text-foreground dark:text-foreground">Select a conversation</h2>
              <p className="text-muted-foreground dark:text-muted-foreground text-sm">Choose a chat to start messaging</p>
            </div>
          </div>
        ) : (
          <>
            <div className="md:sticky md:top-0 fixed top-0 left-0 right-0 md:left-auto md:right-auto z-20 border-b border-border dark:border-border bg-background dark:bg-background py-3 pl-2 pr-4 md:px-5 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {/* Mobile back button */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden hover-elevate active-elevate-2 flex-shrink-0"
                  onClick={() => setLocation("/")}
                  data-testid="button-back-to-list"
                >
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                <div className="relative flex-shrink-0">
                  <Avatar className="w-10 h-10">
                    <AvatarFallback className="bg-primary/20 dark:bg-primary/20 text-primary dark:text-primary font-semibold text-sm">
                      {getInitials(otherUsername)}
                    </AvatarFallback>
                  </Avatar>
                  {!isGroupChat && otherUserPresence && (
                    <div 
                      className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-background dark:border-background ${
                        otherUserPresence.online ? 'bg-green-500' : 'bg-muted-foreground/50 dark:bg-muted-foreground/50'
                      }`}
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold text-foreground dark:text-foreground truncate">{otherUsername}</h2>
                  {isGroupChat ? (
                    <p className="text-xs text-muted-foreground dark:text-muted-foreground">
                      {selectedGroup?.memberCount || 0} members
                    </p>
                  ) : typingIndicators.length > 0 ? (
                    <p className="text-xs text-primary dark:text-primary">typing...</p>
                  ) : otherUserPresence?.online ? (
                    <p className="text-xs text-green-500">online</p>
                  ) : (
                    <p className="text-xs text-muted-foreground dark:text-muted-foreground">offline</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {!isGroupChat && (
                  <>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="hover-elevate active-elevate-2 h-9 w-9" 
                      onClick={() => handleStartCall("voice")}
                      data-testid="button-voice-call"
                    >
                      <Phone className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="hover-elevate active-elevate-2 h-9 w-9 bg-primary/10 dark:bg-primary/10" 
                      onClick={() => handleStartCall("video")}
                      data-testid="button-video-call"
                    >
                      <Video className="w-4 h-4 text-primary dark:text-primary" />
                    </Button>
                  </>
                )}
                {isGroupChat && selectedGroup && (
                  <>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="hover-elevate active-elevate-2 h-9 w-9" 
                      onClick={() => setShowGroupMembersSheet(true)}
                      data-testid="button-view-members"
                    >
                      <Users className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="hover-elevate active-elevate-2 h-9 w-9 text-destructive" 
                      onClick={() => setShowDeleteGroupDialog(true)}
                      data-testid="button-delete-group"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 pt-20 pb-24 md:pt-4 md:pb-4 custom-scrollbar">
              {isLoadingMessages ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-6 h-6 animate-spin text-primary dark:text-primary" />
                </div>
              ) : groupedMessages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <MessageCircle className="w-12 h-12 text-muted-foreground dark:text-muted-foreground mx-auto mb-3" />
                    <p className="text-muted-foreground dark:text-muted-foreground text-sm">
                      No messages yet
                    </p>
                    <p className="text-muted-foreground dark:text-muted-foreground text-xs mt-1">
                      Send a message to start the conversation
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {groupedMessages.map((group) => (
                    <div key={group.date}>
                      <DateDivider date={group.date} />
                      {group.messages.map((message) => (
                        <MessageBubble
                          key={message.id}
                          message={message}
                          isOwnMessage={message.senderId === userId}
                          isGroupChat={isGroupChat}
                          onClickSender={handleClickSender}
                        />
                      ))}
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            <div className="md:sticky md:bottom-0 fixed bottom-0 left-0 right-0 md:left-auto md:right-auto z-20 border-t border-border dark:border-border bg-card dark:bg-card">
              <ChatInput 
                onSendMessage={handleSendMessage} 
                username={username || ""} 
                onTyping={handleTyping} 
                placeholder="Type a message..."
              />
            </div>
          </>
        )}
      </div>

      <AlertDialog open={showDeleteGroupDialog} onOpenChange={setShowDeleteGroupDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Group</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedGroup?.name}"? This action cannot be undone. All group messages and data will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (selectedConversationId) {
                  deleteGroupMutation.mutate(selectedConversationId);
                  setShowDeleteGroupDialog(false);
                }
              }}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              data-testid="button-confirm-delete"
            >
              Delete Group
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bottom Navigation - Mobile only (hide when chat is open) */}
      {!selectedConversationId && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-sidebar dark:bg-sidebar border-t border-border dark:border-border flex items-center justify-around px-4 py-2 z-50">
        <Button 
          variant="ghost" 
          size="icon" 
          className={`flex flex-col items-center justify-center gap-1 h-auto py-2 px-4 hover-elevate active-elevate-2 ${currentView === "inbox" ? "text-primary dark:text-primary" : "text-muted-foreground dark:text-muted-foreground"}`}
          onClick={goToInbox}
          data-testid="bottom-nav-inbox"
        >
          <div className="relative">
            <Mail className="w-6 h-6" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] flex items-center justify-center bg-primary text-primary-foreground text-[9px] font-bold rounded-full px-0.5" data-testid="bottom-nav-badge-unread">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>
          <span className="text-xs font-medium">Inbox</span>
        </Button>
        <Button 
          variant="ghost" 
          size="icon" 
          className={`flex flex-col items-center justify-center gap-1 h-auto py-2 px-4 hover-elevate active-elevate-2 ${currentView === "groups" ? "text-primary dark:text-primary" : "text-muted-foreground dark:text-muted-foreground"}`}
          onClick={openGroups}
          data-testid="bottom-nav-groups"
        >
          <Users className="w-6 h-6" />
          <span className="text-xs font-medium">Groups</span>
        </Button>
        <Button 
          variant="ghost" 
          size="icon" 
          className={`flex flex-col items-center justify-center gap-1 h-auto py-2 px-4 hover-elevate active-elevate-2 ${currentView === "settings" ? "text-primary dark:text-primary" : "text-muted-foreground dark:text-muted-foreground"}`}
          onClick={openSettings}
          data-testid="bottom-nav-settings"
        >
          <Settings className="w-6 h-6" />
          <span className="text-xs font-medium">Settings</span>
        </Button>
      </div>
      )}
    </div>
  );
}
