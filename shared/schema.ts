import { z } from "zod";

export const userSchema = z.object({
  id: z.string(),
  username: z.string().min(3, "Username must be at least 3 characters").max(20, "Username must be less than 20 characters"),
  name: z.string().min(1, "Name is required").max(100, "Name must be less than 100 characters"),
  passwordHash: z.string(),
  blockedUsers: z.array(z.string()).default([]),
  blockedAt: z.record(z.string(), z.number()).default({}),
  createdAt: z.number(),
  lastActiveAt: z.number().optional(),
});

export const insertUserSchema = userSchema.omit({ 
  id: true,
  createdAt: true,
  passwordHash: true,
  blockedUsers: true,
  blockedAt: true,
  lastActiveAt: true,
}).extend({
  password: z.string().min(8, "Password must be at least 8 characters").max(15, "Password must be at most 15 characters"),
});

export const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export const updateUserSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name must be less than 100 characters"),
});

export type User = z.infer<typeof userSchema>;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type LoginCredentials = z.infer<typeof loginSchema>;
export type UpdateUser = z.infer<typeof updateUserSchema>;

export const conversationSchema = z.object({
  id: z.string(),
  participants: z.array(z.string()).length(2),
  createdAt: z.number(),
  lastMessageAt: z.number(),
});

export const insertConversationSchema = conversationSchema.omit({ 
  id: true, 
  createdAt: true,
  lastMessageAt: true 
});

export type Conversation = z.infer<typeof conversationSchema>;
export type InsertConversation = z.infer<typeof insertConversationSchema>;

export const groupSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Group name is required").max(100, "Group name must be less than 100 characters"),
  description: z.string().optional(),
  creatorId: z.string(),
  createdAt: z.number(),
  lastMessageAt: z.number(),
  memberCount: z.number().default(1),
  lastMemberChangeAt: z.number(),
});

export const insertGroupSchema = groupSchema.omit({ 
  id: true, 
  createdAt: true,
  lastMessageAt: true,
  memberCount: true,
  lastMemberChangeAt: true,
});

export const updateGroupSchema = z.object({
  name: z.string().min(1, "Group name is required").max(100, "Group name must be less than 100 characters").optional(),
  description: z.string().optional(),
});

export type Group = z.infer<typeof groupSchema>;
export type InsertGroup = z.infer<typeof insertGroupSchema>;
export type UpdateGroup = z.infer<typeof updateGroupSchema>;

export const groupMemberSchema = z.object({
  id: z.string(),
  groupId: z.string(),
  userId: z.string(),
  joinedAt: z.number(),
});

export const insertGroupMemberSchema = groupMemberSchema.omit({ 
  id: true, 
  joinedAt: true,
});

export type GroupMember = z.infer<typeof groupMemberSchema>;
export type InsertGroupMember = z.infer<typeof insertGroupMemberSchema>;

export const messageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  senderId: z.string(),
  senderUsername: z.string(),
  text: z.string().optional(),
  mediaUrl: z.string().optional(),
  mediaType: z.enum(["image", "video", "file", "audio"]).optional(),
  fileName: z.string().optional(),
  fileSize: z.number().optional(),
  timestamp: z.number(),
  deleted: z.boolean().default(false),
  mediaDeleted: z.boolean().default(false),
  deliveredAt: z.number().optional(),
  readAt: z.number().optional(),
});

export const insertMessageSchema = messageSchema.omit({ 
  id: true, 
  timestamp: true,
  deleted: true,
  mediaDeleted: true,
  deliveredAt: true,
  readAt: true,
});

export type Message = z.infer<typeof messageSchema>;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

export interface ConversationWithDetails extends Conversation {
  otherUser?: User;
  lastMessage?: Message;
  unreadCount?: number;
}

export interface GroupWithDetails extends Group {
  members?: User[];
  lastMessage?: Message;
  isCreator?: boolean;
  isMember?: boolean;
}

export interface CloudinaryUploadResponse {
  secure_url: string;
  public_id: string;
  resource_type: string;
  format: string;
}

export const typingIndicatorSchema = z.object({
  userId: z.string(),
  username: z.string(),
  conversationId: z.string(),
  isTyping: z.boolean(),
  timestamp: z.number(),
});

export type TypingIndicator = z.infer<typeof typingIndicatorSchema>;

export const userPresenceSchema = z.object({
  userId: z.string(),
  username: z.string(),
  online: z.boolean(),
  lastSeen: z.number(),
});

export type UserPresence = z.infer<typeof userPresenceSchema>;

export interface SheetMessageRow {
  timestamp: string;
  chatId: string;
  messageId: string;
  senderId: string;
  receiverId: string;
  text: string;
  mediaUrl: string;
  mediaType: string;
  fileName: string;
  fileSize: string;
  action: string;
  deviceBoundLogin: string;
}

export const blockUserSchema = z.object({
  targetUserId: z.string(),
});

export const callSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  callerId: z.string(),
  callerUsername: z.string(),
  receiverId: z.string(),
  receiverUsername: z.string(),
  type: z.enum(["voice", "video"]),
  status: z.enum(["ringing", "active", "ended", "missed", "rejected"]),
  startedAt: z.number().optional(),
  endedAt: z.number().optional(),
  duration: z.number().optional(),
  recordingUrl: z.string().optional(),
  timestamp: z.number(),
});

export const insertCallSchema = callSchema.omit({
  id: true,
  timestamp: true,
  startedAt: true,
  endedAt: true,
  duration: true,
  recordingUrl: true,
});

export const updateCallSchema = z.object({
  status: z.enum(["ringing", "active", "ended", "missed", "rejected"]).optional(),
  startedAt: z.number().optional(),
  endedAt: z.number().optional(),
  duration: z.number().optional(),
  recordingUrl: z.string().optional(),
});

export const endCallSchema = z.object({
  conversationId: z.string(),
  callerId: z.string(),
  callerUsername: z.string(),
  receiverId: z.string(),
  receiverUsername: z.string(),
  type: z.enum(["voice", "video"]),
  status: z.literal("ended"),
  startedAt: z.number(),
  endedAt: z.number(),
  duration: z.number(),
  recordingUrl: z.string().optional(),
  timestamp: z.number(),
});

export type Call = z.infer<typeof callSchema>;
export type InsertCall = z.infer<typeof insertCallSchema>;
export type UpdateCall = z.infer<typeof updateCallSchema>;
export type EndCall = z.infer<typeof endCallSchema>;

export const webRTCSignalSchema = z.object({
  callId: z.string(),
  fromUserId: z.string(),
  toUserId: z.string(),
  type: z.enum(["offer", "answer", "ice-candidate", "end-call", "reject-call"]),
  payload: z.any(),
  timestamp: z.number(),
});

export type WebRTCSignal = z.infer<typeof webRTCSignalSchema>;

export interface SheetCallRow {
  timestamp: string;
  callId: string;
  conversationId: string;
  callerId: string;
  receiverId: string;
  type: string;
  duration: string;
  recordingUrl: string;
  status: string;
}
