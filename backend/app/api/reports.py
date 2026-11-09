from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload
from app.db.session import get_db
from app.models.sale import Sale
from sqlalchemy import select, func
from app.models.financial_entry import FinancialEntry

router = APIRouter(prefix="/api/reports", tags=["financial reports"])
TZ = ZoneInfo("Africa/Nairobi")
CENT = Decimal("0.01")
PAYMENT_METHODS = {"Cash", "M-Pesa", "Card", "Other"}
ENTRY_TYPES = {"EXPENSE", "OPENING_FLOAT", "CASH_IN", "CASH_OUT"}


def cash(value):
    return Decimal(str(value or 0)).quantize(CENT, rounding=ROUND_HALF_UP)


def as_local(dt):
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(TZ)


def boundaries(period: str, start_date: date | None, end_date: date | None):
    today = datetime.now(TZ).date()
    if period == "daily":
        first = last = today
    elif period == "weekly":
        first = today - timedelta(days=today.weekday())
        last = today
    elif period == "monthly":
        first, last = today.replace(day=1), today
    elif period == "yearly":
        first, last = today.replace(month=1, day=1), today
    elif period == "custom":
        if not start_date or not end_date:
            raise HTTPException(status_code=422, detail="Choose both a start date and an end date for a custom report.")
        first, last = start_date, end_date
        if last < first:
            raise HTTPException(status_code=422, detail="End date must be on or after the start date.")
        if (last - first).days > 3660:
            raise HTTPException(status_code=422, detail="Choose a date range of 10 years or less.")
    else:
        raise HTTPException(status_code=422, detail="Period must be daily, weekly, monthly, yearly, or custom.")
    start = datetime.combine(first, time.min, tzinfo=TZ).astimezone(timezone.utc)
    end = datetime.combine(last + timedelta(days=1), time.min, tzinfo=TZ).astimezone(timezone.utc)
    return first, last, start, end


class FinancialEntryCreate(BaseModel):
    entry_date: date | None = None
    entry_type: str
    category: str = Field(min_length=1, max_length=80)
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    payment_method: str = "Cash"
    description: str = Field(default="", max_length=1000)


@router.get("")
def financial_report(
    period: str = Query(default="daily"),
    start_date: date | None = None,
    end_date: date | None = None,
    db: Session = Depends(get_db),
):
    first, last, start, end = boundaries(period, start_date, end_date)
    sales = db.scalars(
        select(Sale).options(selectinload(Sale.items))
        .where(Sale.created_at >= start, Sale.created_at < end)
        .order_by(Sale.created_at.desc())
    ).all()
    entries = db.scalars(
        select(FinancialEntry)
        .where(FinancialEntry.entry_date >= first, FinancialEntry.entry_date <= last)
        .order_by(FinancialEntry.entry_date.desc(), FinancialEntry.created_at.desc())
    ).all()

    monthly_trend = period == "yearly" or (last - first).days > 62
    revenue = Decimal("0.00")
    cogs = Decimal("0.00")
    units = 0
    payment_totals = defaultdict(lambda: Decimal("0.00"))
    product_stats = {}
    trend_totals = defaultdict(lambda: Decimal("0.00"))
    transaction_rows = []

    for sale in sales:
        amount = cash(sale.total_amount)
        revenue += amount
        method = (sale.payment_method or "Other").strip()
        if method not in PAYMENT_METHODS:
            method = "Other"
        payment_totals[method] += amount
        local_dt = as_local(sale.created_at)
        if local_dt:
            trend_key = local_dt.strftime("%Y-%m") if monthly_trend else local_dt.date().isoformat()
            trend_totals[trend_key] += amount

        sale_cogs = Decimal("0.00")
        sale_units = 0
        for item in sale.items:
            quantity = int(item.quantity or 0)
            item_revenue = cash(item.line_total)
            item_cost = cash(Decimal(str(item.unit_cost or 0)) * quantity)
            sale_cogs += item_cost
            cogs += item_cost
            units += quantity
            sale_units += quantity
            key = item.product_id
            stat = product_stats.setdefault(key, {
                "product_id": key, "name": item.product_name, "sku": item.sku,
                "units_sold": 0, "revenue": Decimal("0.00"), "cost": Decimal("0.00")
            })
            stat["units_sold"] += quantity
            stat["revenue"] += item_revenue
            stat["cost"] += item_cost
        transaction_rows.append({
            "id": sale.id,
            "receipt_number": sale.receipt_number,
            "created_at": sale.created_at.isoformat() if sale.created_at else "",
            "payment_method": method,
            "total_amount": float(amount),
            "units_sold": sale_units,
            "gross_profit": float(cash(amount - sale_cogs)),
        })

    expenses = Decimal("0.00")
    cash_out = Decimal("0.00")
    cash_in = Decimal("0.00")
    total_money_out = Decimal("0.00")
    total_money_in = Decimal("0.00")
    opening_float_entries = []
    opening_float = Decimal("0.00")
    expense_rows = []
    for entry in entries:
        amount = cash(entry.amount)
        method = (entry.payment_method or "Cash").strip()
        kind = entry.entry_type.upper()
        if kind == "EXPENSE":
            expenses += amount
            total_money_out += amount
            if method == "Cash":
                cash_out += amount
        elif kind == "CASH_OUT":
            total_money_out += amount
            if method == "Cash":
                cash_out += amount
        elif kind == "CASH_IN":
            total_money_in += amount
            if method == "Cash":
                cash_in += amount
        elif kind == "OPENING_FLOAT" and method == "Cash":
            opening_float_entries.append((entry.entry_date, amount))
        local_dt = as_local(entry.created_at)
        expense_rows.append({
            "id": entry.id,
            "entry_type": kind,
            "category": entry.category,
            "amount": float(amount),
            "payment_method": method,
            "description": entry.description or "",
            "created_at": entry.created_at.isoformat() if entry.created_at else "",
            "local_date": entry.entry_date.isoformat() if entry.entry_date else (local_dt.date().isoformat() if local_dt else ""),
        })

    # For a multi-day report, carry forward only the first recorded opening float
    # in the selected period; subsequent daily floats are not additive cash.
    # For a multi-day report, carry forward only the first recorded opening float
# in the selected period; subsequent daily floats are not additive cash.
        if opening_float_entries:
            first_float_date = min(item[0] for item in opening_float_entries)
            # Include all opening floats recorded within the selected report period.
            opening_float = sum(
                (amount for _, amount in opening_float_entries),
                Decimal("0.00"),
            )

    gross_profit = cash(revenue - cogs)
    net_profit = cash(gross_profit - expenses)
    cash_sales = sum(
        (cash(sale.total_amount) for sale in sales if (sale.payment_method or "").strip() == "Cash"),
        Decimal("0.00"),
    )
    # This figure is the total expected funds across every payment method,
    # not only physical cash in the drawer. Expenses and paid-out entries are
    # deducted regardless of whether they were paid by Cash, M-Pesa, Card, or Other.

    total_expected_cash = cash(revenue + opening_float + total_money_in - total_money_out)
    mpesa_sales = cash(payment_totals["M-Pesa"])
    card_sales = cash(payment_totals["Card"])
    other_sales = cash(payment_totals["Other"])

    # Keep zero-sales days visible. Yearly reports group by calendar month.
    trend = []
    if monthly_trend:
        cursor = first.replace(day=1)
        while cursor <= last:
            key = cursor.strftime("%Y-%m")
            trend.append({"date": key, "label": cursor.strftime("%b"), "revenue": float(cash(trend_totals[key]))})
            if cursor.month == 12:
                cursor = cursor.replace(year=cursor.year + 1, month=1, day=1)
            else:
                cursor = cursor.replace(month=cursor.month + 1, day=1)
    else:
        cursor = first
        while cursor <= last:
            key = cursor.isoformat()
            trend.append({"date": key, "label": cursor.strftime("%d %b"), "revenue": float(cash(trend_totals[key]))})
            cursor += timedelta(days=1)

    top_products = sorted(product_stats.values(), key=lambda row: (row["units_sold"], row["revenue"]), reverse=True)[:10]
    for row in top_products:
        row["gross_profit"] = float(cash(Decimal(str(row["revenue"])) - row["cost"]))
        row["revenue"] = float(cash(row["revenue"]))
        del row["cost"]

    payment_mix = [
        {"method": method, "amount": float(cash(payment_totals[method]))}
        for method in ["Cash", "M-Pesa", "Card", "Other"]
        if payment_totals[method] > 0
    ]

    return {
        "period": period, "start_date": first.isoformat(), "end_date": last.isoformat(),
        "sales_count": len(sales), "revenue": float(cash(revenue)),
        "cost_of_goods_sold": float(cash(cogs)), "gross_profit": float(gross_profit),
        "expenses": float(cash(expenses)), "net_profit": float(net_profit),
        "units_sold": units, "cash_sales": float(cash(cash_sales)),
        "mpesa_sales": float(mpesa_sales), "card_sales": float(card_sales),
        "other_sales": float(other_sales),
        "opening_float": float(cash(opening_float)), "cash_in": float(cash(cash_in)),
        "cash_out": float(cash(cash_out)),
        "total_money_in": float(cash(total_money_in)),
        "total_money_out": float(cash(total_money_out)),
        "total_expected_cash": float(total_expected_cash),
        "expected_cash": float(total_expected_cash),
        "payment_mix": payment_mix, "trend": trend,
        "trend_granularity": "month" if monthly_trend else "day",
        "top_products": top_products,
        "transactions": transaction_rows[:500], "financial_entries": expense_rows[:500],
        "transaction_limit": 500,
    }


@router.post("/entries", status_code=201)
def create_financial_entry(payload: FinancialEntryCreate, db: Session = Depends(get_db)):
    kind = payload.entry_type.strip().upper()
    if kind not in ENTRY_TYPES:
        raise HTTPException(status_code=422, detail="Choose Expense, Opening cash float, Cash received, or Cash paid out.")
    method = payload.payment_method.strip()
    if method not in PAYMENT_METHODS:
        raise HTTPException(status_code=422, detail="Payment method must be Cash, M-Pesa, Card, or Other.")
    if not payload.category.strip():
        raise HTTPException(status_code=422, detail="Category is required.")
    entry = FinancialEntry(
        entry_type=kind,
        category=payload.category.strip(),
        amount=cash(payload.amount),
        payment_method=method,
        description=payload.description.strip(),
        entry_date=payload.entry_date or datetime.now(TZ).date(),
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return {
        "id": entry.id, "entry_type": entry.entry_type, "category": entry.category,
        "amount": float(cash(entry.amount)), "payment_method": entry.payment_method,
        "description": entry.description, "entry_date": entry.entry_date.isoformat() if entry.entry_date else "", "created_at": entry.created_at.isoformat() if entry.created_at else "",
    }

def get_available_funds(db: Session) -> Decimal:
    """Calculate expected funds from sales, opening floats, money in and out."""

    total_sales = cash(
        db.scalar(
            select(func.coalesce(func.sum(Sale.total_amount), 0))
        ) or 0
    )

    entries = db.scalars(select(FinancialEntry)).all()

    opening_float = Decimal("0.00")
    total_money_in = Decimal("0.00")
    total_money_out = Decimal("0.00")

    for item in entries:
        amount = cash(item.amount)
        kind = (item.entry_type or "").strip().upper()

        if kind == "OPENING_FLOAT":
            opening_float += amount
        elif kind == "CASH_IN":
            total_money_in += amount
        elif kind in {"CASH_OUT", "EXPENSE"}:
            total_money_out += amount

    return cash(
        total_sales + opening_float + total_money_in - total_money_out
    )


@router.get("/restocking/balance")
def get_restocking_balance(db: Session = Depends(get_db)):
    available = get_available_funds(db)

    return {
        "available_funds": float(available),
        "currency": "KES",
    }


@router.get("/restocking")
def list_restocking_entries(db: Session = Depends(get_db)):
    entries = db.scalars(
        select(FinancialEntry)
        .where(
            FinancialEntry.entry_type == "CASH_OUT",
            FinancialEntry.category == "Restocking",
        )
        .order_by(
            FinancialEntry.entry_date.desc(),
            FinancialEntry.created_at.desc(),
        )
    ).all()

    return [
        {
            "id": item.id,
            "entry_date": item.entry_date.isoformat()
            if item.entry_date else "",
            "amount": float(cash(item.amount)),
            "category": item.category,
            "payment_method": item.payment_method,
            "description": item.description or "",
            "created_at": item.created_at.isoformat()
            if item.created_at else "",
        }
        for item in entries
    ]


@router.post("/restocking", status_code=201)
def create_restocking_entry(
    payload: FinancialEntryCreate,
    db: Session = Depends(get_db),
):
    amount = cash(payload.amount)

    if amount <= 0:
        raise HTTPException(
            status_code=422,
            detail="Withdrawal amount must be greater than zero.",
        )

    # Restrict this endpoint to cash outflows for restocking.
    if payload.entry_type.strip().upper() != "CASH_OUT":
        raise HTTPException(
            status_code=422,
            detail="Restocking transactions must be CASH_OUT entries.",
        )

    available = get_available_funds(db)

    if amount > available:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Insufficient funds. Available: KSh {available:,.2f}; "
                f"requested: KSh {amount:,.2f}."
            ),
        )

    entry = FinancialEntry(
        entry_type="CASH_OUT",
        category="Restocking",
        amount=amount,
        payment_method="Cash",
        description=payload.description.strip(),
        entry_date=payload.entry_date or datetime.now(TZ).date(),
    )

    db.add(entry)
    db.commit()
    db.refresh(entry)

    remaining = get_available_funds(db)

    return {
        "id": entry.id,
        "entry_type": entry.entry_type,
        "category": entry.category,
        "amount": float(cash(entry.amount)),
        "payment_method": entry.payment_method,
        "description": entry.description or "",
        "entry_date": entry.entry_date.isoformat(),
        "created_at": entry.created_at.isoformat()
        if entry.created_at else "",
        "available_funds": float(remaining),
    }