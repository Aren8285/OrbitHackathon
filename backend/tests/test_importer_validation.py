"""Bad-CSV and validation tests (security.md: reject bad files with a clear error)."""

from tests.conftest import ASSET_CSV_MINIMAL, csv_upload


def test_non_csv_file_rejected(client):
    response = client.post('/api/assets/import-csv', files=csv_upload('assets.xlsx', 'not a csv'))
    assert response.status_code == 415


def test_wrong_header_rejected(client):
    bad_csv = 'asset_id,asset_name,wrong_column\nA-001,Payment DB,10\n'
    response = client.post('/api/assets/import-csv', files=csv_upload('assets.csv', bad_csv))
    assert response.status_code == 422
    assert 'Wrong header' in response.json()['detail']


def test_empty_file_rejected(client):
    response = client.post('/api/assets/import-csv', files=csv_upload('assets.csv', ''))
    assert response.status_code == 422


def test_header_only_file_rejected(client):
    header_only = ASSET_CSV_MINIMAL.split('\n')[0] + '\n'
    response = client.post('/api/assets/import-csv', files=csv_upload('assets.csv', header_only))
    assert response.status_code == 422
    assert 'no data rows' in response.json()['detail']


def test_out_of_range_criticality_rejected_with_clear_message(client):
    bad_csv = ASSET_CSV_MINIMAL.replace('A-001,Payment Processing Database,Database,Production,IT Ops,Payments,10,', 'A-001,Payment Processing Database,Database,Production,IT Ops,Payments,99,')
    response = client.post('/api/assets/import-csv', files=csv_upload('assets.csv', bad_csv))
    assert response.status_code == 422
    detail = response.json()['detail']
    assert 'criticality' in detail
    assert 'between 1 and 10' in detail
    assert client.get('/health').json()['assets'] == 0  # nothing persisted


def test_out_of_range_cvss_and_epss_rejected(client):
    assets_csv = ASSET_CSV_MINIMAL
    client.post('/api/assets/import-csv', files=csv_upload('a.csv', assets_csv))

    bad_cvss = (
        'asset_id,cve_id,title,cvss_score,epss_score,is_kev,patch_available,patch_age_days,status\n'
        'A-001,CVE-2099-0001,RCE,12.0,0.5,false,true,10,open\n'
    )
    response = client.post('/api/vulnerabilities/import', files=csv_upload('v.csv', bad_cvss))
    assert response.status_code == 422
    assert 'cvss_score' in response.json()['detail']

    bad_epss = (
        'asset_id,cve_id,title,cvss_score,epss_score,is_kev,patch_available,patch_age_days,status\n'
        'A-001,CVE-2099-0002,RCE,7.5,1.5,false,true,10,open\n'
    )
    response = client.post('/api/vulnerabilities/import', files=csv_upload('v.csv', bad_epss))
    assert response.status_code == 422
    assert 'epss_score' in response.json()['detail']


def test_invalid_cve_id_format_rejected(client):
    client.post('/api/assets/import-csv', files=csv_upload('a.csv', ASSET_CSV_MINIMAL))
    bad = (
        'asset_id,cve_id,title,cvss_score,epss_score,is_kev,patch_available,patch_age_days,status\n'
        'A-001,not-a-cve,RCE,8.0,0.5,false,true,10,open\n'
    )
    response = client.post('/api/vulnerabilities/import', files=csv_upload('v.csv', bad))
    assert response.status_code == 422
    assert 'cve_id' in response.json()['detail']


def test_invalid_status_and_boolean_rejected(client):
    client.post('/api/assets/import-csv', files=csv_upload('a.csv', ASSET_CSV_MINIMAL))
    bad_status = (
        'asset_id,cve_id,title,cvss_score,epss_score,is_kev,patch_available,patch_age_days,status\n'
        'A-001,CVE-2099-0001,RCE,8.0,0.5,false,true,10,exploded\n'
    )
    response = client.post('/api/vulnerabilities/import', files=csv_upload('v.csv', bad_status))
    assert response.status_code == 422
    assert 'status' in response.json()['detail']

    bad_bool = (
        'asset_id,cve_id,title,cvss_score,epss_score,is_kev,patch_available,patch_age_days,status\n'
        'A-001,CVE-2099-0002,RCE,8.0,0.5,maybe,true,10,open\n'
    )
    response = client.post('/api/vulnerabilities/import', files=csv_upload('v.csv', bad_bool))
    assert response.status_code == 422
    assert 'boolean' in response.json()['detail']


def test_vulnerability_for_unknown_asset_rejected(client):
    bad = (
        'asset_id,cve_id,title,cvss_score,epss_score,is_kev,patch_available,patch_age_days,status\n'
        'A-999,CVE-2099-0001,RCE,8.0,0.5,false,true,10,open\n'
    )
    response = client.post('/api/vulnerabilities/import', files=csv_upload('v.csv', bad))
    assert response.status_code == 422
    assert 'unknown asset_id' in response.json()['detail']


def test_control_effectiveness_ordering_rejected(client):
    bad = (
        'control_key,control_name,category,coverage,implementation_status,eff_low,eff_likely,eff_high,annual_cost\n'
        'mfa,Multi-Factor Authentication,identity,0.3,partial,0.5,0.3,0.35,500000\n'
    )
    response = client.post('/api/controls/import', files=csv_upload('c.csv', bad))
    assert response.status_code == 422
    assert 'eff_low' in response.json()['detail']


def test_wrong_column_count_line_rejected(client):
    bad = ASSET_CSV_MINIMAL.replace(
        '10,Restricted,true,10,9,9\n', '10,Restricted,true,10,9\n'
    )
    response = client.post('/api/assets/import-csv', files=csv_upload('a.csv', bad))
    assert response.status_code == 422
    assert 'expected 12 fields' in response.json()['detail']


def test_oversized_file_rejected_with_413(client):
    # one valid row inflated to > 2 MB
    huge_row = ('A-001,' + 'x' * 2_200_000 + ',Database,Production,IT Ops,Payments,10,Restricted,true,10,9,9\n')
    huge_csv = ASSET_CSV_MINIMAL.split('\n')[0] + '\n' + huge_row
    response = client.post('/api/assets/import-csv', files=csv_upload('a.csv', huge_csv))
    assert response.status_code == 413


def test_too_many_rows_rejected(client):
    header = ASSET_CSV_MINIMAL.split('\n')[0]
    rows = '\n'.join(f'A-{i:03d},Asset {i},Server,Production,IT,IT,5,Internal,false,5,5,5' for i in range(1, 5003))
    response = client.post('/api/assets/import-csv', files=csv_upload('a.csv', header + '\n' + rows + '\n'))
    assert response.status_code == 422
    assert '5,000' in response.json()['detail'] or '5000' in response.json()['detail']
