# Intervention-Planner
Capstone project Fall 2026

Frontend: Vue<br />
Backend:  Python - FastAPI<br />
Database: Relational (SQL) <br />

## ENVIRONMENT SETUP (do in powershell terminal)

### Backend Setup

```bash
cd backend
python -m venv venv
venv\Scripts\Activate.ps1   # Windows
# source venv/bin/activate  # Mac/Linux
pip install -r requirements.txt
pip install fastapi uvicorn supabase
uvicorn main:app --reload
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```
