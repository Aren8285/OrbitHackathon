import pytest
from pydantic import ValidationError
from sqlalchemy import select

from app import models
from app.config import Settings
from app.database import CompanySession
from app.services import risk_service
from app.scripts import seed


@pytest.mark.parametrize('url', ['sqlite://', 'sqlite:///./riskops.db', 'sqlite+pysqlite:///:memory:'])
def test_sqlite_configuration(url):
    assert Settings(_env_file=None, database_url=url).database_url == url


@pytest.mark.parametrize('url', ['unsupported://user:secret@remote/demo', 'sqlite://remote/demo', 'not-a-url'])
def test_nonlocal_or_unsupported_database_rejected(url):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, database_url=url)


def test_fresh_deploy_seed_creates_company_and_calculates_every_scenario(client, db):
    db.delete(db.get(models.Company, 1))
    db.commit()
    response = client.post('/api/demo/seed')
    assert response.status_code == 200, response.text
    result = response.json()
    assert result['rebuilt'] is True
    assert result['counts'] == dict(assets=60, vulnerabilities=186, controls=21,
                                   risk_scenarios=6, simulation_results=6, remediations=175)
    assert db.get(models.Company, 1).name == 'FinPay Solutions'
    assert client.get('/api/risk/summary').json()['total_assets'] == 60
    assert any(task.priority == 'P0' for task in db.scalars(select(models.RemediationTask)).all())


def test_reseed_keeps_all_row_counts_and_one_simulation_per_scenario(client):
    first = client.post('/api/demo/seed')
    second = client.post('/api/demo/seed')
    assert first.status_code == second.status_code == 200
    assert first.json()['counts'] == second.json()['counts']
    assert second.json()['counts']['simulation_results'] == second.json()['counts']['risk_scenarios'] == 6


def test_rebuild_retains_other_company_data(client, db):
    with CompanySession(bind=db.get_bind(), info={'company_id': 2}) as other:
        other.add(models.Company(id=2, name='Other Company'))
        other.flush()
        other.add(models.Asset(company_id=2, asset_id='OTHER-1', asset_name='Keep me', asset_type='Database'))
        other.commit()
    for _ in range(2):
        response = client.post('/api/demo/seed')
        assert response.status_code == 200, response.text
    with CompanySession(bind=db.get_bind(), info={'company_id': 2}) as other:
        rows = other.scalars(select(models.Asset)).all()
        assert [(row.asset_id, row.asset_name) for row in rows] == [('OTHER-1', 'Keep me')]


def test_failed_calculation_rolls_back_entire_rebuild(client, db, monkeypatch):
    assert client.post('/api/demo/seed').status_code == 200
    control = db.scalar(select(models.Control).where(models.Control.control_key == 'edr'))
    control.annual_cost = 123456
    db.commit()

    def fail(*args, **kwargs):
        raise RuntimeError('Internal failure must not leak')

    monkeypatch.setattr(risk_service, 'calculate', fail)
    response = client.post('/api/demo/seed')
    assert response.status_code == 503
    assert 'Internal failure' not in response.text
    db.expire_all()
    assert db.scalar(select(models.Control).where(models.Control.control_key == 'edr')).annual_cost == 123456
    assert len(db.scalars(select(models.SimulationResult)).all()) == 6
    assert len(db.scalars(select(models.Asset)).all()) == 60


def test_missing_demo_csv_does_not_delete_existing_data(client, db, monkeypatch, tmp_path):
    assert client.post('/api/demo/seed').status_code == 200
    monkeypatch.setattr(seed, 'ASSETS_CSV', tmp_path / 'missing.csv')
    response = client.post('/api/demo/seed')
    assert response.status_code == 503
    assert len(db.scalars(select(models.Asset)).all()) == 60
    assert len(db.scalars(select(models.SimulationResult)).all()) == 6
