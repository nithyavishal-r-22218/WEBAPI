# WEBAPI — GodMode Automation Framework

Full-stack browser automation framework. Record. Queue. Execute. At scale.

## Architecture

```
godmode-fixed/
├── backend/          Express API — job queue, auth, execution
│   ├── middleware/   Auth middleware
│   ├── routes/       Route handlers (jobs, recordings, testCases, results)
│   ├── services/     Job processor & queue management
│   └── utils/        Logger
├── dashboard/        Next.js — real-time job control panel
│   ├── pages/        Next.js pages
│   └── styles/       CSS modules
├── extension/        Chrome MV3 — browser action recorder
└── docker-compose.yml
```

## Quick Start

### 1. Configure environment variables

```bash
cp .env.example godmode-fixed/backend/.env
cp .env.example godmode-fixed/dashboard/.env.local
# Edit each .env file and set GODMODE_API_KEY to a strong random value
```

### 2. Start with Docker Compose

```bash
cd godmode-fixed
docker-compose up --build
```

### 3. Load the Chrome Extension

1. Open `chrome://extensions` in Chrome
2. Enable **Developer Mode**
3. Click **Load Unpacked** and select `godmode-fixed/extension/`

### 4. Open the Dashboard

Navigate to [http://localhost:3000](http://localhost:3000)

---

## Development Setup

### Backend

```bash
cd godmode-fixed/backend
npm install
GODMODE_API_KEY=dev-key node index.js
# Runs on http://localhost:4000
```

### Dashboard

```bash
cd godmode-fixed/dashboard
npm install
npm run dev
# Runs on http://localhost:3000
```

---

## API Reference

All requests (except `/health`) require: `x-api-key: <GODMODE_API_KEY>` header

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/health` | Health check (no auth) |
| POST | `/run` | Queue a new job |
| GET | `/jobs` | List all jobs |
| GET | `/jobs/:id` | Get job status + result |
| DELETE | `/jobs/:id` | Cancel a queued job |
| POST | `/recordings` | Upsert a recording |
| GET | `/recordings` | List all recordings |
| DELETE | `/recordings/:id` | Delete a recording |
| POST | `/cases` | Upsert a test case |
| GET | `/cases` | List all test cases |
| DELETE | `/cases/:id` | Delete a test case |
| POST | `/results` | Append a test result |
| GET | `/results` | List test results |

### Job Types

```json
{ "type": "SCRAPE",   "payload": { "url": "https://example.com" } }
{ "type": "AUTOMATE", "payload": { "steps": [...] } }
{ "type": "SCHEDULE", "payload": { "cron": "0 9 * * *" } }
{ "type": "CUSTOM",   "payload": { "anything": "you want" } }
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GODMODE_API_KEY` | *(required)* | API authentication key |
| `PORT` | `4000` | Backend port |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated allowed origins |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` | Dashboard → API URL |

---

## Running Tests

```bash
cd godmode-fixed/backend
npm test
```

---

## Security Notes

- Set `GODMODE_API_KEY` to a strong random value in production (never use the default)
- The API key is compared using constant-time comparison to prevent timing attacks
- CORS is restricted to configured origins
- Request body size is capped at 1 MB
- The `/run` endpoint is rate-limited to 30 requests/minute
