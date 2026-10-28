from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app import models, schemas
from app.database import get_db

router = APIRouter()


@router.get('', response_model=list[schemas.VulnerabilityOut])
def list_vulnerabilities(db: Session = Depends(get_db)):
    from app.services import risk_service
    ranked = {(row['asset_id'], row['cve_id']): row for row in risk_service.finding_rankings(db, open_only=False)}
    rows = db.scalars(select(models.Vulnerability).options(joinedload(models.Vulnerability.asset))).unique().all()
    return [dict(schemas.VulnerabilityOut.model_validate(row).model_dump(),
                 priority_label=ranked[(row.asset_id, row.cve_id)]['priority_label'],
                 priority_score=ranked[(row.asset_id, row.cve_id)]['priority']) for row in rows]


@router.post('', response_model=schemas.VulnerabilityOut)
def create_vulnerability(vuln: schemas.VulnerabilityCreate, db: Session = Depends(get_db)):
    asset = db.scalar(select(models.Asset).where(models.Asset.asset_id == vuln.asset_id))
    if asset is None:
        raise HTTPException(status_code=404, detail=f'Asset {vuln.asset_id!r} not found')
    db_vuln = models.Vulnerability(
        asset_row_id=asset.id,
        **vuln.model_dump(exclude={'asset_id'}),
    )
    db.add(db_vuln)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=409, detail='This CVE already exists on that asset')
    db.refresh(db_vuln)
    from app.services import risk_service
    row = next(row for row in risk_service.finding_rankings(db, open_only=False)
               if row['asset_id'] == db_vuln.asset_id and row['cve_id'] == db_vuln.cve_id)
    return dict(schemas.VulnerabilityOut.model_validate(db_vuln).model_dump(),
                priority_label=row['priority_label'], priority_score=row['priority'])
