"""Cold-seed timing harness (task item 3).

Runs the exact demo-rebuild seeding path (the same functions as
``demo_rebuild.rebuild_demo``) against a brand-new empty SQLite database and
prints the duration of each phase plus the wall-clock total. Phase calls are
wrapped, not reimplemented, so optimizations can be priced by phase; nothing
about the data, iterations, or formulas changes.

Usage (from backend/):
    python scripts/time_seed.py        # fresh temp DB each run, timing table
"""
import os
import sys
import time
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
TEMP_DB = SCRIPTS_DIR / 'tmp_seed_timing.db'

BACKEND_DIR = SCRIPTS_DIR.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


def prepare_fresh_db() -> None:
    for suffix in ('', '-wal', '-shm'):
        path = Path(str(TEMP_DB) + suffix)
        if path.exists():
            path.unlink()
    os.environ['DATABASE_URL'] = f'sqlite:///{TEMP_DB.as_posix()}'


def cleanup(engine) -> None:
    try:
        engine.dispose()
    except Exception:
        pass
    for suffix in ('', '-wal', '-shm'):
        path = Path(str(TEMP_DB) + suffix)
        if path.exists():
            try:
                path.unlink()
            except OSError:
                pass


def main() -> int:
    prepare_fresh_db()

    import app.models  # register every mapped table
    from app.database import Base, SessionLocal, engine
    from app.services import csv_import, remediation_tasks, risk_service

    Base.metadata.create_all(bind=engine)

    timings = []

    def timed(name, fn):
        start = time.perf_counter()
        try:
            result = fn()
        except Exception:
            timings.append((name, time.perf_counter() - start))
            raise
        timings.append((name, time.perf_counter() - start))
        return result

    for attr in ('import_assets', 'import_vulnerabilities', 'import_controls'):
        original = getattr(csv_import, attr)
        setattr(csv_import, attr, (lambda fn, name: lambda *a, **kw: timed(name, lambda: fn(*a, **kw)))(original, f'csv_{attr}'))

    for module, attr, name in [
        (risk_service, 'create_default_assumptions', 'assumptions_defaults'),
        (risk_service, 'calculate', 'scoring_and_simulation'),
        (remediation_tasks, 'seed_tasks', 'remediation_task_seed'),
    ]:
        original = getattr(module, attr)
        setattr(module, attr, (lambda fn, name: lambda *a, **kw: timed(name, lambda: fn(*a, **kw)))(original, name))

    from app.services import demo_scenarios as ds
    original_seed_scenarios = ds.seed_scenarios
    setattr(ds, 'seed_scenarios', lambda *a, **kw: timed('scenario_seed', lambda: original_seed_scenarios(*a, **kw)))

    import app.services.demo_rebuild as dr

    total_start = time.perf_counter()
    try:
        dr.rebuild_demo(SessionLocal())
    finally:
        cleanup(engine)

    total = time.perf_counter() - total_start
    print(f'{"phase":<28}{"seconds":>10}')
    for phase, seconds in sorted(timings, key=lambda item: -item[1]):
        print(f'{phase:<28}{seconds:>10.3f}')
    print(f'{"TOTAL wall-clock":<28}{total:>10.3f}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
