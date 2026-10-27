"""Validated CSV import for assets, vulnerabilities and controls.

Security rules (security.md):
- .csv only, max 2 MB (enforced in router), max 5,000 rows.
- Every column is validated with Pydantic before touching the database.
- Cell contents are never executed; bad files are rejected with a clear error.
- Imports are idempotent: rows are matched by their external keys so a
  repeated seed does not create duplicate records or asset-CVE findings.
"""

import csv
import io
import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

from pydantic import BaseModel, ConfigDict, Field, field_validator, BeforeValidator, model_validator, ValidationError
from typing_extensions import Annotated

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models

MAX_IMPORT_ROWS = 5000

ASSET_COLUMNS = [
    'asset_id', 'asset_name', 'asset_type', 'environment', 'owner', 'business_unit',
    'criticality', 'data_classification', 'internet_facing', 'revenue_dependency',
    'operational_impact', 'compliance_impact',
]
VULNERABILITY_COLUMNS = [
    'asset_id', 'cve_id', 'title', 'cvss_score', 'epss_score', 'is_kev',
    'patch_available', 'patch_age_days', 'status',
]
CONTROL_COLUMNS = [
    'control_key', 'control_name', 'category', 'coverage', 'implementation_status',
    'eff_low', 'eff_likely', 'eff_high', 'annual_cost',
]


def _to_bool(value) -> bool:
    if isinstance(value, bool):
        return value
    text = str(value).strip().lower()
    if text in {'true', '1', 'yes', 'y'}:
        return True
    if text in {'false', '0', 'no', 'n', ''}:
        return False
    raise ValueError(f"'{text}' is not a boolean")


def _to_optional_str(value) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _to_int(value) -> int:
    text = str(value).strip()
    if text == '':
        raise ValueError('value is required')
    return int(float(text)) if re.match(r'^-?\d+(\.\d+)?$', text) else int(text)


def _to_float(value) -> float:
    text = str(value).strip()
    if text == '':
        raise ValueError('value is required')
    return float(text)


Booleans = Annotated[bool, BeforeValidator(_to_bool)]
OptionalString = Annotated[Optional[str], BeforeValidator(_to_optional_str)]
IntField = Annotated[int, BeforeValidator(_to_float)]
FloatField = Annotated[float, BeforeValidator(_to_float)]


class AssetRow(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    asset_id: str
    asset_name: str = Field(min_length=1, max_length=255)
    asset_type: str = Field(min_length=1, max_length=100)
    environment: str = Field('Production', min_length=1, max_length=50)
    owner: OptionalString = None
    business_unit: OptionalString = None
    criticality: IntField  # 1-10
    data_classification: str = Field('Internal', min_length=1, max_length=50)
    internet_facing: Booleans
    revenue_dependency: IntField = 1
    operational_impact: IntField = 1
    compliance_impact: IntField = 1

    @field_validator('asset_id')
    @classmethod
    def check_asset_id(cls, value: str) -> str:
        check_asset_id(value)
        return value

    @field_validator('criticality')
    @classmethod
    def check_criticality(cls, value: int) -> int:
        if not 1 <= value <= 10:
            raise ValueError('criticality must be between 1 and 10')
        return value

    @field_validator('revenue_dependency', 'operational_impact', 'compliance_impact')
    @classmethod
    def check_impact(cls, value: int) -> int:
        if not 1 <= value <= 10:
            raise ValueError('impact fields must be between 1 and 10')
        return value


class VulnerabilityRow(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    asset_id: str
    cve_id: str = Field(min_length=9, max_length=50)
    title: str = Field(min_length=1, max_length=255)
    cvss_score: FloatField  # 0-10
    epss_score: FloatField  # 0-1
    is_kev: Booleans = False
    patch_available: Booleans = True
    patch_age_days: IntField = 0
    status: str = 'open'

    @field_validator('asset_id')
    @classmethod
    def check_asset_id(cls, value: str) -> str:
        check_asset_id(value)
        return value

    @field_validator('cve_id')
    @classmethod
    def check_cve_id(cls, value: str) -> str:
        check_vendor_cve(value)
        return value.upper()

    @field_validator('cvss_score')
    @classmethod
    def check_cvss(cls, value: float) -> float:
        if not 0.0 <= value <= 10.0:
            raise ValueError('cvss_score must be between 0.0 and 10.0')
        return value

    @field_validator('epss_score')
    @classmethod
    def check_epss(cls, value: float) -> float:
        if not 0.0 <= value <= 1.0:
            raise ValueError('epss_score must be between 0.0 and 1.0')
        return value

    @field_validator('patch_age_days')
    @classmethod
    def check_patch_age(cls, value: int) -> int:
        if value < 0:
            raise ValueError('patch_age_days cannot be negative')
        return value

    @field_validator('status')
    @classmethod
    def check_status(cls, value: str) -> str:
        allowed = {'open', 'accepted', 'mitigated', 'false_positive'}
        if value not in allowed:
            raise ValueError(f'status must be one of {sorted(allowed)}')
        return value


class ControlRow(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    control_key: str = Field(min_length=1, max_length=100)
    control_name: str = Field(min_length=1, max_length=255)
    category: str = Field('technical', min_length=1, max_length=100)
    coverage: FloatField = 0.0  # 0-1
    implementation_status: str = Field('none', min_length=1, max_length=50)
    eff_low: FloatField = 0.0
    eff_likely: FloatField = 0.0
    eff_high: FloatField = 0.0
    annual_cost: IntField = 0

    @field_validator('control_key')
    @classmethod
    def check_key(cls, value: str) -> str:
        if not re.match(r'^[a-z0-9_]{1,100}$', value):
            raise ValueError('control_key must be snake_case (letters, digits, underscores)')
        return value

    @field_validator('coverage', 'eff_low', 'eff_likely', 'eff_high')
    @classmethod
    def check_unit_interval(cls, value: float) -> float:
        if not 0.0 <= value <= 1.0:
            raise ValueError('effectiveness and coverage values must be between 0.0 and 1.0')
        return value

    @field_validator('annual_cost')
    @classmethod
    def check_cost(cls, value: int) -> int:
        if value < 0:
            raise ValueError('annual_cost cannot be negative')
        return value

    @model_validator(mode='after')
    def check_effectiveness_range(self):
        if not (self.eff_low <= self.eff_likely <= self.eff_high):
            raise ValueError('eff_low must be <= eff_likely <= eff_high')
        return self


def check_asset_id(value: str) -> None:
    if not re.match(r'^[A-Za-z][A-Za-z0-9._-]{0,49}$', value):
        raise ValueError('asset_id must start with a letter and use only letters, digits, . _ - (max 50 chars)')


def check_vendor_cve(value: str) -> None:
    if not re.match(r'^CVE-\d{4}-\d{4,7}$', value):
        raise ValueError('cve_id must look like CVE-YYYY-NNNN (e.g. CVE-2024-1234)')


@dataclass
class ParsedCSV:
    dataset: str
    columns: List[str]
    rows: List[Dict[str, str]]


@dataclass
class ImportError_:
    row_number: int
    field: str
    message: str


@dataclass
class ImportReport:
    dataset: str
    rows_read: int
    created: int = 0
    updated: int = 0
    skipped: int = 0
    errors: List[ImportError_] = field(default_factory=list)


def parse_csv_bytes(content: bytes, dataset: str, columns: List[str], max_rows: int = MAX_IMPORT_ROWS) -> ParsedCSV:
    """Decode and structurally validate an uploaded CSV before row validation."""
    try:
        text = content.decode('utf-8-sig')
    except UnicodeDecodeError as exc:
        raise CSVFileRejected(f'File is not valid UTF-8 encoded CSV: {exc}') from exc

    if not text.strip():
        raise CSVFileRejected('File is empty')

    reader = csv.reader(io.StringIO(text, newline=''))
    try:
        header = next(reader)
    except StopIteration:
        raise CSVFileRejected('File is empty') from None

    header = [column.strip().lstrip('\ufeff') for column in header]
    if header != columns:
        raise CSVFileRejected(
            f'Wrong header for {dataset} import. Expected: {",".join(columns)}. Found: {",".join(header)}'
        )

    rows: List[Dict[str, str]] = []
    for row_number, values in enumerate(reader, start=2):
        if not any(v.strip() for v in values):
            continue  # skip fully blank lines
        if len(values) != len(columns):
            raise CSVFileRejected(f'Line {row_number}: expected {len(columns)} fields, found {len(values)}')
        rows.append(dict(zip(columns, values)))
        if len(rows) > max_rows:
            raise CSVFileRejected(f'File exceeds the maximum of {max_rows} data rows')
    if not rows:
        raise CSVFileRejected('File has no data rows')

    return ParsedCSV(dataset=dataset, columns=columns, rows=rows)


class CSVFileRejected(Exception):
    """Raised when a file is structurally invalid (encoding, header, shape)."""


def validate_rows(rows: List[Dict[str, str]], row_model: type) -> Tuple[List[BaseModel], List[ImportError_]]:
    validated: List[BaseModel] = []
    errors: List[ImportError_] = []
    for index, row in enumerate(rows, start=1):
        try:
            validated.append(row_model.model_validate(row))
        except ValidationError as exc:
            for issue in exc.errors():
                field_name = '.'.join(str(part) for part in issue['loc'])
                raw = issue.get('input')
                raw = f' (got: {raw})' if raw else ''
                errors.append(ImportError_(row_number=index, field=field_name or 'row', message=f'{issue["msg"]}{raw}'))
    return validated, errors


def reject_errors(dataset: str, errors: List[ImportError_]) -> None:
    if errors:
        digits = ', '.join(
            f"line {e.row_number + 1} field '{e.field}': {e.message}" for e in errors[:10]
        )
        more = f' (+ {len(errors) - 10} more)' if len(errors) > 10 else ''
        raise CSVFileRejected(f'{dataset} import rejected: {digits}{more}')


def import_assets(db: Session, content: bytes, commit: bool = True) -> ImportReport:
    parsed = parse_csv_bytes(content, 'assets', ASSET_COLUMNS)
    report = ImportReport(dataset='assets', rows_read=len(parsed.rows))
    validated_rows, errors = validate_rows(parsed.rows, AssetRow)
    reject_errors('assets', errors)

    existing: Dict[str, models.Asset] = {
        asset.asset_id: asset
        for asset in db.scalars(select(models.Asset).where(models.Asset.asset_id.in_([r.asset_id for r in validated_rows])))
    }

    session_assets: Dict[str, models.Asset] = {}
    for row in validated_rows:
        asset = session_assets.get(row.asset_id)
        if asset is None:
            db_asset = existing.get(row.asset_id)
            if db_asset is None:
                db_asset = models.Asset(asset_id=row.asset_id)
                db.add(db_asset)
                report.created += 1
                existing[row.asset_id] = db_asset
            else:
                report.updated += 1
            session_assets[row.asset_id] = db_asset
            asset = db_asset
        else:
            # same external id appears twice in one file: update in place
            report.updated += 1
        for column in ASSET_COLUMNS:
            setattr(asset, column, getattr(row, column))
    db.commit() if commit else db.flush()
    return report


def import_vulnerabilities(db: Session, content: bytes, commit: bool = True) -> ImportReport:
    parsed = parse_csv_bytes(content, 'vulnerabilities', VULNERABILITY_COLUMNS)
    report = ImportReport(dataset='vulnerabilities', rows_read=len(parsed.rows))
    validated_rows, errors = validate_rows(parsed.rows, VulnerabilityRow)
    reject_errors('vulnerabilities', errors)

    asset_ids = sorted({row.asset_id for row in validated_rows})
    asset_map: Dict[str, models.Asset] = {
        asset.asset_id: asset
        for asset in db.scalars(select(models.Asset).where(models.Asset.asset_id.in_(asset_ids)))
    }
    missing = sorted(set(asset_ids) - set(asset_map))
    if missing:
        sample = ', '.join(missing[:5])
        if len(missing) > 5:
            sample += f' (+ {len(missing) - 5} more)'
        raise CSVFileRejected(
            f'vulnerabilities import rejected: unknown asset_id {sample}. Import assets first.'
        )

    pairs = sorted((r.asset_id, r.cve_id) for r in validated_rows)
    asset_row_ids = [row.id for row in asset_map.values()]
    existing_vulns: Dict[Tuple[int, str], models.Vulnerability] = {}
    if asset_row_ids:
        db_vulns = db.scalars(select(models.Vulnerability).where(models.Vulnerability.asset_row_id.in_(asset_row_ids)))
        for vuln in db_vulns:
            if (vuln.asset.asset_id, vuln.cve_id) in set(pairs):
                existing_vulns[(vuln.asset.asset_id, vuln.cve_id)] = vuln

    seen: set = set()
    for row in validated_rows:
        key = (row.asset_id, row.cve_id)
        if key in seen:
            report.skipped += 1  # duplicate line inside the same file
            continue
        seen.add(key)
        vuln = existing_vulns.get(key)
        if vuln is None:
            vuln = models.Vulnerability(asset_row_id=asset_map[row.asset_id].id, cve_id=row.cve_id)
            db.add(vuln)
            report.created += 1
        else:
            report.updated += 1
        for column in ('title', 'cvss_score', 'epss_score', 'is_kev', 'patch_available', 'patch_age_days', 'status'):
            setattr(vuln, column, getattr(row, column))
    db.commit() if commit else db.flush()
    return report


def import_controls(db: Session, content: bytes, commit: bool = True) -> ImportReport:
    parsed = parse_csv_bytes(content, 'controls', CONTROL_COLUMNS)
    report = ImportReport(dataset='controls', rows_read=len(parsed.rows))
    validated_rows, errors = validate_rows(parsed.rows, ControlRow)
    reject_errors('controls', errors)

    existing: Dict[str, models.Control] = {
        control.control_key: control
        for control in db.scalars(select(models.Control).where(models.Control.control_key.in_([r.control_key for r in validated_rows])))
    }
    for row in validated_rows:
        control = existing.get(row.control_key)
        if control is None:
            control = models.Control(control_key=row.control_key)
            db.add(control)
            report.created += 1
        else:
            report.updated += 1
        for column in CONTROL_COLUMNS:
            setattr(control, column, getattr(row, column))
    db.commit() if commit else db.flush()
    return report
