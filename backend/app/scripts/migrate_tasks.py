"""Preserve existing task rows while replacing the old one-task-per-control key.

Run with the API stopped: python -m app.scripts.migrate_tasks
SQLite only. A full database backup is saved before the task table is rebuilt.
"""
from datetime import datetime, timezone
from pathlib import Path
import sqlite3

from sqlalchemy import inspect, select

from app import models
from app.database import engine


def main():
    if engine.dialect.name != 'sqlite' or not engine.url.database or engine.url.database == ':memory:':
        raise ValueError('This migration requires a file-backed SQLite database')
    constraints = inspect(engine).get_unique_constraints('remediation_tasks')
    if any(set(item['column_names']) == {'company_id', 'control_key', 'asset_id', 'vulnerability_id'} for item in constraints):
        print('Task identity is already current; no changes made.')
        return
    path = Path(engine.url.database).resolve()
    backup = path.with_name(path.stem + '.pre-calculation-' + datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f') + '.db')
    with sqlite3.connect('file:' + path.as_posix() + '?mode=ro', uri=True) as source, sqlite3.connect(backup) as destination:
        source.backup(destination)
    table = models.RemediationTask.__table__
    with engine.begin() as connection:
        rows = [dict(row) for row in connection.execute(select(table)).mappings()]
        table.drop(connection)
        table.create(connection)
        if rows:
            connection.execute(table.insert(), rows)
    print(f'Task table upgraded; preserved {len(rows)} rows. Backup: {backup.name}')


if __name__ == '__main__':
    main()
