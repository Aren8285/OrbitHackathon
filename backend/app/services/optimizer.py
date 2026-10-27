from typing import Iterable


def greedy_selection(items: Iterable[dict], budget: float):
    selected = []
    remaining = budget
    for item in sorted(items, key=lambda x: x.get('benefit', 0), reverse=True):
        if item.get('cost', 0) <= remaining:
            selected.append(item)
            remaining -= item.get('cost', 0)
    return selected
