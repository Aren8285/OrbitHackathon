import asyncio
import json
import logging
import os
from pathlib import Path
import subprocess
import sys
import time

import httpx
import pytest

from app.config import ENV_FILE, REPO_ROOT, Settings, settings
from app.services import llm
from tests.conftest import REAL_GEMINI_POST
from tests.test_ai_and_tasks import seed_full


def test_settings_and_database_path_are_independent_of_working_directory(tmp_path):
    # A directory-local decoy must never override the single root configuration.
    (tmp_path / '.env').write_text('DEMO_API_TOKEN=decoy\nGEMINI_API_KEY=decoy\nCORS_ORIGINS=*\n')
    script = """
import json
from dotenv import dotenv_values
from app.config import ENV_FILE, settings
from app.database import engine
data=dotenv_values(ENV_FILE)
print(json.dumps(dict(
    source=str(ENV_FILE),
    token_matches_root=settings.demo_api_token==data.get('DEMO_API_TOKEN',''),
    key_matches_root=settings.gemini_api_key==data.get('GEMINI_API_KEY',''),
    database_path=engine.url.database,
    database_setting=settings.database_url,
    origins=settings.cors_origins,
)))
"""
    env = os.environ.copy()
    for name in Settings.model_fields:
        env.pop(name.upper(), None)
    env.update(PYTHONPATH=str(REPO_ROOT / 'backend'), PYTHONDONTWRITEBYTECODE='1')
    observed = []
    for cwd in (REPO_ROOT, REPO_ROOT / 'backend', tmp_path):
        output = subprocess.check_output([sys.executable, '-B', '-c', script], cwd=cwd, env=env, text=True)
        observed.append(json.loads(output))
    assert observed[0] == observed[1] == observed[2]
    assert observed[0]['source'] == str(ENV_FILE)
    assert observed[0]['token_matches_root'] and observed[0]['key_matches_root']
    assert Path(observed[0]['database_path']).is_absolute()


def test_settings_defaults_and_removed_configuration_names():
    assert Settings.model_fields['debug'].default is False
    assert Settings.model_fields['llm_timeout_seconds'].default == 30
    assert llm.CHAIN_TIMEOUT_SECONDS == 45
    assert Settings.model_config['env_file'] == str(ENV_FILE)
    assert 'cors_origins' in Settings.model_fields
    assert not {'allowed_origins', 'epss_api_url', 'kev_api_url'} & Settings.model_fields.keys()


def test_startup_logs_source_chain_and_only_secret_presence(monkeypatch, caplog):
    monkeypatch.setattr(settings, 'gemini_api_key', 'startup-private-key')
    monkeypatch.setattr(settings, 'demo_api_token', 'startup-private-token')
    monkeypatch.setattr(settings, 'secret_key', 'startup-private-secret')
    monkeypatch.setattr(settings, 'gemini_model', 'configured-primary')
    monkeypatch.setattr(settings, 'gemini_fallback_models', ['configured-secondary'])
    with caplog.at_level(logging.INFO, logger='uvicorn.error'):
        llm.log_startup_config()
    assert 'config loaded from ' + str(ENV_FILE) in caplog.text
    assert 'model_chain=configured-primary, configured-secondary' in caplog.text
    assert 'key_present=yes demo_token_present=yes secret_key_present=yes' in caplog.text
    for secret in (settings.gemini_api_key, settings.demo_api_token, settings.secret_key):
        assert secret not in caplog.text


@pytest.mark.parametrize('reply,metrics,rule', [
    ('word ' * 151, {'loss': 10}, 'word_limit'),
    ('Loss is 11', {'loss': 10}, 'unknown_number'),
    ('Loss {unknown_value}', {'loss': 10}, 'unknown_placeholder'),
])
def test_rejection_diagnostics_classify_placeholder_validation(reply, metrics, rule):
    assert llm.reply_rejection(reply, metrics)[0] == rule
    assert not llm.reply_is_valid(reply, metrics)


def test_debug_false_logs_rule_but_never_reply(monkeypatch, caplog):
    monkeypatch.setattr(settings, 'debug', False)
    reply = 'Sensitive reply containing unknown loss 12345'
    with caplog.at_level(logging.DEBUG, logger=llm.logger.name):
        llm.log_rejected_reply(reply, {'loss': 10})
    assert 'rule=unknown_number' in caplog.text
    assert reply not in caplog.text and '12345' not in caplog.text


def test_debug_true_logs_reply_with_all_credentials_redacted(monkeypatch, caplog):
    monkeypatch.setattr(settings, 'debug', True)
    monkeypatch.setattr(settings, 'gemini_api_key', 'debug-private-key')
    monkeypatch.setattr(settings, 'demo_api_token', 'debug-private-token')
    monkeypatch.setattr(settings, 'secret_key', 'debug-private-secret')
    reply = 'Unknown loss 12345 ' + ' '.join((settings.gemini_api_key, settings.demo_api_token, settings.secret_key))
    with caplog.at_level(logging.DEBUG, logger=llm.logger.name):
        llm.log_rejected_reply(reply, {'loss': 10})
    assert 'rule=unknown_number' in caplog.text
    assert 'Unknown loss 12345' in caplog.text
    assert caplog.text.count('[REDACTED]') == 3
    for secret in (settings.gemini_api_key, settings.demo_api_token, settings.secret_key):
        assert secret not in caplog.text


def test_chain_deadline_cancels_inflight_retry_and_serves_template(client, monkeypatch):
    seed_full(client)
    monkeypatch.setattr(settings, 'gemini_api_key', 'deadline-test-key')
    monkeypatch.setattr(settings, 'gemini_model', 'primary')
    monkeypatch.setattr(settings, 'gemini_fallback_models', ['secondary'])
    monkeypatch.setattr(settings, 'llm_timeout_seconds', .03)
    monkeypatch.setattr(llm, 'CHAIN_TIMEOUT_SECONDS', .05)
    calls, cancelled = [], []

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

    async def slow_post(client, url, **kwargs):
        calls.append(url)
        try:
            await asyncio.sleep(3600)
        finally:
            cancelled.append(url)

    monkeypatch.setattr(httpx, 'AsyncClient', FakeClient)
    monkeypatch.setattr(llm, '_post_gemini', slow_post)
    chain_times = []
    original_call = llm.call_llm
    def measured_call(*args, **kwargs):
        started = time.perf_counter()
        try:
            return original_call(*args, **kwargs)
        finally:
            chain_times.append(time.perf_counter() - started)
    monkeypatch.setattr(llm, 'call_llm', measured_call)
    response = client.get('/api/ai/explain-risk')
    assert chain_times[0] < .5
    assert response.status_code == 200
    assert response.json()['model'] == 'template'
    assert response.json()['fallback_reason'] == 'Gemini model chain reached its total time cap'
    assert len(calls) == 2 and calls[0] == calls[1]
    assert cancelled == calls
    assert all('secondary' not in url for url in calls)


def test_deadline_is_shared_across_fallback_models(monkeypatch):
    monkeypatch.setattr(settings, 'gemini_api_key', 'deadline-test-key')
    monkeypatch.setattr(settings, 'gemini_model', 'primary')
    monkeypatch.setattr(settings, 'gemini_fallback_models', ['secondary'])
    monkeypatch.setattr(settings, 'llm_timeout_seconds', 30)
    monkeypatch.setattr(llm, 'CHAIN_TIMEOUT_SECONDS', .08)
    calls, cancelled = [], []
    class FakeClient:
        async def __aenter__(self): return self
        async def __aexit__(self, *args): return False
    async def post(client, url, **kwargs):
        calls.append(url)
        if 'primary' in url:
            await asyncio.sleep(.02)
            return httpx.Response(503)
        try:
            await asyncio.sleep(3600)
        finally:
            cancelled.append(url)
    monkeypatch.setattr(httpx, 'AsyncClient', FakeClient)
    monkeypatch.setattr(llm, '_post_gemini', post)
    started = time.perf_counter()
    with pytest.raises(llm.LLMError, match='total time cap'):
        llm.call_llm('system', '{}')
    assert time.perf_counter() - started < .5
    assert len(calls) == 3 and calls[0] == calls[1]
    assert 'secondary' in calls[2] and cancelled == [calls[2]]


def test_async_http_adapter_uses_header_not_query():
    async def check():
        def respond(request):
            assert request.headers['x-goog-api-key'] == 'adapter-test-key'
            assert 'adapter-test-key' not in str(request.url)
            return httpx.Response(200, json={'ok': True})
        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
            response = await REAL_GEMINI_POST(client, llm.BASE_URL + '/models/test:generateContent',
                                             headers={'x-goog-api-key': 'adapter-test-key'}, json={})
            assert response.json() == {'ok': True}
    asyncio.run(check())
