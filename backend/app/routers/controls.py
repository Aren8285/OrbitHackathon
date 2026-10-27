from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db

router = APIRouter()


@router.get('/')
def list_controls(db: Session = Depends(get_db)):
    return db.query(models.Control).all()


@router.post('/', response_model=schemas.Control)
def create_control(control: schemas.ControlCreate, db: Session = Depends(get_db)):
    db_control = models.Control(**control.model_dump())
    db.add(db_control)
    db.commit()
    db.refresh(db_control)
    return db_control
