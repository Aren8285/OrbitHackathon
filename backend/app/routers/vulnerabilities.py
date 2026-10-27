from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db

router = APIRouter()


@router.get('/')
def list_vulnerabilities(db: Session = Depends(get_db)):
    return db.query(models.Vulnerability).all()


@router.post('/', response_model=schemas.Vulnerability)
def create_vulnerability(vuln: schemas.VulnerabilityCreate, db: Session = Depends(get_db)):
    db_vuln = models.Vulnerability(**vuln.model_dump())
    db.add(db_vuln)
    db.commit()
    db.refresh(db_vuln)
    return db_vuln
