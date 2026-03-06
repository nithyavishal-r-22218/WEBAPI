# ⚡ WEBAPI Automation Tool

Full-stack browser automation framework. Record. Queue. Execute. At scale.

## Architecture

```
godmode/
├── backend/          Express API — job queue, auth, execution
├── dashboard/        Next.js — real-time job control panel
├── extension/        Chrome MV3 — browser action recorder
└── docker-compose.yml
```

## Quick Start

```bash
# 1. Start everything
docker-compose up --build

# 2. Load extension in Chrome
# chrome://extensions → Developer Mode → Load Unpacked → select /extension

# 3. Open Dashboard
open http://localhost:3000
```

## API Reference

All requests require: `x-api-key: <GODMODE_API_KEY>` header

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/health` | Health check (no auth) |
| POST | `/run` | Queue a new job |
| GET | `/jobs` | List all jobs |
| GET | `/jobs/:id` | Get job status + result |
| DELETE | `/jobs/:id` | Cancel a queued job |
| POST | `/recordings` | Upsert a recording |
| GET | `/recordings` | List all recordings (sorted by `at` desc) |
| DELETE | `/recordings/:id` | Delete a recording |
| POST | `/cases` | Upsert a test case (alias of `/test-cases`) |
| GET | `/cases` | List all test cases (alias of `/test-cases`) |
| DELETE | `/cases/:id` | Delete a test case (alias of `/test-cases/:id`) |
| POST | `/test-cases` | Upsert a test case |
| GET | `/test-cases` | List all test cases (sorted by `createdAt` desc) |
| DELETE | `/test-cases/:id` | Delete a test case |
| POST | `/results` | Append a test result (keep last 500) |
| GET | `/results` | List test results (last 100, sorted by `t0` desc) |

### POST /run — Job Types

```json
// Scrape
{ "type": "SCRAPE", "payload": { "url": "https://example.com" } }

// Automate (from extension recording)
{ "type": "AUTOMATE", "payload": { "steps": [...] } }

// Schedule
{ "type": "SCHEDULE", "payload": { "cron": "0 9 * * *" } }

// Custom
{ "type": "CUSTOM", "payload": { "anything": "you want" } }
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GODMODE_API_KEY` | *(required)* | API authentication key — **must be set in production** |
| `PORT` | `4000` | Backend port |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated allowed CORS origins |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` | Dashboard → API URL |

## Production Upgrades (Next Steps)

- [ ] Replace in-memory queue with **BullMQ + Redis**
- [ ] Add **Playwright/Puppeteer** for actual browser automation execution
- [ ] PostgreSQL for job persistence
- [ ] WebSocket for real-time job status push
- [ ] Multi-user auth (JWT / OAuth)
- [ ] Cron scheduling with node-cron
- [ ] Webhook callbacks on job completion
