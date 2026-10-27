from fastapi import APIRouter

router = APIRouter()


@router.get('/summary')
def ai_summary():
    return {'summary': 'AI prioritization is ready to generate insights.'}
