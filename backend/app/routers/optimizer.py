from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.services import optimizer as optimizer_service
from app.services import risk_service

router = APIRouter()


@router.get('/recommendations', response_model=schemas.OptimizerRecommendation)
def optimizer_recommendations(
    budget: int = Query(None, ge=0, description='Max annual control spend in INR'),
    asset_id: str = Query('A-001', description='Scenario asset providing the inherent loss'),
    db: Session = Depends(get_db),
):
    """Greedy optimizer over the control catalog. Inherent loss is the
    scenario asset's EDITABLE impact assumption; nothing is fabricated."""
    from app.config import settings

    if budget is None:
        budget = int(settings.default_budget)
    asset = db.query(models.Asset).filter_by(asset_id=asset_id).first()
    if asset is None:
        raise HTTPException(status_code=404, detail=f'Asset {asset_id!r} not found')
    assumption = risk_service.get_or_create_assumption(db, asset)
    candidates = [
        optimizer_service.ControlCandidate(
            control_key=control.control_key,
            control_name=control.control_name,
            annual_cost_inr=control.annual_cost,
            effectiveness=control.eff_likely,
        )
        for control in db.query(models.Control).all()
    ]
    try:
        result = optimizer_service.optimize_portfolio(candidates, assumption.assumed_impact_inr, budget)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    result['asset_id'] = asset_id
    return result
