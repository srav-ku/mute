# Deployment Guide

This chat application uses Express server with WebSocket support for WebRTC signaling. This requires a platform that supports long-lived Node.js processes, **not serverless functions**.

## Important Note About Free Hosting

Most free platforms now have limitations. This app requires:
- ✅ Long-lived Node.js process (for WebSocket server)
- ✅ No sleep timeout (app must stay awake)
- ✅ WebSocket support

**Platforms that DON'T work:**
- ❌ Vercel (serverless only, no persistent WebSockets)
- ❌ Cloudflare Workers (no long-lived processes)
- ❌ Netlify Functions (serverless only)

---

## Required Environment Variables

Create a `.env` file with these variables:

### Firebase Configuration
```bash
FIREBASE_API_KEY=your_api_key
FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
FIREBASE_DATABASE_URL=https://your_project.firebaseio.com
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_STORAGE_BUCKET=your_project.appspot.com
FIREBASE_MESSAGING_SENDER_ID=your_sender_id
FIREBASE_APP_ID=your_app_id
```

### Cloudinary Configuration
```bash
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
CLOUDINARY_UPLOAD_PRESET=your_preset
```

### Google Sheets (Optional - for message logging)
```bash
GOOGLE_SHEETS_PRIVATE_KEY="your_private_key_with_newlines"
GOOGLE_SHEETS_CLIENT_EMAIL=your_service_account_email
GOOGLE_SHEETS_SPREADSHEET_ID=your_spreadsheet_id
```

### Session Secret
```bash
SESSION_SECRET=your_random_secret_minimum_32_characters
NODE_ENV=production
PORT=5000
```

---

## Option 1: Self-Host on VPS (Recommended)

The most reliable option for this app is a low-cost VPS.

### Providers ($5-6/month):
- **DigitalOcean Droplet** - $6/month, 1GB RAM
- **Linode Nanode** - $5/month, 1GB RAM
- **Vultr** - $5/month, 1GB RAM
- **Hetzner Cloud** - €4.5/month, 2GB RAM (best value)

### Setup Steps (Ubuntu 22.04):

```bash
# 1. SSH into your server
ssh root@your-server-ip

# 2. Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# 3. Install PM2 (process manager)
npm install -g pm2

# 4. Clone your repository
git clone your-repo-url
cd your-app

# 5. Install dependencies
npm install

# 6. Build the application
npm run build

# 7. Create .env file
nano .env
# Paste all your environment variables, save (Ctrl+X, Y, Enter)

# 8. Start with PM2
pm2 start npm --name "chat-app" -- start

# 9. Make PM2 restart on reboot
pm2 startup
pm2 save

# 10. Setup nginx reverse proxy (optional but recommended)
apt-get install -y nginx
nano /etc/nginx/sites-available/chat-app
```

### Nginx Configuration:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

```bash
# Enable the site
ln -s /etc/nginx/sites-available/chat-app /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx

# Install SSL (free with Let's Encrypt)
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d your-domain.com
```

Your app is now live at `https://your-domain.com`!

---

## Option 2: Railway (Has Limitations)

Railway free tier now has **scale-to-zero** which means your app will sleep after inactivity. This breaks WebSocket connections.

**⚠️ Railway Pro Plan ($5/month)** is needed to prevent sleep timeout.

If you still want to try Railway:

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Initialize project
railway init

# Add environment variables
railway variables set FIREBASE_API_KEY="your_key"
# ... add all other env variables

# Deploy
railway up
```

**Railway Pricing:**
- Free tier: $5 credit/month (but has scale-to-zero)
- Pro tier: $5/month subscription (no scale-to-zero)

---

## Option 3: Render (Has Sleep Timeout)

Render free tier sleeps after 15 minutes of inactivity. Your app will take 30+ seconds to wake up on new requests.

**⚠️ Not recommended** for chat apps, but here's how:

1. Create account at render.com
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Configure:
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Environment:** Node
5. Add all environment variables in the dashboard
6. Deploy

**Render Pricing:**
- Free tier: Sleeps after 15min inactivity
- Starter plan: $7/month (no sleep)

---

## Option 4: Fly.io (No Longer Free)

Fly.io removed their free tier in 2024. Costs ~$5/month minimum.

If you want to use Fly.io:

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Login
flyctl auth login

# Launch app
flyctl launch

# Add environment variables
flyctl secrets set FIREBASE_API_KEY="your_key"
# ... add all other env variables

# Deploy
flyctl deploy
```

---

## Comparison Table

| Platform | Cost | Sleep Timeout | WebSocket Support | Recommended |
|----------|------|---------------|-------------------|-------------|
| **Self-hosted VPS** | $5-6/month | ❌ None | ✅ Full support | ⭐⭐⭐⭐⭐ |
| **Railway Pro** | $5/month | ❌ None | ✅ Full support | ⭐⭐⭐⭐ |
| **Fly.io** | $5/month | ❌ None | ✅ Full support | ⭐⭐⭐ |
| **Render Starter** | $7/month | ❌ None | ✅ Full support | ⭐⭐⭐ |
| **Railway Free** | $0 | ⚠️ Yes | ✅ Yes | ⭐⭐ (not reliable) |
| **Render Free** | $0 | ⚠️ Yes (15min) | ✅ Yes | ⭐ (not reliable) |
| **Vercel** | $0 | N/A | ❌ No | ❌ (incompatible) |
| **Cloudflare** | $0 | N/A | ❌ No | ❌ (incompatible) |

---

## Build Scripts

Your `package.json` should have:

```json
{
  "scripts": {
    "dev": "tsx watch server/index.ts --tsconfig tsconfig.json",
    "build": "vite build",
    "start": "NODE_ENV=production tsx server/index.ts"
  }
}
```

---

## Post-Deployment Checklist

After deploying:

1. ✅ Visit your app URL and register a test account
2. ✅ Test login/logout functionality
3. ✅ Start a 1-on-1 chat and send messages
4. ✅ Upload an image/video (tests Cloudinary)
5. ✅ Create a group chat
6. ✅ Test video/audio calls (WebRTC)
7. ✅ Check typing indicators work
8. ✅ Verify read receipts appear
9. ✅ Test on mobile device
10. ✅ Check browser console for errors

---

## Monitoring & Maintenance

### Using PM2 (VPS):

```bash
# View logs
pm2 logs chat-app

# Restart app
pm2 restart chat-app

# Monitor resource usage
pm2 monit

# Update app
cd your-app
git pull
npm install
npm run build
pm2 restart chat-app
```

### Using Railway/Render/Fly.io:

Check the platform's dashboard for:
- Application logs
- Resource usage (CPU, RAM)
- Request metrics
- Error tracking

---

## Troubleshooting

### WebSocket Connection Fails

**Problem:** Video/audio calls don't connect

**Solution:**
1. Check CORS settings in `server/index.ts`
2. Verify WebSocket port is open (default: 5000)
3. Ensure your platform supports WebSockets
4. Check firewall rules on VPS

### Firebase Connection Issues

**Problem:** Messages not saving to Firebase

**Solution:**
1. Verify all Firebase env variables are set correctly
2. Check Firebase Realtime Database rules allow read/write
3. Ensure Firebase project has Realtime Database enabled
4. Check Firebase API key is correct

### Cloudinary Upload Fails

**Problem:** Can't upload images/videos

**Solution:**
1. Verify Cloudinary env variables
2. Check upload preset exists and is unsigned
3. Increase file size limit if needed
4. Check Cloudinary dashboard for errors

### App Crashes on Startup

**Problem:** Server won't start

**Solution:**
1. Check logs for error messages
2. Verify all required env variables are set
3. Ensure PORT is set correctly
4. Check Node.js version (needs 18+)

---

## Security Best Practices

Before deploying to production:

1. ✅ Set strong `SESSION_SECRET` (32+ random characters)
2. ✅ Enable Firebase security rules
3. ✅ Use HTTPS (Let's Encrypt on VPS, automatic on Railway/Render/Fly)
4. ✅ Set `NODE_ENV=production`
5. ✅ Don't commit `.env` file to git
6. ✅ Use environment variables for all secrets
7. ✅ Keep dependencies updated (`npm audit fix`)
8. ✅ Enable rate limiting for API routes
9. ✅ Configure CORS properly
10. ✅ Regular backups of Firebase data

---

## Custom Domain Setup

### VPS (with nginx):
1. Point your domain's A record to your VPS IP
2. Update nginx config with your domain name
3. Run `certbot --nginx -d yourdomain.com` for SSL

### Railway:
1. Go to Settings → Domains
2. Add your custom domain
3. Update DNS records as instructed

### Render:
1. Go to Settings → Custom Domains
2. Add your domain
3. Update DNS CNAME to point to Render

### Fly.io:
```bash
flyctl certs add yourdomain.com
# Follow instructions to add DNS records
```

---

## Cost Summary

**Truly Free Options:**
- ❌ None that fully support this app without limitations

**Budget Options ($5-7/month):**
- ✅ VPS (DigitalOcean, Linode, Vultr, Hetzner) - Best value, most control
- ✅ Railway Pro - Easy deployment, good DX
- ✅ Fly.io - Global edge deployment
- ✅ Render Starter - Simple setup

**Recommendation:**

For **learning/hobby**: Railway Pro ($5/month) - easiest setup
For **serious projects**: VPS ($5-6/month) - most control and reliability
For **global audience**: Fly.io ($5/month) - distributed edge servers

---

## Need Help?

- VPS setup issues: Check provider's documentation
- Railway: https://docs.railway.app
- Render: https://render.com/docs
- Fly.io: https://fly.io/docs
- PM2 process manager: https://pm2.keymetrics.io/docs

**Remember:** Free tiers with no limitations don't exist for WebSocket apps. Budget $5-7/month for reliable hosting.
