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

# API Endpoints

Base URL: `http://localhost:5000/api/v1` · Auth header for protected routes: `Authorization: Bearer <token>` (token comes from the login response `data.token`).

Total: 80 distinct endpoints (some are listed twice with different demo bodies, e.g. the logins).

Success: `{ "success": true, "message": "...", "data": {}, "meta": {} }` · Error: `{ "success": false, "message": "...", "errors": [] }`

---

## auth

### 1. Register (customer) - sends a 6-digit OTP to the email, no token yet

**auth:** `POST http://localhost:5000/api/v1/auth/register`  
**Access:** Public

```json
{
  "name": "Uhai",
  "email": "uhaimong.dev@gmail.com",
  "password": "Admin@885",
  "phone": "+8801711111111",
  "address": "House 12, Road 4, Sector 10",
  "meterNumber": "MTR-1001"
}
```

### 2. Resend verification OTP (60s cooldown, max 5 per hour)

**auth:** `POST http://localhost:5000/api/v1/auth/resend-otp`  
**Access:** Public

```json
{
  "email": "uhaimong.dev@gmail.com"
}
```

### 3. Verify email with OTP (logs the user in)

**auth:** `POST http://localhost:5000/api/v1/auth/verify-email`  
**Access:** Public (OTP from email; paste it into the `otp` collection variable)

```json
{
  "email": "uhaimong.dev@gmail.com",
  "otp": "{{otp}}"
}
```

### 4. Login (Admin)

**auth:** `POST http://localhost:5000/api/v1/auth/login`  
**Access:** Public (email must be verified)

**Note: It is demo body request not real loign credential**

```json
{
  "email": "admin@example.com",
  "password": "Password@123"
}
```

### 5. Login (Operator)

**auth:** `POST http://localhost:5000/api/v1/auth/login`  
**Access:** Public (email must be verified)

```json
{
  "email": "operator@example.com",
  "password": "Password@123"
}
```

### 6. Login (Zone Manager)

**auth:** `POST http://localhost:5000/api/v1/auth/login`  
**Access:** Public (email must be verified)

```json
{
  "email": "manager@example.com",
  "password": "Password@123"
}
```

### 7. Login (Technician)

**auth:** `POST http://localhost:5000/api/v1/auth/login`  
**Access:** Public (email must be verified)

```json
{
  "email": "tech1@example.com",
  "password": "Password@123"
}
```

### 8. Login (Customer)

**auth:** `POST http://localhost:5000/api/v1/auth/login`  
**Access:** Public (email must be verified)

```json
{
  "email": "customer@example.com",
  "password": "Password@123"
}
```

### 9. Refresh token (rotates session, old token stops working)

**auth:** `POST http://localhost:5000/api/v1/auth/refresh-token`  
**Access:** Any logged-in user (use the token from Verify email)

No request body.

### 10. Change password - step 1: send OTP to my email

**auth:** `POST http://localhost:5000/api/v1/auth/change-password/send-otp`  
**Access:** Any logged-in user

No request body.

### 11. Change password - step 2: confirm with OTP

**auth:** `POST http://localhost:5000/api/v1/auth/change-password`  
**Access:** Any logged-in user (OTP from email in `otp` variable)

```json
{
  "otp": "{{otp}}",
  "currentPassword": "Passw0rd123",
  "newPassword": "Passw0rd456"
}
```

### 12. Logout

**auth:** `POST http://localhost:5000/api/v1/auth/logout`  
**Access:** Any logged-in user

No request body.

### 13. Forgot password - sends OTP (always answers 200, never reveals if the email exists)

**auth:** `POST http://localhost:5000/api/v1/auth/forgot-password`  
**Access:** Public

```json
{
  "email": "rahim@example.com"
}
```

### 14. Reset password with OTP (signs out all sessions)

**auth:** `POST http://localhost:5000/api/v1/auth/reset-password`  
**Access:** Public (OTP from email in `otp` variable)

```json
{
  "email": "rahim@example.com",
  "otp": "{{otp}}",
  "newPassword": "Passw0rd789"
}
```

### 15. Login (new customer created by Register, after reset)

**auth:** `POST http://localhost:5000/api/v1/auth/login`  
**Access:** Public

```json
{
  "email": "rahim@example.com",
  "password": "Passw0rd789"
}
```

---

## network / zones

### 16. Create zone

**zones:** `POST http://localhost:5000/api/v1/zones`  
**Access:** ADMIN

```json
{
  "name": "Dhaka South",
  "code": "DHK-S",
  "description": "Dhaka South distribution zone"
}
```

### 17. List zones

**zones:** `GET http://localhost:5000/api/v1/zones?q=dhaka&sortBy=name&order=asc&page=1&limit=10`  
**Access:** Any logged-in user

No request body.

### 18. Get zone

**zones:** `GET http://localhost:5000/api/v1/zones/{{zoneId}}`  
**Access:** Any logged-in user

No request body.

### 19. Update zone

**zones:** `PATCH http://localhost:5000/api/v1/zones/{{zoneId}}`  
**Access:** ZONE_MANAGER (own zone) / ADMIN

```json
{
  "description": "Updated zone description"
}
```

### 20. Delete zone (soft delete)

**zones:** `DELETE http://localhost:5000/api/v1/zones/{{newZoneId}}`  
**Access:** ADMIN

No request body.

---

## network / substations

### 21. Create substation

**substations:** `POST http://localhost:5000/api/v1/substations`  
**Access:** ZONE_MANAGER (own zone) / ADMIN

```json
{
  "zoneId": "{{zoneId}}",
  "name": "Gulshan Substation",
  "code": "SS-GULSHAN",
  "capacityMw": 80
}
```

### 22. List substations

**substations:** `GET http://localhost:5000/api/v1/substations?zoneId={{zoneId}}&q=uttara&sortBy=capacityMw&order=desc&page=1&limit=10`  
**Access:** Any logged-in user

No request body.

### 23. Get substation

**substations:** `GET http://localhost:5000/api/v1/substations/{{substationId}}`  
**Access:** Any logged-in user

No request body.

### 24. Update substation

**substations:** `PATCH http://localhost:5000/api/v1/substations/{{newSubstationId}}`  
**Access:** ZONE_MANAGER (own zone) / ADMIN

```json
{
  "name": "Gulshan Main Substation",
  "capacityMw": 90
}
```

### 25. Delete substation (soft delete)

**substations:** `DELETE http://localhost:5000/api/v1/substations/{{newSubstationId}}`  
**Access:** ZONE_MANAGER (own zone) / ADMIN

No request body.

---

## network / feeders

### 26. Create feeder

**feeders:** `POST http://localhost:5000/api/v1/feeders`  
**Access:** ZONE_MANAGER (own zone) / ADMIN

```json
{
  "substationId": "{{substationId}}",
  "name": "Test Feeder",
  "code": "F-TEST",
  "capacityMw": 25,
  "loadMw": 10,
  "priority": "LOW"
}
```

### 27. List feeders

**feeders:** `GET http://localhost:5000/api/v1/feeders?priority=LOW&status=ENERGIZED&sortBy=loadMw&order=desc&page=1&limit=10`  
**Access:** Any logged-in user

No request body.

### 28. Get feeder

**feeders:** `GET http://localhost:5000/api/v1/feeders/{{feederId}}`  
**Access:** Any logged-in user

No request body.

### 29. Update feeder

**feeders:** `PATCH http://localhost:5000/api/v1/feeders/{{testFeederId}}`  
**Access:** ZONE_MANAGER (own zone) / ADMIN

```json
{
  "name": "Test Feeder Updated",
  "priority": "MEDIUM",
  "status": "ENERGIZED"
}
```

### 30. Update live load reading

**feeders:** `PATCH http://localhost:5000/api/v1/feeders/{{feederId}}/load`  
**Access:** OPERATOR / ZONE_MANAGER / ADMIN

```json
{
  "loadMw": 15,
  "status": "ENERGIZED"
}
```

### 31. Delete feeder (soft delete)

**feeders:** `DELETE http://localhost:5000/api/v1/feeders/{{testFeederId}}`  
**Access:** ZONE_MANAGER (own zone) / ADMIN

No request body.

---

## network / areas

### 32. Create area

**areas:** `POST http://localhost:5000/api/v1/areas`  
**Access:** ZONE_MANAGER (own zone) / ADMIN

```json
{
  "feederId": "{{feederId}}",
  "name": "Sector 14",
  "code": "A-SEC14",
  "type": "RESIDENTIAL",
  "customerCount": 800,
  "address": "Sector 14, Uttara"
}
```

### 33. List areas

**areas:** `GET http://localhost:5000/api/v1/areas?q=sector&type=RESIDENTIAL&sortBy=name&order=asc&page=1&limit=10`  
**Access:** Any logged-in user

No request body.

### 34. Get area

**areas:** `GET http://localhost:5000/api/v1/areas/{{areaId}}`  
**Access:** Any logged-in user

No request body.

### 35. Update area

**areas:** `PATCH http://localhost:5000/api/v1/areas/{{newAreaId}}`  
**Access:** ZONE_MANAGER (own zone) / ADMIN

```json
{
  "name": "Sector 14 Updated",
  "customerCount": 900
}
```

### 36. Delete area (soft delete)

**areas:** `DELETE http://localhost:5000/api/v1/areas/{{newAreaId}}`  
**Access:** ZONE_MANAGER (own zone) / ADMIN

No request body.

---

## users

### 37. Get my profile

**users:** `GET http://localhost:5000/api/v1/users/me`  
**Access:** Any logged-in user

No request body.

### 38. Update my profile

**users:** `PATCH http://localhost:5000/api/v1/users/me`  
**Access:** Any logged-in user

```json
{
  "name": "Demo Customer",
  "phone": "+8801700000010",
  "address": "House 12, Road 4, Sector 10",
  "areaId": "{{areaId}}"
}
```

### 39. Upload avatar (multipart/form-data, Cloudinary)

**users:** `POST http://localhost:5000/api/v1/users/me/avatar`  
**Access:** Any logged-in user

```
multipart/form-data
image (file): (choose a JPEG/PNG/WEBP file, max 5 MB)
```

### 40. Set my availability (on-duty toggle)

**users:** `PATCH http://localhost:5000/api/v1/users/me/availability`  
**Access:** TECHNICIAN

```json
{
  "isAvailable": true
}
```

### 41. List technicians (pagination + filters)

**users:** `GET http://localhost:5000/api/v1/users/technicians?available=true&page=1&limit=10`  
**Access:** OPERATOR / ZONE_MANAGER / ADMIN

No request body.

### 42. Delete my account (soft delete, logs me out everywhere)

**users:** `DELETE http://localhost:5000/api/v1/users/me`  
**Access:** Any logged-in user (not ADMIN) - demo uses the throwaway Register user

No request body.

---

## admin

### 43. List users (search / filter / sort / pagination)

**admin:** `GET http://localhost:5000/api/v1/admin/users?q=demo&role=CUSTOMER&isActive=true&sortBy=name&order=asc&page=1&limit=10`  
**Access:** ADMIN

No request body.

### 44. Create staff account

**admin:** `POST http://localhost:5000/api/v1/admin/users`  
**Access:** ADMIN

```json
{
  "name": "New Operator",
  "email": "operator2@example.com",
  "password": "Passw0rd123",
  "role": "OPERATOR",
  "phone": "+8801700000099",
  "zoneId": "{{zoneId}}"
}
```

### 45. Get user by id

**admin:** `GET http://localhost:5000/api/v1/admin/users/{{staffId}}`  
**Access:** ADMIN

No request body.

### 46. Change user role

**admin:** `PATCH http://localhost:5000/api/v1/admin/users/{{staffId}}/role`  
**Access:** ADMIN

```json
{
  "role": "TECHNICIAN",
  "zoneId": "{{zoneId}}"
}
```

### 47. Activate / deactivate user

**admin:** `PATCH http://localhost:5000/api/v1/admin/users/{{staffId}}/status`  
**Access:** ADMIN

```json
{
  "isActive": false
}
```

### 48. Delete user (soft delete)

**admin:** `DELETE http://localhost:5000/api/v1/admin/users/{{staffId}}`  
**Access:** ADMIN

No request body.

### 49. Dashboard statistics

**admin:** `GET http://localhost:5000/api/v1/admin/dashboard-stats`  
**Access:** ADMIN

No request body.

### 50. Audit logs (filters + pagination)

**admin:** `GET http://localhost:5000/api/v1/admin/audit-logs?entity=Outage&action=OUTAGE_VERIFIED&page=1&limit=20`  
**Access:** ADMIN

No request body.

---

## schedule

### 51. Create planned outage (conflict-checked)

**schedule:** `POST http://localhost:5000/api/v1/schedules`  
**Access:** OPERATOR / ZONE_MANAGER / ADMIN

```json
{
  "feederId": "{{feederId}}",
  "startTime": "2030-01-01T10:00:00.000Z",
  "endTime": "2030-01-01T12:00:00.000Z",
  "type": "MAINTENANCE",
  "reason": "Transformer maintenance"
}
```

### 52. Generate load-shedding schedule - preview only (dryRun)

**schedule:** `POST http://localhost:5000/api/v1/schedules/generate`  
**Access:** OPERATOR / ZONE_MANAGER / ADMIN

```json
{
  "zoneId": "{{zoneId}}",
  "date": "2030-01-02",
  "deficitMw": 20,
  "startHour": 8,
  "endHour": 22,
  "slotHours": 2,
  "maxShedHoursPerFeeder": 4,
  "utcOffsetMinutes": 360,
  "dryRun": true,
  "reason": "Gas supply shortage"
}
```

### 53. Generate load-shedding schedule - save

**schedule:** `POST http://localhost:5000/api/v1/schedules/generate`  
**Access:** OPERATOR / ZONE_MANAGER / ADMIN

```json
{
  "zoneId": "{{zoneId}}",
  "date": "2030-01-02",
  "deficitMw": 20,
  "startHour": 8,
  "endHour": 22,
  "slotHours": 2,
  "maxShedHoursPerFeeder": 4,
  "utcOffsetMinutes": 360,
  "dryRun": false,
  "reason": "Gas supply shortage"
}
```

### 54. List schedules (customers only see their own feeder/area)

**schedule:** `GET http://localhost:5000/api/v1/schedules?status=SCHEDULED&type=LOAD_SHEDDING&from=2030-01-01&to=2030-12-31&sortBy=startTime&order=asc&page=1&limit=10`  
**Access:** Any logged-in user

No request body.

### 55. Get schedule

**schedule:** `GET http://localhost:5000/api/v1/schedules/{{scheduleId}}`  
**Access:** Any logged-in user

No request body.

### 56. Reschedule (only SCHEDULED)

**schedule:** `PATCH http://localhost:5000/api/v1/schedules/{{scheduleId}}`  
**Access:** OPERATOR / ZONE_MANAGER / ADMIN

```json
{
  "startTime": "2030-01-01T11:00:00.000Z",
  "endTime": "2030-01-01T13:00:00.000Z",
  "reason": "Moved by one hour"
}
```

### 57. Cancel schedule

**schedule:** `POST http://localhost:5000/api/v1/schedules/{{scheduleId}}/cancel`  
**Access:** OPERATOR / ZONE_MANAGER / ADMIN

```json
{
  "reason": "Work postponed"
}
```

### 58. Delete schedule (soft delete)

**schedule:** `DELETE http://localhost:5000/api/v1/schedules/{{scheduleId}}`  
**Access:** ADMIN

No request body.

---

## outage

### 59. Report outage (multipart/form-data, image optional)

**outage:** `POST http://localhost:5000/api/v1/outages/report`  
**Access:** CUSTOMER

```
multipart/form-data
description (text): No electricity since 8pm in Sector 10
areaId (text): {{areaId}}  (optional - defaults to your profile area)
image (file): (optional JPEG/PNG/WEBP, max 5 MB)
```

### 60. List outages (role-scoped, filters + pagination)

**outage:** `GET http://localhost:5000/api/v1/outages?status=REPORTED&severity=MEDIUM&sortBy=startedAt&order=desc&page=1&limit=10`  
**Access:** Any logged-in user

No request body.

### 61. My reported outages

**outage:** `GET http://localhost:5000/api/v1/outages/my-reports?page=1&limit=10`  
**Access:** CUSTOMER

No request body.

### 62. My assigned outages

**outage:** `GET http://localhost:5000/api/v1/outages/my-assigned?status=ASSIGNED&page=1&limit=10`  
**Access:** TECHNICIAN

No request body.

### 63. Get outage

**outage:** `GET http://localhost:5000/api/v1/outages/{{outageId}}`  
**Access:** Any logged-in user (scoped)

No request body.

### 64. Outage timeline (audit trail)

**outage:** `GET http://localhost:5000/api/v1/outages/{{outageId}}/timeline`  
**Access:** Any logged-in user (scoped)

No request body.

### 65. Verify outage (REPORTED -> VERIFIED)

**outage:** `PATCH http://localhost:5000/api/v1/outages/{{outageId}}/verify`  
**Access:** OPERATOR / ZONE_MANAGER / ADMIN

```json
{
  "severity": "HIGH",
  "cause": "Transformer fault",
  "estimatedRestorationAt": "2030-01-01T18:00:00.000Z"
}
```

### 66. Assign technician (VERIFIED -> ASSIGNED)

**outage:** `POST http://localhost:5000/api/v1/outages/{{outageId}}/assign`  
**Access:** OPERATOR / ZONE_MANAGER / ADMIN

```json
{
  "technicianId": "{{technicianId}}"
}
```

### 67. Technician: start repair (ASSIGNED -> IN_PROGRESS)

**outage:** `PATCH http://localhost:5000/api/v1/outages/{{outageId}}/status`  
**Access:** TECHNICIAN (assigned)

```json
{
  "status": "IN_PROGRESS",
  "notes": "Reached the site"
}
```

### 68. Technician: mark restored (IN_PROGRESS -> RESTORED)

**outage:** `PATCH http://localhost:5000/api/v1/outages/{{outageId}}/status`  
**Access:** TECHNICIAN (assigned)

```json
{
  "status": "RESTORED",
  "notes": "Replaced blown fuse",
  "cause": "Blown HT fuse"
}
```

### 69. Reject outage (alternative to Assign - only for REPORTED/VERIFIED outages)

**outage:** `POST http://localhost:5000/api/v1/outages/{{outageId}}/reject`  
**Access:** OPERATOR / ZONE_MANAGER / ADMIN

```json
{
  "reason": "Customer-side fault, not a grid outage"
}
```

### 70. Auto-assign best available technician (alternative to manual Assign - only for VERIFIED outages)

**outage:** `POST http://localhost:5000/api/v1/outages/{{outageId}}/auto-assign`  
**Access:** OPERATOR / ZONE_MANAGER / ADMIN

No request body.

### 71. Delete outage (soft delete, RESTORED/REJECTED only)

**outage:** `DELETE http://localhost:5000/api/v1/outages/{{outageId}}`  
**Access:** ADMIN

No request body.

---

## notification

### 72. My notifications

**notification:** `GET http://localhost:5000/api/v1/notifications?unreadOnly=true&page=1&limit=10`  
**Access:** Any logged-in user

No request body.

### 73. Mark one as read

**notification:** `PATCH http://localhost:5000/api/v1/notifications/{{notificationId}}/read`  
**Access:** Any logged-in user

No request body.

### 74. Mark all as read

**notification:** `PATCH http://localhost:5000/api/v1/notifications/read-all`  
**Access:** Any logged-in user

No request body.

---

## bill

### 75. Create bill (tiered tariff calculated server-side)

**bill:** `POST http://localhost:5000/api/v1/bills`  
**Access:** OPERATOR / ADMIN

```json
{
  "customerId": "{{customerId}}",
  "billingMonth": "2030-01",
  "units": 250,
  "dueDate": "2030-02-15T00:00:00.000Z"
}
```

### 76. List bills (customers see only their own)

**bill:** `GET http://localhost:5000/api/v1/bills?status=UNPAID&month=2030-01&sortBy=dueDate&order=asc&page=1&limit=10`  
**Access:** CUSTOMER / OPERATOR / ADMIN

No request body.

### 77. Get bill

**bill:** `GET http://localhost:5000/api/v1/bills/{{billId}}`  
**Access:** CUSTOMER / OPERATOR / ADMIN

No request body.

### 78. Create bill (second bill, used for the delete demo)

**bill:** `POST http://localhost:5000/api/v1/bills`  
**Access:** OPERATOR / ADMIN

```json
{
  "customerId": "{{customerId}}",
  "billingMonth": "2030-02",
  "units": 120,
  "dueDate": "2030-03-15T00:00:00.000Z"
}
```

### 79. Delete bill (soft delete, unpaid only)

**bill:** `DELETE http://localhost:5000/api/v1/bills/{{tempBillId}}`  
**Access:** ADMIN

No request body.

---

## payment

### 80. Initiate bKash payment (open data.bkashUrl in a browser)

**payment:** `POST http://localhost:5000/api/v1/payments/initiate`  
**Access:** CUSTOMER

```json
{
  "billId": "{{billId}}"
}
```

### 81. bKash callback (bKash redirects the browser here)

**payment:** `GET http://localhost:5000/api/v1/payments/callback/{{paymentId}}?paymentID={{bkashPaymentId}}&status=success`  
**Access:** Public (called by bKash)

No request body.

### 82. Webhook (re-verifies with bKash; header x-webhook-secret required)

**payment:** `POST http://localhost:5000/api/v1/payments/webhook`  
**Access:** Public + secret header

**Extra header:** `x-webhook-secret: {{webhookSecret}}`

```json
{
  "paymentID": "{{bkashPaymentId}}"
}
```

### 83. Verify payment (re-query bKash)

**payment:** `POST http://localhost:5000/api/v1/payments/{{paymentId}}/verify`  
**Access:** CUSTOMER / OPERATOR / ADMIN

No request body.

### 84. List payments

**payment:** `GET http://localhost:5000/api/v1/payments?status=COMPLETED&sortBy=createdAt&order=desc&page=1&limit=10`  
**Access:** CUSTOMER / OPERATOR / ADMIN

No request body.

### 85. Get payment

**payment:** `GET http://localhost:5000/api/v1/payments/{{paymentId}}`  
**Access:** CUSTOMER / OPERATOR / ADMIN

No request body.

---

## analytics

### 86. Outage summary

**analytics:** `GET http://localhost:5000/api/v1/analytics/outage-summary?from=2026-01-01&to=2030-12-31`  
**Access:** OPERATOR / ZONE_MANAGER / ADMIN

No request body.

### 87. Area reliability (worst areas first)

**analytics:** `GET http://localhost:5000/api/v1/analytics/area-reliability?from=2026-01-01&to=2030-12-31&limit=10`  
**Access:** OPERATOR / ZONE_MANAGER / ADMIN

No request body.

### 88. Technician performance

**analytics:** `GET http://localhost:5000/api/v1/analytics/technician-performance?from=2026-01-01&to=2030-12-31&limit=10`  
**Access:** OPERATOR / ZONE_MANAGER / ADMIN

No request body.

## Highlights

- Conflict detection + Postgres advisory locks + transactions (schedules, outage reports, payments)
- Atomic technician claim (compare-and-set) – no double assignment
- Priority/fairness-based load-shedding generator with `dryRun`
- Outage state machine, soft deletes, audit log + outage timeline
- Redis caching (network lists, analytics, dashboard) – falls back gracefully when `REDIS_URL` is empty
- Rate limiting, Helmet, CORS, indexed Prisma schema split into multiple files
