from typing import Dict


def get_kev_status(cve_id: str, kev_index: Dict[str, bool] | None = None) -> bool:
    if kev_index is None:
        return False
    return bool(kev_index.get(cve_id))


def get_epss_score(cve_id: str, epss_map: Dict[str, float] | None = None) -> float:
    if epss_map is None:
        return 0.0
    return float(epss_map.get(cve_id, 0.0))
