from contextlib import asynccontextmanager
from starlette.concurrency import run_in_threadpool
from app.services import llm

from fastapi import APIRouter, Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select

from app import models, schemas
from app.config import settings
from app.security import require_demo_token
from app.database import Base, engine, get_db
from app.routers import ai, assumptions, assets, controls, imports, optimizer, remediation, risk, simulation, vulnerabilities

Base.metadata.create_all(bind=engine)
# Bootstrap only the tenant identity at application startup, never on GET paths.
from app.database import SessionLocal
with SessionLocal() as bootstrap_db:
    if bootstrap_db.get(models.Company, models.FINPAY_COMPANY_ID) is None:
        bootstrap_db.add(models.Company(id=models.FINPAY_COMPANY_ID, name='FinPay Solutions'))
        bootstrap_db.commit()

@asynccontextmanager
async def lifespan(app):
    llm.log_startup_config()
    await run_in_threadpool(llm.discover_models)
    yield


app = FastAPI(
    lifespan=lifespan,
    title=settings.app_name,
    description='RiskOps API for cyber risk prioritization and remediation planning.',
    version='0.2.0',
    # Keep API documentation endpoints disabled; only /health is public.
    docs_url=None, redoc_url=None, openapi_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

api = APIRouter(prefix='/api', dependencies=[Depends(require_demo_token)])
api.include_router(imports.router, tags=['imports'])
api.include_router(assets.router, prefix='/assets', tags=['assets'])
api.include_router(vulnerabilities.router, prefix='/vulnerabilities', tags=['vulnerabilities'])
api.include_router(controls.router, prefix='/controls', tags=['controls'])
api.include_router(risk.router, prefix='/risk', tags=['risk'])
api.include_router(assumptions.router, prefix='/assumptions', tags=['assumptions'])
api.include_router(optimizer.router, prefix='/optimizer', tags=['optimizer'])
api.include_router(simulation.router, prefix='/simulation', tags=['simulation'])
api.include_router(remediation.router, prefix='/remediations', tags=['remediation'])
api.include_router(ai.router, prefix='/ai', tags=['ai'])


@api.get('/')
def read_root():
    return {'message': f'{settings.app_name} API is running'}


@api.post('/demo/seed')
def seed_demo(db=Depends(get_db)):
    from app.services.demo_rebuild import rebuild_demo
    try:
        return rebuild_demo(db)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=503, detail='Demo rebuild failed; previous data has been retained') from None



app.include_router(api)


@app.get('/health', response_model=schemas.HealthStatus)
def health(db=Depends(get_db)):
    """Liveness + readiness: verifies the database is reachable."""
    try:
        # ORM expression instead of literal SQL text (security.md: no string-built SQL).
        db.execute(select(1))
        counts = {
            'assets': db.scalar(select(func.count()).select_from(models.Asset)) or 0,
            'vulnerabilities': db.scalar(select(func.count()).select_from(models.Vulnerability)) or 0,
            'controls': db.scalar(select(func.count()).select_from(models.Control)) or 0,
        }
    except Exception:
        raise HTTPException(status_code=503, detail='Database unavailable') from None

    return schemas.HealthStatus(
        status='ok',
        database='connected',
        assets=counts['assets'],
        vulnerabilities=counts['vulnerabilities'],
        controls=counts['controls'],
        version='0.2.0',
    )
