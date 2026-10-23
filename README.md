# TaskFlow Management System

Production-grade full-stack architecture for the **SWAN DIGITAL SOLUTIONS Full Stack Developer Assessment**.

---

## Tech Stack Overview

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 19, Vite, TypeScript, Tailwind CSS, React Router v7 |
| **Backend** | Python 3.12, FastAPI, Pydantic v2 / Settings, Uvicorn |
| **Database** | MongoDB with the official **PyMongo Async API** (`AsyncMongoClient`) |
| **Authentication** | JWT (`PyJWT`), Argon2id password hashing (`argon2-cffi`), Role-Based Access Control (RBAC) |
| **Data Fetching** | Axios with centralized client & request/response interceptors |
| **Charts** | Recharts |
| **Testing** | `pytest` + `pytest-asyncio` + `httpx` (Backend), `Vitest` + `@testing-library/react` (Frontend) |

---

## Database Architecture & MongoDB Collections

The application uses MongoDB via the official **PyMongo Async API** (`AsyncMongoClient`). No SQL databases or ORMs are used.

### 1. `users` Collection
Stores registered user credentials, display names, and authorization roles.

```json
{
  "_id": "ObjectId('6ada382da943616770b442e3')",
  "name": "Alice Developer",
  "email": "alice@example.com",
  "password_hash": "$2b$12$...",
  "role": "USER",
  "created_at": "2026-10-22T21:00:00Z",
  "updated_at": "2026-10-22T21:00:00Z"
}
```

* **Index**: Unique index on `email` (`idx_users_email_unique`) with consistent normalization (lowercased, trimmed).

### 2. `tasks` Collection
Stores workflow task documents with references to creators and assignees.

```json
{
  "_id": "ObjectId('6ada382da943616770b442e4')",
  "title": "Set up MongoDB Connection",
  "description": "Initialize AsyncMongoClient and verify collection indexes",
  "status": "TODO",
  "priority": "MEDIUM",
  "due_date": "2026-11-01T18:00:00Z",
  "creator_id": "ObjectId('6ada382da943616770b442e3')",
  "assignee_id": null,
  "created_at": "2026-10-22T21:00:00Z",
  "updated_at": "2026-10-22T21:00:00Z"
}
```

* **Indexes**:
  * `idx_tasks_creator_id` on `creator_id: 1`
  * `idx_tasks_assignee_id` on `assignee_id: 1`
  * `idx_tasks_status` on `status: 1`
  * `idx_tasks_priority` on `priority: 1`
  * `idx_tasks_due_date` on `due_date: 1`

### 3. Validation and Serialization Policy
* **`PyObjectId`**: Custom Pydantic v2 type adapter validating BSON ObjectIds from strings or `ObjectId` instances, always serializing ObjectIds as 24-character hexadecimal strings in JSON outputs.
* **Password Protection**: `password_hash` is maintained exclusively within internal DB models (`UserInDB`) and is never included in public API schemas (`UserResponse`).
* **Title Validation**: Task titles are required, trimmed, non-empty, and limited to 255 characters.
* **UTC Timezone Policy**: All datetimes (`due_date`, `created_at`, `updated_at`) are validated and stored as timezone-aware UTC datetimes.

---

## Environment Setup

### 1. Backend Environment Configuration
Copy the backend environment example:

```bash
cd backend
cp .env.example .env
```

Key variables inside `backend/.env`:
```ini
PROJECT_NAME="TaskFlow Management API"
VERSION="1.0.0"
ENVIRONMENT="development"
DEBUG=true
API_V1_STR="/api/v1"
SECRET_KEY="development_secret_key_change_in_production_min_32_chars_long"
ALGORITHM="HS256"
ACCESS_TOKEN_EXPIRE_MINUTES=1440
MONGODB_URI="mongodb://127.0.0.1:27017"
MONGODB_DB_NAME="taskflow_db"
BACKEND_CORS_ORIGINS=["http://localhost:5173","http://127.0.0.1:5173","http://localhost:3000"]
```

### 2. Frontend Environment Configuration
Copy the frontend environment example:

```bash
cd frontend
cp .env.example .env
```

Key variables inside `frontend/.env`:
```ini
VITE_API_BASE_URL="http://127.0.0.1:8000"
VITE_APP_NAME="TaskFlow Management System"
```

---

## Backend Quick Start

### 1. Create Virtual Environment & Install Dependencies
From the `backend` directory:

```bash
# Windows (PowerShell)
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt

# macOS/Linux
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

### 2. Verify MongoDB Connection and Indexes

#### Method A: Command-Line Verification
Run the following Python snippet to verify connection and collection indexes:
```bash
python -c "import asyncio; from app.core.database import check_mongo_connection, connect_to_mongo, db_manager; async def test(): print('Check:', await check_mongo_connection()); await connect_to_mongo(); async for idx in await db_manager.db['users'].list_indexes(): print('User Index:', idx['name']); async for idx in await db_manager.db['tasks'].list_indexes(): print('Task Index:', idx['name']); await db_manager.client.close(); asyncio.run(test())"
```

#### Method B: Querying Health Endpoint
Start the server and query `GET /health`:
```bash
curl http://127.0.0.1:8000/health
```

Expected response when MongoDB is connected:
```json
{
  "status": "healthy",
  "app_name": "TaskFlow Management API",
  "version": "1.0.0",
  "environment": "development",
  "database": "connected",
  "timestamp": "2026-10-22T21:00:00Z"
}
```

> **Note**: Database passwords and credentials are never logged or exposed in responses. If MongoDB is offline, the endpoint returns `status: "degraded"` with `database: "unreachable (ServerSelectionTimeoutError)"` without crashing.

### 3. Start the Backend API Server
```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```
- Interactive Swagger UI: [http://127.0.0.1:8000/api/v1/docs](http://127.0.0.1:8000/api/v1/docs)
- Root Health Check: [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health)
- API v1 Health Check: [http://127.0.0.1:8000/api/v1/health](http://127.0.0.1:8000/api/v1/health)

### 4. Run Backend Tests
Run the complete backend test suite including MongoDB connectivity, schemas, health, registration, login, JWT validation, and RBAC:
```bash
pytest -v
```

---

## Authentication & Role-Based Access Control (RBAC)

TaskFlow implements a secure authentication layer using **FastAPI**, **Argon2id password hashing**, **JWT (HS256)**, and **MongoDB**.

### Authentication Endpoints

| Method | Endpoint | Description | Auth Required | Status Codes |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/register` | Register a new user account | None (Public) | `201 Created`, `409 Conflict`, `422 Unprocessable` |
| `POST` | `/api/v1/auth/login` | Authenticate credentials and obtain JWT token | None (Public) | `200 OK`, `401 Unauthorized`, `422 Unprocessable` |
| `GET` | `/api/v1/auth/me` | Retrieve profile of currently authenticated user | Bearer Token | `200 OK`, `401 Unauthorized` |
| `GET` | `/api/v1/auth/admin-check` | RBAC verification endpoint for admin privileges | Bearer Token (ADMIN) | `200 OK`, `401 Unauthorized`, `403 Forbidden` |

### Security Guarantees
1. **Password Hashing**: Passwords are encrypted using **Argon2id** (`argon2-cffi`), the winner of the Password Hashing Competition (PHC) and OWASP-recommended standard. Plaintext passwords are never stored or logged.
2. **Default Role Enforcement**: Public registration exclusively assigns the `USER` role. The `role` attribute is not accepted in `UserRegisterRequest`, preventing privilege escalation.
3. **No Public Admin Endpoint**: Admin accounts cannot be created via public HTTP registration.
4. **Environment-Driven JWT Secrets**: Signing key (`SECRET_KEY`), algorithm (`ALGORITHM`), and token lifetime (`ACCESS_TOKEN_EXPIRE_MINUTES`) are loaded from backend `.env`. Insecure default secrets (< 32 characters or common placeholder strings) are rejected at startup.
5. **Verified Token Identity**: The `get_current_user` dependency cryptographically validates signature, expiration (`exp`), and subject (`sub`), then retrieves the user record directly from MongoDB by `ObjectId`. Client-supplied IDs or roles are never trusted.
6. **Information Shielding**: Public schemas (`UserResponse`) never include the `password_hash` field.

### Provisioning an Administrator

To safely provision an administrator without exposing a public endpoint, use the CLI provisioning utility:

```bash
# In the backend directory with virtual environment activated:
python scripts/create_admin.py --name "System Admin" --email "admin@taskflow.com" --password "StrongAdminPass123!"
```

Or run interactively with secure password masking:
```bash
python scripts/create_admin.py
# Prompts:
# Enter admin name: ...
# Enter admin email: ...
# Enter admin password: [masked]
# Confirm admin password: [masked]
```

If an account with the specified email already exists, the script promotes it to `ADMIN` and updates its password hash.

---

## Testing in Swagger UI (Interactive API Docs)

Follow these steps to test registration, login, JWT authentication, and RBAC directly in the browser:

### Step 1: Open Swagger UI
Start the backend server:
```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```
Open **[http://127.0.0.1:8000/api/v1/docs](http://127.0.0.1:8000/api/v1/docs)** in your browser.

### Step 2: Register a New User
1. Locate `POST /api/v1/auth/register` under the **Authentication** section.
2. Click **Try it out**.
3. Supply a JSON body:
   ```json
   {
     "name": "Alex Johnson",
     "email": "alex@example.com",
     "password": "Password123!"
   }
   ```
4. Click **Execute**.
5. Verify response code **201 Created** and inspect the returned profile (`role: "USER"`, no `password_hash`).
6. Click **Execute** again with the same payload to verify that duplicate registration is rejected with **409 Conflict**.

### Step 3: Log In and Copy Access Token
1. Locate `POST /api/v1/auth/login`.
2. Click **Try it out** and enter:
   ```json
   {
     "email": "alex@example.com",
     "password": "Password123!"
   }
   ```
3. Click **Execute**.
4. Verify response code **200 OK**.
5. Copy the `access_token` string from the response JSON (without quotation marks).
6. Test with an incorrect password to verify **401 Unauthorized** with `{"detail": "Incorrect email or password."}`.

### Step 4: Authorize Swagger UI
1. Scroll to the top of the page and click the green **Authorize 🔓** button.
2. In the **HTTPBearer (http, Bearer)** dialog, paste your copied access token into the **Value** field.
3. Click **Authorize**, then click **Close**. The lock icon now appears locked 🔒.

### Step 5: Test Authenticated Route (`GET /api/v1/auth/me`)
1. Locate `GET /api/v1/auth/me`.
2. Click **Try it out** -> **Execute**.
3. Verify response code **200 OK** returning Alex's public profile.

### Step 6: Test Role Restrictions (`GET /api/v1/auth/admin-check`)
1. Locate `GET /api/v1/auth/admin-check`.
2. Click **Try it out** -> **Execute**.
3. Because Alex has role `USER`, verify response code **403 Forbidden** with:
   ```json
   {
     "detail": "Administrator permissions required to perform this action."
   }
   ```

### Step 7: Test Admin Privileges
1. In your terminal, provision an admin account:
   ```bash
   python scripts/create_admin.py --name "Lead Admin" --email "admin@example.com" --password "AdminPass123!"
   ```
2. In Swagger UI, execute `POST /api/v1/auth/login` with `admin@example.com` and `AdminPass123!`.
3. Copy the new admin `access_token`.
4. Click **Authorize 🔒**, click **Logout**, paste the admin token, and click **Authorize**.
5. Execute `GET /api/v1/auth/admin-check` again.
6. Verify response code **200 OK** with confirmation:
   ```json
   {
     "status": "authorized",
     "message": "Administrator privilege confirmed for Lead Admin.",
     "role": "ADMIN"
   }
   ```

### Step 8: Test Dashboard Analytics
1. Locate `GET /api/v1/dashboard/summary` under the **Dashboard** section.
2. Click **Try it out** -> **Execute**.
3. Inspect the response payload:
   - `total_tasks`: Total tasks in scope
   - `pending_tasks`: Tasks with `TODO` and `IN_PROGRESS`
   - `completed_tasks`: Tasks with `COMPLETED`
   - `overdue_tasks`: Incomplete tasks with past UTC due dates
   - `status_breakdown`: Key-value pairs for `TODO`, `IN_PROGRESS`, `COMPLETED`
   - `priority_breakdown`: Key-value pairs for `LOW`, `MEDIUM`, `HIGH`
   - `completion_rate`: Calculated percentage (`completed_tasks / total_tasks * 100`)
4. Switch authorization between a regular `USER` token and an `ADMIN` token to observe user-scoped versus global organization-wide analytics.

---

## Task Management REST API & Permissions

TaskFlow provides a complete RESTful task management API with role-based scoping, ownership protection, and MongoDB query optimization.

### Task API Contract

| Method | Endpoint | Description | Auth Required | Permissions & Behavior |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/tasks` | Create a new task | Bearer Token | `creator_id` is automatically set to authenticated user; validates assignee exists if specified |
| `GET` | `/api/v1/tasks` | List authorized tasks | Bearer Token | `ADMIN` views all tasks; `USER` views created or assigned tasks; supports search, filter, sort, pagination |
| `GET` | `/api/v1/tasks/{task_id}` | Retrieve single task | Bearer Token | `ADMIN`, creator, or assignee; `403` for unauthorized users; `404` if not found |
| `PATCH` | `/api/v1/tasks/{task_id}` | Update permitted fields | Bearer Token | `ADMIN`/creator can update all fields; assignee can ONLY update `status` (`403` otherwise); `creator_id` is protected |
| `DELETE` | `/api/v1/tasks/{task_id}` | Delete a task | Bearer Token | Permitted for creator and `ADMIN`; returns `204 No Content`; `403` for assignees/others |
| `GET` | `/api/v1/users` | User assignment directory | Bearer Token | Returns public profiles (`_id`, `name`, `email`, `role`) for assignment dropdowns |

### Permissions & RBAC Matrix

| Role / Actor | View Task | Edit All Fields | Edit Status | Reassign | Delete Task |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **ADMIN** | Any Task | Yes | Yes | Yes | Yes |
| **Task Creator (USER)** | Created Tasks | Yes | Yes | Yes | Yes |
| **Task Assignee (USER)** | Assigned Tasks | No (403) | Yes | No (403) | No (403) |
| **Other Users (USER)** | No (403 / Hidden) | No (403) | No (403) | No (403) | No (403) |

### Query Parameters for `GET /api/v1/tasks`

| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `search` | `string` | `null` | Case-insensitive title search (escaped against regex injection) |
| `status` | `string` | `null` | Filter by `TODO`, `IN_PROGRESS`, or `COMPLETED` |
| `priority` | `string` | `null` | Filter by `LOW`, `MEDIUM`, or `HIGH` |
| `sort_by` | `string` | `created_at` | Field to sort by: `due_date`, `created_at`, `title`, `priority`, `status` |
| `sort_order` | `string` | `desc` | Direction: `asc` or `desc` |
| `page` | `integer` | `1` | 1-indexed page number |
| `page_size` | `integer` | `10` | Items per page (min 1, max 100) |

### Pagination Response Schema (`TaskPaginationResponse`)
```json
{
  "items": [
    {
      "_id": "6ada43477de1ea6df1b34fa1",
      "title": "Optimize MongoDB Indexes",
      "description": "Ensure stable sorting and compound indexes",
      "status": "IN_PROGRESS",
      "priority": "HIGH",
      "due_date": "2026-11-05T12:00:00Z",
      "creator_id": "6ada43477de1ea6df1b34f9a",
      "assignee_id": "6ada43477de1ea6df1b34f9b",
      "created_at": "2026-10-22T17:10:00Z",
      "updated_at": "2026-10-22T17:15:00Z"
    }
  ],
  "total": 24,
  "page": 1,
  "page_size": 10,
  "total_pages": 3
}
```

---

## Dashboard Analytics & Telemetry

TaskFlow provides aggregated performance analytics computed in MongoDB via the PyMongo Async `$facet` pipeline.

### Dashboard Endpoint

| Method | Endpoint | Description | Auth Required | Scoping & Behavior |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/dashboard/summary` | Analytics summary metrics | Bearer Token | `ADMIN` views global org metrics; `USER` views tasks they created or are assigned to |

### Metric Definitions
- **`total_tasks`**: Total unique tasks within the user's authorization scope.
- **`pending_tasks`**: Tasks with lifecycle status `TODO` or `IN_PROGRESS`.
- **`completed_tasks`**: Tasks with lifecycle status `COMPLETED`.
- **`overdue_tasks`**: Non-completed tasks whose `due_date` is earlier than the current UTC timestamp (`due_date < now_utc`). Tasks without a due date are never overdue.
- **`status_breakdown`**: Dictionary of task counts partitioned by status (`TODO`, `IN_PROGRESS`, `COMPLETED`).
- **`priority_breakdown`**: Dictionary of task counts partitioned by priority (`LOW`, `MEDIUM`, `HIGH`).
- **`completion_rate`**: `(completed_tasks / total_tasks) * 100`, rounded to 2 decimal places. Returns `0.0` when total tasks is zero.

### Scoping & Double-Counting Prevention
- **`ADMIN`**: Computes organization-wide statistics across all tasks in MongoDB.
- **`USER`**: Computes metrics exclusively for tasks where `creator_id == current_user.id` OR `assignee_id == current_user.id`.
- If a user is both the creator and the assignee of a task, MongoDB's document-level `$or` evaluates the document exactly once, guaranteeing zero double-counting.
- Returns zero counts and initialized dictionary mappings for empty collections.

### Dashboard Summary Response Schema (`DashboardSummaryResponse`)
```json
{
  "total_tasks": 12,
  "pending_tasks": 8,
  "completed_tasks": 4,
  "overdue_tasks": 2,
  "status_breakdown": {
    "TODO": 5,
    "IN_PROGRESS": 3,
    "COMPLETED": 4
  },
  "priority_breakdown": {
    "LOW": 3,
    "MEDIUM": 6,
    "HIGH": 3
  },
  "completion_rate": 33.33
}
```

---

## Frontend Quick Start

### 1. Install Dependencies
```bash
cd frontend
npm install
```

### 2. Start the Vite Development Server
```bash
npm run dev
```
Access the application dashboard at: [http://localhost:5173](http://localhost:5173)

### 3. Run Frontend Tests
```bash
npm run test
```

### 4. Build Production Bundle
```bash
npm run build
```
