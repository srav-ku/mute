# Chat Application - Real-time Messaging with WebRTC

## Overview

This is a real-time chat application built with a modern web stack featuring instant messaging, WebRTC-based audio/video calls, group chats, and WhatsApp-style mobile navigation. The application uses Firebase Realtime Database for real-time messaging, PostgreSQL for user management, and WebSockets for WebRTC signaling.

Key features include:
- Real-time one-on-one and group messaging
- WebRTC video and audio calls
- User presence tracking and typing indicators
- Message read receipts and delivery status
- Media sharing (images, videos, audio) via Cloudinary
- Mobile-optimized UI with dark mode
- Optional Google Sheets integration for message logging and backup

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Technology Stack:**
- React 18 with TypeScript for type-safe component development
- Vite as the build tool and development server
- Wouter for lightweight client-side routing
- TanStack Query for server state management and caching
- Tailwind CSS with shadcn/ui component library for styling
- Firebase SDK for real-time database subscriptions

**State Management Pattern:**
- Server state managed via TanStack Query with query invalidation
- Local UI state handled with React hooks (useState, useEffect)
- Authentication state persisted in localStorage with session tokens in sessionStorage
- Real-time updates via Firebase subscriptions feeding into React state

**Routing Strategy:**
- Uses Wouter for declarative routing
- Custom navigation manager (`useNavigationManager`) for complex navigation flows
- Routes: landing page, login, register, conversations list, individual chats, group chats, profile, settings
- Browser history integration with custom back button handling

**Real-time Communication:**
- Firebase Realtime Database for messages, typing indicators, and user presence
- WebRTC for peer-to-peer audio/video calls with Firebase signaling
- Automatic reconnection and presence cleanup on disconnect

### Backend Architecture

**Server Framework:**
- Express.js with TypeScript running on Node.js
- Long-lived process required (NOT serverless) for WebSocket support
- Session management using express-session with MemoryStore
- RESTful API endpoints for CRUD operations

**Data Layer Pattern:**
- Abstraction layer (`IStorage` interface) allowing swappable storage implementations
- Current implementation: `FirebaseStorage` using Firebase Realtime Database
- Drizzle ORM integration prepared for PostgreSQL (may be added later)
- Separate concerns: user data, conversations, groups, and messages

**WebSocket Server:**
- WebSocket server for WebRTC signaling (offer/answer/ICE candidates)
- Handles call initiation, acceptance, rejection, and termination
- Real-time signaling between peers for establishing WebRTC connections

**Authentication & Security:**
- Session-based authentication with httpOnly cookies
- Password hashing using bcryptjs
- User blocking functionality to prevent unwanted communication
- Session validation middleware (`requireAuth`) for protected routes

### Data Storage Solutions

**Firebase Realtime Database:**
- Primary storage for real-time messaging data
- Collections: messages, users, conversations, groups, groupMembers, typing indicators, user presence, call states
- Automatic data synchronization with subscriptions
- Presence management with onDisconnect handlers

**PostgreSQL (via Drizzle ORM):**
- Schema defined but not actively used in current implementation
- Prepared for potential migration or hybrid storage approach
- User, conversation, and group schemas defined in shared types

**Session Storage:**
- In-memory session store (MemoryStore) for development
- Cookie-based session management
- 30-day session expiration

**Media Storage:**
- Cloudinary for image, video, and audio file uploads
- Direct client-to-Cloudinary uploads using upload presets
- Signed URLs for secure media access

### External Dependencies

**Firebase:**
- Service: Firebase Realtime Database
- Purpose: Real-time messaging, presence tracking, typing indicators
- Configuration: API key, auth domain, database URL, project ID, storage bucket, messaging sender ID, app ID
- Critical dependency for core messaging functionality

**Cloudinary:**
- Service: Media CDN and transformation service
- Purpose: Image, video, and audio file storage and delivery
- Configuration: Cloud name, API key, API secret, upload preset
- Used for all media attachments in messages

**Google Sheets (Optional):**
- Service: Google Sheets API via service account
- Purpose: Message logging and automated backups
- Configuration: Private key, client email, spreadsheet ID
- Automatic backup triggers when message count exceeds 40,000
- Separate sheets for messages, calls, and groups

**Node.js Packages:**
- `bcryptjs`: Password hashing and verification
- `express-session`: Session management
- `multer`: Multipart form data handling for file uploads
- `node-cron`: Scheduled cleanup tasks (daily message, group, and user cleanup)
- `ws`: WebSocket server for WebRTC signaling
- `zod`: Runtime type validation for API inputs

**Scheduled Services:**
- Message cleanup: Removes messages older than 24 hours (daily at midnight)
- Group cleanup: Deletes empty groups after 2 hours of inactivity (daily at midnight)
- User cleanup: Removes inactive users after 4 days (daily at midnight)
- Sheets backup: Automatic spreadsheet backup when threshold reached

**Deployment Requirements:**
- Platform must support long-lived Node.js processes (NOT serverless)
- WebSocket support required for WebRTC signaling
- No sleep/timeout acceptable (app must stay awake)
- PostgreSQL database connection string (if using PostgreSQL)
- All environment variables properly configured