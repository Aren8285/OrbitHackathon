# RiskOps

RiskOps is a lightweight risk operations platform for modeling cyber risk, prioritizing remediation, and simulating the financial impact of control investments.

## Stack
- Backend: FastAPI + SQLAlchemy + Pydantic + SQLite (local file only)
- Frontend: Next.js + React + TypeScript
- Data: CSV import, KEV/EPSS enrichment, Monte Carlo risk simulation

## Quick start

1. Copy `.env.example` to `.env` at the repository root.
   Set an exact comma-separated `CORS_ORIGINS` list (for example,
   `http://localhost:3000`). No wildcard or automatic localhost-port allowance exists.
   Create `frontend/.env.local` with the **same** `DEMO_API_TOKEN` and
   `BACKEND_API_URL=http://127.0.0.1:8000`. These are server-only variables;
   never prefix the token with `NEXT_PUBLIC_`. The frontend file must contain
   only `BACKEND_API_URL` and `DEMO_API_TOKEN`; copy the token from the root file.
   There is no `backend/.env`. Backend settings read the root file by its absolute
   path relative to `config.py`, irrespective of the launch directory. Environment
   variables supplied by the process can still override that file for deployment
   or isolated tests.
2. Start the API:
   ```bash
   cd backend
   python -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   uvicorn app.main:app --reload --workers 1   # rate limits are process-local
   ```
3. Start the dashboard:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
4. Open the dashboard and click **Load FinPay demo**. No manual seed command is
   needed for a fresh database. This replaces FinPay demo data and calculates all
   risk results and remediation tasks in one request.
5. Optional: start both services with Docker Compose:
   ```bash
   docker compose up --build
   ```

SQLite is the only supported database. `DATABASE_URL` defaults to
`sqlite:///./backend/riskops.db`; use a writable, persistent directory for deployed data.
Relative SQLite paths resolve against the repository root, so root and backend
launches use the same database. Existing local data remains in `backend/riskops.db`.
Startup creates missing tables but does not migrate an old schema. The backend
image bundles the demo CSVs; build it from the repository root with
`docker build -f backend/Dockerfile .`. Compose mounts the CSVs read-only and
persists the SQLite file in the mounted backend directory. Compose reads the
root `.env` for both the backend and frontend credential; the frontend container
receives only its backend URL and demo token, not the Gemini key.

## Functional areas
- Asset inventory and criticality analysis
- Vulnerability scoring and enrichment
- Control coverage and residual risk estimation
- Scenarios and loss simulation
- Optimization of remediation spend
- AI-assisted prioritization summary

## Data files
The project includes demo data under `demo-data/` for sample financial services assets, vulnerabilities, and controls.

## Database reset and company isolation

The company-scoped schema is a breaking change. For this hackathon, run
`python -m app.scripts.seed --reset` from `backend/` once when upgrading.
**This drops and recreates all application tables, deleting existing data**, then
loads the demo CSVs and persists default financial assumptions. Do not use this
command against data you need to retain. Normal startup never drops tables.

`companies` is the tenant registry. Every business table has a non-null
`company_id` foreign key to it. The single demo tenant is **FinPay Solutions**
(ID 1). SQLAlchemy `CompanySession` applies company criteria to ORM queries,
including joins, counts, updates and deletes, and validates writes and asset
references. The shared credential authorizes only company 1; requesting another
`company_id` returns empty lists/zero summaries or 404 for individual records,
and writes targeting another company return 403. This is a shared-access demo,
not individual user authentication.

GET requests never persist missing impact assumptions. They return documented
transient defaults; seed and `POST /api/risk/calculate` save those defaults.
Explicit assumption updates also persist their submitted values.

## Protected API and browser access

All backend data routes are under `/api` and require the header
`X-Demo-Token: <DEMO_API_TOKEN>` on both reads and writes. Missing, incorrect,
or unconfigured credentials return 401. Only `GET /health` is public; interactive
documentation endpoints are disabled.

The browser calls same-origin Next.js `/api/*` route handlers. Those handlers
add the server-only token and forward to `BACKEND_API_URL`; neither the browser
bundle nor browser request headers contain it. The proxy rejects cross-origin
browser requests and bounds request bodies. The UI itself has shared demo
access: anyone who can reach it can use the FinPay demo.

Canonical routes include:

- `/api/assets`, `/api/vulnerabilities`, `/api/controls`
- `/api/assets/import-csv`, `/api/vulnerabilities/import`, `/api/controls/import`
- `/api/risk/summary`, `/api/risk/assets`, `/api/risk/calculate`
- `/api/optimizer/recommend`
- `/api/remediations`, `/api/remediations/{control_key}` (PUT status)
- `/api/ai/explain-risk`, `/api/ai/executive-summary`, `/api/ai/metrics`
- `/api/demo/seed` (POST, atomic full FinPay demo rebuild)

AI rate limits: `/api/ai/explain-risk` and `/api/ai/executive-summary` are each
limited per client (10 requests/minute per client IP). `/api/ai/status` and
`/api/ai/metrics` are not rate-limited because they do not call the model.
Upload routes have a separate limit (10 requests/minute, shared across all
uploads). Limits are process-local, so run a single worker in the demo (the
image and quick-start pin `--workers 1`; the Compose dev command uses
`--reload`, which also runs one application process); when scaling to multiple
workers, use a shared store such as Redis for limit state instead. Excess
requests return 429 with `Retry-After`.

## Validation

From `backend/`, run `python -m pytest -q`. Tests use isolated in-memory databases
and cover missing/wrong/correct tokens, company isolation, cross-company writes,
read-only GET behavior, upload/AI rate limits, and CORS. From `frontend/`, run
`npm run build` to validate the production bundle. If the local Turbopack
worker crashes, `npm run build -- --webpack` uses the alternative Next.js
builder. Frontend unit and proxy tests run with `node --test tests/*.test.mjs`
from `frontend/`. The browser demo flow runs with `npm run test:e2e` after
installing Playwright's Chromium browser. It starts isolated local servers and
uses a temporary SQLite database; `frontend/.env.local` must contain the shared
demo token.

## Scenario data and task schema upgrade

The scenario/task schema is another breaking SQLite change. Before using this
version with an existing database, back it up, stop the API, and run
`python -m app.scripts.seed --reset` from `backend/`. This deletes existing
application rows and loads the current demo. For an already upgraded database,
`POST /api/demo/seed` rebuilds the demo with stable row counts. The CLI
`python -m app.scripts.seed` performs non-destructive CSV upserts instead.

The seed imports the three `demo-data/*.csv` datasets and creates six
company-scoped `risk_scenarios`: payment-infrastructure ransomware, customer
PII breach, phishing account takeover, public web app compromise, cloud storage
exposure, and DDoS outage. Inspect them through `GET /api/risk/scenarios`.
Each scenario has low/likely/high assumptions for frequency, compromise
probability, downtime, recovery, regulatory and reputation costs, plus a JSON
list of applicable control keys. The single control-mapping dictionary is
`SCENARIO_CONTROLS` in `backend/app/services/demo_scenarios.py`.

All monetary database columns use integer INR (64-bit storage), and fractional
money is rejected by API validation, CSV imports, and ORM writes. Frequency is
events per year and may be fractional; compromise probability is unitless on
0–1. These two inputs are **not INR**. Demo ranges are explicitly labelled
fictional planning assumptions, not measured losses or legal penalty estimates.

`simulation_results` stores a company/scenario reference, RNG seed, run count,
integer-INR mean and P50/P90/P95/P99, histogram data, and creation time. The demo rebuild calculates and stores six simulation results using the shared
PERT engine. All financial APIs now use these stored scenario ranges through the shared
PERT engine. GET requests compute without saving; explicit scenario simulation
and risk-calculation POST requests store results.

Seeded remediation tasks have `open`, `in_progress`, `completed`, or `verified`
status; a P0–P3 priority; asset and optional vulnerability references; owner;
estimated risk reduction in INR; and a due date. P0 uses the KEV/internet-facing/
criticality override; P1/P2 thresholds are 0.65/0.40. Due dates are 0/2/7/30 days
from creation using the India calendar date. The reduction estimate is an additional single-control annual-loss reduction
from the same scenario model, before implementing the proposed full-coverage
rollout. Estimates overlap and must not be added together. Only verified tasks count toward achieved
risk reduction, preserving the existing verification workflow.

Repeating `POST /api/demo/seed` replaces all FinPay business rows, resets task
status and owners, and creates new due dates and simulation results. It validates
the bundled CSVs before deleting rows and commits the rebuild in one transaction;
a failure rolls back to the previous data. Other companies are preserved.
The non-destructive CLI seed preserves existing task progress instead. To change a task owner together with
its status, PUT `{"status":"in_progress","owner":"Security Lead"}` to
`/api/remediations/{control_key}`.


## Unified calculations and optimizer

With the API stopped, existing SQLite installations can preserve their task rows
while upgrading the task identity with `python -m app.scripts.migrate_tasks`
from `backend/`. This saves a full `.db` backup and rebuilds only the task table.
New databases and full demo resets already have the new task identity. Tasks can
now share a control when they address different assets/findings.

`POST /api/risk/calculate` scores all findings, runs all scenario distributions,
stores one result per scenario, creates missing finding tasks, and refreshes
priorities and reduction estimates. Existing status, owner and due dates are
preserved unless priority changes; changed priorities receive the configured
0/2/7/30-day deadline. `GET /api/risk/summary` includes portfolio mean,
P50/P90/P95/P99, a 40-bin histogram, the average technical-risk score across open
findings (0-1), and the count of open P0/P1 findings. An empty portfolio returns
zeros. GET routes never persist results.

Each annual draw samples independent modified-Beta PERT distributions (lambda
4) for frequency, compromise probability, and each of the four cost components:
`frequency * probability * (downtime + recovery + regulatory + reputation)`.
There is no Poisson/binomial alternative or automatic 0.6/1.8 severity spread.
Portfolio percentiles are calculated after summing aligned scenario draws.
Fixed seeds produce reproducible results; money is rounded only at output to
integer INR. Explicit playground inputs use the same engine with constant
triples for scalar inputs.

Actual controls count only when their catalog status represents implemented
coverage (`implemented`, `partial`, `completed`, or `verified`). Partial means
only the recorded deployed fraction counts. Effectiveness is
`eff_likely * coverage`; overlapping controls combine as `1-product(1-e)`.
A control affects only the scenarios whose applicable-key list includes it.
Verification does not invent coverage: a verified control at zero coverage
still receives zero credit. Record coverage through the remediation API/UI.
Only explicit status/coverage updates change the control deployment state.

`POST /api/optimizer/recommend` accepts:
`{"budget":2000000,"must_include":["mfa"],"exclude":["siem"]}`.
It starts from the same current portfolio loss as summary/simulation and greedily
recomputes marginal annual-loss reduction per rupee after each pick. A selected
control represents a **proposed implemented rollout at 100% coverage**; existing
coverage is replaced, never counted twice. Recommendations never change actual
deployment. The response explicitly labels this proposal assumption. Excluding
an already implemented control prevents recommending it, and does not turn off
its existing deployment. Unknown/conflicting keys and unaffordable required
sets return 422. Zero-cost controls are supported; ROI is null for zero total
cost. Otherwise ROI is `(annual loss reduction - total cost) / total cost`.

`GET /api/risk/scenarios` includes each scenario's current calculated loss
metrics. `POST /api/simulation/run` with `{"scenario_key":"ransomware"}`
calculates and stores a scenario result. The dashboard, optimizer, AI metrics,
asset simulations and remediation impact all use `services/scenario_engine.py`.
Priority thresholds live in `app/config.py`; the frontend colors API labels
instead of inventing a separate score threshold. Local KEV/EPSS keys override
CSV values, including local false/zero; only missing keys use CSV fallback.

## Gemini explanations

Configure these server-side values in the root `.env`:

```dotenv
LLM_PROVIDER=gemini
GEMINI_API_KEY=your-key
GEMINI_MODEL=gemini-3.8-flash
GEMINI_FALLBACK_MODELS=
LLM_TIMEOUT_SECONDS=30
```

Use model IDs available to your key; the example is not an availability
guarantee. Set `GEMINI_FALLBACK_MODELS` to a comma-separated ordered list.
The primary model is tried first, then distinct fallbacks. There is no OpenAI
configuration, model default, compatibility endpoint, or provider fallback.
Setting another provider disables Gemini and serves the template.

Gemini calls use the official REST
[generateContent API](https://ai.google.dev/api/generate-content), with the key
only in `x-goog-api-key`, never in a query string or application logs. Timeout
and 5xx errors retry the same model exactly once before advancing. A 429 or
model-not-found/not-supported error advances immediately. Other errors, blocked
or malformed replies, and exhausted chains return the template without leaking
provider error bodies. `LLM_TIMEOUT_SECONDS` defaults to 30 seconds per model
attempt (maximum 30). A cancellable 45-second deadline covers the entire
generation chain, including retries and fallbacks. At that deadline the in-flight
HTTP request is cancelled and the template is returned; another model is not started.

Startup logs `config loaded from <absolute path>`, the provider and ordered model
chain, and yes/no presence flags for the key and demo credential. Secret values
are never logged. `DEBUG=false` is the default.

Startup queries the [models endpoint](https://ai.google.dev/api/models), including
pagination, and logs which configured models support `generateContent` and which
do not. Discovery failure is logged as unknown availability and never prevents
startup. Discovery is diagnostic: generation still tries the configured chain
in order, even if discovery failed.

`GET /api/ai/status` returns only `provider`, `key_present`, `configured_chain`,
`available_models`, and `last_used_model`. It reads cached startup discovery and
does not discover models or generate text. `available_models` contains configured
models found with generation support; an empty list can also mean discovery was
not possible. `last_used_model` is null until a Gemini reply passes validation,
then records the latest accepted Gemini model. Template fallback does not erase
that history.

Both `/api/ai/explain-risk` and `/api/ai/executive-summary` return the answering
model in `model`, or `"template"`. The frontend displays that value. All AI
routes, including the un-rate-limited status and metrics routes, require the
demo token. The Next.js proxy allows the configured model chain to finish rather
than imposing its normal 35-second timeout, while retaining browser cancellation.

Both system instructions and the JSON prompt are fewer than 150 words; generated
text must also be fewer than 150 words. Every text field, including control names,
is capped at 200 characters; longer prompt text may be abbreviated further to
fit the word budget. Calculated numerical leaves are unchanged. The model's user
message is only JSON, and the system says to treat it as data, never instructions.

Reply numbers must match supplied numerical metrics. There is no small-integer
exemption and no implicit percentage conversion. Literal supplied identifiers
such as `P0` and `CVE-...` may be quoted without authorizing their digits as new
financial values. Spelled-out small numbers are checked too. Explicit annual
loss/P50/P95 claims are checked against their own metric, so a legitimate zero
elsewhere cannot authorize an incorrect zero-loss claim. Invalid replies use the
short deterministic template; raw asset names and vulnerability titles are not
interpolated into that template.

Tests mock provider GET/POST calls, and the default pytest fixture blocks real
provider HTTP. No live Gemini call is made by the test suite. Add your real key
only to the server `.env`, then restart the API to discover available models.


## Rejected Gemini reply diagnostics

Set `DEBUG=true` in the root `.env` temporarily and restart the backend to enable
Gemini debug logs. Rejection diagnostics identify `word_limit`, `unknown_number`,
or `other` (including a mismatched loss/P50/P95 claim). Reply text is recorded
only when `DEBUG=true`, with configured credentials redacted. Without that flag,
reply text is never logged, even when a debug log level is selected externally.
HTTP headers, API keys and provider error bodies are never recorded.

These diagnostics do not relax validation or add number placeholders. A valid
provider response can still fall back when its wording introduces unsupported
numbers, rounded currency values or percentage conversions. Placeholder design
and any validation changes are deferred to Stage 2.
