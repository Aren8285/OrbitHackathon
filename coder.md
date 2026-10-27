# coder.md

Read this and security.md before every task.

## Project
RiskOps: hackathon MVP that turns assets, vulnerabilities and controls (CSV) into cyber risk in INR,
ranks fixes, and recommends controls under a budget. The LLM only explains calculated numbers.
Demo story: FinPay's payment database is exposed to ransomware.

## Stack
- Backend: Python 3.11, FastAPI, SQLAlchemy, SQLite, NumPy, pytest
- Frontend: Next.js, TypeScript, Tailwind, Recharts
- LLM: Gemini or Groq, server-side only

## Rules
1. One task at a time. Run it and confirm it works before moving on.
2. Build only what is listed under "Build". No auth system, Celery, Redis, RAG or PDF engine.
3. The LLM never creates numbers. It only explains JSON that the code calculated.
4. Keep logic in `services/`; keep routers thin.
5. Money is integer INR (1 lakh = 100,000; 1 crore = 10,000,000). Scores are 0-1 internally.
6. Show loss as a range (P50 / P95), not one number.
7. Add a unit test for every formula.
8. Ask if something is unclear. Don't guess. Don't add packages without saying why.

## Build (in order)
1. FastAPI + SQLite + /health
2. CSV import for assets, vulnerabilities, controls + FinPay seed
3. KEV and EPSS lookup from local files
4. Scoring
5. Monte Carlo (10,000 runs, PERT sampling, fixed seed)
6. Greedy budget optimizer
7. Dashboard, asset table, loss chart, budget slider
8. AI explain panel
9. Remediation list with status

## Formulas (inputs scaled to 0-1)
- Criticality = 0.35 revenue + 0.25 data sensitivity + 0.20 operational + 0.20 compliance
- Exposure = 0.35 internet + 0.25 KEV + 0.20 EPSS + 0.20 patch age (age/90, max 1)
- Technical risk = 0.40 CVSS + 0.30 exposure + 0.30 criticality
- Priority = 0.30 KEV + 0.20 EPSS + 0.20 internet + 0.15 criticality + 0.15 financial impact
- Annual loss = frequency x compromise probability x (downtime + recovery + regulatory + reputation)
- Combined controls = 1 - (1-e1)(1-e2)...; residual = inherent x (1 - combined)

## Must-pass tests
- Controls 0.30, 0.20, 0.25 give 0.58 combined
- 2 crore inherent gives 84 lakh residual
- Payment DB criticality = 0.96
- Optimizer never exceeds budget

## Done means
Runs without errors, tests pass, works with demo-data, no secrets or debug prints.
Reply with: files changed, how to run it, anything assumed.