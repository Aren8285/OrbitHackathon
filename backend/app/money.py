"""Integer-only INR storage, including direct ORM writes."""
from decimal import Decimal, InvalidOperation

from sqlalchemy import BigInteger
from sqlalchemy.types import TypeDecorator


class INR(TypeDecorator):
    impl = BigInteger
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        try:
            amount = Decimal(str(value))
            if not amount.is_finite() or amount != amount.to_integral_value() or not 0 <= amount <= 2**63 - 1:
                raise ValueError('Money must be non-negative integer INR')
            return int(amount)
        except InvalidOperation as exc:
            raise ValueError('Money must be non-negative integer INR') from exc
