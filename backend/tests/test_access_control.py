from datetime import date

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import event, func, select, update

from app import models
from app.main import app
from app.config import Settings
from app.scripts.seed import seed_database
from app.security import ai_limit, upload_limit
from tests.conftest import ASSET_CSV_MINIMAL, csv_upload
from app.database import CompanySession


@pytest.mark.parametrize('method,path', [
    ('GET', '/api/assets'), ('POST', '/api/assets'),
    ('GET', '/api/vulnerabilities'), ('POST', '/api/vulnerabilities'),
    ('GET', '/api/controls'), ('POST', '/api/controls'),
    ('POST', '/api/assets/import-csv'), ('POST', '/api/vulnerabilities/import'),
    ('POST', '/api/controls/import'), ('GET', '/api/risk/summary'),
    ('GET', '/api/risk/assets'), ('GET', '/api/risk/scenarios'), ('POST', '/api/risk/calculate'),
    ('GET', '/api/optimizer/recommend'), ('POST', '/api/optimizer/recommend'), ('GET', '/api/remediations'),
    ('PUT', '/api/remediations/mfa'), ('GET', '/api/assumptions/impact'),
    ('GET', '/api/ai/explain-risk'), ('GET', '/api/ai/executive-summary'),
    ('GET', '/api/ai/metrics'), ('GET', '/api/ai/status'), ('POST', '/api/simulation/run'),
    ('POST', '/api/demo/seed'),
])
@pytest.mark.parametrize('token', [None, 'wrong-token'])
def test_every_data_route_requires_token(client, method, path, token):
    # A separate client has no implicit test token; retain the scoped DB override.
    with TestClient(app) as anonymous:
        headers = {} if token is None else {'X-Demo-Token': token}
        assert anonymous.request(method, path, headers=headers).status_code == 401


def test_correct_token_and_open_health(client):
    assert client.get('/api/assets').status_code == 200
    with TestClient(app) as anonymous:
        assert anonymous.get('/health').status_code == 200


def test_unconfigured_token_fails_closed(client, monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, 'demo_api_token', '')
    assert client.get('/api/assets').status_code == 401


def test_other_company_cannot_be_read_or_modified(db, client):
    seed_database(db)
    with CompanySession(bind=db.get_bind(), info={'company_id': 2}) as other:
        other.add(models.Company(id=2, name='Other Company'))
        other.commit()
        foreign = models.Asset(asset_id='OTHER-1', asset_name='Private asset', asset_type='Database')
        other.add(foreign)
        other.add(models.Control(control_key='private', control_name='Private control'))
        other.commit()
        foreign_id = foreign.id
    assert db.scalar(select(models.Asset).where(models.Asset.company_id == 2)) is None
    assert db.scalar(select(func.count()).select_from(models.Asset)) == 60
    assert db.scalar(select(models.Asset).where(models.Asset.id == foreign_id)) is None
    assert client.get('/api/assets/OTHER-1').status_code == 404
    assert client.get('/api/assets?company_id=2').json() == []
    assert client.get('/api/risk/assets?company_id=2').json() == []
    assert client.get('/api/risk/summary?company_id=2').json()['total_assets'] == 0
    assert client.put('/api/remediations/private', json={'status': 'verified'}).status_code == 404
    assert client.post('/api/assets/import-csv?company_id=2', files=csv_upload('a.csv', ASSET_CSV_MINIMAL)).status_code == 403


def test_cross_company_foreign_key_write_is_rejected(db):
    with CompanySession(bind=db.get_bind(), info={'company_id': 2}) as other:
        other.add(models.Company(id=2, name='Other Company'))
        other.commit()
        foreign = models.Asset(asset_id='OTHER-1', asset_name='Private', asset_type='Database')
        other.add(foreign)
        other.commit()
        foreign_id = foreign.id
    db.add(models.Vulnerability(asset_row_id=foreign_id, cve_id='CVE-2099-9999', title='Cross-company'))
    with pytest.raises(HTTPException) as exc:
        db.commit()
    assert exc.value.status_code == 403
    db.rollback()


def test_every_business_table_is_scoped_and_bulk_reassignment_is_blocked(db):
    with CompanySession(bind=db.get_bind(), info={'company_id': 2}) as other:
        other.add(models.Company(id=2, name='Other Company'))
        other.commit()
        asset = models.Asset(asset_id='OTHER-1', asset_name='Private', asset_type='Database')
        other.add(asset)
        other.add(models.Control(control_key='private', control_name='Private control'))
        other.commit()
        other.add_all([
            models.Vulnerability(asset_row_id=asset.id, cve_id='CVE-2099-9999', title='Private finding'),
            models.ImpactAssumption(asset_row_id=asset.id, assumed_impact_inr=1000),
            models.Scenario(name='Private scenario'),
            models.Remediation(title='Private remediation'),
            models.RemediationTask(control_key='private', asset_id=asset.asset_id, due_date=date.today()),
        ])
        other.commit()
        for model in [models.Asset, models.Vulnerability, models.Control, models.ImpactAssumption,
                      models.Scenario, models.Remediation, models.RemediationTask]:
            assert other.scalar(select(func.count()).select_from(model)) == 1
            assert db.scalars(select(model)).all() == []
            assert db.scalar(select(func.count()).select_from(model)) == 0
    with pytest.raises(HTTPException):
        db.execute(update(models.Asset).values(company_id=2))
    db.rollback()


def test_gets_do_not_write_even_with_missing_assumptions(db, client):
    client.post('/api/assets/import-csv', files=csv_upload('a.csv', ASSET_CSV_MINIMAL))
    assert db.query(models.ImpactAssumption).count() == 0
    statements = []
    def capture(conn, cursor, statement, parameters, context, executemany):
        if statement.lstrip().split()[0].upper() in ('INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP'):
            statements.append(statement)
    event.listen(db.get_bind(), 'before_cursor_execute', capture)
    try:
        for path in ['/api/risk/summary', '/api/risk/assets', '/api/assumptions/impact',
                     '/api/simulation/assets/A-001', '/api/optimizer/recommend',
                     '/api/remediations/impact', '/api/ai/metrics', '/api/ai/explain-risk',
                     '/api/ai/executive-summary']:
            assert client.get(path).status_code == 200, path
    finally:
        event.remove(db.get_bind(), 'before_cursor_execute', capture)
    assert statements == []
    assert db.query(models.ImpactAssumption).count() == 0
    assert client.post('/api/risk/calculate').status_code == 200
    assert db.query(models.ImpactAssumption).count() == 1


@pytest.mark.parametrize('path', ['/api/ai/metrics', '/api/ai/explain-risk', '/api/ai/executive-summary', '/api/ai/status'])
def test_all_ai_routes_share_limit(client, monkeypatch, path):
    monkeypatch.setattr(ai_limit, 'limit', 1)
    assert client.get(path).status_code == 200
    assert client.get('/api/ai/metrics').status_code == 429


@pytest.mark.parametrize('path', ['/api/assets/import-csv', '/api/vulnerabilities/import', '/api/controls/import'])
def test_uploads_share_limit(client, monkeypatch, path):
    monkeypatch.setattr(upload_limit, 'limit', 1)
    assert client.post(path, files={'file': ('bad.txt', b'x')}).status_code == 415
    assert client.post('/api/assets/import-csv', files=csv_upload('a.csv', ASSET_CSV_MINIMAL)).status_code == 429


def test_cors_has_no_development_regex(client):
    response = client.options('/api/assets', headers={
        'Origin': 'http://localhost:54321', 'Access-Control-Request-Method': 'GET',
    })
    assert response.status_code == 400
    assert 'access-control-allow-origin' not in response.headers
    with pytest.raises(ValueError):
        Settings(allowed_origins=['*'])


def test_canonical_seed_and_ai_routes(client, db):
    assert client.post('/api/demo/seed').status_code == 200
    assert db.get(models.Company, 1).name == 'FinPay Solutions'
    assert client.get('/api/ai/executive-summary').status_code == 200
