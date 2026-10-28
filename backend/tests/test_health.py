"""Health endpoint, importer validation and import endpoint behaviour."""


def test_health_returns_ok(client):
    response = client.get('/health')
    assert response.status_code == 200
    body = response.json()
    assert body['status'] == 'ok'
    assert body['database'] == 'connected'
    assert body['version'] == '0.2.0'


def test_asset_roundtrip_via_import_endpoint(client):
    assets_csv = (
        'asset_id,asset_name,asset_type,environment,owner,business_unit,criticality,'
        'data_classification,internet_facing,revenue_dependency,operational_impact,compliance_impact\n'
        'A-001,Payment Processing Database,Database,Production,IT Ops,Payments,10,Restricted,true,10,9,9\n'
        'A-002,Customer PII Database,Database,Production,IT Ops,Customer Success,9,Restricted,false,8,8,10\n'
    )
    response = client.post('/api/assets/import-csv', files={'file': ('assets.csv', assets_csv.encode(), 'text/csv')})
    assert response.status_code == 200, response.text
    assert response.json()['created'] == 2

    listing = client.get('/api/assets').json()
    assert len(listing) == 2
    a1 = next(a for a in listing if a['asset_id'] == 'A-001')
    assert a1['asset_name'] == 'Payment Processing Database'
    assert a1['criticality'] == 10
    assert a1['internet_facing'] is True

    single = client.get('/api/assets/A-001')
    assert single.status_code == 200
    assert single.json()['business_unit'] == 'Payments'


def test_vulnerabilities_link_to_assets_by_external_id(client):
    assets_csv = (
        'asset_id,asset_name,asset_type,environment,owner,business_unit,criticality,'
        'data_classification,internet_facing,revenue_dependency,operational_impact,compliance_impact\n'
        'A-001,Payment DB,Database,Production,IT Ops,Payments,10,Restricted,true,10,9,9\n'
        'A-002,PII DB,Database,Production,IT Ops,CS,9,Restricted,false,8,8,10\n'
    )
    client.post('/api/assets/import-csv', files={'file': ('a.csv', assets_csv.encode(), 'text/csv')})

    vulns_csv = (
        'asset_id,cve_id,title,cvss_score,epss_score,is_kev,patch_available,patch_age_days,status\n'
        'A-001,CVE-2099-0001,RCE in database service,9.8,0.82,true,true,45,open\n'
        'A-002,CVE-2099-0001,RCE in database service,9.8,0.82,true,true,45,open\n'
    )
    response = client.post(
        '/api/vulnerabilities/import', files={'file': ('v.csv', vulns_csv.encode(), 'text/csv')}
    )
    assert response.status_code == 200, response.text
    assert response.json()['created'] == 2

    listing = client.get('/api/vulnerabilities').json()
    assert len(listing) == 2  # same CVE on two different assets is allowed
    assert {v['asset_id'] for v in listing} == {'A-001', 'A-002'}
    assert all(v['cve_id'] == 'CVE-2099-0001' for v in listing)

    assert client.get('/health').json()['vulnerabilities'] == 2


def test_reimport_does_not_duplicate_findings(client):
    assets_csv = (
        'asset_id,asset_name,asset_type,environment,owner,business_unit,criticality,'
        'data_classification,internet_facing,revenue_dependency,operational_impact,compliance_impact\n'
        'A-001,Payment DB,Database,Production,IT Ops,Payments,10,Restricted,true,10,9,9\n'
    )
    vulns_csv = (
        'asset_id,cve_id,title,cvss_score,epss_score,is_kev,patch_available,patch_age_days,status\n'
        'A-001,CVE-2099-0001,RCE in database service,9.8,0.82,true,true,45,open\n'
        'A-001,CVE-2099-0002,Privilege escalation,7.8,0.21,false,true,30,open\n'
    )
    client.post('/api/assets/import-csv', files={'file': ('a.csv', assets_csv.encode(), 'text/csv')})
    first = client.post('/api/vulnerabilities/import', files={'file': ('v.csv', vulns_csv.encode(), 'text/csv')}).json()
    assert first['created'] == 2

    # same file again: upsert, never duplicate
    second = client.post('/api/vulnerabilities/import', files={'file': ('v.csv', vulns_csv.encode(), 'text/csv')}).json()
    assert second['created'] == 0
    assert second['updated'] == 2
    assert client.get('/health').json()['vulnerabilities'] == 2

    # assets too
    second_assets = client.post('/api/assets/import-csv', files={'file': ('a.csv', assets_csv.encode(), 'text/csv')}).json()
    assert second_assets['created'] == 0
    assert second_assets['updated'] == 1
    assert client.get('/health').json()['assets'] == 1


def test_repeat_asset_lines_in_one_file_are_skipped(client):
    assets_csv = (
        'asset_id,asset_name,asset_type,environment,owner,business_unit,criticality,'
        'data_classification,internet_facing,revenue_dependency,operational_impact,compliance_impact\n'
        'A-001,Payment DB,Database,Production,IT Ops,Payments,10,Restricted,true,10,9,9\n'
        'A-001,Payment DB v2,Database,Production,IT Ops,Payments,10,Restricted,true,10,9,9\n'
    )
    response = client.post('/api/assets/import-csv', files={'file': ('a.csv', assets_csv.encode(), 'text/csv')})
    assert response.status_code == 200
    body = response.json()
    # same external id twice: first import wins, later row is an update, not a new asset
    assert body['created'] == 1
    assert client.get('/health').json()['assets'] == 1
    assert client.get('/api/assets/A-001').json()['asset_name'] == 'Payment DB v2'
