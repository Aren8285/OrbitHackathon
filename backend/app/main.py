from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, engine
from app.routers import ai, assets, controls, optimizer, remediation, risk, vulnerabilities

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.app_name,
    description='RiskOps API for cyber risk prioritization and remediation planning.',
    version='0.1.0',
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

app.include_router(assets.router, prefix='/assets', tags=['assets'])
app.include_router(vulnerabilities.router, prefix='/vulnerabilities', tags=['vulnerabilities'])
app.include_router(controls.router, prefix='/controls', tags=['controls'])
app.include_router(risk.router, prefix='/risk', tags=['risk'])
app.include_router(optimizer.router, prefix='/optimizer', tags=['optimizer'])
app.include_router(remediation.router, prefix='/remediation', tags=['remediation'])
app.include_router(ai.router, prefix='/ai', tags=['ai'])


@app.get('/')
def read_root():
    return {'message': f'{settings.app_name} API is running'}
