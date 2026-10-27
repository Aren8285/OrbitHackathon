# RiskOps

RiskOps is a lightweight risk operations platform for modeling cyber risk, prioritizing remediation, and simulating the financial impact of control investments.

## Stack
- Backend: FastAPI + SQLAlchemy + Pydantic
- Frontend: Next.js + React + TypeScript
- Data: CSV import, KEV/EPSS enrichment, Monte Carlo risk simulation

## Quick start

1. Copy `.env.example` to `.env` and configure the project settings.
2. Start the API:
   ```bash
   cd backend
   python -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   uvicorn app.main:app --reload
   ```
3. Start the dashboard:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
4. Optional: start both services with Docker Compose:
   ```bash
   docker compose up --build
   ```

## Functional areas
- Asset inventory and criticality analysis
- Vulnerability scoring and enrichment
- Control coverage and residual risk estimation
- Scenarios and loss simulation
- Optimization of remediation spend
- AI-assisted prioritization summary

## Data files
The project includes demo data under `demo-data/` for sample financial services assets, vulnerabilities, and controls.
