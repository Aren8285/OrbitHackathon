"""Tests for local KEV/EPSS enrichment with fictional-CVE separation."""

from app.services import enrichment
from app.services.enrichment import enrich_finding, get_epss_score, get_kev_status, is_fictional_cve


def test_fictional_demo_cves_are_flagged():
    assert is_fictional_cve('CVE-2099-0001') is True
    assert is_fictional_cve('cve-2099-0155') is True
    assert is_fictional_cve('CVE-2024-5678') is False
    assert is_fictional_cve('not-a-cve') is False
    assert is_fictional_cve('') is False


def test_real_cves_use_local_kev_file():
    flag, source = get_kev_status('CVE-2023-1234', db_value=False)
    assert flag is True
    assert source == enrichment.SOURCE == 'local_files'


def test_real_cves_not_in_kev_file_default_false():
    flag, source = get_kev_status('CVE-2024-0001', db_value=False)
    assert flag is False
    assert source == 'local_files'


def test_fictional_cves_keep_database_values_and_demo_source():
    flag, source = get_kev_status('CVE-2099-0001', db_value=True)
    assert flag is True
    assert source == 'demo'


def test_epss_score_from_local_file():
    score, source = get_epss_score('CVE-2024-5678', db_value=None)
    assert score == 0.61
    assert source == 'local_files'


def test_epss_uses_richer_of_local_and_db_for_real_cves():
    score, _ = get_epss_score('CVE-2023-1234', db_value=0.1)  # local file says 0.82
    assert score == 0.82
    score, _ = get_epss_score('CVE-2023-1234', db_value=0.95)  # DB is richer
    assert score == 0.95


def test_epss_for_fictional_cves_never_touches_local_files():
    score, source = get_epss_score('CVE-2099-0002', db_value=0.21)
    assert score == 0.21
    assert source == 'demo'


def test_enrich_finding_marks_fictional_provenance():
    result = enrich_finding('CVE-2099-0001', db_kev=True, db_epss=0.82)
    assert result['fictional'] is True
    assert result['data_source'] == 'demo'
    assert result['kev'] is True
    assert result['epss'] == 0.82

    result = enrich_finding('CVE-2023-1234', db_kev=None, db_epss=0.1)
    assert result['fictional'] is False
    assert result['data_source'] == 'local_sync'
    assert result['kev'] is True       # from local CISA-style file
    assert result['epss'] == 0.82      # richer local EPSS value


def test_loaders_tolerate_missing_files(tmp_path):
    empty_kev = enrichment.load_kev_index(tmp_path / 'nope.json')
    empty_epss = enrichment.load_epss_map(tmp_path / 'nope.csv')
    assert empty_kev == {}
    assert empty_epss == {}
