from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db

router = APIRouter()


@router.get('/', response_model=list[schemas.ControlOut])
def list_controls(db: Session = Depends(get_db)):
    return db.scalars(select(models.Control).order_by(models.Control.control_key)).all()


@router.post('/', response_model=schemas.ControlOut)
def create_control(control: schemas.ControlCreate, db: Session = Depends(get_db)):
    db_control = models.Control(**control.model_dump())
    db.add(db_control)
    db.commit()
    db.refresh(db_control)
    return db_control
