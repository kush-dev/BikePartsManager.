# BikeParts Manager — Milestone 1

React + Vite frontend, FastAPI backend, Supabase PostgreSQL database.

## Requirements
- Node.js 20.19+ (or a compatible current LTS release)
- Python 3.11+
- A Supabase project and its PostgreSQL connection string

## 1. Configure Supabase
1. Create a Supabase project.
2. In the Supabase dashboard, open **Connect** and copy a PostgreSQL connection string.
3. For a local Python backend, use the direct connection if your network supports it; otherwise use the session pooler connection.
4. Replace `[YOUR-PASSWORD]` with your database password. URL-encode reserved characters in the password.
5. Copy `backend/.env.example` to `backend/.env` and set `DATABASE_URL`.
6. Do not commit `.env` or share its connection string.

This project connects to PostgreSQL through SQLAlchemy from the backend. Do not put the database password or any privileged key in the React frontend.

## 2. Start the backend (Windows PowerShell)
```powershell
cd backend
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
Copy-Item .env.example .env
# Edit .env and set DATABASE_URL before starting
uvicorn app.main:app --reload
```
API: http://127.0.0.1:8000
API docs: http://127.0.0.1:8000/docs

Tables are created automatically at startup for this initial prototype. Before production, replace `create_all` with versioned migrations (Alembic).

## 3. Start the frontend (new PowerShell terminal)
```powershell
cd frontend
npm install
Copy-Item .env.example .env
npm run dev
```
Frontend: http://localhost:5173

## 4. Features in this milestone
- Dashboard-style retail layout
- Large product search
- Product create, list, edit and deactivate
- Category create and list
- Stock quantity and reorder threshold fields
- Low-stock indicator
- Light/dark theme switch
- Supabase PostgreSQL persistence through FastAPI

## Security and next steps
This is a local development foundation, not yet production-ready. Login and role-based authorization are intentionally not included in this milestone. Do not expose the backend publicly until authentication, authorization, rate limits, production CORS, database migrations, backups and audit logging are implemented.
