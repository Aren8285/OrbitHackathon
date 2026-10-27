from app.services.scoring import compute_priority


def test_compute_priority_ranges():
    asset = {'criticality': 5, 'exposure': 0.8}
    vulnerability = {'cvss': 8.5, 'epss': 0.7, 'kev': True}
    score = compute_priority(asset, vulnerability)
    assert score > 0
    assert score <= 1000
