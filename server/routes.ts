import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { firebaseService } from "./services/firebase";
import { googleSheetsService } from "./services/sheets";
import { sheetsBackupService } from "./services/sheetsBackup";
import { cleanupOrchestrator } from "./services/cleanup";
import { insertMessageSchema, insertUserSchema, loginSchema, blockUserSchema, insertCallSchema, updateCallSchema, endCallSchema, updateUserSchema, type ConversationWithDetails, type Call, insertGroupSchema, updateGroupSchema, insertGroupMemberSchema, type GroupWithDetails } from "@shared/schema";
import { storage } from "./storage";
import { z } from "zod";
import bcrypt from "bcryptjs";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";

const upload = multer({ storage: multer.memoryStorage() });

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

export async function registerRoutes(app: Express): Promise<Server> {
  await googleSheetsService.initializeSheet();
  await googleSheetsService.initializeCallsSheet();
  await googleSheetsService.initializeGroupsSheet();
  await sheetsBackupService.initialize();
  await cleanupOrchestrator.initialize();

  app.get("/api/config/firebase", (req, res) => {
    res.json({
      apiKey: process.env.FIREBASE_API_KEY,
      authDomain: process.env.FIREBASE_AUTH_DOMAIN,
      databaseURL: process.env.FIREBASE_DATABASE_URL,
      projectId: process.env.FIREBASE_PROJECT_ID,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.FIREBASE_APP_ID,
    });
  });


  app.get("/api/config/cloudinary", (req, res) => {
    res.json({
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      uploadPreset: process.env.CLOUDINARY_UPLOAD_PRESET,
    });
  });


  

  app.post("/api/auth/register", async (req, res) => {
    try {
      const validatedData = insertUserSchema.parse(req.body);
      

      const existingUser = await storage.getUserByUsername(validatedData.username);
      if (existingUser) {
        return res.status(400).json({ error: "Username already taken" });
      }
      

      const passwordHash = await bcrypt.hash(validatedData.password, 10);
      

      const user = await storage.createUser({
        username: validatedData.username,
        name: validatedData.name,
        passwordHash,
      });
      

      req.session.userId = user.id;
      
      res.status(201).json({
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          createdAt: user.createdAt,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid user data", details: error.errors });
      } else {
        console.error("Error registering user:", error);
        res.status(500).json({ error: "Failed to register user" });
      }
    }
  });
  

  app.post("/api/auth/login", async (req, res) => {
    try {
      const validatedData = loginSchema.parse(req.body);
      

      const user = await storage.getUserByUsername(validatedData.username);
      if (!user) {
        return res.status(401).json({ error: "Invalid username or password" });
      }
      

      const isValidPassword = await bcrypt.compare(validatedData.password, user.passwordHash);
      if (!isValidPassword) {
        return res.status(401).json({ error: "Invalid username or password" });
      }
      

      req.session.userId = user.id;
      

      await firebaseService.updateUserActivity(user.id);
      

      res.json({
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          createdAt: user.createdAt,
        }
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid login data", details: error.errors });
      } else {
        console.error("Error logging in:", error);
        res.status(500).json({ error: "Failed to login" });
      }
    }
  });

  // GET search users by username - must come BEFORE /api/users/:userId
  app.get("/api/users/search", requireAuth, async (req, res) => {
    try {
      const query = req.query.q as string;
      const currentUserId = req.session.userId!;
      
      if (!query || query.trim().length === 0) {
        return res.json([]);
      }
      
      const users = await storage.searchUsers(query);
      
      const blockedUserIds = await storage.getBlockedUsers(currentUserId);
      
      const filteredUsers = users.filter(user => 
        user.id !== currentUserId && !blockedUserIds.includes(user.id)
      );
      
      const safeUsers = filteredUsers.map(user => ({
        id: user.id,
        username: user.username,
        createdAt: user.createdAt,
      }));
      res.json(safeUsers);
    } catch (error) {
      console.error("Error searching users:", error);
      res.status(500).json({ error: "Failed to search users" });
    }
  });

  // GET current user's profile - protected route
  app.get("/api/users/:userId", requireAuth, async (req, res) => {
    try {
      const requestedUserId = req.params.userId;
      const sessionUserId = req.session.userId;
      
      // Users can only access their own profile
      if (requestedUserId !== sessionUserId) {
        return res.status(403).json({ error: "Forbidden: You can only access your own profile" });
      }
      
      const user = await storage.getUser(requestedUserId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      res.json({
        id: user.id,
        username: user.username,
        name: user.name,
        createdAt: user.createdAt,
      });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  // PATCH update user's display name - protected route
  app.patch("/api/users/:userId", requireAuth, async (req, res) => {
    try {
      const requestedUserId = req.params.userId;
      const sessionUserId = req.session.userId;
      
      // Users can only update their own profile
      if (requestedUserId !== sessionUserId) {
        return res.status(403).json({ error: "Forbidden: You can only update your own profile" });
      }
      
      const validatedData = updateUserSchema.parse(req.body);
      
      const updatedUser = await storage.updateUser(requestedUserId, validatedData);
      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      res.json({
        id: updatedUser.id,
        username: updatedUser.username,
        name: updatedUser.name,
        createdAt: updatedUser.createdAt,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid user data", details: error.errors });
      } else {
        console.error("Error updating user:", error);
        res.status(500).json({ error: "Failed to update user" });
      }
    }
  });

  // DELETE user account - protected route
  app.delete("/api/users/:userId", requireAuth, async (req, res) => {
    try {
      const requestedUserId = req.params.userId;
      const sessionUserId = req.session.userId;
      
      // Users can only delete their own account
      if (requestedUserId !== sessionUserId) {
        return res.status(403).json({ error: "Forbidden: You can only delete your own account" });
      }
      
      const user = await storage.getUser(requestedUserId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Delete the user and all associated data
      await storage.deleteUser(requestedUserId);
      
      // Clear the session
      req.session.destroy((err) => {
        if (err) {
          console.error("Error destroying session:", err);
        }
      });
      
      res.json({ message: "Account deleted successfully" });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ error: "Failed to delete account" });
    }
  });

  // Blocking routes

  // POST block a user (permanent, mutual)
  app.post("/api/users/block/:userId", requireAuth, async (req, res) => {
    try {
      const currentUserId = req.session.userId!;
      const targetUserId = req.params.userId;

      if (currentUserId === targetUserId) {
        return res.status(400).json({ error: "Cannot block yourself" });
      }

      const targetUser = await storage.getUser(targetUserId);
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }

      const isAlreadyBlocked = await storage.isBlocked(currentUserId, targetUserId);
      if (isAlreadyBlocked) {
        return res.status(400).json({ error: "User already blocked" });
      }

      await storage.blockUser(currentUserId, targetUserId);

      const conversation = await storage.getConversationByParticipants(currentUserId, targetUserId);
      
      if (conversation) {
        await storage.deleteConversation(conversation.id);

        const timestamp = new Date().toISOString();
        const currentUser = await storage.getUser(currentUserId);
        
        await googleSheetsService.logAction(
          "block",
          {
            id: `block-${Date.now()}`,
            conversationId: conversation.id,
            senderId: currentUserId,
            senderUsername: currentUser?.username || "",
            text: `User blocked: ${targetUser.username}`,
            timestamp: Date.now(),
            deleted: false,
            mediaDeleted: false,
          },
          conversation.id,
          targetUserId,
          true
        );

        sheetsBackupService.notifyMessageLogged();
      }

      res.json({ 
        message: "User blocked successfully",
        blockedUserId: targetUserId,
        blockedUsername: targetUser.username
      });
    } catch (error) {
      console.error("Error blocking user:", error);
      res.status(500).json({ error: "Failed to block user" });
    }
  });

  // GET blocked users list
  app.get("/api/users/blocked", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const blockedUserIds = await storage.getBlockedUsers(userId);
      
      const blockedUsersWithDetails = await Promise.all(
        blockedUserIds.map(async (blockedUserId) => {
          const user = await storage.getUser(blockedUserId);
          return {
            id: blockedUserId,
            username: user?.username || "Unknown",
            blockedAt: user ? (await storage.getUser(userId))?.blockedAt[blockedUserId] : Date.now(),
          };
        })
      );

      res.json(blockedUsersWithDetails);
    } catch (error) {
      console.error("Error fetching blocked users:", error);
      res.status(500).json({ error: "Failed to fetch blocked users" });
    }
  });

  // Conversation routes
  
  // GET user's conversations
  app.get("/api/conversations", requireAuth, async (req, res) => {
    try {
      const userId = req.query.userId as string;
      const currentUserId = req.session.userId!;
      
      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }
      
      if (userId !== currentUserId) {
        return res.status(403).json({ error: "Forbidden: Can only access own conversations" });
      }
      
      const conversations = await storage.getUserConversations(userId);
      const blockedUserIds = await storage.getBlockedUsers(userId);
      
      const filteredConversations = conversations.filter(conv => {
        const otherUserId = conv.participants.find(id => id !== userId);
        return otherUserId && !blockedUserIds.includes(otherUserId);
      });
      
      const conversationsWithDetails: ConversationWithDetails[] = await Promise.all(
        filteredConversations.map(async (conv) => {
          const otherUserId = conv.participants.find(id => id !== userId);
          const otherUser = otherUserId ? await storage.getUser(otherUserId) : undefined;
          const lastMessage = await firebaseService.getLastMessage(conv.id);
          const unreadCount = await firebaseService.getUnreadCount(conv.id, userId);
          
          return {
            ...conv,
            otherUser,
            lastMessage: lastMessage || undefined,
            unreadCount,
          };
        })
      );
      
      res.json(conversationsWithDetails);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  // POST create or get conversation between two users
  app.post("/api/conversations", requireAuth, async (req, res) => {
    try {
      const { user1Id, user2Id } = req.body;
      const currentUserId = req.session.userId!;
      
      if (!user1Id || !user2Id) {
        return res.status(400).json({ error: "user1Id and user2Id are required" });
      }
      
      if (user1Id === user2Id) {
        return res.status(400).json({ error: "Cannot create conversation with yourself" });
      }
      
      if (user1Id !== currentUserId && user2Id !== currentUserId) {
        return res.status(403).json({ error: "Forbidden: You can only create conversations for yourself" });
      }
      
      const otherUserId = user1Id === currentUserId ? user2Id : user1Id;
      
      const isBlocked = await storage.isBlocked(currentUserId, otherUserId);
      if (isBlocked) {
        return res.status(403).json({ error: "Cannot create conversation with blocked user" });
      }
      
      let conversation = await storage.getConversationByParticipants(user1Id, user2Id);
      
      if (!conversation) {
        conversation = await storage.createConversation({
          participants: [user1Id, user2Id],
        });
      }
      
      res.json(conversation);
    } catch (error) {
      console.error("Error creating conversation:", error);
      res.status(500).json({ error: "Failed to create conversation" });
    }
  });

  // Group routes
  
  // GET all groups
  app.get("/api/groups", requireAuth, async (req, res) => {
    try {
      const query = req.query.q as string;
      
      let groups;
      if (query && query.trim().length > 0) {
        groups = await storage.searchGroups(query);
      } else {
        groups = await storage.getAllGroups();
      }
      
      const groupsWithDetails: GroupWithDetails[] = await Promise.all(
        groups.map(async (group) => {
          const members = await storage.getGroupMembers(group.id);
          const memberDetails = await Promise.all(
            members.map(m => storage.getUser(m.userId))
          );
          const lastMessage = await firebaseService.getLastMessage(group.id);
          
          return {
            ...group,
            members: memberDetails.filter(m => m !== undefined),
            lastMessage: lastMessage || undefined,
            isCreator: group.creatorId === req.session.userId,
            isMember: await storage.isGroupMember(group.id, req.session.userId!),
          };
        })
      );
      
      res.json(groupsWithDetails);
    } catch (error) {
      console.error("Error fetching groups:", error);
      res.status(500).json({ error: "Failed to fetch groups" });
    }
  });

  // GET user's groups
  app.get("/api/groups/my", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const groups = await storage.getUserGroups(userId);
      
      const groupsWithDetails: GroupWithDetails[] = await Promise.all(
        groups.map(async (group) => {
          const members = await storage.getGroupMembers(group.id);
          const memberDetails = await Promise.all(
            members.map(m => storage.getUser(m.userId))
          );
          const lastMessage = await firebaseService.getLastMessage(group.id);
          
          return {
            ...group,
            members: memberDetails.filter(m => m !== undefined),
            lastMessage: lastMessage || undefined,
            isCreator: group.creatorId === userId,
            isMember: true,
          };
        })
      );
      
      res.json(groupsWithDetails);
    } catch (error) {
      console.error("Error fetching user groups:", error);
      res.status(500).json({ error: "Failed to fetch user groups" });
    }
  });

  // GET single group
  app.get("/api/groups/:groupId", requireAuth, async (req, res) => {
    try {
      const { groupId } = req.params;
      const group = await storage.getGroup(groupId);
      
      if (!group) {
        return res.status(404).json({ error: "Group not found" });
      }
      
      const members = await storage.getGroupMembers(groupId);
      const memberDetails = await Promise.all(
        members.map(m => storage.getUser(m.userId))
      );
      const lastMessage = await firebaseService.getLastMessage(groupId);
      
      const groupWithDetails: GroupWithDetails = {
        ...group,
        members: memberDetails.filter(m => m !== undefined),
        lastMessage: lastMessage || undefined,
        isCreator: group.creatorId === req.session.userId,
        isMember: await storage.isGroupMember(groupId, req.session.userId!),
      };
      
      res.json(groupWithDetails);
    } catch (error) {
      console.error("Error fetching group:", error);
      res.status(500).json({ error: "Failed to fetch group" });
    }
  });

  // POST create new group
  app.post("/api/groups", requireAuth, async (req, res) => {
    try {
      const currentUserId = req.session.userId!;
      const validatedData = insertGroupSchema.parse({
        ...req.body,
        creatorId: currentUserId,
      });
      
      const existingGroup = await storage.getGroupByName(validatedData.name);
      if (existingGroup) {
        return res.status(400).json({ error: "Group name already exists" });
      }
      
      const group = await storage.createGroup(validatedData);
      
      if (req.body.memberIds && Array.isArray(req.body.memberIds)) {
        for (const userId of req.body.memberIds) {
          if (userId !== currentUserId) {
            await storage.addGroupMember({ groupId: group.id, userId });
          }
        }
      }
      
      res.status(201).json(group);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid group data", details: error.errors });
      } else {
        console.error("Error creating group:", error);
        res.status(500).json({ error: "Failed to create group" });
      }
    }
  });

  // PATCH update group
  app.patch("/api/groups/:groupId", requireAuth, async (req, res) => {
    try {
      const { groupId } = req.params;
      const currentUserId = req.session.userId!;
      
      const group = await storage.getGroup(groupId);
      if (!group) {
        return res.status(404).json({ error: "Group not found" });
      }
      
      if (group.creatorId !== currentUserId) {
        return res.status(403).json({ error: "Only group creator can update group" });
      }
      
      const validatedData = updateGroupSchema.parse(req.body);
      const updatedGroup = await storage.updateGroup(groupId, validatedData);
      
      res.json(updatedGroup);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid group data", details: error.errors });
      } else {
        console.error("Error updating group:", error);
        res.status(500).json({ error: "Failed to update group" });
      }
    }
  });

  // DELETE group
  app.delete("/api/groups/:groupId", requireAuth, async (req, res) => {
    try {
      const { groupId } = req.params;
      const currentUserId = req.session.userId!;
      
      const group = await storage.getGroup(groupId);
      if (!group) {
        return res.status(404).json({ error: "Group not found" });
      }
      
      if (group.creatorId !== currentUserId) {
        return res.status(403).json({ error: "Only group creator can delete group" });
      }
      
      await storage.deleteGroup(groupId);
      await firebaseService.deleteGroupMessages(groupId);
      
      res.json({ message: "Group deleted successfully" });
    } catch (error) {
      console.error("Error deleting group:", error);
      res.status(500).json({ error: "Failed to delete group" });
    }
  });

  // POST join group
  app.post("/api/groups/:groupId/join", requireAuth, async (req, res) => {
    try {
      const { groupId } = req.params;
      const currentUserId = req.session.userId!;
      
      const group = await storage.getGroup(groupId);
      if (!group) {
        return res.status(404).json({ error: "Group not found" });
      }
      
      const isMember = await storage.isGroupMember(groupId, currentUserId);
      if (isMember) {
        return res.status(400).json({ error: "Already a member of this group" });
      }
      
      await storage.addGroupMember({ groupId, userId: currentUserId });
      
      res.json({ message: "Joined group successfully" });
    } catch (error) {
      console.error("Error joining group:", error);
      res.status(500).json({ error: "Failed to join group" });
    }
  });

  // POST add member to group
  app.post("/api/groups/:groupId/members", requireAuth, async (req, res) => {
    try {
      const { groupId } = req.params;
      const { userId } = req.body;
      
      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }
      
      const group = await storage.getGroup(groupId);
      if (!group) {
        return res.status(404).json({ error: "Group not found" });
      }
      
      const isMember = await storage.isGroupMember(groupId, userId);
      if (isMember) {
        return res.status(400).json({ error: "User is already a member" });
      }
      
      await storage.addGroupMember({ groupId, userId });
      
      res.json({ message: "Member added successfully" });
    } catch (error) {
      console.error("Error adding member:", error);
      res.status(500).json({ error: "Failed to add member" });
    }
  });

  // DELETE leave group
  app.delete("/api/groups/:groupId/leave", requireAuth, async (req, res) => {
    try {
      const { groupId } = req.params;
      const currentUserId = req.session.userId!;
      
      const group = await storage.getGroup(groupId);
      if (!group) {
        return res.status(404).json({ error: "Group not found" });
      }
      
      if (group.creatorId === currentUserId) {
        return res.status(400).json({ error: "Group creator cannot leave. Delete the group instead." });
      }
      
      await storage.removeGroupMember(groupId, currentUserId);
      
      res.json({ message: "Left group successfully" });
    } catch (error) {
      console.error("Error leaving group:", error);
      res.status(500).json({ error: "Failed to leave group" });
    }
  });

  // DELETE group (creator only)
  app.delete("/api/groups/:groupId", requireAuth, async (req, res) => {
    try {
      const { groupId } = req.params;
      const currentUserId = req.session.userId!;
      
      const group = await storage.getGroup(groupId);
      if (!group) {
        return res.status(404).json({ error: "Group not found" });
      }
      
      if (group.creatorId !== currentUserId) {
        return res.status(403).json({ error: "Only the group creator can delete the group" });
      }
      
      // Delete the group (this will cascade delete members and messages in Firebase)
      await storage.deleteGroup(groupId);
      
      res.json({ message: "Group deleted successfully" });
    } catch (error) {
      console.error("Error deleting group:", error);
      res.status(500).json({ error: "Failed to delete group" });
    }
  });

  // GET group members
  app.get("/api/groups/:groupId/members", requireAuth, async (req, res) => {
    try {
      const { groupId } = req.params;
      
      const group = await storage.getGroup(groupId);
      if (!group) {
        return res.status(404).json({ error: "Group not found" });
      }
      
      const members = await storage.getGroupMembers(groupId);
      const memberDetails = await Promise.all(
        members.map(async (m) => {
          const user = await storage.getUser(m.userId);
          return user ? { ...user, joinedAt: m.joinedAt } : null;
        })
      );
      
      res.json(memberDetails.filter(m => m !== null));
    } catch (error) {
      console.error("Error fetching group members:", error);
      res.status(500).json({ error: "Failed to fetch group members" });
    }
  });

  // GET messages for a group
  app.get("/api/groups/:groupId/messages", requireAuth, async (req, res) => {
    try {
      const { groupId } = req.params;
      
      const isMember = await storage.isGroupMember(groupId, req.session.userId!);
      if (!isMember) {
        return res.status(403).json({ error: "Must be a group member to view messages" });
      }
      
      const messages = await firebaseService.getConversationMessages(groupId);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching group messages:", error);
      res.status(500).json({ error: "Failed to fetch group messages" });
    }
  });

  // POST new message to a group
  app.post("/api/groups/:groupId/messages", requireAuth, async (req, res) => {
    try {
      const { groupId } = req.params;
      
      const isMember = await storage.isGroupMember(groupId, req.session.userId!);
      if (!isMember) {
        return res.status(403).json({ error: "Must be a group member to send messages" });
      }
      
      const validatedData = insertMessageSchema.parse({
        ...req.body,
        conversationId: groupId,
      });
      
      const message = await firebaseService.addMessage(validatedData);
      
      await storage.updateGroupLastMessage(groupId, message.timestamp);
      await firebaseService.updateGroupLastMessage(groupId, message.timestamp);
      

      await firebaseService.updateUserActivity(req.session.userId!);
      
      googleSheetsService.logMessage(message, "send").then(() => {
        sheetsBackupService.notifyMessageLogged();
      }).catch(console.error);
      
      res.status(201).json(message);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid message data", details: error.errors });
      } else {
        console.error("Error creating group message:", error);
        res.status(500).json({ error: "Failed to create group message" });
      }
    }
  });

  // Message routes
  
  // GET messages for a conversation
  app.get("/api/conversations/:conversationId/messages", async (req, res) => {
    try {
      const { conversationId } = req.params;
      const messages = await firebaseService.getConversationMessages(conversationId);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  // POST new message to a conversation
  app.post("/api/conversations/:conversationId/messages", async (req, res) => {
    try {
      const { conversationId } = req.params;
      const validatedData = insertMessageSchema.parse({
        ...req.body,
        conversationId,
      });
      
      const message = await firebaseService.addMessage(validatedData);
      
      // Update conversation's last message timestamp
      await storage.updateConversationLastMessage(conversationId, message.timestamp);
      await firebaseService.updateConversationLastMessage(conversationId, message.timestamp);
      

      if (message.senderId) {
        await firebaseService.updateUserActivity(message.senderId);
      }
      
      // Log to Google Sheets asynchronously with action "send"
      googleSheetsService.logMessage(message, "send").then(() => {
        sheetsBackupService.notifyMessageLogged();
      }).catch(console.error);
      
      res.status(201).json(message);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid message data", details: error.errors });
      } else {
        console.error("Error creating message:", error);
        res.status(500).json({ error: "Failed to create message" });
      }
    }
  });

  // Call routes
  
  // POST new call
  app.post("/api/calls", async (req, res) => {
    try {
      const validatedData = insertCallSchema.parse(req.body);
      
      const call: Call = {
        ...validatedData,
        id: validatedData.id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
      };

      // Log to Google Sheets asynchronously
      googleSheetsService.logCall(call).catch(console.error);
      
      res.status(201).json(call);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid call data", details: error.errors });
      } else {
        console.error("Error creating call:", error);
        res.status(500).json({ error: "Failed to create call" });
      }
    }
  });

  // PATCH update call
  app.patch("/api/calls/:callId", async (req, res) => {
    try {
      const { callId } = req.params;
      
      // If status is "ended", require complete call data for logging
      if (req.body.status === "ended") {
        const validatedEndCall = endCallSchema.parse(req.body);
        
        const call: Call = {
          id: callId,
          ...validatedEndCall,
        };

        // Log to Google Sheets - throw error if logging fails for ended calls
        try {
          await googleSheetsService.logCall(call, true);
        } catch (logError) {
          console.error("Failed to log ended call to Google Sheets:", logError);
          return res.status(503).json({ 
            error: "Failed to log call",
            message: "Call ended but could not be logged to Google Sheets",
            details: logError instanceof Error ? logError.message : "Unknown error"
          });
        }
        
        res.json({ success: true, callId, call });
      } else {
        // For other status updates, use the simpler schema
        const validatedUpdates = updateCallSchema.parse(req.body);
        res.json({ success: true, callId, updates: validatedUpdates });
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ 
          error: "Invalid call update data", 
          details: error.errors 
        });
      } else {
        console.error("Error updating call:", error);
        res.status(500).json({ 
          error: "Failed to update call",
          message: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }
  });

  // POST upload call recording
  app.post("/api/upload-call-recording", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file provided" });
      }

      const file = req.file;

      if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
        return res.status(500).json({ 
          error: "Cloudinary not configured",
          message: "Missing Cloudinary credentials in environment variables"
        });
      }

      // Convert buffer to base64 data URI
      const b64 = Buffer.from(file.buffer).toString("base64");
      const dataURI = `data:${file.mimetype};base64,${b64}`;

      // Upload to Cloudinary using the SDK
      const result = await cloudinary.uploader.upload(dataURI, {
        resource_type: "video",
        folder: "call-recordings",
      });

      res.json({ 
        url: result.secure_url, 
        publicId: result.public_id 
      });
    } catch (error) {
      console.error("Error uploading call recording:", error);
      res.status(500).json({ 
        error: "Failed to upload recording",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
