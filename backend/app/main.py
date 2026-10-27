from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select, text

from app import models, schemas
from app.config import settings
from app.database import Base, engine, get_db
from app.routers import ai, assumptions, assets, controls, imports, optimizer, remediation, risk, simulation, vulnerabilities

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.app_name,
    description='RiskOps API for cyber risk prioritization and remediation planning.',
    version='0.2.0',
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    # Dev convenience: the Next.js dev server picks a random port (3000, or an
    # ephemeral one when 3000 is taken). Allow any loopback origin while
    # app_env is development; production keeps the exact configured list.
    allow_origin_regex=(
        r'^https?://(localhost|127\.0\.0\.1)(:\d+)?$'
        if settings.app_env == 'development'
        else None
    ),
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

app.include_router(imports.router, prefix='/imports', tags=['imports'])
app.include_router(assets.router, prefix='/assets', tags=['assets'])
app.include_router(vulnerabilities.router, prefix='/vulnerabilities', tags=['vulnerabilities'])
app.include_router(controls.router, prefix='/controls', tags=['controls'])
app.include_router(risk.router, prefix='/risk', tags=['risk'])
app.include_router(assumptions.router, prefix='/assumptions', tags=['assumptions'])
app.include_router(optimizer.router, prefix='/optimizer', tags=['optimizer'])
app.include_router(simulation.router, prefix='/simulation', tags=['simulation'])
app.include_router(remediation.router, prefix='/remediation', tags=['remediation'])
app.include_router(ai.router, prefix='/ai', tags=['ai'])


@app.get('/')
def read_root():
    return {'message': f'{settings.app_name} API is running'}


@app.get('/health', response_model=schemas.HealthStatus)
def health(db=Depends(get_db)):
    """Liveness + readiness: verifies the database is reachable."""
    try:
        db.execute(text('SELECT 1'))
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
