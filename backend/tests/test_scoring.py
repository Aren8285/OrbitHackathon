"""Unit tests for every scoring formula in coder.md, including must-pass cases."""

import math

from app.services.scoring import (
    combined_controls,
    compute_criticality,
    compute_exposure,
    compute_priority,
    compute_technical_risk,
    data_sensitivity_score,
    financial_impact_score,
    patch_age_score,
    residual_risk,
    scale_tento,
)

INR_CRORE = 10_000_000


# ---------------------------------------------------------------- criticality

def test_payment_processing_database_criticality_is_096():
    """Must-pass (coder.md): A-001 FinPay Payment DB -> 0.96.
    revenue 10, Restricted, operational 9, compliance 9."""
    criticality = compute_criticality(10, 'Restricted', 9, 9)
    assert math.isclose(criticality, 0.96, abs_tol=1e-9)


def test_criticality_uses_documented_weights():
    # revenue 1-10 scale contributes 0.35 * value/10, etc.
    assert math.isclose(compute_criticality(10, 'Internal', 1, 1), 0.35 + 0.25 * 0.4 + 0.2 * 0.1 + 0.2 * 0.1)
    lowest = compute_criticality(1, 'Public', 1, 1)
    assert math.isclose(lowest, 0.35 * 0.1 + 0.25 * 0.1 + 0.2 * 0.1 + 0.2 * 0.1)
    assert 0 < lowest <= 1


def test_data_sensitivity_mapping_is_documented_and_case_insensitive():
    assert data_sensitivity_score('Restricted') == 1.0
    assert data_sensitivity_score('CONFIDENTIAL') == 0.7
    assert data_sensitivity_score('internal') == 0.4
    assert data_sensitivity_score('public') == 0.1
    assert data_sensitivity_score('Something-New') == 0.4  # unknown -> Internal -> 0.4


# ---------------------------------------------------------------- exposure

def test_exposure_payment_db_cve():
    """A-001 row: internet, KEV, EPSS 0.82, patch age 45 (45/90 = 0.5)."""
    exposure = compute_exposure(True, True, 0.82, 45)
    assert math.isclose(exposure, 0.35 + 0.25 + 0.2 * 0.82 + 0.2 * 0.5)


def test_patch_age_caps_at_ninety_days():
    assert math.isclose(patch_age_score(90), 1.0)
    assert math.isclose(patch_age_score(120), 1.0)
    assert math.isclose(patch_age_score(45), 0.5)
    assert patch_age_score(0) == 0.0
    assert patch_age_score(-5) == 0.0


def test_exposure_bounds_for_extreme_inputs():
    assert compute_exposure(False, False, 0.0, 0) == 0.0
    assert math.isclose(compute_exposure(True, True, 1.0, 120), 1.0)
    # never negative even with junk
    assert compute_exposure(False, False, -2, -100) == 0.0


# ---------------------------------------------------------------- technical risk

def test_technical_risk_payment_db_rce():
    # CVE-2099-0001 on A-001: CVSS 9.8, exposure 0.864, criticality 0.96
    technical = compute_technical_risk(9.8, 0.864, 0.96)
    assert math.isclose(technical, 0.4 * 0.98 + 0.3 * 0.864 + 0.3 * 0.96)


def test_technical_risk_scales_cvss_by_ten():
    assert math.isclose(compute_technical_risk(10, 1.0, 1.0), 1.0)
    assert compute_technical_risk(20, 1.5, 2.0) <= 1.0  # clamped inputs


# ---------------------------------------------------------------- priority

def test_priority_payment_db_rce():
    # KEV 1, EPSS 0.82, internet 1, criticality 0.96, financial 0.96 (9.6M / 1 crore)
    priority = compute_priority(True, 0.82, True, 0.96, 0.96)
    assert math.isclose(priority, 0.3 + 0.2 * 0.82 + 0.2 + 0.15 * 0.96 + 0.15 * 0.96)


def test_priority_bounds_and_missing_financial():
    # no financial impact passed -> that leg contributes 0, never fabricated
    assert math.isclose(compute_priority(False, 0.0, False, 0.5, None), 0.15 * 0.5)
    flat = compute_priority(False, 0.0, False, 0.0, 0.0)
    assert flat == 0.0


def test_financial_impact_normalizes_by_reference():
    assert financial_impact_score(2 * INR_CRORE) == 1.0
    assert math.isclose(financial_impact_score(0.24 * INR_CRORE), 0.24)
    assert financial_impact_score(-500) == 0.0
    assert financial_impact_score(None) == 0.0


def test_scale_tento():
    assert math.isclose(scale_tento(10), 1.0)
    assert math.isclose(scale_tento(5), 0.5)
    assert scale_tento(0) == 0.0
    assert scale_tento('junk') == 0.4  # unknown 1-10 input -> Internal default


# ---------------------------------------------------------------- controls & residual (must-pass checks)

def test_combined_controls_three_layers():
    # 1 - (1-0.30)(1-0.20)(1-0.25) = 1 - 0.42 = 0.58
    combined = combined_controls([0.30, 0.20, 0.25])
    assert math.isclose(combined, 0.58, abs_tol=1e-9)


def test_combined_controls_never_exceeds_one():
    assert combined_controls([1.0, 1.0, 1.0]) == 1.0
    assert combined_controls([]) == 0.0


def test_residual_risk_two_crore_inherent_is_84_lakh():
    # Must-pass (coder.md): 2 crore inherent with 0.58 combined -> 84 lakh residual.
    residual = residual_risk(2 * INR_CRORE, 0.58)
    assert math.isclose(residual, 8_400_000, abs_tol=1e-3)
    assert math.isclose(round(residual), 8_400_000)
