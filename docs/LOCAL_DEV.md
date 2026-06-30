# Local Development Guide

## Prerequisites

Install these once if not already present.

### 1. Yarn

```bash
npm install --global yarn
```

### 2. Node.js

Already installed (v20+). Verify: `node --version`

### 3. Python 3.11+

Already installed. Verify: `python3 --version`

---

## One-Command Start

```bash
./dev.sh
```

Starts backend on `:8001` and frontend on `:3000`. Database is MongoDB Atlas — no local DB needed.

---

## Manual Start (step by step)

### Step 1 — Start Backend

```bash
cd backend
source .venv/bin/activate
uvicorn server:app --reload --port 8001 --host 0.0.0.0
```

Backend runs at: `http://localhost:8001`  
API docs at: `http://localhost:8001/docs`

> **First time only:** If `.venv` is missing or packages are incomplete:
> ```bash
> cd backend
> python3 -m venv .venv
> source .venv/bin/activate
> pip install -r requirements.txt
> ```

### Step 2 — Start Frontend

```bash
cd frontend
yarn install        # first time only
yarn start:local    # starts Expo in LAN mode
```

Expo shows a QR code. Scan with **Expo Go** on your phone (must be on same Wi-Fi).

For web browser:

```bash
cd frontend
yarn web
```

---

## Environment Files

| File | Used by | Purpose |
|---|---|---|
| `backend/.env` | Backend | Atlas URL, API keys |
| `frontend/.env` | Emergent only | Emergent-specific URLs |
| `frontend/.env.local` | Local only | Overrides `.env` for local dev |

`frontend/.env.local` sets `EXPO_PUBLIC_BACKEND_URL=http://localhost:8001` so the app talks to your local backend.

---

## Ports

| Service | Port |
|---|---|
| Backend (FastAPI) | 8001 |
| Frontend (Expo Metro) | 3000 |
| MongoDB | Atlas (cloud) |
