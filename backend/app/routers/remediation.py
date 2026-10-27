from fastapi import APIRouter

router = APIRouter()


@router.get('/plan')
def remediation_plan():
    return {'plan': [], 'total_cost': 0.0}
