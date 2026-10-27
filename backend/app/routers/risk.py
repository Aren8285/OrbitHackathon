from fastapi import APIRouter

router = APIRouter()


@router.get('/summary')
def get_risk_summary():
    return {
        'total_assets': 0,
        'critical_assets': 0,
        'open_vulnerabilities': 0,
        'estimated_loss': 0.0,
    }
