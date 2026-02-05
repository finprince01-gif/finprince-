
# 🛡️ Mission-Critical ERP Security Architecture

**Document Version:** 1.0.0
**Role:** Chief Security Architect
**Scope:** Multi-Tenant Accounting, Inventory, Payroll, GST, Vendors, Customers

---

## 🔐 1. Security Philosophy (Mandatory)

This system operates on **"Iron Laws"** that strictly prohibit reliance on developer discipline.

1.  **Zero Trust Architecture**: We treat *internal* traffic (Service-to-DB) with the same suspicion as *external* traffic. The database layer does NOT trust the application layer to filter tenants correctly—it enforces it.
2.  **Architecture-Enforced Security**: Security is baked into base classes, middleware, and database schemas. It is NOT implemented in individual controllers or views.
3.  **Fail-Closed**: If a permission check fails, or a tenant context is missing, the system crashes/rejects the request immediately. Grants are explicit; denials are implicit default.
4.  **Hostile User Assumption**: Every request is treated as malicious until proven otherwise by cryptographic signature (JWT) and logic validation.
5.  **Insider Threat Defense**: Audit logs are immutable and stored externally. Admins cannot silently modify data.

---

## 🏗️ 2. Secure System Architecture Diagram

```mermaid
graph TD
    subgraph "External Hostile World"
        Client[Web/Mobile Client] -->|HTTPS TLS 1.3| WAF[WAF / Load Balancer]
        WAF -->|Clean Req| Gateway[API Gateway]
    end

    subgraph "Secure Application Core"
        Gateway -->|Reverse Proxy| AppServer[Django App Server]
        
        subgraph "Request Lifecycle (The Gauntlet)"
            AppServer --> MW_Auth[1. Auth Middleware (JWT Verify)]
            MW_Auth --> MW_Tenant[2. Tenant Middleware (Context Injection)]
            MW_Tenant --> MW_RBAC[3. RBAC Middleware (Policy Check)]
            MW_RBAC --> MW_Rate[4. Rate Limit Middleware]
            MW_Rate --> View[View / Controller]
        end
        
        View -->|DTO| Service[Service Layer (Business Logic)]
        
        subgraph "Data Access Layer (The Wall)"
            Service -->|Query| Repo[TenantSafeRepository]
            Repo -->|Auto-Inject TenantID| Model[BaseTenantModel]
        end
    end

    subgraph "Data Persistence & Audit"
        Model -->|SQL (Forced Filter)| DB[(Primary DB)]
        Model -->|Async Event| AuditQ[Audit Queue (Kafka/Redis)]
        AuditQ -->|Write-Only| AuditDB[(Immutable Audit Logs)]
    end
```

---

## 📋 3. Absolute Tenant Isolation (Code-Level Enforcement)

**The Rule:** A developer *cannot* write a query that crosses tenant boundaries without using a specifically flagged "Unsafe/Admin" manager.

### A. The Ban
*   ❌ `request.body.tenant_id`: **FORBIDDEN**
*   ❌ `request.headers.X-Tenant-ID`: **FORBIDDEN** (Ignored for auth'd requests)
*   ✅ `jwt.claims.tenant_id`: **REQUIRED**

### B. Tenant Context (ContextVars)

Use Python `contextvars` to hold the isolated tenant ID globally for the thread.

```python
# core/context.py
import contextvars

_tenant_context = contextvars.ContextVar('tenant_id', default=None)

def set_tenant(tenant_id: str):
    return _tenant_context.set(tenant_id)

def get_tenant() -> str:
    val = _tenant_context.get()
    if not val:
        # FAIL CLOSED: Crash if no tenant context exists in a protected path
        raise SecurityException("CRITICAL: Missing Tenant Context in Protected Path")
    return val
```

### C. Enforced Tenant-Safe Query (The Manager)

```python
# core/models.py
from django.db import models
from .context import get_tenant

class TenantAwareManager(models.Manager):
    def get_queryset(self):
        # AUTOMATICALLY INJECT WHERE CLAUSE
        tenant_id = get_tenant() 
        return super().get_queryset().filter(tenant_id=tenant_id)

    def create(self, **kwargs):
        # AUTOMATICALLY INJECT INSERT DATA
        kwargs['tenant_id'] = get_tenant()
        return super().create(**kwargs)

class BaseTenantModel(models.Model):
    tenant_id = models.CharField(max_length=36, db_index=True, editable=False)
    
    # The default manager restricts access
    objects = TenantAwareManager()
    
    # Explicit "unsafe" manager for background tasks/admin only
    # usage requires explicit audit logging
    unsafe_system_objects = models.Manager()

    class Meta:
        abstract = True
```

---

## 🚦 4. Authorization & RBAC (Resource-Based)

**Philosophy:** Check *Capabilities*, not *Roles*.
*   ❌ `if user.role == 'manager'` (Brittle, hardcoded)
*   ✅ `if user.can('voucher.approve')` (Flexible, data-driven)

### RBAC Permission Model
Permissions are stored effectively as a Matrix in JSON.

```json
// RBAC Structure (Stored in Cache/DB)
{
  "role": "Finance_Manager",
  "permissions": [
    "voucher.view",
    "voucher.create",
    "voucher.approve",
    "report.financial.view"
  ],
  "inheritance": ["Accountant"]
}
```

### Authorization Middleware
Policy enforcement happens *use-case* execution.

```python
# core/permissions.py
from functools import wraps

def require_permission(action: str):
    def decorator(view_func):
        @wraps(view_func)
        def _wrapped(request, *args, **kwargs):
            if not has_permission(request.user, action):
                # Log this security event
                SecurityLogger.log_denial(request.user, action)
                raise PermissionDenied(f"Upgrade capabilities required for {action}")
            return view_func(request, *args, **kwargs)
        return _wrapped
    return decorator
```

---

## 💰 5. ERP-Specific Financial Safeguards

Financial data requires integrity beyond standard security.

1.  **Double-Entry Enforcement**:
    *   Service layer *sums* all Debits and Credits before save.
    *   If `Sum(Dr) != Sum(Cr)`, transaction aborts.
2.  **Immutability**:
    *   Fields `amount`, `ledger`, `date` on a `Posted` voucher are `readonly` at the Model `save()` level.
    *   Updates require a *Reversal Voucher* (new transaction), not an edit.
3.  **Idempotency**:
    *   Every financial POST request requires an `Idempotency-Key` header.
    *   Cache keys prevent replay attacks (process once, return cached response for retries).

---

## 🔐 6. Identity, Auth & Session Control

*   **Tokens**:
    *   Access Token: JWT, RS256 signed, **15 min expiry**.
    *   Refresh Token: **Rotating** family (using old token invalidates entire chain).
*   **Password Hashing**: `Argon2id` (memory-hard, resistant to GPU cracking).
*   **MFA**:
    *   Enforce TOTP (Time-based One Time Password) for `is_staff=True` or accessing delicate modules (Payroll/Banking).
*   **Lockout**:
    *   5 failed attempts -> 5 min lock.
    *   10 failed attempts -> 30 min lock + Admin Alert.

---

## 🛡️ 7. Infrastructure & Deployment Security

1.  **Database Separation**:
    *   `app_user`: SELECT, INSERT, UPDATE. **NO DELETE** (Soft Delete only).
    *   `migration_user`: ALTER, CREATE, DROP (Used only during CI/CD deployment).
    *   `backup_user`: SELECT only (Used by backup agent).
2.  **Network**:
    *   DB is in a **Private Subnet** (No Public IP).
    *   Application accesses DB via **TLS/SSL**.
3.  **Container Security**:
    *   Run as `non-root` user.
    *   Read-only root filesystem where possible.
    *   No SSH/Shell access enabled in Prod.

---

## 📜 8. Audit Logging & Compliance (The "Black Box")

**Requirement:** Every meaningful change generates an immutable log entry.

### Audit Log Schema
```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY,
    timestamp TIMESTAMP DEFAULT NOW(),
    tenant_id UUID NOT NULL,
    user_id UUID,
    ip_address INET,
    action_type VARCHAR(50), -- "LOGIN_FAIL", "VOUCHER_POST", "USER_CREATE"
    resource_id VARCHAR(100),
    before_state JSONB, -- Snapshot before change
    after_state JSONB,  -- Snapshot after change
    severity VARCHAR(20) -- "INFO", "WARN", "CRITICAL"
);
-- Write-Once permissions enforced by DB constraints or Append-Only storage
```

---

## 🚀 9. Production Security Checklist

### Pipeline & Code
- [ ] **SAST Analysis**: Run Bandit/SonarQube on every commit.
- [ ] **Dependency Scan**: Check `requirements.txt` against CVE database.
- [ ] **Secrets Check**: Git hooks block commits looking like keys/passwords.

### Runtime
- [ ] **Debug Mode**: ABSOLUTELY FALSE.
- [ ] **Allowed Hosts**: Strict list (no `*`).
- [ ] **Secure Headers**: HSTS, X-Frame-Options: DENY, CSP enabled.
- [ ] **Error Pages**: Generic 500/400 pages (No stack traces leaked).

### Monitoring
- [ ] **Alert Rule**: >5 Auth Failures per minute -> PagerDuty.
- [ ] **Alert Rule**: Permission Denied on "Payroll" -> Security Team Alert.
- [ ] **Alert Rule**: CPU Spike > 80% (Potential DDoS).

---

**Violating this architecture requires deliberately writing "unsafe" code, bypassing managers, and ignoring middleware protections.** This ensures that accidental "careless" mistakes cannot breach tenant isolation.
