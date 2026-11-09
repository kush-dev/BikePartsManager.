from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP
import secrets

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.db.session import get_db
from app.models.product import Product
from app.models.sale import Sale, SaleItem, StockMovement
from app.schemas.sale import SaleCreate

router = APIRouter(prefix="/api/sales", tags=["sales and POS"])
CENT = Decimal("0.01")


def money(value: Decimal) -> Decimal:
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def sale_to_dict(sale: Sale) -> dict:
    return {
        "id": sale.id,
        "receipt_number": sale.receipt_number,
        "subtotal": sale.subtotal,
        "total_amount": sale.total_amount,
        "amount_received": sale.amount_received,
        "change_due": sale.change_due,
        "payment_method": sale.payment_method,
        "created_at": sale.created_at.isoformat() if sale.created_at else "",
        "items": [{
            "product_id": item.product_id,
            "sku": item.sku,
            "product_name": item.product_name,
            "quantity": item.quantity,
            "unit_price": item.unit_price,
            "unit_cost": item.unit_cost,
            "line_total": item.line_total,
        } for item in sale.items],
    }


@router.post("", status_code=status.HTTP_201_CREATED)
def checkout(payload: SaleCreate, db: Session = Depends(get_db)):
    # Combine duplicate product lines so stock checks and deductions stay correct.
    combined: dict[int, dict] = {}
    for line in payload.items:
        if line.product_id in combined:
            existing = combined[line.product_id]
            if existing["unit_price"] != line.unit_price:
                raise HTTPException(status_code=422, detail="A product cannot have two prices in the same checkout.")
            existing["quantity"] += line.quantity
        else:
            combined[line.product_id] = {"quantity": line.quantity, "unit_price": money(line.unit_price)}

    try:
        sale_lines = []
        subtotal = Decimal("0.00")
        # PostgreSQL row locks prevent simultaneous checkouts from overselling the same stock.
        for product_id, line in combined.items():
            product = db.scalar(
                select(Product).where(Product.id == product_id, Product.is_active.is_(True)).with_for_update()
            )
            if not product:
                raise HTTPException(status_code=404, detail=f"Product {product_id} was not found or is inactive.")
            if line["quantity"] > product.quantity:
                raise HTTPException(
                    status_code=409,
                    detail=f"Not enough stock for {product.name}. Available: {product.quantity}; requested: {line['quantity']}.",
                )
            line_total = money(line["unit_price"] * line["quantity"])
            subtotal += line_total
            sale_lines.append((product, line["quantity"], line["unit_price"], line_total, product.quantity))

        subtotal = money(subtotal)
        received = money(payload.amount_received)
        if received < subtotal:
            raise HTTPException(status_code=422, detail="Amount received cannot be less than the sale total.")

        receipt = f"BPM-{datetime.now(timezone.utc):%Y%m%d-%H%M%S}-{secrets.token_hex(2).upper()}"
        sale = Sale(
            receipt_number=receipt,
            subtotal=subtotal,
            total_amount=subtotal,
            amount_received=received,
            change_due=money(received - subtotal),
            payment_method=payload.payment_method,
        )
        db.add(sale)
        db.flush()

        for product, quantity, unit_price, line_total, before in sale_lines:
            product.quantity = before - quantity
            db.add(SaleItem(
                sale_id=sale.id,
                product_id=product.id,
                sku=product.sku,
                product_name=product.name,
                quantity=quantity,
                unit_price=unit_price,
                unit_cost=product.cost_price,
                line_total=line_total,
            ))
            db.add(StockMovement(
                product_id=product.id,
                sale_id=sale.id,
                movement_type="SALE",
                quantity_change=-quantity,
                quantity_before=before,
                quantity_after=product.quantity,
                note=f"Sold on receipt {receipt}",
            ))

        db.commit()
        saved = db.scalar(select(Sale).options(selectinload(Sale.items)).where(Sale.id == sale.id))
        return sale_to_dict(saved)
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise


@router.get("")
def list_sales(limit: int = Query(default=20, ge=1, le=100), db: Session = Depends(get_db)):
    sales = db.scalars(
        select(Sale).options(selectinload(Sale.items)).order_by(Sale.created_at.desc()).limit(limit)
    ).all()
    return [sale_to_dict(sale) for sale in sales]


@router.get("/summary/today")
def today_summary(db: Session = Depends(get_db)):
    # Use the database/session timezone date boundary. Supabase timestamps are stored with timezone.
    now = datetime.now(ZoneInfo("Africa/Nairobi"))
    start = datetime.combine(now.date(), time.min, tzinfo=ZoneInfo("Africa/Nairobi")).astimezone(timezone.utc)
    end = start + timedelta(days=1)
    sales_count, amount = db.execute(
        select(func.count(Sale.id), func.coalesce(func.sum(Sale.total_amount), 0))
        .where(Sale.created_at >= start, Sale.created_at < end)
    ).one()
    items_sold = db.scalar(
        select(func.coalesce(func.sum(SaleItem.quantity), 0))
        .join(Sale, Sale.id == SaleItem.sale_id)
        .where(Sale.created_at >= start, Sale.created_at < end)
    ) or 0
    gross_profit = db.scalar(
        select(func.coalesce(func.sum(SaleItem.line_total - (SaleItem.unit_cost * SaleItem.quantity)), 0))
        .join(Sale, Sale.id == SaleItem.sale_id)
        .where(Sale.created_at >= start, Sale.created_at < end)
    ) or 0
    return {
        "sales_count": sales_count or 0,
        "sales_amount": money(Decimal(str(amount or 0))),
        "items_sold": int(items_sold),
        "gross_profit": money(Decimal(str(gross_profit))),
        "average_sale": money(Decimal(str(amount or 0)) / sales_count) if sales_count else Decimal("0.00"),
    }

@router.get("/analytics")
def sales_analytics(
    days: int = Query(default=7, ge=7, le=31),
    db: Session = Depends(get_db),
):
    tz = ZoneInfo("Africa/Nairobi")
    now = datetime.now(tz)
    today = now.date()

    # Use Kenya-local calendar days, converted to UTC for database filtering.
    trend_start_day = today - timedelta(days=days - 1)
    movement_start_day = today - timedelta(days=29)
    end_day = today + timedelta(days=1)

    trend_start = datetime.combine(
        trend_start_day, time.min, tzinfo=tz
    ).astimezone(timezone.utc)

    movement_start = datetime.combine(
        movement_start_day, time.min, tzinfo=tz
    ).astimezone(timezone.utc)

    end_time = datetime.combine(
        end_day, time.min, tzinfo=tz
    ).astimezone(timezone.utc)

    sales = db.scalars(
        select(Sale)
        .options(selectinload(Sale.items))
        .where(
            Sale.created_at >= movement_start,
            Sale.created_at < end_time,
        )
        .order_by(Sale.created_at.asc())
    ).all()

    def local_sale_date(sale):
        created = sale.created_at

        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)

        return created.astimezone(tz).date()

    # Daily sales trend: include dates with zero sales.
    daily_totals = defaultdict(lambda: Decimal("0.00"))

    # Last-30-day sales and product movement.
    product_units = defaultdict(int)
    product_revenue = defaultdict(lambda: Decimal("0.00"))
    payment_totals = defaultdict(lambda: Decimal("0.00"))

    for sale in sales:
        sale_date = local_sale_date(sale)
        payment = (sale.payment_method or "Other").strip().title()

        payment_totals[payment] += Decimal(str(sale.total_amount or 0))

        if sale_date >= trend_start_day:
            daily_totals[sale_date] += Decimal(
                str(sale.total_amount or 0)
            )

        for item in sale.items:
            product_units[item.product_id] += int(item.quantity)
            product_revenue[item.product_id] += Decimal(
                str(item.line_total or 0)
            )

    daily_sales = []

    for offset in range(days):
        day = trend_start_day + timedelta(days=offset)

        daily_sales.append({
            "date": day.isoformat(),
            "label": day.strftime("%d %b"),
            "amount": float(money(daily_totals[day])),
        })

    # Active inventory, including products with no sales in the period.
    products = db.scalars(
        select(Product)
        .where(Product.is_active.is_(True))
        .order_by(Product.name.asc())
    ).all()

    movement = []

    category_units = defaultdict(int)
    category_value = defaultdict(lambda: Decimal("0.00"))

    for product in products:
        units_sold = product_units[product.id]
        category_name = (
            product.category.name
            if product.category
            else "Uncategorised"
        )

        movement.append({
            "product_id": product.id,
            "name": product.name,
            "sku": product.sku,
            "units_sold": units_sold,
            "revenue": float(money(product_revenue[product.id])),
            "current_stock": int(product.quantity or 0),
            "reorder_level": int(product.reorder_level or 0),
            "category": category_name,
        })

        stock = int(product.quantity or 0)
        category_units[category_name] += stock
        category_value[category_name] += (
            Decimal(str(product.cost_price or 0)) * stock
        )

    fast_moving = sorted(
        [item for item in movement if item["units_sold"] > 0],
        key=lambda item: item["units_sold"],
        reverse=True,
    )[:5]

    slow_moving = sorted(
        movement,
        key=lambda item: (
            item["units_sold"],
            item["name"].lower(),
        ),
    )[:5]

    low_stock = [
        item for item in movement
        if item["current_stock"] <= item["reorder_level"]
    ]

    low_stock.sort(
        key=lambda item: (
            item["current_stock"] - item["reorder_level"],
            item["units_sold"] * -1,
        )
    )

    return {
        "period_days": days,
        "movement_period_days": 30,
        "daily_sales": daily_sales,
        "fast_moving": fast_moving,
        "slow_moving": slow_moving,
        "payment_mix": [
            {
                "method": method,
                "amount": float(money(amount)),
            }
            for method, amount in sorted(payment_totals.items())
        ],
        "category_stock": [
            {
                "category": name,
                "units": units,
                "cost_value": float(money(category_value[name])),
            }
            for name, units in sorted(category_units.items())
        ],
        "low_stock": low_stock[:8],
    }