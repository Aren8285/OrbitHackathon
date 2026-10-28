"""Fictional FinPay planning assumptions, not measured losses or actuarial data.

Frequency is events/year, compromise probability is 0–1, and all four cost
components are integer INR per incident. Low/likely/high are ordered triples.
"""
from sqlalchemy import select

from app import models
from app.services.csv_import import ImportReport


SCENARIO_CONTROLS = {
    'ransomware': ['edr', 'patching', 'backups', 'segmentation', 'vuln_mgmt', 'siem'],
    'pii_breach': ['db_encryption', 'dlp', 'mfa', 'siem'],
    'phishing': ['mfa', 'email_security', 'training'],
    'web_compromise': ['waf', 'patching', 'vuln_mgmt'],
    'cloud_exposure': ['cspm', 'mfa'],
    'ddos': ['ddos'],
}

# Broad planning ranges for a fictional mid-size Indian payment company.
DEMO_SCENARIOS = {
    'ransomware': dict(
        name='Ransomware on payment infrastructure', asset_id='A-001',
        frequency=(0.2, 0.8, 2.0), compromise_probability=(0.15, 0.40, 0.75),
        downtime_cost=(2_000_000, 8_000_000, 30_000_000),
        recovery_cost=(1_000_000, 4_000_000, 12_000_000),
        regulatory_cost=(0, 2_000_000, 15_000_000),
        reputation_cost=(500_000, 5_000_000, 20_000_000)),
    'pii_breach': dict(
        name='Customer PII breach', asset_id='A-002',
        frequency=(0.1, 0.4, 1.2), compromise_probability=(0.10, 0.30, 0.65),
        downtime_cost=(200_000, 1_000_000, 4_000_000),
        recovery_cost=(1_000_000, 5_000_000, 15_000_000),
        regulatory_cost=(500_000, 10_000_000, 50_000_000),
        reputation_cost=(2_000_000, 15_000_000, 60_000_000)),
    'phishing': dict(
        name='Phishing account takeover', asset_id='A-009',
        frequency=(2.0, 6.0, 15.0), compromise_probability=(0.05, 0.15, 0.40),
        downtime_cost=(50_000, 200_000, 1_000_000),
        recovery_cost=(100_000, 500_000, 2_000_000),
        regulatory_cost=(0, 200_000, 2_000_000),
        reputation_cost=(50_000, 500_000, 3_000_000)),
    'web_compromise': dict(
        name='Public web app compromise', asset_id='A-003',
        frequency=(0.5, 2.0, 6.0), compromise_probability=(0.10, 0.25, 0.60),
        downtime_cost=(300_000, 2_000_000, 8_000_000),
        recovery_cost=(500_000, 2_000_000, 7_000_000),
        regulatory_cost=(0, 1_000_000, 10_000_000),
        reputation_cost=(200_000, 3_000_000, 15_000_000)),
    'cloud_exposure': dict(
        name='Cloud storage exposure', asset_id='A-007',
        frequency=(0.2, 0.7, 2.0), compromise_probability=(0.10, 0.35, 0.70),
        downtime_cost=(0, 200_000, 1_000_000),
        recovery_cost=(200_000, 1_000_000, 4_000_000),
        regulatory_cost=(0, 3_000_000, 20_000_000),
        reputation_cost=(500_000, 5_000_000, 25_000_000)),
    'ddos': dict(
        name='DDoS outage', asset_id='A-003',
        frequency=(1.0, 4.0, 12.0), compromise_probability=(0.10, 0.30, 0.70),
        downtime_cost=(500_000, 3_000_000, 15_000_000),
        recovery_cost=(100_000, 500_000, 2_000_000),
        regulatory_cost=(0, 100_000, 1_000_000),
        reputation_cost=(100_000, 1_000_000, 5_000_000)),
}


def seed_scenarios(db, commit=True):
    report = ImportReport(dataset='risk_scenarios', rows_read=len(DEMO_SCENARIOS))
    available = set(db.scalars(select(models.Control.control_key)).all())
    required = {key for keys in SCENARIO_CONTROLS.values() for key in keys}
    if not required <= available:
        raise ValueError('Scenario controls are missing from the imported catalog')
    for key, config in DEMO_SCENARIOS.items():
        row = db.scalar(select(models.RiskScenario).where(models.RiskScenario.scenario_key == key))
        if row is None:
            row = models.RiskScenario(scenario_key=key)
            db.add(row)
            report.created += 1
        else:
            report.updated += 1
        row.name = config['name']
        row.asset_id = config['asset_id']
        row.assumptions_note = (
            'Fictional editable demo planning assumptions, not measured losses or '
            'legal penalty estimates. Costs are INR per incident; frequency is '
            'events/year; compromise probability is unitless (0-1).'
        )
        row.applicable_control_keys = list(SCENARIO_CONTROLS[key])
        for field in ('frequency', 'compromise_probability', 'downtime_cost',
                      'recovery_cost', 'regulatory_cost', 'reputation_cost'):
            for level, value in zip(('low', 'likely', 'high'), config[field]):
                setattr(row, f'{field}_{level}', value)
    db.commit() if commit else db.flush()
    return report
