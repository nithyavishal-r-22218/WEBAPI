# ⚡ GodMode — Automation HQ

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

All requests require: `x-api-key: godmode-dev-key` header

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/health` | Health check (no auth) |
| POST | `/run` | Queue a new job |
| GET | `/jobs` | List all jobs |
| GET | `/jobs/:id` | Get job status + result |
| DELETE | `/jobs/:id` | Cancel a queued job |

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
| `GODMODE_API_KEY` | `godmode-dev-key` | API authentication key |
| `PORT` | `4000` | Backend port |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` | Dashboard → API URL |

## Production Upgrades (Next Steps)

- [ ] Replace in-memory queue with **BullMQ + Redis**
- [ ] Add **Playwright/Puppeteer** for actual browser automation execution
- [ ] PostgreSQL for job persistence
- [ ] WebSocket for real-time job status push
- [ ] Multi-user auth (JWT / OAuth)
- [ ] Cron scheduling with node-cron
- [ ] Webhook callbacks on job completion
