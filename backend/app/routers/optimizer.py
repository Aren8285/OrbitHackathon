from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import select
from app import models, schemas
from app.config import settings
from app.database import get_db
from app.services.optimizer import recommend

router = APIRouter()


def run_recommendation(db, budget, must_include=(), exclude=(), asset_id=None):
    if asset_id and db.scalar(select(models.Asset).where(models.Asset.asset_id == asset_id)) is None:
        raise HTTPException(status_code=404, detail='Asset not found')
    try:
        return recommend(db, budget, must_include, exclude, asset_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None


@router.post('/recommend', response_model=schemas.OptimizerRecommendation)
def optimizer_recommend(payload: schemas.OptimizerRequest, db: Session = Depends(get_db)):
    return run_recommendation(db, payload.budget, payload.must_include, payload.exclude, payload.asset_id)


@router.get('/recommend', response_model=schemas.OptimizerRecommendation)
def optimizer_recommendations(budget: int = Query(None, ge=0), asset_id: str | None = None,
                              db: Session = Depends(get_db)):
    return run_recommendation(db, budget if budget is not None else int(settings.default_budget), asset_id=asset_id)
