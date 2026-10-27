from app.services.monte_carlo import simulate_loss


def test_simulate_loss_returns_numeric_value():
    result = simulate_loss([10000, 25000, 50000], iterations=250)
    assert isinstance(result, float)
    assert result > 0
