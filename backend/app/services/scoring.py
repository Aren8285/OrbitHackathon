"""Deterministic risk scoring engine.

All formulas come from coder.md and every input is normalized to 0-1 before use.
No formula invents money: financial impact comes only from the editable,
labeled impact assumptions surfaced by the /assumptions endpoints.

Documented normalization rules
------------------------------
- 1-10 inventory scales (revenue_dependency, operational_impact, compliance_impact,
  criticality): value / 10, clamped to [0, 1].
- data_classification -> data sensitivity on the same 1-10 scale:
  Public=2, Internal=5, Confidential=8, Restricted=10, unknown -> Internal(5).
  The mapping is a documented company calibration, not a fabricated number.
- CVSS 0-10 -> score / 10.
- EPSS is already 0-1 and used as-is (clamped).
- internet_facing and KEV are booleans -> 1.0 / 0.0.
- patch age: min(age / 90, 1). Age <= 0 contributes 0.
"""

from typing import Iterable, Optional

INR_PER_LAKH = 100_000
INR_PER_CRORE = 10_000_000

# Editable reference for the financial-impact leg of the priority formula.
# Items labeled as assumptions may store up to this reference; bigger losses
# must be encoded by editing the assumption itself, never invented by code.
IMPACT_REFERENCE_INR = INR_PER_CRORE
# Default assumed full impact for an asset at criticality 1.0 (labelled
# assumption, editable per asset through the /assumptions API).
DEFAULT_FULL_IMPACT_INR = IMPACT_REFERENCE_INR
PATCH_AGE_LOOKAHEAD_DAYS = 90

CRITICALITY_WEIGHTS = {
    'revenue': 0.35,
    'data_sensitivity': 0.25,
    'operational': 0.20,
    'compliance': 0.20,
}
EXPOSURE_WEIGHTS = {
    'internet': 0.35,
    'kev': 0.25,
    'epss': 0.20,
    'patch_age': 0.20,
}
TECHNICAL_RISK_WEIGHTS = {
    'cvss': 0.40,
    'exposure': 0.30,
    'criticality': 0.30,
}
PRIORITY_WEIGHTS = {
    'kev': 0.30,
    'epss': 0.20,
    'internet': 0.20,
    'criticality': 0.15,
    'financial_impact': 0.15,
}

# 1-10 business calibration for data classification levels.
DATA_SENSITIVITY_SCALE = {
    'public': 2,
    'internal': 5,
    'confidential': 8,
    'restricted': 10,
}
UNKNOWN_DATA_SENSITIVITY = DATA_SENSITIVITY_SCALE['internal']


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, float(value)))


def scale_tento(value) -> float:
    """Normalize a 1-10 business scale to 0-1."""
    try:
        number = float(value)
    except (TypeError, ValueError):
        number = UNKNOWN_DATA_SENSITIVITY
    return _clamp01(number / 10.0)


def data_sensitivity_score(data_classification: str) -> float:
    key = (data_classification or '').strip().lower()
    return scale_tento(DATA_SENSITIVITY_SCALE.get(key, UNKNOWN_DATA_SENSITIVITY))


def patch_age_score(patch_age_days) -> float:
    try:
        age = float(patch_age_days)
    except (TypeError, ValueError):
        age = 0.0
    if age <= 0:
        return 0.0
    return _clamp01(age / PATCH_AGE_LOOKAHEAD_DAYS)


def compute_criticality(
    revenue_dependency,
    data_classification,
    operational_impact,
    compliance_impact,
) -> float:
    """0.35 revenue + 0.25 data sensitivity + 0.20 operational + 0.20 compliance."""
    return (
        CRITICALITY_WEIGHTS['revenue'] * scale_tento(revenue_dependency)
        + CRITICALITY_WEIGHTS['data_sensitivity'] * data_sensitivity_score(data_classification)
        + CRITICALITY_WEIGHTS['operational'] * scale_tento(operational_impact)
        + CRITICALITY_WEIGHTS['compliance'] * scale_tento(compliance_impact)
    )


def compute_exposure(
    internet_facing,
    kev,
    epss,
    patch_age_days,
) -> float:
    """0.35 internet + 0.25 KEV + 0.20 EPSS + 0.20 patch age (age/90, max 1)."""
    internet = 1.0 if bool(internet_facing) else 0.0
    kev_flag = 1.0 if bool(kev) else 0.0
    return (
        EXPOSURE_WEIGHTS['internet'] * internet
        + EXPOSURE_WEIGHTS['kev'] * kev_flag
        + EXPOSURE_WEIGHTS['epss'] * _clamp01(epss or 0.0)
        + EXPOSURE_WEIGHTS['patch_age'] * patch_age_score(patch_age_days)
    )


def compute_technical_risk(cvss, exposure, criticality) -> float:
    """0.40 CVSS + 0.30 exposure + 0.30 criticality (all normalized to 0-1)."""
    return (
        TECHNICAL_RISK_WEIGHTS['cvss'] * scale_tento(cvss)
        + TECHNICAL_RISK_WEIGHTS['exposure'] * _clamp01(exposure)
        + TECHNICAL_RISK_WEIGHTS['criticality'] * _clamp01(criticality)
    )


def compute_priority(kev, epss, internet_facing, criticality, financial_impact) -> float:
    """0.30 KEV + 0.20 EPSS + 0.20 internet + 0.15 criticality + 0.15 financial impact."""
    kev_flag = 1.0 if bool(kev) else 0.0
    internet = 1.0 if bool(internet_facing) else 0.0
    return (
        PRIORITY_WEIGHTS['kev'] * kev_flag
        + PRIORITY_WEIGHTS['epss'] * _clamp01(epss or 0.0)
        + PRIORITY_WEIGHTS['internet'] * internet
        + PRIORITY_WEIGHTS['criticality'] * _clamp01(criticality)
        + PRIORITY_WEIGHTS['financial_impact'] * _clamp01(financial_impact or 0.0)
    )


def financial_impact_score(assumed_impact_inr, reference_inr: Optional[int] = None) -> float:
    """Editable-assumption money -> 0-1. No defaults are fabricated here:
    the caller supplies the asset's (editable) assumed impact in integer INR."""
    reference = reference_inr if reference_inr is not None else IMPACT_REFERENCE_INR
    try:
        impact = float(assumed_impact_inr)
    except (TypeError, ValueError):
        return 0.0
    if impact <= 0:
        return 0.0
    return _clamp01(impact / reference)


def combined_controls(effectiveness: Iterable[float]) -> float:
    """1 - (1-e1)(1-e2)... for control effectiveness on 0-1.

    Must-pass check (coder.md): (0.30, 0.20, 0.25) -> 0.58.
    """
    product = 1.0
    for e in effectiveness:
        e = _clamp01(e)
        product *= (1.0 - e)
    return _clamp01(1.0 - product)


def residual_risk(inherent_risk: float, combined_effectiveness: float) -> float:
    """Residual = inherent x (1 - combined). Values may be INR or 0-1 scores;
    the same multiplicative rule applies to both.

    Must-pass check (coder.md): inherent 2 crore with combined 0.58 -> 84 lakh.
    """
    return float(inherent_risk) * (1.0 - _clamp01(combined_effectiveness))


def classify_priority(kev, internet_facing, criticality, priority_score):
    from app.config import PRIORITY_P0_CRITICALITY, PRIORITY_P1_THRESHOLD, PRIORITY_P2_THRESHOLD
    if kev and internet_facing and criticality >= PRIORITY_P0_CRITICALITY:
        return 'P0'
    if priority_score >= PRIORITY_P1_THRESHOLD:
        return 'P1'
    if priority_score >= PRIORITY_P2_THRESHOLD:
        return 'P2'
    return 'P3'
