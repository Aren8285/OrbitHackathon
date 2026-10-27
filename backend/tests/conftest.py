"""Shared test fixtures: isolated in-memory SQLite per test session."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app

TEST_DATABASE_URL = 'sqlite://'

test_engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={'check_same_thread': False},
    poolclass=StaticPool,
    future=True,
)
TestSession = sessionmaker(bind=test_engine, autoflush=False, autocommit=False)


@pytest.fixture(autouse=True)
def isolated_db():
    """Fresh schema for every test, no shared state between tests."""
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture()
def db():
    session = TestSession()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client(db):
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.pop(get_db, None)


def csv_upload(filename: str, text: str):
    """Build a multipart CSV upload payload for TestClient."""
    return {'file': (filename, text.encode('utf-8'), 'text/csv')}


ASSET_CSV_MINIMAL = (
    'asset_id,asset_name,asset_type,environment,owner,business_unit,criticality,'
    'data_classification,internet_facing,revenue_dependency,operational_impact,compliance_impact\n'
    'A-001,Payment Processing Database,Database,Production,IT Ops,Payments,10,'
    'Restricted,true,10,9,9\n'
)
