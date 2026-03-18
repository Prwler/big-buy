# Marketplace API

A production-grade secondhand marketplace REST API built with **NestJS**, **TypeORM**, and **PostgreSQL**. The project demonstrates core backend engineering patterns alongside a Data Engineering layer with nightly aggregation jobs and analytical reporting.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | NestJS |
| Database | PostgreSQL 15 |
| ORM | TypeORM |
| Auth | JWT + Refresh Token rotation |
| Search | Postgres full-text search (`tsvector`) |
| Scheduling | `@nestjs/schedule` (cron jobs) |
| Validation | `class-validator` / `class-transformer` |
| Docs | Swagger / OpenAPI (`/api`) |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        REST API Layer                       │
│   auth  │  listings  │  orders  │  reviews  │  analytics   │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                 Transactional DB (OLTP)                     │
│   users  │  listings  │  orders  │  payments  │  reviews   │
└─────────────────────────┬───────────────────────────────────┘
                          │  nightly cron jobs
┌─────────────────────────▼───────────────────────────────────┐
│                  Reporting Tables (OLAP)                    │
│   report_daily_sales  │  report_seller_performance          │
│   report_category_trends                                    │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                   Analytics Endpoints                       │
│   /analytics/sales/daily  │  /analytics/sellers/top        │
│   /analytics/categories/trends                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL 15+

### Installation

```bash
git clone https://github.com/Prwler/big-buy.git
cd big-buy
npm install
```

### Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

```env
NODE_ENV=development

DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=marketplace

JWT_SECRET=your-long-random-secret
JWT_ACCESS_EXPIRES=15m

JOBS_SECRET=your-jobs-secret
```

### Database Setup

1. Create a `marketplace` database in PostgreSQL
2. Start the app — TypeORM will auto-create the transactional tables via `synchronize: true`
3. Run the reporting tables migration manually in your SQL client:

```bash
src/database/migrations/002_reporting_tables.sql
```

### Run

```bash
# Development
npm run start:dev

# Production
npm run build
npm run start:prod
```

Swagger UI is available at `http://localhost:3000/api`

---

## API Endpoints

### Auth
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | Public | Register as buyer or seller |
| POST | `/auth/verify` | Public | Verify email with 6-digit code |
| POST | `/auth/verify/resend` | Public | Resend verification code |
| POST | `/auth/login` | Public | Login — requires verified account |
| POST | `/auth/refresh` | Public | Rotate refresh token |
| POST | `/auth/logout` | Public | Revoke refresh token |

### Listings
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/listings` | Public | Search listings (full-text + filters) |
| GET | `/listings/:id` | Public | Get single listing |
| GET | `/listings/seller/:sellerId` | Public | Listings by seller |
| POST | `/listings` | Seller | Create listing (draft) |
| PATCH | `/listings/:id` | Seller | Update listing |
| PATCH | `/listings/:id/publish` | Seller | Publish draft |
| DELETE | `/listings/:id` | Seller/Admin | Soft-delete listing |

### Orders
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/orders` | Buyer | Place an order |
| GET | `/orders/me/buying` | Buyer | My purchases |
| GET | `/orders/me/selling` | Seller | My sales |
| GET | `/orders/:id` | Party | Order detail |
| PATCH | `/orders/:id/pay` | Buyer | Confirm payment → `paid` |
| PATCH | `/orders/:id/ship` | Seller | Mark shipped → `shipped` |
| PATCH | `/orders/:id/deliver` | Buyer | Confirm delivery → `delivered` |
| PATCH | `/orders/:id/complete` | Buyer | Complete order → `completed` |
| PATCH | `/orders/:id/cancel` | Party | Cancel order |

### Reviews
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/reviews/seller/:sellerId` | Public | Reviews for a seller |
| GET | `/reviews/:id` | Public | Single review |
| POST | `/reviews` | Buyer | Leave review on completed order |
| PATCH | `/reviews/:id/hide` | Admin | Hide a review |

### Analytics
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/analytics/sales/daily` | Admin | Daily GMV + 7-day rolling avg |
| GET | `/analytics/sellers/top` | Admin | Top sellers by revenue |
| GET | `/analytics/categories/trends` | Admin | Category WoW GMV growth |
| GET | `/analytics/sellers/me` | Seller | My performance dashboard |
| GET | `/analytics/sellers/:id` | Admin | Any seller's dashboard |
| POST | `/analytics/run-jobs` | Admin + secret header | Manually trigger aggregation jobs |

---

## Key Design Decisions

### 1. Order State Machine

Orders follow a strict state machine with explicit valid transitions:

```
pending ──► paid ──► shipped ──► delivered ──► completed
   │                                    
   └──► cancelled          paid ──► refunded
```

Invalid transitions throw a `400 Bad Request`. Every transition runs inside a **database transaction with pessimistic locking** to prevent race conditions — for example, two buyers simultaneously ordering the same listing.

### 2. OLTP / OLAP Separation

Analytical queries never touch the hot transactional tables. Instead, three nightly cron jobs aggregate data into dedicated reporting tables:

| Job | Schedule | Populates |
|---|---|---|
| Daily sales | `0 1 * * *` | `report_daily_sales` |
| Seller performance | `30 1 * * *` | `report_seller_performance` |
| Category trends | `0 2 * * 1` | `report_category_trends` |

All jobs are **idempotent** — safe to re-run using `INSERT ... ON CONFLICT DO UPDATE`.

The reporting endpoints query only these pre-aggregated tables, keeping the transactional database fast and the analytical queries cheap.

### 3. Postgres Features

- **Full-text search** — `tsvector` / `tsquery` on listing title and description, auto-updated via trigger
- **Window functions** — `RANK()` for seller leaderboards, `LAG()` for week-over-week category trends, rolling averages for GMV
- **Pessimistic locking** — `SELECT ... FOR UPDATE` on order and listing rows during transactions
- **Partial indexes** — index only active listings for the most common query path
- **JSONB** — flexible per-category product attributes and shipping addresses
- **Triggers** — automatic `updated_at` timestamps and order status history logging

### 4. Auth

- Short-lived JWT access tokens (15 min) paired with long-lived refresh tokens (30 days)
- Refresh token **rotation** on every use — old token revoked, new pair issued
- Refresh tokens and verification codes are **hashed before storage** (SHA-256) so a leaked database doesn't expose live credentials
- Email verification required before login — verification codes expire after 15 minutes
- Resend endpoint uses a consistent response message to prevent **user enumeration**

### 5. Response Safety

- `@Exclude()` on sensitive fields (`passwordHash`, `verificationCodeHash`, etc.) via `ClassSerializerInterceptor`
- Seller/buyer IDs on reviews derived server-side from the order — never trusted from the request body
- Soft deletes on listings preserve order and review history

---

## Project Structure

```
src/
├── auth/
│   ├── decorators/        # @CurrentUser(), @Roles()
│   ├── dto/               # RegisterDto, LoginDto, VerifyDto
│   ├── entities/          # User, RefreshToken
│   ├── guards/            # JwtAuthGuard, RolesGuard
│   └── strategies/        # JwtStrategy
├── listings/
│   ├── dto/               # CreateListingDto, SearchListingsDto
│   └── entities/          # Listing, ListingImage, Category
├── orders/
│   ├── dto/               # CreateOrderDto, ShipOrderDto, CancelOrderDto
│   └── entities/          # Order, Payment, OrderStatusHistory
├── reviews/
│   ├── dto/               # CreateReviewDto
│   └── entities/          # Review
├── analytics/
│   ├── jobs/              # AggregationJob (cron)
│   └── reporting/         # ReportingService, ReportingController
└── database/
    └── migrations/
        ├── 001_initial_schema.sql
        └── 002_reporting_tables.sql
```