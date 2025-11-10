import { google } from "googleapis";
import { type Message, type SheetMessageRow, type Call, type SheetCallRow } from "@shared/schema";
import { storage } from "../storage";
import { firebaseService } from "./firebase";

export class GoogleSheetsService {
  private sheets;
  private spreadsheetId: string;
  private auth;

  constructor() {
    try {
      // Parse the service account JSON from the environment variable
      const serviceAccountKey = JSON.parse(process.env.GOOGLE_SHEETS_API_KEY || "{}");
      
      this.auth = new google.auth.GoogleAuth({
        credentials: serviceAccountKey,
        scopes: [
          "https://www.googleapis.com/auth/spreadsheets",
          "https://www.googleapis.com/auth/drive",
        ],
      });
      
      this.sheets = google.sheets({ version: "v4", auth: this.auth });
      this.spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || "";
    } catch (error) {
      console.error("Error initializing Google Sheets auth:", error);
      // Fallback: disable sheets logging if auth fails
      this.sheets = null as any;
      this.spreadsheetId = "";
    }
  }

  async logAction(
    action: "send" | "delete_message" | "delete_media",
    message: Message,
    conversationId: string,
    receiverId: string,
    groupName?: string,
    senderDisplayName?: string
  ): Promise<void> {
    if (!this.sheets || !this.spreadsheetId) {
      console.log("[Sheets] Google Sheets not configured, skipping log");
      return;
    }

    try {
      const isGroupChat = receiverId === "GROUP";

      if (isGroupChat) {
        // Log to Groups tab for group chats
        const timestamp = this.formatTimestamp12Hour(message.timestamp);
        
        const values = [
          [
            timestamp,
            groupName || "",
            message.senderUsername || "",
            senderDisplayName || "",
            message.text || "",
            message.mediaUrl || "",
            message.mediaType || "",
          ],
        ];

        await this.sheets.spreadsheets.values.append({
          spreadsheetId: this.spreadsheetId,
          range: "Groups!A:G",
          valueInputOption: "RAW",
          requestBody: {
            values,
          },
        });

        console.log(`[Sheets] ✓ Action '${action}' for group chat "${groupName}" logged to Groups tab`);
        if (message.mediaUrl) {
          console.log(`[Sheets] ✓ Media logged: ${message.mediaType} - ${message.fileName || "unnamed"}`);
        }
      } else {
        // Log to Sheet1 for one-to-one chats
        const timestamp = this.formatTimestamp12Hour(message.timestamp);
        
        // Get receiver's username
        const receiver = await storage.getUser(receiverId);
        const receiverUsername = receiver?.username || receiverId;
        
        const values = [
          [
            timestamp,
            message.senderUsername || "",
            receiverUsername,
            message.text || "",
            message.mediaUrl || "",
            message.mediaType || "",
          ],
        ];

        await this.sheets.spreadsheets.values.append({
          spreadsheetId: this.spreadsheetId,
          range: "OneChat!A:F",
          valueInputOption: "RAW",
          requestBody: {
            values,
          },
        });

        console.log(`[Sheets] ✓ Action '${action}' for one-to-one message ${message.id} logged to OneChat`);
        if (message.mediaUrl) {
          console.log(`[Sheets] ✓ Media logged: ${message.mediaType} - ${message.fileName || "unnamed"}`);
        }
      }
    } catch (error) {
      console.error("[Sheets] ✗ Error logging to Google Sheets:", error);
      console.error("[Sheets] Failed row data:", {
        action,
        chatId: conversationId,
        receiverId,
        hasMedia: !!message.mediaUrl,
      });
      // Don't throw - we don't want to block the main operation if Sheets fails
    }
  }

  private formatTimestamp12Hour(timestamp: number): string {
    // Convert to IST (UTC+5:30)
    const date = new Date(timestamp);
    const utcTime = date.getTime();
    const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
    const istTime = new Date(utcTime + istOffset);
    
    const hours = istTime.getUTCHours();
    const minutes = istTime.getUTCMinutes();
    const seconds = istTime.getUTCSeconds();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;
    const minutesStr = minutes.toString().padStart(2, '0');
    const secondsStr = seconds.toString().padStart(2, '0');
    
    const month = (istTime.getUTCMonth() + 1).toString().padStart(2, '0');
    const day = istTime.getUTCDate().toString().padStart(2, '0');
    const year = istTime.getUTCFullYear();
    
    return `${month}/${day}/${year} ${hours12}:${minutesStr}:${secondsStr} ${ampm}`;
  }

  async initializeSheet(): Promise<void> {
    if (!this.sheets || !this.spreadsheetId) {
      console.log("Google Sheets not configured, skipping initialization");
      return;
    }

    try {
      // Check if headers already exist
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: "OneChat!A1:F1",
      });

      // Only set headers if they don't exist
      if (!response.data.values || response.data.values.length === 0) {
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: "OneChat!A1:F1",
          valueInputOption: "RAW",
          requestBody: {
            values: [
              [
                "timestamp",
                "sendUser",
                "receiveUser",
                "message",
                "mediaUrl",
                "mediaType",
              ],
            ],
          },
        });
        console.log("Google Sheets headers initialized - data will start from row 2");
      } else {
        console.log("Google Sheets already initialized with headers");
      }
    } catch (error) {
      console.error("Error initializing Google Sheets:", error);
    }
  }

  async logMessage(message: Message, action: "send" | "delete_message" | "delete_media" = "send"): Promise<void> {
    try {
      let receiverId = "";
      let chatType = "";
      let groupName: string | undefined;
      let senderDisplayName: string | undefined;
      
      // First, try to get group chat directly from Firebase
      const group = await firebaseService.getGroup(message.conversationId);
      
      if (group) {
        // Group chat - set receiverId to "GROUP" to indicate it's a group message
        receiverId = "GROUP";
        chatType = "group";
        groupName = group.name;
        console.log(`[Sheets] Logging ${action} for group chat: ${group.name} (${message.conversationId})`);
      } else {
        // Try to get conversation (one-to-one chat) from storage
        const conversation = await storage.getConversation(message.conversationId);
        
        if (conversation && conversation.participants && Array.isArray(conversation.participants)) {
          // One-to-one conversation
          receiverId = conversation.participants.find(id => id !== message.senderId) || "";
          chatType = "one-to-one";
          console.log(`[Sheets] Logging ${action} for one-to-one conversation: ${message.conversationId}`);
        } else {
          console.error("[Sheets] Conversation or group not found for logging:", message.conversationId);
          console.error("[Sheets] Message details:", {
            messageId: message.id,
            senderId: message.senderId,
            senderUsername: message.senderUsername,
            text: message.text?.substring(0, 50),
            mediaUrl: message.mediaUrl ? "present" : "none",
          });
          return;
        }
      }

      // Get sender's user info for display name
      const sender = await storage.getUser(message.senderId);
      senderDisplayName = sender?.name;

      // Log to Google Sheets
      await this.logAction(action, message, message.conversationId, receiverId, groupName, senderDisplayName);
      console.log(`[Sheets] Successfully logged ${action} for ${chatType} chat - Message: ${message.id}`);
    } catch (error) {
      console.error("[Sheets] Error in logMessage:", error);
      console.error("[Sheets] Failed message details:", {
        conversationId: message.conversationId,
        messageId: message.id,
        action,
      });
    }
  }

  async logCall(call: Call, throwOnError: boolean = false): Promise<void> {
    if (!this.sheets || !this.spreadsheetId) {
      const message = "Google Sheets not configured, cannot log call";
      console.log(message);
      if (throwOnError) {
        throw new Error(message);
      }
      return;
    }

    try {
      const timestamp = this.formatTimestamp12Hour(call.timestamp);
      
      // Get caller and receiver usernames
      const caller = await storage.getUser(call.callerId);
      const receiver = await storage.getUser(call.receiverId);
      const callerUsername = caller?.username || call.callerUsername || call.callerId;
      const receiverUsername = receiver?.username || call.receiverUsername || call.receiverId;

      const values = [
        [
          timestamp,
          callerUsername,
          receiverUsername,
          call.type,
          call.duration ? call.duration.toString() : "0",
          call.recordingUrl || "",
          call.status,
        ],
      ];

      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: "Calls!A:G",
        valueInputOption: "RAW",
        requestBody: {
          values,
        },
      });

      console.log(`Call ${call.id} logged to Google Sheets`);
    } catch (error) {
      console.error("Error logging call to Google Sheets:", error);
      if (throwOnError) {
        throw error;
      }
    }
  }

  async initializeCallsSheet(): Promise<void> {
    if (!this.sheets || !this.spreadsheetId) {
      console.log("Google Sheets not configured, skipping calls sheet initialization");
      return;
    }

    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: "Calls!A1:G1",
      });

      if (!response.data.values || response.data.values.length === 0) {
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: "Calls!A1:G1",
          valueInputOption: "RAW",
          requestBody: {
            values: [
              [
                "timestamp",
                "callUser",
                "receiveUser",
                "type",
                "duration",
                "recordingUrl",
                "status",
              ],
            ],
          },
        });
        console.log("Calls sheet headers initialized");
      } else {
        console.log("Calls sheet already initialized");
      }
    } catch (error) {
      console.error("Error initializing Calls sheet:", error);
    }
  }

  async initializeGroupsSheet(): Promise<void> {
    if (!this.sheets || !this.spreadsheetId) {
      console.log("Google Sheets not configured, skipping groups sheet initialization");
      return;
    }

    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: "Groups!A1:G1",
      });

      if (!response.data.values || response.data.values.length === 0) {
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: "Groups!A1:G1",
          valueInputOption: "RAW",
          requestBody: {
            values: [
              [
                "timestamp",
                "groupname",
                "username",
                "displayname",
                "message",
                "mediaUrl",
                "mediaType",
              ],
            ],
          },
        });
        console.log("Groups sheet headers initialized");
      } else {
        console.log("Groups sheet already initialized");
      }
    } catch (error) {
      console.error("Error initializing Groups sheet:", error);
    }
  }
}

export const googleSheetsService = new GoogleSheetsService();
