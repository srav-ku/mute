# Chat Application

A real-time chat application with WebRTC video/audio calls, group chats, and WhatsApp-style mobile navigation.

## Features

- Real-time messaging with Firebase
- Video and audio calls (WebRTC)
- Group chats with member management
- User presence indicators
- Typing indicators
- Message read receipts
- File/image sharing with Cloudinary
- Mobile-optimized navigation
- Dark mode support
- Google Sheets backup integration

## Tech Stack

**Frontend:**
- React 18
- TypeScript
- Vite
- Wouter (routing)
- TanStack Query
- Tailwind CSS + shadcn/ui
- Firebase (Realtime Database)
- WebRTC

**Backend:**
- Node.js + Express
- PostgreSQL (via Drizzle ORM)
- WebSocket (ws)
- Firebase Admin SDK
- Session management

## Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL database

### Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

3. Set up environment variables (see `.env.example`)

4. Run database migrations:
```bash
npm run db:push
```

5. Start development server:
```bash
npm run dev
```

The app will be available at `http://localhost:5000`

## Environment Variables

Create a `.env` file with:

```env
NODE_ENV=development
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
SESSION_SECRET=your-session-secret

FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-client-email
FIREBASE_PRIVATE_KEY=your-private-key
FIREBASE_DATABASE_URL=your-database-url
FIREBASE_API_KEY=your-api-key
FIREBASE_AUTH_DOMAIN=your-auth-domain
FIREBASE_STORAGE_BUCKET=your-storage-bucket
FIREBASE_MESSAGING_SENDER_ID=your-sender-id
FIREBASE_APP_ID=your-app-id

VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-auth-domain
VITE_FIREBASE_DATABASE_URL=your-database-url
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-storage-bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id

CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
VITE_CLOUDINARY_CLOUD_NAME=your-cloud-name
VITE_CLOUDINARY_UPLOAD_PRESET=your-upload-preset
```

## Deployment

See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for detailed deployment instructions.

### Recommended Platforms (Free, No Sleep):
1. **Fly.io** - Best option, always-on free tier
2. **Railway** - $5/month free credit
3. **Koyeb** - Free tier with no sleep

## Build for Production

```bash
npm run build
npm start
```

## Project Structure

```
├── client/          # React frontend
│   ├── src/
│   │   ├── components/  # Reusable components
│   │   ├── pages/       # Page components
│   │   ├── lib/         # Utilities & services
│   │   └── hooks/       # Custom React hooks
├── server/          # Express backend
│   ├── routes.ts    # API routes
│   ├── storage.ts   # Database interface
│   └── services/    # External services
├── shared/          # Shared TypeScript types
└── Dockerfile       # Production deployment
```

## License

MIT
