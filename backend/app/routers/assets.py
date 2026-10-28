from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db

router = APIRouter()


@router.get('', response_model=list[schemas.AssetOut])
def list_assets(db: Session = Depends(get_db)):
    from app.services import risk_service
    rankings = {row['asset_id']: row for row in risk_service.asset_rankings(db)}
    return [dict(schemas.AssetOut.model_validate(row).model_dump(), **{
                key: rankings[row.asset_id][key] for key in (
                    'priority_label', 'coverage', 'coverage_reason', 'expected_annual_loss_inr',
                    'p50_inr', 'p95_inr', 'scenario_losses')
            }) for row in db.scalars(select(models.Asset).order_by(models.Asset.asset_id)).all()]


@router.get('/{asset_id}', response_model=schemas.AssetOut)
def get_asset(asset_id: str, db: Session = Depends(get_db)):
    asset = db.scalar(select(models.Asset).where(models.Asset.asset_id == asset_id))
    if asset is None:
        raise HTTPException(status_code=404, detail=f'Asset {asset_id!r} not found')
    from app.services import risk_service
    ranking = next(row for row in risk_service.asset_rankings(db) if row['asset_id'] == asset.asset_id)
    return dict(schemas.AssetOut.model_validate(asset).model_dump(), **{
        key: ranking[key] for key in (
            'priority_label', 'coverage', 'coverage_reason', 'expected_annual_loss_inr',
            'p50_inr', 'p95_inr', 'scenario_losses')
    })


@router.post('', response_model=schemas.AssetOut)
def create_asset(asset: schemas.AssetCreate, db: Session = Depends(get_db)):
    db_asset = models.Asset(**asset.model_dump())
    db.add(db_asset)
    db.commit()
    db.refresh(db_asset)
    return db_asset
