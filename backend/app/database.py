from fastapi import HTTPException, Request
import sqlite3

from sqlalchemy import create_engine, event, inspect, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker, with_loader_criteria

from app.config import settings

@event.listens_for(Engine, 'connect')
def enforce_sqlite_foreign_keys(connection, record):
    if isinstance(connection, sqlite3.Connection):
        cursor = connection.cursor()
        cursor.execute('PRAGMA foreign_keys=ON')
        cursor.close()


engine = create_engine(settings.database_url, connect_args={'check_same_thread': False, 'timeout': 30})
Base = declarative_base()


class CompanySession(Session):
    """All ORM reads (including joins/counts) and writes stay in one company."""


SessionLocal = sessionmaker(class_=CompanySession, autocommit=False, autoflush=False, bind=engine)


@event.listens_for(CompanySession, 'do_orm_execute')
def scope_queries(state):
    from app.models import Company, CompanyOwned
    company_id = state.session.info.get('company_id', 1)
    if state.is_select or state.is_update or state.is_delete:
        state.statement = state.statement.options(with_loader_criteria(
            CompanyOwned, lambda model: model.company_id == company_id, include_aliases=True,
        ), with_loader_criteria(Company, lambda model: model.id == company_id, include_aliases=True))
    # Bulk DML skips before_flush validation, so writes must use ORM objects.
    if state.is_insert or state.is_update or state.is_delete:
        raise HTTPException(status_code=403, detail='Bulk writes are not supported')


@event.listens_for(CompanySession, 'before_flush')
def scope_writes(session, flush_context, instances):
    from app import models
    company_id = session.info.get('company_id', 1)
    for obj in session.new | session.dirty | session.deleted:
        if isinstance(obj, models.Company) and obj.id != company_id:
            raise HTTPException(status_code=403, detail='Company access denied')
        if isinstance(obj, models.CompanyOwned):
            if obj in session.new and obj.company_id is None:
                obj.company_id = company_id
            if company_id != obj.company_id or company_id < 1:
                raise HTTPException(status_code=403, detail='Company access denied')
            if any(old != company_id for old in inspect(obj).attrs.company_id.history.deleted):
                raise HTTPException(status_code=403, detail='Company reassignment is forbidden')
            if isinstance(obj, (models.Vulnerability, models.ImpactAssumption)):
                asset = session.scalar(select(models.Asset).where(models.Asset.id == obj.asset_row_id))
                if asset is None or asset.company_id != company_id:
                    raise HTTPException(status_code=403, detail='Company access denied')
            if isinstance(obj, models.RemediationTask):
                asset = session.scalar(select(models.Asset).where(models.Asset.asset_id == obj.asset_id))
                if asset is None:
                    raise HTTPException(status_code=403, detail='Company access denied')
                if obj.vulnerability_id is not None:
                    finding = session.scalar(select(models.Vulnerability).where(models.Vulnerability.id == obj.vulnerability_id))
                    if finding is None or finding.asset_row_id != asset.id:
                        raise HTTPException(status_code=403, detail='Task vulnerability does not belong to its asset')



def configure_scope(db, request: Request):
    # The shared token authorizes only FinPay. A query parameter cannot switch tenants.
    requested = request.query_params.get('company_id', '1')
    db.info['company_id'] = 1 if requested == '1' else -1
    if db.info['company_id'] == -1 and request.method not in ('GET', 'HEAD'):
        raise HTTPException(status_code=403, detail='Company access denied')
    return db


def get_db(request: Request):
    db = SessionLocal()
    try:
        configure_scope(db, request)
        yield db
    finally:
        db.close()
