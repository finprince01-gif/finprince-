# AI Accounting SaaS - Production Grade ERP

A multi-tenant AI-powered accounting system built with Django (Backend) and React (Frontend). Designed for scalability, security, and high-performance financial management.

## 🚀 Architecture Overview

*   **Frontend**: React + TypeScript + Vite + Tailwind CSS.
*   **Backend**: Django 5.0 + Django REST Framework (DRF).
*   **Database**: MySQL 8.0 with ProxySQL for connection multiplexing.
*   **Security**: JWT Authentication via Secure HttpOnly Cookies, RBAC (Role-Based Access Control).
*   **Infrastructure**: Kubernetes (K8s) ready, Docker-compose for localized development.
*   **AI Engine**: Google Gemini integration for intelligent financial automation.

## 🛠 Project Structure

```text
├── .agent/             # Agent-based system configurations
├── admin-subscription-panel/ # Central admin for managing SaaS subscriptions
├── backend/            # Django REST API
│   ├── core/           # Auth, Middleware, base models
│   ├── accounting/     # Ledger, Vouchers, Financial reports
│   ├── inventory/      # Stock tracking, Warehouses
│   ├── rbac/           # Role-based permissions
│   └── ...             # Other functional modules
├── frontend/           # React Application
│   ├── src/app/        # App routing and entry points
│   ├── src/components/ # Reusable UI components
│   └── src/pages/      # Feature-specific pages 
├── k8s/                # Kubernetes deployment manifests
└── schema.sql          # Single source of truth for the database
```

## ⚙️ Production Configuration

### Backend Security
The application is pre-configured with industry-standard security headers in `settings.py`:
- `HSTS` (Strict Transport Security)
- `X-Frame-Options: DENY` (Clickjacking protection)
- `SECURE_CONTENT_TYPE_NOSNIFF`
- `HttpOnly` and `Secure` cookie flags for JWT tokens.

### Scaling
- **ProxySQL**: Configured to handle 50k+ users by managing connection pools efficiently.
- **AI Workers**: Distributed AI task processing via Redis and an autoscaling worker pool.

## 🔧 Setup & Installation

### Backend
1. `cd backend`
2. `pip install -r requirements.txt`
3. Create a `.env` file based on `.env.example`.
4. Run the server: `python manage.py runserver`

### Frontend
1. `cd frontend`
2. `npm install`
3. Create a `.env` file for API endpoints.
4. Run: `npm run dev`

## 🛡 Security & Compliance
- **Data Isolation**: Multi-tenancy is enforced at the database layer via `tenant_id` on all core models.
- **Audit Logs**: All sensitive operations are logged via `ExceptionLoggingMiddleware` and module-specific loggers.

## 📜 Database Management
This project uses a **manual schema management strategy**. 
- **Source of Truth**: `schema.sql`
- **Migrations**: Standard Django migrations are disabled. All DDL changes must be applied to `schema.sql` and the database directly.
