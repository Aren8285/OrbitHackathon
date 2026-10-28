from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app import schemas
from sqlalchemy import select
from app import models
from app.database import get_db
from app.services import risk_service

router = APIRouter()


@router.get('/summary', response_model=schemas.RiskSummary)
def get_risk_summary(db: Session = Depends(get_db)):
    return risk_service.summary(db)


@router.get('/rankings', response_model=list[schemas.FindingRanking])
def get_finding_rankings(
    open_only: bool = Query(True, description='Only open findings when true'),
    db: Session = Depends(get_db),
):
    return risk_service.finding_rankings(db, open_only=open_only)


@router.get('/assets', response_model=list[schemas.AssetRiskRanking])
def get_asset_rankings(db: Session = Depends(get_db)):
    return risk_service.asset_rankings(db)


@router.post('/calculate', response_model=schemas.RiskSummary)
def calculate_risk(db: Session = Depends(get_db)):
    return risk_service.calculate(db)


@router.get('/scenarios', response_model=list[schemas.RiskScenarioOut])
def list_risk_scenarios(db: Session = Depends(get_db)):
    from app.services import scenario_engine
    computed = {row['scenario_id']: row for row in scenario_engine.portfolio(db)['scenarios']}
    return [dict(schemas.RiskScenarioOut.model_validate(row).model_dump(), simulation=computed[row.id])
            for row in db.scalars(select(models.RiskScenario).order_by(models.RiskScenario.scenario_key)).all()]
