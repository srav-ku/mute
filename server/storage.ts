import { type User, type InsertUser, type Conversation, type InsertConversation, type Group, type InsertGroup, type UpdateGroup, type GroupMember, type InsertGroupMember } from "@shared/schema";
import { randomUUID } from "crypto";
import { firebaseService } from "./services/firebase";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(data: { username: string; name: string; passwordHash: string }): Promise<User>;
  updateUser(id: string, data: { name: string }): Promise<User | undefined>;
  searchUsers(query: string): Promise<User[]>;
  deleteUser(id: string): Promise<void>;
  blockUser(userId: string, targetUserId: string): Promise<void>;
  getBlockedUsers(userId: string): Promise<string[]>;
  isBlocked(userId: string, targetUserId: string): Promise<boolean>;
  getConversation(id: string): Promise<Conversation | undefined>;
  getConversationByParticipants(user1Id: string, user2Id: string): Promise<Conversation | undefined>;
  getUserConversations(userId: string): Promise<Conversation[]>;
  createConversation(conversation: InsertConversation): Promise<Conversation>;
  updateConversationLastMessage(id: string, timestamp: number): Promise<void>;
  deleteConversation(id: string): Promise<void>;
  getGroup(id: string): Promise<Group | undefined>;
  getGroupByName(name: string): Promise<Group | undefined>;
  createGroup(group: InsertGroup): Promise<Group>;
  updateGroup(id: string, data: UpdateGroup): Promise<Group | undefined>;
  deleteGroup(id: string): Promise<void>;
  searchGroups(query: string): Promise<Group[]>;
  getAllGroups(): Promise<Group[]>;
  updateGroupLastMessage(id: string, timestamp: number): Promise<void>;
  addGroupMember(groupMember: InsertGroupMember): Promise<GroupMember>;
  removeGroupMember(groupId: string, userId: string): Promise<void>;
  getGroupMembers(groupId: string): Promise<GroupMember[]>;
  getUserGroups(userId: string): Promise<Group[]>;
  isGroupMember(groupId: string, userId: string): Promise<boolean>;
}

export class FirebaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const user = await firebaseService.getUser(id);
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const user = await firebaseService.getUserByUsername(username);
    return user || undefined;
  }

  async createUser(data: { username: string; name: string; passwordHash: string }): Promise<User> {
    const id = randomUUID();
    const user = await firebaseService.createUser({
      id,
      username: data.username,
      name: data.name,
      passwordHash: data.passwordHash,
      createdAt: Date.now(),
    });
    return user;
  }

  async updateUser(id: string, data: { name: string }): Promise<User | undefined> {
    const user = await firebaseService.updateUser(id, data);
    return user || undefined;
  }

  async searchUsers(query: string): Promise<User[]> {
    return await firebaseService.searchUsers(query);
  }

  async deleteUser(id: string): Promise<void> {
    await firebaseService.deleteUser(id);
  }

  async blockUser(userId: string, targetUserId: string): Promise<void> {
    await firebaseService.blockUser(userId, targetUserId);
  }

  async getBlockedUsers(userId: string): Promise<string[]> {
    return await firebaseService.getBlockedUsers(userId);
  }

  async isBlocked(userId: string, targetUserId: string): Promise<boolean> {
    return await firebaseService.isBlocked(userId, targetUserId);
  }

  async getConversation(id: string): Promise<Conversation | undefined> {
    const conversation = await firebaseService.getConversation(id);
    return conversation || undefined;
  }

  async getConversationByParticipants(user1Id: string, user2Id: string): Promise<Conversation | undefined> {
    const conversation = await firebaseService.getConversationByParticipants(user1Id, user2Id);
    return conversation || undefined;
  }

  async getUserConversations(userId: string): Promise<Conversation[]> {
    return await firebaseService.getUserConversations(userId);
  }

  async createConversation(insertConversation: InsertConversation): Promise<Conversation> {
    const id = randomUUID();
    const now = Date.now();
    const conversation = await firebaseService.createConversation({
      id,
      participants: insertConversation.participants,
      createdAt: now,
      lastMessageAt: now,
    });
    return conversation;
  }

  async updateConversationLastMessage(id: string, timestamp: number): Promise<void> {
    await firebaseService.updateConversationLastMessage(id, timestamp);
  }

  async deleteConversation(id: string): Promise<void> {
    await firebaseService.deleteConversation(id);
    await firebaseService.deleteConversationMessages(id);
  }

  async getGroup(id: string): Promise<Group | undefined> {
    const group = await firebaseService.getGroup(id);
    return group || undefined;
  }

  async getGroupByName(name: string): Promise<Group | undefined> {
    const group = await firebaseService.getGroupByName(name);
    return group || undefined;
  }

  async createGroup(insertGroup: InsertGroup): Promise<Group> {
    const id = randomUUID();
    const now = Date.now();
    const group = await firebaseService.createGroup({
      id,
      name: insertGroup.name,
      description: insertGroup.description,
      creatorId: insertGroup.creatorId,
      createdAt: now,
      lastMessageAt: now,
      memberCount: 1,
    });
    
    const memberId = randomUUID();
    await firebaseService.addGroupMember({
      id: memberId,
      groupId: id,
      userId: insertGroup.creatorId,
      joinedAt: now,
    });
    
    return group;
  }

  async updateGroup(id: string, data: UpdateGroup): Promise<Group | undefined> {
    const group = await firebaseService.updateGroup(id, data);
    return group || undefined;
  }

  async deleteGroup(id: string): Promise<void> {
    const members = await firebaseService.getGroupMembers(id);
    for (const member of members) {
      await firebaseService.removeGroupMember(id, member.userId);
    }
    await firebaseService.deleteGroup(id);
    await firebaseService.deleteGroupMessages(id);
  }

  async searchGroups(query: string): Promise<Group[]> {
    return await firebaseService.searchGroups(query);
  }

  async getAllGroups(): Promise<Group[]> {
    return await firebaseService.getAllGroups();
  }

  async updateGroupLastMessage(id: string, timestamp: number): Promise<void> {
    await firebaseService.updateGroupLastMessage(id, timestamp);
  }

  async addGroupMember(insertGroupMember: InsertGroupMember): Promise<GroupMember> {
    const id = randomUUID();
    const now = Date.now();
    const groupMember = await firebaseService.addGroupMember({
      id,
      groupId: insertGroupMember.groupId,
      userId: insertGroupMember.userId,
      joinedAt: now,
    });
    
    const group = await firebaseService.getGroup(insertGroupMember.groupId);
    if (group) {
      await firebaseService.updateGroup(insertGroupMember.groupId, {
        ...group,
        memberCount: group.memberCount + 1,
      });
    }
    
    return groupMember;
  }

  async removeGroupMember(groupId: string, userId: string): Promise<void> {
    await firebaseService.removeGroupMember(groupId, userId);
    
    const group = await firebaseService.getGroup(groupId);
    if (group && group.memberCount > 0) {
      await firebaseService.updateGroup(groupId, {
        ...group,
        memberCount: group.memberCount - 1,
      });
    }
  }

  async getGroupMembers(groupId: string): Promise<GroupMember[]> {
    return await firebaseService.getGroupMembers(groupId);
  }

  async getUserGroups(userId: string): Promise<Group[]> {
    return await firebaseService.getUserGroups(userId);
  }

  async isGroupMember(groupId: string, userId: string): Promise<boolean> {
    return await firebaseService.isGroupMember(groupId, userId);
  }
}

export const storage = new FirebaseStorage();
