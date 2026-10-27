from fastapi import APIRouter, Depends, HTTPException
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.services import risk_service

router = APIRouter()


@router.get('/impact', response_model=list[schemas.ImpactAssumptionOut])
def list_impact_assumptions(db: Session = Depends(get_db)):
    assumptions = risk_service.get_all_assumptions(db)
    return [risk_service.assumption_out(db, assumption) for assumption in assumptions]


@router.get('/impact/{asset_id}', response_model=schemas.ImpactAssumptionOut)
def get_impact_assumption(asset_id: str, db: Session = Depends(get_db)):
    asset = db.scalar(select(models.Asset).where(models.Asset.asset_id == asset_id))
    if asset is None:
        raise HTTPException(status_code=404, detail=f'Asset {asset_id!r} not found')
    assumption = risk_service.get_assumption(db, asset)
    return risk_service.assumption_out(db, assumption)


@router.put('/impact/{asset_id}', response_model=schemas.ImpactAssumptionOut)
def update_impact_assumption(
    asset_id: str,
    payload: schemas.ImpactAssumptionUpdate,
    db: Session = Depends(get_db),
):
    asset = db.scalar(select(models.Asset).where(models.Asset.asset_id == asset_id))
    if asset is None:
        raise HTTPException(status_code=404, detail=f'Asset {asset_id!r} not found')
    try:
        updated = risk_service.update_assumption(db, asset, payload.model_dump())
    except (ValueError, ValidationError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return updated
