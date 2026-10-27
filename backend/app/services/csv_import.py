from pathlib import Path
import csv


def import_csv(file_path: str):
    rows = []
    with open(file_path, newline='') as csv_file:
        reader = csv.DictReader(csv_file)
        for row in reader:
            rows.append(row)
    return rows
