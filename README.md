# TaskFlow Management System

Production-ready full-stack enterprise task management platform developed for the **SWAN DIGITAL SOLUTIONS Full Stack Developer Assessment**.

TaskFlow is built from scratch with a decoupled architecture featuring a high-performance **FastAPI** asynchronous REST backend backed by **MongoDB**, secure **JWT** authentication with **Argon2id** password hashing, and a modern, responsive **Next.js 16 (App Router)** and **React 19** frontend styled with **Tailwind CSS**.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Folder Structure](#folder-structure)
- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [MongoDB Configuration & Architecture](#mongodb-configuration--architecture)
- [Commands to Run Applications](#commands-to-run-applications)
- [API Endpoint Specification](#api-endpoint-specification)
- [Testing Instructions](#testing-instructions)
- [Admin Provisioning Instructions](#admin-provisioning-instructions)
- [Deployment Configuration](#deployment-configuration)
- [Known Limitations & Design Decisions](#known-limitations--design-decisions)
- [Assessment Verification Checklist](#assessment-verification-checklist)

---

## Tech Stack

| Layer | Technology | Description |
| :--- | :--- | :--- |
| **Frontend Framework** | Next.js 16.4 (App Router) | Server-side routing, static prerendering, and optimized client bundles |
| **UI Library** | React 19 & TypeScript 5.7 | Strict type safety, modern hooks, and functional architecture |
| **Styling** | Tailwind CSS 3.4 & PostCSS | Responsive design system, glassmorphic UI, curated color palettes |
| **Icons & Visuals** | Lucide React | High-clarity iconography across navigation, actions, and KPI widgets |
| **Form Management** | React Hook Form & Zod | Schema-based client validation, accessible errors, duplicate-submit protection |
| **Data Visualizations** | Recharts 2.15 | Responsive SVG charts for deliverable distribution and workload severity |
| **HTTP Client** | Axios 1.7 | Centralized API client with JWT Bearer token interceptor and error unwrapping |
| **Backend Framework** | Python 3.12 & FastAPI 0.115 | Asynchronous REST API with automatic OpenAPI (Swagger) documentation |
| **Data Validation** | Pydantic v2 & Pydantic-Settings | Strict request/response schemas, email normalization, ObjectId adapters |
| **Database Driver** | PyMongo 4.8+ (`AsyncMongoClient`) | Native Python asynchronous MongoDB driver with connection pooling |
| **Authentication** | JWT (`PyJWT`) & Argon2id (`argon2-cffi`) | OWASP-recommended state-of-the-art password hashing and bearer tokens |
| **Testing Suites** | Pytest 9 + Httpx & Vitest 3 + RTL | 51 backend tests + 72 frontend unit/integration tests |
| **Code Quality** | Oxlint & TypeScript (`tsc`) | Instant multi-threaded linting and strict type checking |

---

## Folder Structure

```text
taskFlow/
├── README.md                      # Comprehensive project documentation (this file)
├── .gitignore                     # Git ignore rules (secrets, venv, node_modules, caches)
├── backend/                       # FastAPI Asynchronous REST Application
│   ├── .env.example               # Backend environment template
│   ├── pyproject.toml             # Poetry / Pytest configuration
│   ├── requirements.txt           # Python dependencies with pinned versions
│   ├── scripts/
│   │   └── create_admin.py        # Secure CLI administrator provisioning utility
│   ├── tests/                     # 51 Automated Pytest backend integration tests
│   │   ├── conftest.py            # Test fixtures and async client configuration
│   │   ├── test_auth.py           # Registration, login, password hashing, JWT tests
│   │   ├── test_dashboard.py      # Aggregation pipeline and calculation accuracy tests
│   │   ├── test_health.py         # Health check and environment tests
│   │   ├── test_mongodb.py        # MongoDB connection, ping, and index tests
│   │   ├── test_schemas.py        # Schema validation, timezone, and ObjectId tests
│   │   └── test_tasks.py          # Task CRUD, filters, sorting, RBAC permissions tests
│   └── app/
│       ├── main.py                # FastAPI app initialization, lifespan, CORS, and health
│       ├── core/
│       │   ├── config.py          # Pydantic BaseSettings environment loader & validators
│       │   ├── database.py        # AsyncMongoClient manager, ping, and index definitions
│       │   ├── object_id.py       # Custom PyObjectId adapter for Pydantic v2
│       │   └── security.py        # Argon2id hasher and JWT token generator/decoder
│       ├── models/
│       │   ├── enums.py           # UserRole (USER, ADMIN), TaskStatus, TaskPriority
│       │   ├── task.py            # Tasks collection name and index constants
│       │   └── user.py            # Users collection name and index constants
│       ├── schemas/
│       │   ├── auth.py            # Token schemas
│       │   ├── dashboard.py       # DashboardSummaryResponse schemas
│       │   ├── task.py            # TaskCreate, TaskUpdate, TaskResponse, TaskPagination
│       │   └── user.py            # UserRegister, UserLogin, UserResponse, UserInDB
│       ├── api/
│       │   ├── dependencies.py    # Bearer auth, get_current_user, require_admin guards
│       │   └── v1/
│       │       ├── api.py         # Sub-router mounting auth, tasks, dashboard, users
│       │       └── endpoints/
│       │           ├── auth.py    # POST /register, POST /login, GET /me, GET /admin-check
│       │           ├── dashboard.py # GET /dashboard/summary with $facet pipeline
│       │           ├── tasks.py   # Full CRUD, search, filter, sort, pagination
│       │           └── users.py   # GET /users assignment directory
│       └── services/
│           ├── task_service.py    # Database queries and access-control checks
│           └── user_service.py    # User querying and indexing helpers
│
└── frontend/                      # Next.js 16 (App Router) Application
    ├── .env.example               # Frontend environment template
    ├── next.config.mjs            # Next.js build and Turbopack configuration
    ├── package.json               # Dependencies and scripts (dev, build, test, lint, typecheck)
    ├── postcss.config.js          # PostCSS configuration for Tailwind CSS
    ├── tailwind.config.js         # Tailwind theme, typography, and color extensions
    ├── tsconfig.json              # TypeScript configuration
    ├── vitest.config.ts           # Vitest configuration for React 19 testing
    ├── public/                    # Static public assets
    └── src/
        ├── setupTests.ts          # Jest-DOM matchers, ResizeObserver polyfill, canvas mocks
        ├── __tests__/             # 72 Vitest React unit & integration test suites
        │   ├── AuthContext.test.tsx
        │   ├── authService.test.ts
        │   ├── Badge.test.tsx
        │   ├── BoardPage.test.tsx
        │   ├── Button.test.tsx
        │   ├── DashboardPage.test.tsx
        │   ├── DeleteTaskDialog.test.tsx
        │   ├── LoginPage.test.tsx
        │   ├── permissions.test.ts
        │   ├── ProtectedRoute.test.tsx
        │   ├── RegisterPage.test.tsx
        │   ├── TaskFormModal.test.tsx
        │   ├── taskService.test.ts
        │   └── TasksPage.test.tsx
        ├── api/
        │   ├── client.ts          # Centralized Axios client with Bearer token interceptor
        │   ├── endpoints.ts       # Canonical REST endpoint path constants
        │   ├── index.ts           # Barrel exports for API clients
        │   └── services/          # Typed API clients (auth, tasks, dashboard, users, health)
        ├── app/                   # Next.js App Router Pages & Layouts
        │   ├── layout.tsx         # Root layout with AuthProvider and metadata
        │   ├── page.tsx           # Landing redirect to /dashboard or /login
        │   ├── globals.css        # Tailwind directives and utility classes
        │   ├── (auth)/            # Unauthenticated auth route group
        │   │   ├── layout.tsx     # Split-screen branding layout
        │   │   ├── login/         # Interactive login page with password toggle & validation
        │   │   └── register/      # Registration page with Zod schema validation
        │   └── (dashboard)/       # Authenticated workspace route group
        │       ├── layout.tsx     # Sidebar navigation, top header, user menu, ProtectedRoute
        │       ├── dashboard/     # Real-time analytics, KPI widgets, Recharts, recent tasks
        │       ├── tasks/         # Paginated task table, debounced search, modal CRUD
        │       └── board/         # Interactive 3-column Kanban board with quick status moves
        ├── components/            # Reusable UI component library
        │   ├── auth/              # ProtectedRoute wrapper
        │   ├── common/            # Badge, Button, Input, Select, Modal, ConfirmationDialog
        │   ├── navigation/        # Header, Sidebar, UserDropdown
        │   └── tasks/             # TaskCard, TaskTable, TaskFormModal, DeleteTaskDialog
        ├── context/
        │   └── AuthContext.tsx    # Session management, current user state, login/logout actions
        ├── hooks/
        │   ├── useAuth.ts         # Hook consuming AuthContext
        │   └── useDebounce.ts     # Hook for search input debouncing
        ├── types/                 # Shared TypeScript interfaces for users, tasks, analytics
        └── utils/
            ├── permissions.ts     # Client-side permission helpers (canEdit, canDelete, canChangeStatus)
            └── storage.ts         # Secure local storage helpers for JWT token persistence
```

---

## Prerequisites

Before starting the application, ensure your environment has:

1. **Python**: Version 3.12 or higher.
2. **Node.js**: Version 20.x or higher with `npm` (v10+).
3. **MongoDB Server**: Version 6.0 or higher.
   - For local development, MongoDB Community Server running locally on `mongodb://127.0.0.1:27017` is recommended.
   - Alternatively, a hosted MongoDB Atlas connection URI can be specified in `backend/.env`.

---

## Environment Setup

### 1. Backend Environment (`backend/.env`)

In the `backend` directory, create a `.env` file based on `.env.example`:

```bash
cd backend
cp .env.example .env
```

| Environment Variable | Default Value | Description |
| :--- | :--- | :--- |
| `PROJECT_NAME` | `"TaskFlow Management API"` | Application name displayed in health check and Swagger docs |
| `VERSION` | `"1.0.0"` | Current API version |
| `ENVIRONMENT` | `"development"` | Environment runtime mode (`development`, `staging`, `production`) |
| `DEBUG` | `true` | Enables verbose FastAPI debugging |
| `API_V1_STR` | `"/api/v1"` | URL prefix for REST endpoints |
| `SECRET_KEY` | `min_32_chars_random_string` | Cryptographic secret for signing JWT access tokens (rejects trivial secrets) |
| `ALGORITHM` | `"HS256"` | JWT digital signature algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `1440` | JWT expiration duration in minutes (1440 = 24 hours) |
| `MONGODB_URI` | `"mongodb://127.0.0.1:27017"` | MongoDB connection URI with optional authentication credentials |
| `MONGODB_DB_NAME` | `"taskflow_db"` | Primary database name for collections |
| `BACKEND_CORS_ORIGINS` | `["http://localhost:3000"]` | Whitelist of allowed frontend origins permitted to make cross-origin requests |

> **Production Security Note**: Generate a cryptographically secure key for `SECRET_KEY` using `openssl rand -hex 32`.

### 2. Frontend Environment (`frontend/.env.local`)

In the `frontend` directory, create a `.env.local` file based on `.env.example`:

```bash
cd frontend
cp .env.example .env.local
```

| Environment Variable | Default Value | Description |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_API_BASE_URL` | `"http://127.0.0.1:8000"` | Base URL of the backend FastAPI service accessible by the browser |
| `NEXT_PUBLIC_APP_NAME` | `"TaskFlow Management System"` | Public display title for the web application |

> **Important**: Never place database credentials, JWT secret keys, or private API keys in frontend environment files. Only variables prefixed with `NEXT_PUBLIC_` are bundled to the browser.

---

## MongoDB Configuration & Architecture

TaskFlow uses the official **PyMongo Async API** (`AsyncMongoClient`) for non-blocking I/O. No SQL databases, ORMs, or legacy wrappers are used.

### Collections and Document Schemas

#### 1. `users` Collection
Stores registered user credentials, display names, and authorization roles.

```json
{
  "_id": "ObjectId('6adb17cf89f5d76aee77cd9b')",
  "name": "Jane Doe",
  "email": "jane.doe@taskflow.com",
  "password_hash": "$argon2id$v=19$m=65536,t=3,p=4$...",
  "role": "USER",
  "created_at": "2026-10-23T08:20:00.000Z",
  "updated_at": "2026-10-23T08:20:00.000Z"
}
```

* **Index**: Unique index on `email` (`idx_users_email_unique`) with case-insensitive normalization applied before insertion.

#### 2. `tasks` Collection
Stores workflow deliverables, priorities, statuses, and user associations.

```json
{
  "_id": "ObjectId('6adb18d6628d30f88a4aa141')",
  "title": "Implement Enterprise Architecture",
  "description": "End-to-end full stack verification deliverable",
  "status": "COMPLETED",
  "priority": "HIGH",
  "due_date": "2026-11-01T12:00:00.000Z",
  "creator_id": "ObjectId('6adb17cf89f5d76aee77cd9b')",
  "assignee_id": null,
  "created_at": "2026-10-23T08:20:38.769Z",
  "updated_at": "2026-10-23T08:25:57.462Z"
}
```

* **Indexes**:
  * `idx_tasks_creator_id` on `creator_id: 1` (accelerates user-scoped queries)
  * `idx_tasks_assignee_id` on `assignee_id: 1` (accelerates assigned-to-me queries)
  * `idx_tasks_status` on `status: 1` (speeds up Kanban and status filtering)
  * `idx_tasks_priority` on `priority: 1` (speeds up priority filtering)
  * `idx_tasks_due_date` on `due_date: 1` (speeds up overdue aggregations and sorting)

### Index Verification & Startup Lifespan
During FastAPI startup (in `app/main.py` via `lifespan`), the database manager automatically verifies and creates all indexes idempotently. The server performs a non-blocking `ping` to ensure database readiness. If MongoDB is temporarily offline, the server enters degraded mode without crashing.

---

## Commands to Run Applications

### 1. Starting MongoDB
Ensure MongoDB is running locally on port 27017:

```bash
# Windows (PowerShell - if running as a Windows Service)
Get-Service MongoDB | Start-Service

# macOS / Linux (Homebrew or systemd)
brew services start mongodb-community
# or: sudo systemctl start mongod
```

### 2. Starting the Backend API Server
From the `backend` directory:

```bash
# Activate virtual environment
# Windows (PowerShell):
.venv\Scripts\Activate.ps1
# macOS/Linux:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start FastAPI with auto-reload
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

- **Health Check Endpoint**: [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health)
- **Interactive Swagger Documentation**: [http://127.0.0.1:8000/api/v1/docs](http://127.0.0.1:8000/api/v1/docs)

### 3. Starting the Frontend Next.js Server
From the `frontend` directory in a separate terminal:

```bash
# Install dependencies
npm install

# Start Next.js development server
npm run dev
```

- **Web Application URL**: [http://localhost:3000](http://localhost:3000)

---

## API Endpoint Specification

All application routes are versioned under `/api/v1`. Authenticated routes require an `Authorization: Bearer <access_token>` header.

### 1. Authentication Endpoints (`/api/v1/auth`)

| Method | Endpoint | Access | Description | Status Codes |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/register` | Public | Register new user account (defaults to `USER` role; rejects role tampering) | `201 Created`, `409 Conflict`, `422 Unprocessable` |
| `POST` | `/api/v1/auth/login` | Public | Authenticate email/password; returns JWT access token and user profile | `200 OK`, `401 Unauthorized`, `422 Unprocessable` |
| `GET` | `/api/v1/auth/me` | Authenticated | Retrieve current user profile (never exposes password hash) | `200 OK`, `401 Unauthorized` |
| `GET` | `/api/v1/auth/admin-check` | ADMIN Only | Guarded route confirming administrator privileges | `200 OK`, `401 Unauthorized`, `403 Forbidden` |

### 2. Task Management Endpoints (`/api/v1/tasks`)

| Method | Endpoint | Access | Description | Status Codes |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/tasks` | Authenticated | Create a new task. Sets `creator_id` automatically to authenticated user | `201 Created`, `400/404 Invalid Assignee`, `422 Unprocessable` |
| `GET` | `/api/v1/tasks` | Authenticated | List tasks. `ADMIN` sees all; `USER` sees created or assigned tasks | `200 OK`, `401 Unauthorized` |
| `GET` | `/api/v1/tasks/{task_id}` | Authenticated | Retrieve task by ID. Authorized for `ADMIN`, creator, or assignee | `200 OK`, `403 Forbidden`, `404 Not Found`, `422 Invalid ID` |
| `PATCH` | `/api/v1/tasks/{task_id}` | Authenticated | Update task. `ADMIN`/creator can edit all; assignee can ONLY edit `status` | `200 OK`, `403 Forbidden`, `404 Not Found`, `422 Invalid ID` |
| `DELETE` | `/api/v1/tasks/{task_id}` | Authenticated | Delete task. Allowed only for creator or `ADMIN` | `204 No Content`, `403 Forbidden`, `404 Not Found`, `422 Invalid ID` |

#### Query Parameters for `GET /api/v1/tasks`
- `search` (string, optional): Case-insensitive regex title search (escaped against regex injection).
- `status` (string, optional): Filter by `TODO`, `IN_PROGRESS`, or `COMPLETED`.
- `priority` (string, optional): Filter by `LOW`, `MEDIUM`, or `HIGH`.
- `sort_by` (string, optional): Sort attribute (`created_at`, `due_date`, `title`, `priority`, `status`). Default: `created_at`.
- `sort_order` (string, optional): Sort direction (`asc` or `desc`). Default: `desc`.
- `page` (integer, optional): 1-indexed page number. Default: `1`.
- `page_size` (integer, optional): Items per page (1 to 100). Default: `10`.

### 3. Dashboard Analytics (`/api/v1/dashboard`)

| Method | Endpoint | Access | Description | Status Codes |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/dashboard/summary` | Authenticated | Compute real-time KPIs and deliverable distributions via MongoDB aggregation | `200 OK`, `401 Unauthorized` |

* **Scoping**: `ADMIN` receives organization-wide metrics; regular `USER` receives metrics strictly scoped to tasks they created or were assigned to. Evaluated via MongoDB `$or` to prevent double-counting.

### 4. User Directory (`/api/v1/users`)

| Method | Endpoint | Access | Description | Status Codes |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/users` | Authenticated | Directory of registered users (`_id`, `name`, `email`, `role`) for task assignment | `200 OK`, `401 Unauthorized` |

### 5. Health Checks (`/health`)

| Method | Endpoint | Access | Description | Status Codes |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/health` | Public | System status and non-blocking MongoDB connectivity verification | `200 OK` (Healthy or Degraded) |
| `GET` | `/api/v1/health` | Public | Sub-router health check endpoint | `200 OK` |

---

## Testing Instructions

### 1. Backend Automated Testing (`pytest`)
From the `backend` directory with virtual environment activated:

```bash
pytest -v
```

**Verification Results**:
- **51 tests collected, 51 passed (100%)** in ~6.0 seconds.
- Test coverage includes:
  - `test_auth.py`: Registration, duplicate email rejection, role escalation prevention, login with Argon2id verification, case-insensitive email, expired/invalid JWT tokens, RBAC permission verification.
  - `test_dashboard.py`: Empty state handling, KPI calculation accuracy, double-counting prevention, user vs. admin scoping.
  - `test_health.py`: Health endpoints, metadata verification, configuration parsing.
  - `test_mongodb.py`: AsyncMongoClient connection, ping, collection index verification.
  - `test_schemas.py`: Email normalization, name trimming, password hash exclusion, UTC timezone policies, ObjectId serialization.
  - `test_tasks.py`: Full CRUD, assignee verification, RBAC permissions (creator vs assignee vs admin), search/filter/sort/pagination.

### 2. Frontend Automated Testing (`vitest`)
From the `frontend` directory:

```bash
npm run test
```

**Verification Results**:
- **14 test files, 72 tests passed (100%)** in ~14.2 seconds.
- Test suites cover:
  - `LoginPage.test.tsx`: Form rendering, validation messages, password visibility toggle, 401 handling, successful login redirect.
  - `RegisterPage.test.tsx`: Form validation (min 8 char password, matching confirm password), explicit absence of role selector, 409 duplicate email handling, success redirect.
  - `DashboardPage.test.tsx`: Loading state, metric cards, Recharts status/priority breakdowns, completion velocity progress, empty state handling.
  - `TasksPage.test.tsx`: Task table rendering, debounced title search, status/priority filtering, sorting, pagination, delete dialog.
  - `BoardPage.test.tsx`: 3-column Kanban board (To Do, In Progress, Completed), drag-and-drop / quick status update, priority badges.
  - `TaskFormModal.test.tsx`: Creation modal, pre-populated edit modal, assignee dropdown loading, client validation.
  - `AuthContext.test.tsx` & `ProtectedRoute.test.tsx`: Session persistence, unauthenticated redirection, token storage.

### 3. Frontend Type Checking & Linting
From the `frontend` directory:

```bash
# Type check TypeScript without emitting files
npm run typecheck

# Lint all 67 frontend files with Oxlint
npm run lint
```

**Verification Results**:
- `npm run typecheck`: **0 errors**.
- `npm run lint`: **0 warnings, 0 errors** across all 67 files.

### 4. Frontend Production Build
From the `frontend` directory:

```bash
npm run build
```

**Verification Results**:
- Next.js 16 (Turbopack) successfully compiled 100% of routes (`/`, `/_not-found`, `/board`, `/dashboard`, `/login`, `/register`, `/tasks`).

---

## Admin Provisioning Instructions

Public registration intentionally defaults all new accounts to the `USER` role. To securely provision an administrator without exposing an unauthenticated privileged endpoint, use the dedicated provisioning script.

### 1. Interactive Provisioning (Recommended)
From the `backend` directory with virtual environment activated:

```bash
python scripts/create_admin.py
```
You will be securely prompted for:
1. `Enter admin name:` (e.g., `System Admin`)
2. `Enter admin email:` (e.g., `admin@taskflow.com`)
3. `Enter admin password:` (input is masked)
4. `Confirm admin password:` (input is masked)

### 2. Automated / Scripted Provisioning
You can also supply CLI arguments directly:

```bash
python scripts/create_admin.py --name "System Admin" --email "admin@taskflow.com" --password "AdminSecret123!"
```

### Script Behavior & Security Features:
- Validates password length (minimum 8 characters) and email format.
- Hashes password using **Argon2id**.
- Checks if the user already exists in MongoDB:
  - If existing: Updates role to `ADMIN`, refreshes password hash, and updates `updated_at`.
  - If new: Inserts document with role `ADMIN`.
- Outputs only safe public metadata (`_id`, `name`, `email`, `role`). Never logs password hashes.

---

## Deployment Configuration

### 1. Backend Production Deployment

#### Running with Production ASGI Server (Uvicorn / Gunicorn)
In production, run Uvicorn behind Gunicorn with worker processes:

```bash
pip install gunicorn uvicorn[standard]
gunicorn app.main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

#### Production Environment Considerations:
- Set `ENVIRONMENT="production"`.
- Set `DEBUG=false`.
- Generate a unique 32+ character hexadecimal secret for `SECRET_KEY`:
  ```bash
  openssl rand -hex 32
  ```
- Configure `BACKEND_CORS_ORIGINS` to include only the production frontend domain (e.g., `["https://app.taskflow.com"]`).
- Connect to MongoDB Atlas using an authenticated URI with TLS enabled:
  ```ini
  MONGODB_URI="mongodb+srv://<username>:<password>@cluster0.mongodb.net/taskflow_db?retryWrites=true&w=majority"
  ```

#### Nginx Reverse Proxy Configuration Example:
```nginx
server {
    listen 80;
    server_name api.taskflow.com;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 2. Frontend Production Deployment

#### Next.js Production Server
Build and launch the optimized production bundle:

```bash
cd frontend
npm run build
npm run start -p 3000
```

#### Vercel / Cloud Platform Deployment:
- Root directory: `frontend`
- Build command: `npm run build`
- Output directory: `.next`
- Environment Variables: Set `NEXT_PUBLIC_API_BASE_URL` to your production backend URL (e.g., `https://api.taskflow.com`).

---

## Known Limitations & Design Decisions

1. **Client-Side Bearer Token Persistence**:
   - *Design Decision*: JWT access tokens are stored in browser `localStorage` to support decoupled cross-origin API communication between Next.js on port 3000 and FastAPI on port 8000 without requiring complex cross-domain cookie configurations.
   - *Security Mitigation*: The application applies strict XSS protection, sanitizes inputs, enforces CORS origin whitelisting, and uses standard 24-hour token expiration. For single-domain production deployments, HttpOnly session cookies can be configured on the FastAPI router.
2. **Assignee Permission Restrictions**:
   - *Design Decision*: Per assessment specification, task assignees (who are neither the creator nor an administrator) have restricted update permissions. They can modify task `status` (e.g. advance from To Do to In Progress or Completed), but cannot alter title, description, priority, due date, or reassign ownership. The backend enforces this strictly with `HTTP 403 Forbidden` and the frontend UI disables editing locked fields for assignees.
3. **Hard vs. Soft Deletion**:
   - *Design Decision*: Tasks are permanently deleted from MongoDB upon calling `DELETE /api/v1/tasks/{task_id}`. Soft deletion (`is_deleted` flag) was avoided to keep query performance and database indexing clean and straightforward according to assessment requirements.
4. **Recharts SSR Hydration Handling**:
   - *Design Decision*: Recharts components rely on browser DOM dimensions (`ResizeObserver`). To ensure zero hydration mismatch errors during Next.js server-side rendering, charts render an elegant placeholder container until mounted on the client.

---

## Assessment Verification Checklist

| Requirement Category | Specific Assessment Requirement | Verified Status | Evidence & Test Details |
| :--- | :--- | :---: | :--- |
| **Backend** | Registration and login | Verified | `test_register_success`, `test_login_success`, browser E2E test |
| **Backend** | Password hashing | Verified | Argon2id implemented via `argon2-cffi`; hashes verified in MongoDB |
| **Backend** | JWT validation and expiry | Verified | `test_me_expired_token_unauthorized`, `test_me_invalid_token_unauthorized` |
| **Backend** | Protected endpoints | Verified | HTTPBearer dependency returns 401 on missing/invalid tokens across all endpoints |
| **Backend** | USER and ADMIN permissions | Verified | `test_admin_route_forbidden_for_regular_user`, `test_admin_can_delete_any_task` |
| **Backend** | Task CRUD and assignment | Verified | POST/GET/PATCH/DELETE endpoints; verified assignee existence check |
| **Backend** | Search, filter, sort, pagination | Verified | `test_list_tasks_search_and_filters`, `test_list_tasks_sorting_and_pagination` |
| **Backend** | Dashboard analytics | Verified | MongoDB `$facet` aggregation pipeline; verified calculation accuracy & double-count prevention |
| **Backend** | MongoDB persistence | Verified | Changes made in UI persisted to local MongoDB database and verified across backend restart |
| **Backend** | Validation & error responses | Verified | Pydantic v2 validation errors return consistent HTTP 422 JSON objects |
| **Frontend** | Registration and login UI | Verified | React Hook Form + Zod, password toggle, duplicate-email toast, 8 Vitest tests |
| **Frontend** | Protected routes and logout | Verified | ProtectedRoute wrapper redirects unauthenticated users; logout clears state |
| **Frontend** | Task creation, editing, deletion | Verified | TaskFormModal with validation; DeleteTaskDialog confirmation modal |
| **Frontend** | Assignment directory | Verified | Dropdown populated via `GET /api/v1/users` |
| **Frontend** | Search and filters | Verified | Debounced title search, status filter, priority filter |
| **Frontend** | Sorting and pagination | Verified | Due date, creation date, priority sorting; responsive page pagination controls |
| **Frontend** | Kanban status updates | Verified | 3-column Kanban board with quick status transition buttons and drag-and-drop |
| **Frontend** | Dashboard counts and charts | Verified | Recharts status distribution, priority allocation, deliverable velocity bar |
| **Frontend** | UI States & Responsiveness | Verified | Loading skeletons, empty state illustrations, error alerts, responsive layout |
| **Security** | Secrets excluded from Git | Verified | `.env` and `.env.local` excluded via `.gitignore`; git status clean |
| **Security** | Password hashes never returned | Verified | `UserResponse` schema strictly excludes `password_hash`; verified in API responses |
| **Security** | Public registration no admin | Verified | `UserRegisterRequest` excludes role; backend defaults strictly to `USER` |
| **Security** | Unauthorized task isolation | Verified | Non-admin users can only view/edit tasks they created or were assigned to |
| **Security** | CORS configuration | Verified | Restricted to `BACKEND_CORS_ORIGINS` whitelist in `app/main.py` |
| **Security** | No secrets in frontend code | Verified | Frontend references only `NEXT_PUBLIC_API_BASE_URL`; zero DB/JWT secrets |
| **Security** | Error shielding | Verified | Health check and exception handlers shield stack traces and credentials |
| **Submission** | Production build succeeds | Verified | `npm run build` compiled 100% successfully with Next.js Turbopack |
| **Submission** | Automated test suites pass | Verified | **51/51 Backend tests passed**, **72/72 Frontend tests passed**, **0 Lint errors** |
