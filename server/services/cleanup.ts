import { firebaseService } from "./firebase";
import { googleSheetsService } from "./sheets";
import cron from "node-cron";

export class CleanupOrchestrator {
  private isMessageCleanupRunning: boolean = false;
  private isGroupCleanupRunning: boolean = false;
  private isUserCleanupRunning: boolean = false;

  private readonly MESSAGE_RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours
  private readonly EMPTY_GROUP_RETENTION_MS = 2 * 60 * 60 * 1000; // 2 hours
  private readonly INACTIVE_USER_RETENTION_MS = 4 * 24 * 60 * 60 * 1000; // 4 days

  async initialize(): Promise<void> {
    console.log("Initializing Cleanup Orchestrator...");
    
    this.startMessageCleanupScheduler();
    this.startGroupCleanupScheduler();
    this.startUserCleanupScheduler();
    
    console.log("Cleanup Orchestrator initialized successfully");
  }

  private startMessageCleanupScheduler(): void {
    cron.schedule("0 0 * * *", () => {
      console.log("Daily midnight message cleanup triggered");
      this.cleanupOldMessages().catch(console.error);
    });

    console.log("Message cleanup scheduler started (daily at midnight)");
  }

  private startGroupCleanupScheduler(): void {
    cron.schedule("0 0 * * *", () => {
      console.log("Daily midnight empty group cleanup triggered");
      this.cleanupEmptyGroups().catch(console.error);
    });

    console.log("Group cleanup scheduler started (daily at midnight)");
  }

  private startUserCleanupScheduler(): void {
    cron.schedule("0 0 * * *", () => {
      console.log("Daily midnight inactive user cleanup triggered");
      this.cleanupInactiveUsers().catch(console.error);
    });

    console.log("User cleanup scheduler started (daily at midnight)");
  }

  async cleanupOldMessages(): Promise<void> {
    if (this.isMessageCleanupRunning) {
      console.log("Message cleanup already in progress, skipping...");
      return;
    }

    this.isMessageCleanupRunning = true;

    try {
      const now = Date.now();
      const cutoffTime = now - this.MESSAGE_RETENTION_MS;
      
      console.log(`Starting message cleanup for messages older than ${new Date(cutoffTime).toISOString()}`);
      
      const conversations = await firebaseService.getAllConversations();
      const groups = await firebaseService.getAllGroups();
      
      let totalDeleted = 0;

      for (const conversation of conversations) {
        try {
          const messages = await firebaseService.getConversationMessages(conversation.id);
          const oldMessages = messages.filter(msg => msg.timestamp < cutoffTime);
          
          for (const message of oldMessages) {
            const currentMessage = await firebaseService.getMessage(conversation.id, message.id);
            if (currentMessage && currentMessage.timestamp < cutoffTime) {
              await firebaseService.deleteMessageFromFirebaseOnly(conversation.id, message.id);
              totalDeleted++;
              
              console.log(`Deleted old message ${message.id} from conversation ${conversation.id}`);
            }
          }
        } catch (error) {
          console.error(`Error cleaning messages for conversation ${conversation.id}:`, error);
        }
      }

      for (const group of groups) {
        try {
          const messages = await firebaseService.getConversationMessages(group.id);
          const oldMessages = messages.filter(msg => msg.timestamp < cutoffTime);
          
          for (const message of oldMessages) {
            const currentMessage = await firebaseService.getMessage(group.id, message.id);
            if (currentMessage && currentMessage.timestamp < cutoffTime) {
              await firebaseService.deleteMessageFromFirebaseOnly(group.id, message.id);
              totalDeleted++;
              
              console.log(`Deleted old message ${message.id} from group ${group.id}`);
            }
          }
        } catch (error) {
          console.error(`Error cleaning messages for group ${group.id}:`, error);
        }
      }

      console.log(`✅ Message cleanup completed. Deleted ${totalDeleted} messages from Firebase (preserved in Sheets)`);
    } catch (error) {
      console.error("❌ Message cleanup failed:", error);
    } finally {
      this.isMessageCleanupRunning = false;
    }
  }

  async cleanupEmptyGroups(): Promise<void> {
    if (this.isGroupCleanupRunning) {
      console.log("Group cleanup already in progress, skipping...");
      return;
    }

    this.isGroupCleanupRunning = true;

    try {
      const now = Date.now();
      const cutoffTime = now - this.EMPTY_GROUP_RETENTION_MS;
      
      console.log(`Starting empty group cleanup for groups empty since ${new Date(cutoffTime).toISOString()}`);
      
      const groups = await firebaseService.getAllGroups();
      let totalDeleted = 0;

      for (const group of groups) {
        try {
          const currentGroup = await firebaseService.getGroup(group.id);
          
          if (!currentGroup) {
            continue;
          }

          if (currentGroup.memberCount === 0) {
            const lastChange = currentGroup.lastMemberChangeAt || currentGroup.createdAt || now;
            
            if (lastChange < cutoffTime) {
              await firebaseService.deleteGroupFromFirebaseOnly(group.id);
              totalDeleted++;
              
              console.log(`Deleted empty group ${group.id} (empty since ${new Date(lastChange).toISOString()})`);
            }
          }
        } catch (error) {
          console.error(`Error cleaning group ${group.id}:`, error);
        }
      }

      console.log(`✅ Group cleanup completed. Deleted ${totalDeleted} empty groups from Firebase (preserved in Sheets)`);
    } catch (error) {
      console.error("❌ Group cleanup failed:", error);
    } finally {
      this.isGroupCleanupRunning = false;
    }
  }

  async cleanupInactiveUsers(): Promise<void> {
    if (this.isUserCleanupRunning) {
      console.log("User cleanup already in progress, skipping...");
      return;
    }

    this.isUserCleanupRunning = true;

    try {
      const now = Date.now();
      const cutoffTime = now - this.INACTIVE_USER_RETENTION_MS;
      
      console.log(`Starting inactive user cleanup for users inactive since ${new Date(cutoffTime).toISOString()}`);
      
      const users = await firebaseService.getAllUsers();
      let totalDeleted = 0;

      for (const user of users) {
        try {
          const currentUser = await firebaseService.getUser(user.id);
          
          if (!currentUser) {
            continue;
          }

          const lastActive = currentUser.lastActiveAt || currentUser.createdAt || now;
          
          if (lastActive < cutoffTime) {
            await firebaseService.deleteUser(user.id);
            totalDeleted++;
            
            console.log(`Deleted inactive user ${user.id} (${user.username}) - last active: ${new Date(lastActive).toISOString()}`);
          }
        } catch (error) {
          console.error(`Error cleaning user ${user.id}:`, error);
        }
      }

      console.log(`✅ User cleanup completed. Deleted ${totalDeleted} inactive users from Firebase (preserved in Sheets)`);
    } catch (error) {
      console.error("❌ User cleanup failed:", error);
    } finally {
      this.isUserCleanupRunning = false;
    }
  }

  async manualCleanupMessages(): Promise<{ success: boolean; deletedCount: number }> {
    await this.cleanupOldMessages();
    return { success: true, deletedCount: 0 };
  }

  async manualCleanupGroups(): Promise<{ success: boolean; deletedCount: number }> {
    await this.cleanupEmptyGroups();
    return { success: true, deletedCount: 0 };
  }

  async manualCleanupUsers(): Promise<{ success: boolean; deletedCount: number }> {
    await this.cleanupInactiveUsers();
    return { success: true, deletedCount: 0 };
  }
}

export const cleanupOrchestrator = new CleanupOrchestrator();
