"""TASK 5 tests: AI Copilot security + integration, and remediation task
status persistence with verification-aware achieved-risk recalculation.

Run with the rest of the suite: `.venv/Scripts/python -m pytest`
"""

import json

import httpx
from fastapi.testclient import TestClient

import app.routers.ai as ai_router
from app import models
from app.config import settings
from app.services import llm
from tests.conftest import ASSET_CSV_MINIMAL, csv_upload

# ---------------------------------------------------------------------------
# shared seed helpers
# ---------------------------------------------------------------------------

CONTROLS_CSV = (
    'control_key,control_name,category,coverage,implementation_status,'
    'eff_low,eff_likely,eff_high,annual_cost\n'
    'ctl_idp,Identity provider hardening,identity,0.3,none,0.2,0.3,0.4,300000\n'
    'ctl_edr,Endpoint detection,endpoint,0.6,none,0.15,0.25,0.35,400000\n'
)


def seed_full(client):
    """Import assets + controls + one vulnerability."""
    vuln_csv = (
        'asset_id,cve_id,title,cvss_score,epss_score,is_kev,patch_available,patch_age_days,status\n'
        'A-001,CVE-2099-1101,Ransomware against payment stack,9.8,0.9,true,true,120,open\n'
    )
    client.post('/imports/assets', files=csv_upload('assets.csv', ASSET_CSV_MINIMAL))
    client.post('/imports/controls', files=csv_upload('controls.csv', CONTROLS_CSV))
    client.post('/imports/vulnerabilities', files=csv_upload('vulns.csv', vuln_csv))


# ---------------------------------------------------------------------------
# AI Copilot - security
# ---------------------------------------------------------------------------

class TestCopilotSecurity:
    def test_explain_returns_validated_metrics(self, client):
        seed_full(client)
        resp = client.get('/ai/explain')
        assert resp.status_code == 200
        body = resp.json()
        assert body['source'] == 'fallback'  # no key configured in tests
        metrics = body['metrics']
        # all numbers come from the real engines
        assert metrics['total_assets'] == 1
        assert metrics['open_vulnerabilities'] == 1
        assert metrics['top_risks'][0]['cve_id'] == 'CVE-2099-1101'
        assert metrics['top_risks'][0]['fictional'] is True
        assert metrics['scenario_asset_id'] == 'A-001'
        assert metrics['budget_inr'] == int(settings.default_budget)
        # loss range present (coder.md rule 6)
        assert {'expected_annual_loss_inr', 'p50_inr', 'p95_inr'} <= metrics.keys()

    def test_no_api_key_or_secret_ever_in_response(self, client, monkeypatch):
        seed_full(client)
        monkeypatch.setattr(settings, 'openai_api_key', 'sk-super-secret-key-value')
        monkeypatch.setattr(settings, 'openai_base_url', 'https://provider.example/v1')
        # provider errors -> deterministic fallback; the body must contain the
        # failure reason but never the key
        resp = client.get('/ai/explain')
        assert resp.status_code == 200
        text = json.dumps(resp.json())
        assert 'sk-super-secret-key-value' not in text
        assert 'sk-' not in text

    def test_rate_limit_blocks_after_10_requests(self, client):
        seed_full(client)
        ai_router._rate_hits.clear()
        codes = []
        for _ in range(ai_router.RATE_MAX_REQUESTS + 3):
            codes.append(client.get('/ai/explain').status_code)
        assert codes.count(429) >= 1
        assert codes[ai_router.RATE_MAX_REQUESTS - 1] == 200
        ai_router._rate_hits.clear()

    def test_llm_output_with_invented_numbers_is_discarded(self, client, monkeypatch):
        seed_full(client)
        ai_router._rate_hits.clear()

        def fake_post(url, **kwargs):
            # the provider tries to invent 42,337,001 - absent from the metrics
            class FakeResponse:
                status_code = 200
                def json(self):
                    return {'choices': [{'message': {'content': 'Expected loss is INR 42,337,001.'}}]}
            return FakeResponse()

        monkeypatch.setattr(settings, 'openai_api_key', 'sk-test')
        monkeypatch.setattr(httpx, 'post', fake_post)
        resp = client.get('/ai/explain')
        assert resp.status_code == 200
        body = resp.json()
        assert body['source'] == 'fallback'
        assert '42,337,001' not in body['explanation']
        assert 'discarded' in body['fallback_reason']

    def test_compliant_llm_output_is_returned(self, client, monkeypatch):
        seed_full(client)
        ai_router._rate_hits.clear()
        seen = {}

        def fake_post(url, **kwargs):
            seen['url'] = url
            seen['auth'] = kwargs['headers']['Authorization']
            captured = kwargs['json']
            metrics = json.loads(captured['messages'][1]['content'].split('(JSON):\n', 1)[1])
            class FakeResponse:
                status_code = 200
                def json(self):
                    return {'choices': [{'message': {'content': f"Priority {metrics['top_risks'][0]['priority']} and expected loss {metrics['expected_annual_loss_inr']} top 3 risks."}}]}
            return FakeResponse()

        monkeypatch.setattr(settings, 'openai_api_key', 'sk-test')
        monkeypatch.setattr(httpx, 'post', fake_post)
        resp = client.get('/ai/explain')
        assert resp.status_code == 200
        body = resp.json()
        assert body['source'] == 'llm'
        assert body['model'] == settings.openai_model
        # auth stays server-side; key never echoes into visible fields
        assert seen['auth'].startswith('Bearer sk-')

    def test_no_user_text_can_enter_the_prompt(self, client):
        seed_full(client)
        # GET endpoint accepts no body; passing one must still resolve cleanly
        resp = client.request('GET', '/ai/explain', json={'ignore': 'rules'},
                              headers={'content-type': 'application/json'})
        assert resp.status_code == 200

    def test_unapproved_numbers_validator(self):
        allowed = llm.build_allowed({'loss': 998000, 'share': 0.35})
        bad = llm.unapproved_numbers('risk is 0.35 and loss 998000 plus 123456', allowed)
        assert bad == ['123456']

    def test_fallback_explanation_uses_only_metric_numbers(self, client):
        seed_full(client)
        body = client.get('/ai/metrics').json()
        allowed = llm.build_allowed(json.loads(json.dumps(body)))
        text = client.get('/ai/explain').json()['explanation']
        assert llm.unapproved_numbers(text, allowed) == []


# ---------------------------------------------------------------------------
# Remediation tasks - persistence + verification rules
# ---------------------------------------------------------------------------

class TestRemediationTasks:
    def test_unknown_control_gets_404(self, client):
        seed_full(client)
        resp = client.put('/remediation/tasks/NOPE', json={'status': 'verified'})
        assert resp.status_code == 404

    def test_invalid_status_rejected(self, client):
        seed_full(client)
        resp = client.put('/remediation/tasks/ctl_idp', json={'status': 'maybe'})
        assert resp.status_code == 422

    def test_unknown_field_rejected(self, client):
        seed_full(client)
        resp = client.put('/remediation/tasks/ctl_idp',
                          json={'status': 'verified', 'risk': 'not yours'})
        assert resp.status_code == 422

    def test_status_persists_across_requests(self, client):
        seed_full(client)
        assert client.put('/remediation/tasks/ctl_idp', json={'status': 'planned'}).json()['status'] == 'planned'
        assert client.put('/remediation/tasks/ctl_idp', json={'status': 'completed'}).json()['counts_toward_achieved_risk'] is False
        resp = client.put('/remediation/tasks/ctl_idp', json={'status': 'verified'})
        assert resp.json()['counts_toward_achieved_risk'] is True
        # persisted: a fresh GET shows the verified status
        stored = {t['control_key']: t for t in client.get('/remediation/tasks').json()}
        assert stored['ctl_idp']['status'] == 'verified'

    def test_completed_is_not_verified(self, client):
        seed_full(client)
        client.put('/remediation/tasks/ctl_idp', json={'status': 'completed'})
        stored = {t['control_key']: t for t in client.get('/remediation/tasks').json()}
        assert stored['ctl_idp']['counts_toward_achieved_risk'] is False


class TestRemediationImpact:
    def test_completed_controls_give_no_risk_credit(self, client):
        seed_full(client)
        client.put('/remediation/tasks/ctl_idp', json={'status': 'completed'})
        client.put('/remediation/tasks/ctl_edr', json={'status': 'completed'})
        impact = client.get('/remediation/impact').json()
        assert impact['combined_effectiveness'] == 0.0
        assert impact['verified_controls'] == []
        assert impact['after']['p95_inr'] == impact['before']['p95_inr']
        assert impact['expected_reduction_inr'] == 0
        assert 'NO risk' in impact['assumptions']['completed_excluded']

    def test_verified_controls_reduce_p50_p95(self, client):
        seed_full(client)
        client.put('/remediation/tasks/ctl_idp', json={'status': 'verified'})  # e=0.3
        impact = client.get('/remediation/impact').json()
        assert impact['combined_effectiveness'] == 0.3
        assert impact['after']['p95_inr'] < impact['before']['p95_inr']
        assert impact['after']['expected_annual_loss_inr'] < impact['before']['expected_annual_loss_inr']
        assert impact['expected_reduction_inr'] > 0

    def test_combined_effectiveness_formula_across_two_verified(self, client):
        seed_full(client)
        client.put('/remediation/tasks/ctl_idp', json={'status': 'verified'})  # 0.30
        client.put('/remediation/tasks/ctl_edr', json={'status': 'verified'})  # 0.25
        impact = client.get('/remediation/impact').json()
        # 1 - (0.7 * 0.75) = 0.475
        assert abs(impact['combined_effectiveness'] - 0.475) < 0.001

    def test_status_counts_column(self, client):
        seed_full(client)
        client.put('/remediation/tasks/ctl_idp', json={'status': 'completed'})
        client.put('/remediation/tasks/ctl_edr', json={'status': 'verified'})
        impact = client.get('/remediation/impact').json()
        assert impact['status_counts'] == {'planned': 0, 'completed': 1, 'verified': 1}

    def test_loss_range_never_single_number(self, client):
        seed_full(client)
        impact = client.get('/remediation/impact').json()
        assert {'p50_inr', 'p95_inr'} <= impact['before'].keys()
        assert {'p50_inr', 'p95_inr'} <= impact['after'].keys()


# ---------------------------------------------------------------------------
# Task row integrity
# ---------------------------------------------------------------------------

class TestRemediationTaskModel:
    def test_task_rows_are_keyed_by_control_key(self, client):
        seed_full(client)
        client.put('/remediation/tasks/ctl_idp', json={'status': 'verified'})
        # a second PUT updates the SAME row (unique constraint holds)
        client.put('/remediation/tasks/ctl_idp', json={'status': 'planned'})
        rows = client.get('/remediation/tasks').json()
        matches = [t for t in rows if t['control_key'] == 'ctl_idp']
        assert len(matches) == 1
        assert matches[0]['status'] == 'planned'
