import random
from typing import Iterable


def simulate_loss(distribution: Iterable[float], iterations: int = 1000) -> float:
    samples = list(distribution)
    if not samples:
        return 0.0
    total = 0.0
    for _ in range(iterations):
        total += random.choice(samples)
    return total / iterations
