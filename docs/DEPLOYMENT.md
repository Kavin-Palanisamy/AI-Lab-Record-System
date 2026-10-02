# SecureLab: Production Deployment & Operations Guide

**Document Version:** 1.0.0 (Production Release / Phase 9)  
**Target Environment:** Node.js 20+ LTS / PostgreSQL 15+ / Python 3.11  

---

## 1. Environment Variable Configuration

Create a `.env` file in `server/` with the following production parameters (do not commit secrets to source control):

```env
# Database Configuration
DATABASE_URL="postgresql://securelab_admin:STRONG_DB_PASSWORD@localhost:5432/securelab_db?schema=public"

# Cryptographic Secrets
JWT_SECRET="generate-a-strong-random-64-character-secret-key-here"
JWT_EXPIRES_IN="24h"

# Server Port & Mode
PORT=5000
NODE_ENV="production"
PILOT_MODE="true"

# Client Binding
CLIENT_URL="https://securelab.college.edu"

# Storage & Uploads
UPLOAD_DIR="./storage/uploads"

# AI Microservice URL
AI_SERVICE_URL="http://localhost:8000"

# Retention Policies (in days)
RETENTION_RECORD_IMAGES_DAYS=365
RETENTION_AI_ANALYSIS_DAYS=730
RETENTION_AUDIT_LOGS_DAYS=1825
RETENTION_WRITER_PROFILES_DAYS=1095
```

---

## 2. Production Build & Execution

### 2.1 Backend Build
```bash
cd server
npm install --production=false
npm run build
# Starts production server with compiled JS
node dist/server.js
```

### 2.2 Frontend Build
```bash
cd client
npm install
npm run build
# Serves dist/ via NGINX or static web server
```

### 2.3 Python AI Microservice (Optional Dedicated Edge Node)
```bash
# Optional dedicated FastAPI microservice
uvicorn ai_service.main:app --host 127.0.0.1 --port 8000 --workers 4
```

---

## 3. Database Migration & Seed
```bash
cd server
npx prisma migrate deploy
npx tsx src/prisma/seed.ts
```

---

## 4. Backup & Disaster Recovery Operations

### 4.1 Running a Manual Database Backup
```bash
npx tsx scripts/backup_restore.ts
```
Backups are archived in `storage/backups/` with a cryptographic SHA-256 integrity checksum.

### 4.2 Restoring from Backup
```bash
# In script or emergency console:
# defaultBackupRestoreService.restoreDatabase('storage/backups/backup_TIMESTAMP.json');
```

---

## 5. Health Check & Monitoring

### Standard Health Check
```bash
curl http://localhost:5000/api/health
# Response: {"status":"healthy","service":"SecureLab","version":"1.0.0","pilotMode":true}
```

### Detailed Observability Health Check
```bash
curl http://localhost:5000/api/health/detailed
```
Returns component status for database, storage, active request telemetry, error counts, and retention policy.
