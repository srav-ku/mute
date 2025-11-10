import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set, remove, update, onDisconnect, type Unsubscribe } from "firebase/database";
import { type Message, type TypingIndicator, type UserPresence } from "@shared/schema";

let firebaseInitialized = false;
let database: ReturnType<typeof getDatabase>;

async function initializeFirebase() {
  if (firebaseInitialized) return database;

  try {
    const response = await fetch("/api/config/firebase");
    const firebaseConfig = await response.json();

    const app = initializeApp(firebaseConfig);
    database = getDatabase(app);
    firebaseInitialized = true;
    
    return database;
  } catch (error) {
    console.error("Failed to initialize Firebase:", error);
    throw error;
  }
}

export async function subscribeToConversationMessages(
  conversationId: string,
  callback: (messages: Message[]) => void
): Promise<Unsubscribe> {
  const db = await initializeFirebase();
  const messagesRef = ref(db, `messages/${conversationId}`);

  return onValue(messagesRef, (snapshot) => {
    if (!snapshot.exists()) {
      callback([]);
      return;
    }

    const messages: Message[] = [];
    snapshot.forEach((childSnapshot) => {
      const data = childSnapshot.val();

      if (data && typeof data === "object") {
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
          timestamp:
            typeof data.timestamp === "number" ? data.timestamp : Date.now(),
          deleted: data.deleted || false,
          mediaDeleted: data.mediaDeleted || false,
          deliveredAt: data.deliveredAt,
          readAt: data.readAt,
          replyToId: data.replyToId,
          replyToText: data.replyToText,
          replyToSender: data.replyToSender,
          edited: data.edited || false,
          editedAt: data.editedAt,
          reactions: data.reactions || [],
        };

        messages.push(message);
      }
    });

    const sortedMessages = messages.sort((a, b) => a.timestamp - b.timestamp);
    callback(sortedMessages);
  });
}

export async function setTypingIndicator(
  conversationId: string,
  userId: string,
  username: string,
  isTyping: boolean
): Promise<void> {
  const db = await initializeFirebase();
  const typingRef = ref(db, `typing/${conversationId}/${userId}`);
  
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

export async function subscribeToTypingIndicators(
  conversationId: string,
  callback: (indicators: TypingIndicator[]) => void
): Promise<Unsubscribe> {
  const db = await initializeFirebase();
  const typingRef = ref(db, `typing/${conversationId}`);

  return onValue(typingRef, (snapshot) => {
    if (!snapshot.exists()) {
      callback([]);
      return;
    }

    const indicators: TypingIndicator[] = [];
    snapshot.forEach((childSnapshot) => {
      const data = childSnapshot.val();
      if (data && typeof data === "object") {
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

export async function setUserPresence(
  userId: string,
  username: string,
  online: boolean
): Promise<void> {
  const db = await initializeFirebase();
  const presenceRef = ref(db, `presence/${userId}`);
  
  if (online) {
    await set(presenceRef, {
      userId,
      username,
      online: true,
      lastSeen: Date.now(),
    });
    
    onDisconnect(presenceRef).set({
      userId,
      username,
      online: false,
      lastSeen: Date.now(),
    });
  } else {
    await set(presenceRef, {
      userId,
      username,
      online: false,
      lastSeen: Date.now(),
    });
  }
}

export async function subscribeToUserPresence(
  userId: string,
  callback: (presence: UserPresence | null) => void
): Promise<Unsubscribe> {
  const db = await initializeFirebase();
  const presenceRef = ref(db, `presence/${userId}`);

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

export async function markMessageAsRead(
  conversationId: string,
  messageId: string
): Promise<void> {
  const db = await initializeFirebase();
  const messageRef = ref(db, `messages/${conversationId}/${messageId}`);
  await update(messageRef, { readAt: Date.now() });
}

export async function markConversationMessagesAsRead(
  conversationId: string,
  userId: string,
  messages: Message[]
): Promise<void> {
  const db = await initializeFirebase();
  const now = Date.now();

  for (const message of messages) {
    if (message.senderId !== userId && !message.readAt) {
      const messageRef = ref(db, `messages/${conversationId}/${message.id}`);
      await update(messageRef, {
        deliveredAt: message.deliveredAt || now,
        readAt: now,
      });
    }
  }
}
