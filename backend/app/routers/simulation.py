from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.services import simulation_service

router = APIRouter()


@router.post('/run', response_model=schemas.SimulationResult)
def run_simulation(request: schemas.SimulationRequest, db: Session = Depends(get_db)):
    """Simulate annual INR loss from fully explicit, user-supplied inputs."""
    try:
        if request.scenario_key:
            from app.services import scenario_engine
            scenarios, controls, raw = scenario_engine.context(db, seed=request.seed, iterations=request.iterations)
            scenarios = [row for row in scenarios if row.scenario_key == request.scenario_key]
            if not scenarios:
                raise HTTPException(status_code=404, detail='Scenario not found')
            result = scenario_engine.evaluate(scenarios, controls, raw, seed=request.seed, iterations=request.iterations)
            scenario_engine.persist(db, result)
            db.commit()
            return result
        return simulation_service.run_from_request(request.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get('/assets/{asset_id}', response_model=schemas.SimulationResult)
def simulate_asset(
    asset_id: str,
    seed: Optional[int] = Query(None, description='Override the reproducible default seed'),
    iterations: Optional[int] = Query(None, ge=1_000, le=50_000),
    db: Session = Depends(get_db),
):
    """Simulate loss for one asset using its editable, labeled assumptions.
    Losses are returned as a range (P50 / P95), never a single number."""
    asset = db.query(models.Asset).filter_by(asset_id=asset_id).first()
    if asset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f'Asset {asset_id!r} not found')
    try:
        return simulation_service.run_for_asset(db, asset, seed=seed, iterations=iterations)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get('/portfolio', response_model=schemas.SimulationResult)
def simulate_portfolio(db: Session = Depends(get_db)):
    from app.services.scenario_engine import portfolio
    return portfolio(db)
