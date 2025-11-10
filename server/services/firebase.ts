import { initializeApp } from "firebase/app";
import {
  getDatabase,
  ref,
  push,
  set,
  remove,
  update,
  onValue,
  get,
  query,
  orderByChild,
  type Database,
  type Unsubscribe,
} from "firebase/database";
import { type Message, type InsertMessage, type User, type Conversation, type TypingIndicator, type UserPresence, type Group, type GroupMember } from "@shared/schema";

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

export class FirebaseService {
  private db: Database;
  private usersRef;
  private conversationsRef;
  private groupsRef;
  private groupMembersRef;

  constructor() {
    this.db = database;
    this.usersRef = ref(this.db, "users");
    this.conversationsRef = ref(this.db, "conversations");
    this.groupsRef = ref(this.db, "groups");
    this.groupMembersRef = ref(this.db, "groupMembers");
  }

  // User methods
  async addUser(user: User): Promise<void> {
    const userRef = ref(this.db, `users/${user.id}`);
    await set(userRef, user);
  }

  async getUser(userId: string): Promise<User | null> {
    const userRef = ref(this.db, `users/${userId}`);
    const snapshot = await get(userRef);
    
    if (!snapshot.exists()) {
      return null;
    }

    const user = snapshot.val() as User;
    
    // Migrate old users without lastActiveAt
    if (!user.lastActiveAt) {
      user.lastActiveAt = user.createdAt;
      update(userRef, { lastActiveAt: user.lastActiveAt }).catch(console.error);
    }

    return user;
  }

  async getUserByUsername(username: string): Promise<User | null> {
    const usersSnapshot = await get(this.usersRef);
    
    if (!usersSnapshot.exists()) {
      return null;
    }

    let foundUser: User | null = null;
    usersSnapshot.forEach((childSnapshot) => {
      const user = childSnapshot.val() as User;
      if (user.username === username) {
        // Migrate old users without lastActiveAt
        if (!user.lastActiveAt) {
          user.lastActiveAt = user.createdAt;
          const userRef = ref(this.db, `users/${user.id}`);
          update(userRef, { lastActiveAt: user.lastActiveAt }).catch(console.error);
        }
        foundUser = user;
      }
    });

    return foundUser;
  }

  async createUser(data: { id: string; username: string; name: string; passwordHash: string; createdAt: number }): Promise<User> {
    const user: User = {
      id: data.id,
      username: data.username,
      name: data.name,
      passwordHash: data.passwordHash,
      blockedUsers: [],
      blockedAt: {},
      createdAt: data.createdAt,
      lastActiveAt: data.createdAt,
    };
    
    await this.addUser(user);
    return user;
  }

  async updateUser(userId: string, data: { name: string }): Promise<User | null> {
    const userRef = ref(this.db, `users/${userId}`);
    const snapshot = await get(userRef);
    
    if (!snapshot.exists()) {
      return null;
    }
    
    await update(userRef, {
      name: data.name,
    });
    
    const updatedSnapshot = await get(userRef);
    return updatedSnapshot.val();
  }

  async blockUser(userId: string, targetUserId: string): Promise<void> {
    const timestamp = Date.now();
    
    const userRef = ref(this.db, `users/${userId}`);
    const targetUserRef = ref(this.db, `users/${targetUserId}`);
    
    const userSnapshot = await get(userRef);
    const targetUserSnapshot = await get(targetUserRef);
    
    if (userSnapshot.exists() && targetUserSnapshot.exists()) {
      const user = userSnapshot.val() as User;
      const targetUser = targetUserSnapshot.val() as User;
      
      const updatedBlockedUsers = user.blockedUsers || [];
      if (!updatedBlockedUsers.includes(targetUserId)) {
        updatedBlockedUsers.push(targetUserId);
      }
      
      const updatedBlockedAt = { ...(user.blockedAt || {}), [targetUserId]: timestamp };
      
      await update(userRef, {
        blockedUsers: updatedBlockedUsers,
        blockedAt: updatedBlockedAt,
      });
      
      const targetUpdatedBlockedUsers = targetUser.blockedUsers || [];
      if (!targetUpdatedBlockedUsers.includes(userId)) {
        targetUpdatedBlockedUsers.push(userId);
      }
      
      const targetUpdatedBlockedAt = { ...(targetUser.blockedAt || {}), [userId]: timestamp };
      
      await update(targetUserRef, {
        blockedUsers: targetUpdatedBlockedUsers,
        blockedAt: targetUpdatedBlockedAt,
      });
    }
  }

  async getBlockedUsers(userId: string): Promise<string[]> {
    const user = await this.getUser(userId);
    return user?.blockedUsers || [];
  }

  async isBlocked(userId: string, targetUserId: string): Promise<boolean> {
    const user = await this.getUser(userId);
    if (!user) return false;
    return (user.blockedUsers || []).includes(targetUserId);
  }

  async searchUsers(query: string): Promise<User[]> {
    const lowerQuery = query.toLowerCase().trim();
    if (!lowerQuery) return [];

    const usersSnapshot = await get(this.usersRef);
    
    if (!usersSnapshot.exists()) {
      return [];
    }

    const matchingUsers: User[] = [];
    usersSnapshot.forEach((childSnapshot) => {
      const user = childSnapshot.val() as User;
      if (user.username.toLowerCase().includes(lowerQuery)) {
        matchingUsers.push(user);
      }
    });

    return matchingUsers;
  }

  async deleteUser(userId: string): Promise<void> {
    // Delete user
    const userRef = ref(this.db, `users/${userId}`);
    await remove(userRef);

    // Delete all conversations where user is a participant
    const conversationsSnapshot = await get(this.conversationsRef);
    if (conversationsSnapshot.exists()) {
      const deletionPromises: Promise<void>[] = [];
      
      conversationsSnapshot.forEach((childSnapshot) => {
        const conversation = childSnapshot.val() as Conversation;
        if (conversation.participants.includes(userId)) {
          // Delete conversation
          const conversationRef = ref(this.db, `conversations/${conversation.id}`);
          deletionPromises.push(remove(conversationRef));
          
          // Delete all messages in this conversation
          const messagesRef = ref(this.db, `messages/${conversation.id}`);
          deletionPromises.push(remove(messagesRef));
        }
      });
      
      await Promise.all(deletionPromises);
    }

    // Delete user's presence data
    const presenceRef = ref(this.db, `presence/${userId}`);
    await remove(presenceRef);

    // Delete typing indicators
    const typingRef = ref(this.db, `typing/${userId}`);
    await remove(typingRef);
  }

  // Conversation methods
  async addConversation(conversation: Conversation): Promise<void> {
    const conversationRef = ref(this.db, `conversations/${conversation.id}`);
    await set(conversationRef, conversation);
  }

  async getConversation(conversationId: string): Promise<Conversation | null> {
    const conversationRef = ref(this.db, `conversations/${conversationId}`);
    const snapshot = await get(conversationRef);
    
    if (!snapshot.exists()) {
      return null;
    }

    return snapshot.val();
  }

  async updateConversationLastMessage(conversationId: string, timestamp: number): Promise<void> {
    const conversationRef = ref(this.db, `conversations/${conversationId}`);
    await update(conversationRef, { lastMessageAt: timestamp });
  }

  async getConversationByParticipants(user1Id: string, user2Id: string): Promise<Conversation | null> {
    const conversationsSnapshot = await get(this.conversationsRef);
    
    if (!conversationsSnapshot.exists()) {
      return null;
    }

    let foundConversation: Conversation | null = null;
    conversationsSnapshot.forEach((childSnapshot) => {
      const conversation = childSnapshot.val() as Conversation;
      if (
        conversation.participants && 
        Array.isArray(conversation.participants) &&
        (conversation.participants.includes(user1Id) && conversation.participants.includes(user2Id))
      ) {
        foundConversation = conversation;
      }
    });

    return foundConversation;
  }

  async getUserConversations(userId: string): Promise<Conversation[]> {
    const conversationsSnapshot = await get(this.conversationsRef);
    
    if (!conversationsSnapshot.exists()) {
      return [];
    }

    const userConversations: Conversation[] = [];
    conversationsSnapshot.forEach((childSnapshot) => {
      const conversation = childSnapshot.val() as Conversation;
      if (conversation.participants && Array.isArray(conversation.participants) && conversation.participants.includes(userId)) {
        userConversations.push(conversation);
      }
    });

    return userConversations.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
  }

  async createConversation(data: { id: string; participants: string[]; createdAt: number; lastMessageAt: number }): Promise<Conversation> {
    const conversation: Conversation = {
      id: data.id,
      participants: data.participants,
      createdAt: data.createdAt,
      lastMessageAt: data.lastMessageAt,
    };
    
    await this.addConversation(conversation);
    return conversation;
  }

  async deleteConversation(conversationId: string): Promise<void> {
    const conversationRef = ref(this.db, `conversations/${conversationId}`);
    await remove(conversationRef);
  }

  async deleteConversationMessages(conversationId: string): Promise<void> {
    const messagesRef = ref(this.db, `messages/${conversationId}`);
    await remove(messagesRef);
  }

  // Message methods for conversations
  async addMessage(message: InsertMessage): Promise<Message> {
    const messagesRef = ref(this.db, `messages/${message.conversationId}`);
    const newMessageRef = push(messagesRef);
    const messageData: Message = {
      id: newMessageRef.key!,
      ...message,
      timestamp: Date.now(),
      deleted: false,
      mediaDeleted: false,
    };

    await set(newMessageRef, messageData);
    return messageData;
  }

  async getConversationMessages(conversationId: string): Promise<Message[]> {
    const messagesRef = ref(this.db, `messages/${conversationId}`);
    const snapshot = await get(messagesRef);

    if (!snapshot.exists()) {
      return [];
    }

    const messages: Message[] = [];
    snapshot.forEach((childSnapshot) => {
      const data = childSnapshot.val();
      
      if (data && typeof data === 'object') {
        const message: Message = {
          id: childSnapshot.key!,
          conversationId: data.conversationId,
          senderId: data.senderId,
          senderUsername: data.senderUsername,
          text: data.text || "",
          mediaUrl: data.mediaUrl,
          mediaType: data.mediaType,
          fileName: data.fileName,
          fileSize: data.fileSize,
          timestamp: typeof data.timestamp === 'number' ? data.timestamp : Date.now(),
          deleted: data.deleted || false,
          mediaDeleted: data.mediaDeleted || false,
          deliveredAt: data.deliveredAt,
          readAt: data.readAt,
        };
        
        messages.push(message);
      }
    });

    return messages.sort((a, b) => a.timestamp - b.timestamp);
  }

  subscribeToConversationMessages(conversationId: string, callback: (messages: Message[]) => void): Unsubscribe {
    const messagesRef = ref(this.db, `messages/${conversationId}`);
    
    return onValue(messagesRef, (snapshot) => {
      if (!snapshot.exists()) {
        callback([]);
        return;
      }

      const messages: Message[] = [];
      snapshot.forEach((childSnapshot) => {
        const data = childSnapshot.val();
        
        if (data && typeof data === 'object') {
          const message: Message = {
            id: childSnapshot.key!,
            conversationId: data.conversationId,
            senderId: data.senderId,
            senderUsername: data.senderUsername,
            text: data.text || "",
            mediaUrl: data.mediaUrl,
            mediaType: data.mediaType,
            fileName: data.fileName,
            fileSize: data.fileSize,
            timestamp: typeof data.timestamp === 'number' ? data.timestamp : Date.now(),
            deleted: data.deleted || false,
            mediaDeleted: data.mediaDeleted || false,
            deliveredAt: data.deliveredAt,
            readAt: data.readAt,
          };
          
          messages.push(message);
        }
      });

      const sortedMessages = messages.sort((a, b) => a.timestamp - b.timestamp);
      callback(sortedMessages);
    });
  }


  async getMessage(conversationId: string, messageId: string): Promise<Message | null> {
    const messageRef = ref(this.db, `messages/${conversationId}/${messageId}`);
    const snapshot = await get(messageRef);
    
    if (!snapshot.exists()) {
      return null;
    }

    const data = snapshot.val();
    
    return {
      id: snapshot.key!,
      conversationId: data.conversationId,
      senderId: data.senderId,
      senderUsername: data.senderUsername,
      text: data.text || "",
      mediaUrl: data.mediaUrl,
      mediaType: data.mediaType,
      fileName: data.fileName,
      fileSize: data.fileSize,
      timestamp: typeof data.timestamp === 'number' ? data.timestamp : Date.now(),
      deleted: data.deleted || false,
      mediaDeleted: data.mediaDeleted || false,
      deliveredAt: data.deliveredAt,
      readAt: data.readAt,
    };
  }

  async getLastMessage(conversationId: string): Promise<Message | null> {
    const messages = await this.getConversationMessages(conversationId);
    if (messages.length === 0) return null;
    
    // Filter out call notification messages and get the last non-call message
    const nonCallMessages = messages.filter(msg => 
      msg.text && 
      !msg.text.startsWith("Voice call") && 
      !msg.text.startsWith("Video call")
    );
    
    // If there are non-call messages, return the last one
    // Otherwise return the last message (even if it's a call notification)
    return nonCallMessages.length > 0 
      ? nonCallMessages[nonCallMessages.length - 1] 
      : messages[messages.length - 1];
  }

  async getUnreadCount(conversationId: string, userId: string): Promise<number> {
    const messages = await this.getConversationMessages(conversationId);
    
    // Count messages that are:
    // 1. Not sent by the user
    // 2. Not read (readAt is undefined or null)
    const unreadMessages = messages.filter(msg => 
      msg.senderId !== userId && 
      !msg.readAt
    );
    
    return unreadMessages.length;
  }

  // Typing indicator methods
  async setTypingIndicator(conversationId: string, userId: string, username: string, isTyping: boolean): Promise<void> {
    const typingRef = ref(this.db, `typing/${conversationId}/${userId}`);
    if (isTyping) {
      await set(typingRef, {
        userId,
        username,
        conversationId,
        isTyping: true,
        timestamp: Date.now(),
      });
    } else {
      await remove(typingRef);
    }
  }

  subscribeToTypingIndicators(conversationId: string, callback: (indicators: TypingIndicator[]) => void): Unsubscribe {
    const typingRef = ref(this.db, `typing/${conversationId}`);
    
    return onValue(typingRef, (snapshot) => {
      if (!snapshot.exists()) {
        callback([]);
        return;
      }

      const indicators: TypingIndicator[] = [];
      snapshot.forEach((childSnapshot) => {
        const data = childSnapshot.val();
        if (data && typeof data === 'object') {
          indicators.push({
            userId: data.userId,
            username: data.username,
            conversationId: data.conversationId,
            isTyping: data.isTyping,
            timestamp: data.timestamp,
          });
        }
      });

      callback(indicators);
    });
  }

  // User presence methods
  async setUserPresence(userId: string, username: string, online: boolean): Promise<void> {
    const presenceRef = ref(this.db, `presence/${userId}`);
    await set(presenceRef, {
      userId,
      username,
      online,
      lastSeen: Date.now(),
    });
  }

  async getUserPresence(userId: string): Promise<UserPresence | null> {
    const presenceRef = ref(this.db, `presence/${userId}`);
    const snapshot = await get(presenceRef);
    
    if (!snapshot.exists()) {
      return null;
    }

    const data = snapshot.val();
    return {
      userId: data.userId,
      username: data.username,
      online: data.online,
      lastSeen: data.lastSeen,
    };
  }

  subscribeToUserPresence(userId: string, callback: (presence: UserPresence | null) => void): Unsubscribe {
    const presenceRef = ref(this.db, `presence/${userId}`);
    
    return onValue(presenceRef, (snapshot) => {
      if (!snapshot.exists()) {
        callback(null);
        return;
      }

      const data = snapshot.val();
      callback({
        userId: data.userId,
        username: data.username,
        online: data.online,
        lastSeen: data.lastSeen,
      });
    });
  }

  // Message read receipt methods
  async markMessageAsDelivered(conversationId: string, messageId: string): Promise<void> {
    const messageRef = ref(this.db, `messages/${conversationId}/${messageId}`);
    await update(messageRef, { deliveredAt: Date.now() });
  }

  async markMessageAsRead(conversationId: string, messageId: string): Promise<void> {
    const messageRef = ref(this.db, `messages/${conversationId}/${messageId}`);
    await update(messageRef, { readAt: Date.now() });
  }

  async markConversationMessagesAsRead(conversationId: string, userId: string): Promise<void> {
    const messages = await this.getConversationMessages(conversationId);
    const now = Date.now();
    
    for (const message of messages) {
      if (message.senderId !== userId && !message.readAt) {
        const messageRef = ref(this.db, `messages/${conversationId}/${message.id}`);
        await update(messageRef, { 
          deliveredAt: message.deliveredAt || now,
          readAt: now 
        });
      }
    }
  }

  // Group methods
  async getGroup(groupId: string): Promise<Group | null> {
    const groupRef = ref(this.db, `groups/${groupId}`);
    const snapshot = await get(groupRef);
    
    if (!snapshot.exists()) {
      return null;
    }

    return snapshot.val();
  }

  async getGroupByName(name: string): Promise<Group | null> {
    const groupsSnapshot = await get(this.groupsRef);
    
    if (!groupsSnapshot.exists()) {
      return null;
    }

    let foundGroup: Group | null = null;
    groupsSnapshot.forEach((childSnapshot) => {
      const group = childSnapshot.val() as Group;
      if (group.name.toLowerCase() === name.toLowerCase()) {
        foundGroup = group;
      }
    });

    return foundGroup;
  }

  async createGroup(data: { id: string; name: string; description?: string; creatorId: string; createdAt: number; lastMessageAt: number; memberCount: number }): Promise<Group> {
    const group: Group = {
      id: data.id,
      name: data.name,
      description: data.description,
      creatorId: data.creatorId,
      createdAt: data.createdAt,
      lastMessageAt: data.lastMessageAt,
      memberCount: data.memberCount,
      lastMemberChangeAt: data.createdAt,
    };
    
    const groupRef = ref(this.db, `groups/${group.id}`);
    await set(groupRef, group);
    return group;
  }

  async updateGroup(groupId: string, data: Partial<Group>): Promise<Group | null> {
    const groupRef = ref(this.db, `groups/${groupId}`);
    const snapshot = await get(groupRef);
    
    if (!snapshot.exists()) {
      return null;
    }
    
    await update(groupRef, data);
    
    const updatedSnapshot = await get(groupRef);
    return updatedSnapshot.val();
  }

  async deleteGroup(groupId: string): Promise<void> {
    const groupRef = ref(this.db, `groups/${groupId}`);
    await remove(groupRef);
  }

  async searchGroups(query: string): Promise<Group[]> {
    const lowerQuery = query.toLowerCase().trim();
    if (!lowerQuery) return [];

    const groupsSnapshot = await get(this.groupsRef);
    
    if (!groupsSnapshot.exists()) {
      return [];
    }

    const matchingGroups: Group[] = [];
    groupsSnapshot.forEach((childSnapshot) => {
      const group = childSnapshot.val() as Group;
      if (group.name.toLowerCase().includes(lowerQuery)) {
        matchingGroups.push(group);
      }
    });

    return matchingGroups;
  }

  async getAllGroups(): Promise<Group[]> {
    const groupsSnapshot = await get(this.groupsRef);
    
    if (!groupsSnapshot.exists()) {
      return [];
    }

    const groups: Group[] = [];
    groupsSnapshot.forEach((childSnapshot) => {
      const group = childSnapshot.val() as Group;
      groups.push(group);
    });

    return groups.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
  }

  async updateGroupLastMessage(groupId: string, timestamp: number): Promise<void> {
    const groupRef = ref(this.db, `groups/${groupId}`);
    await update(groupRef, { lastMessageAt: timestamp });
  }

  async deleteGroupMessages(groupId: string): Promise<void> {
    const messagesRef = ref(this.db, `messages/${groupId}`);
    await remove(messagesRef);
  }

  // Group member methods
  async addGroupMember(data: { id: string; groupId: string; userId: string; joinedAt: number }): Promise<GroupMember> {
    const groupMember: GroupMember = {
      id: data.id,
      groupId: data.groupId,
      userId: data.userId,
      joinedAt: data.joinedAt,
    };
    
    const memberRef = ref(this.db, `groupMembers/${data.groupId}/${data.userId}`);
    await set(memberRef, groupMember);
    
    const groupRef = ref(this.db, `groups/${data.groupId}`);
    const groupSnapshot = await get(groupRef);
    if (groupSnapshot.exists()) {
      const group = groupSnapshot.val() as Group;
      await update(groupRef, {
        memberCount: (group.memberCount || 0) + 1,
        lastMemberChangeAt: Date.now(),
      });
    }
    
    return groupMember;
  }

  async removeGroupMember(groupId: string, userId: string): Promise<void> {
    const memberRef = ref(this.db, `groupMembers/${groupId}/${userId}`);
    await remove(memberRef);
    
    const groupRef = ref(this.db, `groups/${groupId}`);
    const groupSnapshot = await get(groupRef);
    if (groupSnapshot.exists()) {
      const group = groupSnapshot.val() as Group;
      const newMemberCount = Math.max(0, (group.memberCount || 0) - 1);
      await update(groupRef, {
        memberCount: newMemberCount,
        lastMemberChangeAt: Date.now(),
      });
    }
  }

  async getGroupMembers(groupId: string): Promise<GroupMember[]> {
    const membersRef = ref(this.db, `groupMembers/${groupId}`);
    const snapshot = await get(membersRef);

    if (!snapshot.exists()) {
      return [];
    }

    const members: GroupMember[] = [];
    snapshot.forEach((childSnapshot) => {
      const member = childSnapshot.val() as GroupMember;
      members.push(member);
    });

    return members;
  }

  async getUserGroups(userId: string): Promise<Group[]> {
    const groupMembersSnapshot = await get(this.groupMembersRef);
    
    if (!groupMembersSnapshot.exists()) {
      return [];
    }

    const userGroupIds: string[] = [];
    groupMembersSnapshot.forEach((groupSnapshot) => {
      groupSnapshot.forEach((memberSnapshot) => {
        const member = memberSnapshot.val() as GroupMember;
        if (member.userId === userId) {
          userGroupIds.push(member.groupId);
        }
      });
    });

    const groups: Group[] = [];
    for (const groupId of userGroupIds) {
      const group = await this.getGroup(groupId);
      if (group) {
        groups.push(group);
      }
    }

    return groups.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
  }

  async isGroupMember(groupId: string, userId: string): Promise<boolean> {
    const memberRef = ref(this.db, `groupMembers/${groupId}/${userId}`);
    const snapshot = await get(memberRef);
    return snapshot.exists();
  }

  async getAllUsers(): Promise<User[]> {
    const usersSnapshot = await get(this.usersRef);
    
    if (!usersSnapshot.exists()) {
      return [];
    }

    const users: User[] = [];
    usersSnapshot.forEach((childSnapshot) => {
      const user = childSnapshot.val() as User;
      users.push(user);
    });

    return users;
  }

  async getAllConversations(): Promise<Conversation[]> {
    const conversationsSnapshot = await get(this.conversationsRef);
    
    if (!conversationsSnapshot.exists()) {
      return [];
    }

    const conversations: Conversation[] = [];
    conversationsSnapshot.forEach((childSnapshot) => {
      const conversation = childSnapshot.val() as Conversation;
      conversations.push(conversation);
    });

    return conversations;
  }

  async updateUserActivity(userId: string): Promise<void> {
    const userRef = ref(this.db, `users/${userId}`);
    const snapshot = await get(userRef);
    
    if (snapshot.exists()) {
      await update(userRef, {
        lastActiveAt: Date.now(),
      });
    }
  }

  async deleteMessageFromFirebaseOnly(conversationId: string, messageId: string): Promise<void> {
    const messageRef = ref(this.db, `messages/${conversationId}/${messageId}`);
    await remove(messageRef);
  }

  async deleteGroupFromFirebaseOnly(groupId: string): Promise<void> {
    const groupRef = ref(this.db, `groups/${groupId}`);
    const messagesRef = ref(this.db, `messages/${groupId}`);
    const membersRef = ref(this.db, `groupMembers/${groupId}`);
    
    await Promise.all([
      remove(groupRef),
      remove(messagesRef),
      remove(membersRef),
    ]);
  }

}

export const firebaseService = new FirebaseService();
