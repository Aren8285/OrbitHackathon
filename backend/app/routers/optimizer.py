from fastapi import APIRouter

router = APIRouter()


@router.get('/recommendations')
def optimizer_recommendations():
    return {
        'budget': 500000,
        'recommended_controls': [],
        'expected_reduction': 0.0,
    }
