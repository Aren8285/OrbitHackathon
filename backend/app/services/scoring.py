from typing import Dict


def compute_criticality(asset: Dict) -> float:
    return float(asset.get('criticality', 1) * 10)


def compute_exposure(asset: Dict) -> float:
    return float(asset.get('exposure', 0.0))


def compute_technical_risk(vulnerability: Dict, asset: Dict) -> float:
    cvss = float(vulnerability.get('cvss', 0.0))
    epss = float(vulnerability.get('epss', 0.0))
    kev_boost = 0.2 if vulnerability.get('kev') else 0.0
    return (cvss * 0.7 + epss * 100 * 0.3) * (1 + kev_boost)


def compute_priority(asset: Dict, vulnerability: Dict) -> float:
    criticality = compute_criticality(asset)
    technical_risk = compute_technical_risk(vulnerability, asset)
    return criticality * 0.6 + technical_risk * 0.4
