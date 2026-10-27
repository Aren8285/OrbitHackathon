from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app import schemas
from app.database import get_db
from app.services import csv_import
from app.schemas import ImportResult

router = APIRouter()

MAX_UPLOAD_BYTES = 2 * 1024 * 1024  # security.md: 2 MB, .csv only


async def _read_upload(file: UploadFile, dataset: str) -> bytes:
    name = (file.filename or '').lower()
    if not name.endswith('.csv'):
        raise HTTPException(status_code=415, detail=f'{dataset} import only accepts .csv files')
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail='CSV file exceeds the 2 MB limit')
    return content


@router.post('/assets', response_model=ImportResult)
async def upload_assets(file: UploadFile = File(...), db: Session = Depends(get_db)):
    content = await _read_upload(file, 'assets')
    try:
        report = csv_import.import_assets(db, content)
    except csv_import.CSVFileRejected as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return ImportResult(
        dataset=report.dataset, rows_read=report.rows_read, created=report.created,
        updated=report.updated, skipped=report.skipped,
    )


@router.post('/vulnerabilities', response_model=ImportResult)
async def upload_vulnerabilities(file: UploadFile = File(...), db: Session = Depends(get_db)):
    content = await _read_upload(file, 'vulnerabilities')
    try:
        report = csv_import.import_vulnerabilities(db, content)
    except csv_import.CSVFileRejected as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return ImportResult(
        dataset=report.dataset, rows_read=report.rows_read, created=report.created,
        updated=report.updated, skipped=report.skipped,
    )


@router.post('/controls', response_model=ImportResult)
async def upload_controls(file: UploadFile = File(...), db: Session = Depends(get_db)):
    content = await _read_upload(file, 'controls')
    try:
        report = csv_import.import_controls(db, content)
    except csv_import.CSVFileRejected as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return ImportResult(
        dataset=report.dataset, rows_read=report.rows_read, created=report.created,
        updated=report.updated, skipped=report.skipped,
    )
