# Load Shedding & Power Outage Management API

## Core Tech:

Node.js · TypeScript · Express · PostgreSQL + Prisma ORM · Zod · Better Auth · Redis · bKash sandbox · Biome

## Setup

```bash
npm install
cp .env.example .env          # SET all ENV
npm run db:generate           # Prisma client (generated into src/generated)
npm run db:migrate -- --name init
npm run dev                   # http://localhost:5000
```

Production: `npm run build && npm run db:deploy && npm start`.
Quality: `npm run typecheck`, `npm run lint`, `npm run format`.

Import `postman_collection.json` into Postman. Run the login requests in **1. Auth** first; tokens and ids are stored in collection variables automatically.

## Roles

CUSTOMER, OPERATOR, TECHNICIAN, ZONE_MANAGER (scoped to zones they manage), ADMIN.
Permission groups live in `src/config/roles.ts` and are enforced per route with `authorize(...)`.

## Auth

Better Auth with the Bearer plugin: `Authorization: Bearer <token>`.
`/api/v1/auth/{register,login,refresh-token,logout}` return the token in the standard envelope (refresh rotates the session).
Google login: `POST /api/auth/sign-in/social` `{ "provider": "google" }` (needs `GOOGLE_CLIENT_ID/SECRET`); the resulting session cookie also works on all routes.

## Error handling

`catchAsync` (higher-order function) wraps every controller; `globalErrorHandler` converts AppError, Zod, Prisma, Multer, Better Auth and malformed-JSON errors into
`{ "success": false, "message": "...", "errors": [] }`. Success: `{ "success": true, "message": "...", "data": {}, "meta"?: {} }`.

## Payments (bKash sandbox)

Bill → `POST /payments/initiate` → open `data.bkashUrl` → bKash redirects to `/payments/callback/:id` → payment is executed & verified server-side, bill becomes PAID.
`/payments/webhook` (header `x-webhook-secret`) and `/payments/:id/verify` re-query bKash; nothing is trusted from the client.

## Highlights

- Conflict detection + Postgres advisory locks + transactions (schedules, outage reports, payments)
- Atomic technician claim (compare-and-set) – no double assignment
- Priority/fairness-based load-shedding generator with `dryRun`
- Outage state machine, soft deletes, audit log + outage timeline
- Redis caching (network lists, analytics, dashboard) – falls back gracefully when `REDIS_URL` is empty
- Rate limiting, Helmet, CORS, indexed Prisma schema split into multiple files
