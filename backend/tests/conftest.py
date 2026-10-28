"""Shared test fixtures: isolated in-memory SQLite per test session."""

import httpx
import pytest
import asyncio
import sys
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, CompanySession, configure_scope, get_db
from app.config import settings
from app import models
from app.security import ai_explain_limit, ai_executive_limit, upload_limit
from app.services import llm
from app.services import copilot
from fastapi import Request
from app.main import app

if sys.platform == 'win32':
    # The sandboxed Windows Proactor loop blocks while creating its self-pipe.
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

REAL_GEMINI_POST = llm._post_gemini

TEST_DATABASE_URL = 'sqlite://'

test_engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={'check_same_thread': False},
    poolclass=StaticPool,
    future=True,
)
TestSession = sessionmaker(class_=CompanySession, bind=test_engine, autoflush=False, autocommit=False)


@pytest.fixture(autouse=True)
def isolated_db(monkeypatch):
    """Fresh schema for every test, no shared state between tests."""
    monkeypatch.setattr(settings, 'demo_api_token', 'test-demo-token')
    monkeypatch.setattr(settings, 'llm_provider', 'gemini')
    monkeypatch.setattr(settings, 'gemini_api_key', '')
    monkeypatch.setattr(settings, 'gemini_model', 'gemini-test-primary')
    monkeypatch.setattr(settings, 'gemini_fallback_models', [])
    monkeypatch.setattr(settings, 'llm_timeout_seconds', 30)
    monkeypatch.setattr(settings, 'debug', False)
    llm.reset_status()
    copilot.clear_explanation_cache()
    def no_real_http(*args, **kwargs):
        raise AssertionError('Real provider HTTP is forbidden in pytest; mock this request')
    monkeypatch.setattr(httpx, 'get', no_real_http)
    monkeypatch.setattr(httpx, 'post', no_real_http)
    async def no_real_async_http(*args, **kwargs):
        raise AssertionError('Real provider HTTP is forbidden in pytest; mock this request')
    monkeypatch.setattr(llm, '_post_gemini', no_real_async_http)
    ai_explain_limit.clear()
    ai_executive_limit.clear()
    upload_limit.clear()
    # Existing import tests intentionally make more than ten uploads.
    monkeypatch.setattr(upload_limit, 'limit', 1000)
    Base.metadata.create_all(bind=test_engine)
    with TestSession() as session:
        session.add(models.Company(id=1, name='FinPay Solutions'))
        session.commit()
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
    def scoped_db(request: Request):
        configure_scope(db, request)
        return db
    app.dependency_overrides[get_db] = scoped_db
    with TestClient(app, headers={'X-Demo-Token': 'test-demo-token'}) as test_client:
        test_client.db = db
        yield test_client
    app.dependency_overrides.pop(get_db, None)


def csv_upload(filename: str, text: str):
    """Build a multipart CSV upload payload for TestClient."""
    return {'file': (filename, text.encode('utf-8'), 'text/csv')}


def mock_gemini_post(monkeypatch, callback):
    async def post(client, url, **kwargs):
        return callback(url, **kwargs)
    monkeypatch.setattr(llm, '_post_gemini', post)


ASSET_CSV_MINIMAL = (
    'asset_id,asset_name,asset_type,environment,owner,business_unit,criticality,'
    'data_classification,internet_facing,revenue_dependency,operational_impact,compliance_impact\n'
    'A-001,Payment Processing Database,Database,Production,IT Ops,Payments,10,'
    'Restricted,true,10,9,9\n'
)
