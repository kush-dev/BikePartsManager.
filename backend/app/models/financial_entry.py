from datetime import date, datetime
from zoneinfo import ZoneInfo
from decimal import Decimal

from sqlalchemy import Date, DateTime, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class FinancialEntry(Base):
    __tablename__ = "financial_entries"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    entry_type: Mapped[str] = mapped_column(String(30), index=True)  # EXPENSE, OPENING_FLOAT, CASH_IN, CASH_OUT
    category: Mapped[str] = mapped_column(String(80), default="Other")
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    payment_method: Mapped[str] = mapped_column(String(30), default="Cash")
    description: Mapped[str] = mapped_column(Text, default="")
    entry_date: Mapped[date] = mapped_column(Date, default=lambda: datetime.now(ZoneInfo("Africa/Nairobi")).date(), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
