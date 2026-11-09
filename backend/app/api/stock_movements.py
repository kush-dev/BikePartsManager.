from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.product import Product
from app.models.sale import Sale, StockMovement

router = APIRouter(prefix="/api/stock-movements", tags=["stock movements"])
KENYA_TZ = ZoneInfo("Africa/Nairobi")


class StockMovementCreate(BaseModel):
    product_id: int = Field(gt=0)
    movement_type: str
    quantity: int
    reason: str = Field(min_length=3, max_length=1000)
    supplier_reference: str | None = Field(default=None, max_length=160)



def movement_to_dict(movement: StockMovement, product: Product, receipt_number: str | None = None):
    return {
        "id": movement.id,
        "product_id": movement.product_id,
        "product_name": product.name,
        "sku": product.sku,
        "sale_id": movement.sale_id,
        "receipt_number": receipt_number,
        "movement_type": movement.movement_type,
        "quantity_change": movement.quantity_change,
        "quantity_before": movement.quantity_before,
        "quantity_after": movement.quantity_after,
        "reason": movement.note or "",
        "created_at": movement.created_at.isoformat() if movement.created_at else None,
    }


@router.get("/summary")
def stock_movement_summary(db: Session = Depends(get_db)):
    products = db.scalars(
        select(Product).where(Product.is_active.is_(True))
    ).all()

    current_units = sum(int(p.quantity or 0) for p in products)
    low_stock = sum(
        1 for p in products
        if int(p.quantity or 0) <= int(p.reorder_level or 0)
    )

    today = datetime.now(KENYA_TZ).date()
    start = datetime.combine(today, time.min, tzinfo=KENYA_TZ).astimezone(timezone.utc)
    end = start + timedelta(days=1)

    rows = db.execute(
        select(
            func.count(StockMovement.id),
            func.coalesce(func.sum(StockMovement.quantity_change), 0),
        ).where(StockMovement.created_at >= start, StockMovement.created_at < end)
    ).one()

    sold_today = db.scalar(
        select(func.coalesce(func.sum(-StockMovement.quantity_change), 0)).where(
            StockMovement.movement_type == "SALE",
            StockMovement.created_at >= start,
            StockMovement.created_at < end,
        )
    ) or 0

    received_today = db.scalar(
        select(func.coalesce(func.sum(StockMovement.quantity_change), 0)).where(
            StockMovement.movement_type == "RECEIPT",
            StockMovement.created_at >= start,
            StockMovement.created_at < end,
        )
    ) or 0

    return {
        "active_products": len(products),
        "current_units": current_units,
        "low_stock_products": low_stock,
        "movements_today": int(rows[0] or 0),
        "net_quantity_change_today": int(rows[1] or 0),
        "units_sold_today": int(sold_today),
        "units_received_today": int(received_today),
    }


@router.get("")
def list_stock_movements(
    product_id: int | None = Query(default=None, gt=0),
    movement_type: str | None = Query(default=None),
    start_date: str | None = Query(default=None),
    end_date: str | None = Query(default=None),
    search: str | None = Query(default=None, max_length=160),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    statement = (
        select(StockMovement, Product, Sale.receipt_number)
        .join(Product, Product.id == StockMovement.product_id)
        .outerjoin(Sale, Sale.id == StockMovement.sale_id)
    )

    if product_id:
        statement = statement.where(StockMovement.product_id == product_id)

    if movement_type:
        kind = movement_type.strip().upper()
        allowed = {"SALE", "RECEIPT", "ADJUSTMENT"}
        if kind not in allowed:
            raise HTTPException(status_code=422, detail="Invalid movement type filter.")
        statement = statement.where(StockMovement.movement_type == kind)

    if start_date:
        try:
            start_day = datetime.strptime(start_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=422, detail="start_date must use YYYY-MM-DD.")
        start = datetime.combine(start_day, time.min, tzinfo=KENYA_TZ).astimezone(timezone.utc)
        statement = statement.where(StockMovement.created_at >= start)

    if end_date:
        try:
            end_day = datetime.strptime(end_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=422, detail="end_date must use YYYY-MM-DD.")
        end = datetime.combine(end_day + timedelta(days=1), time.min, tzinfo=KENYA_TZ).astimezone(timezone.utc)
        statement = statement.where(StockMovement.created_at < end)

    if search and search.strip():
        term = f"%{search.strip()}%"
        statement = statement.where(
            Product.name.ilike(term) | Product.sku.ilike(term) | StockMovement.note.ilike(term)
        )

    rows = db.execute(
        statement.order_by(StockMovement.created_at.desc(), StockMovement.id.desc()).limit(limit)
    ).all()

    return [movement_to_dict(movement, product, receipt) for movement, product, receipt in rows]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_stock_movement(payload: StockMovementCreate, db: Session = Depends(get_db)):
    movement_type = payload.movement_type.strip().upper()
    if movement_type not in {"RECEIPT", "ADJUSTMENT"}:
        raise HTTPException(status_code=422, detail="Movement type must be RECEIPT or ADJUSTMENT.")
    reason = payload.reason.strip()
    if len(reason) < 3:
        raise HTTPException(status_code=422, detail="Enter a reason of at least 3 characters.")

    if payload.quantity == 0:
        raise HTTPException(status_code=422, detail="Quantity must not be zero.")

    if movement_type == "RECEIPT" and payload.quantity <= 0:
        raise HTTPException(status_code=422, detail="Stock received must be a positive quantity.")

    try:
        product = db.scalar(
            select(Product)
            .where(Product.id == payload.product_id, Product.is_active.is_(True))
            .with_for_update()
        )
        if not product:
            raise HTTPException(status_code=404, detail="Active product not found.")

        before = int(product.quantity or 0)
        change = int(payload.quantity)
        after = before + change

        if after < 0:
            raise HTTPException(
                status_code=409,
                detail=f"Adjustment would make stock negative. Current stock: {before}.",
            )

        note = reason
        if payload.supplier_reference and movement_type == "RECEIPT":
            note = f"{note} | Supplier/reference: {payload.supplier_reference.strip()}"

        product.quantity = after
        movement = StockMovement(
            product_id=product.id,
            sale_id=None,
            movement_type=movement_type,
            quantity_change=change,
            quantity_before=before,
            quantity_after=after,
            note=note,
        )
        db.add(movement)
        db.flush()
        db.commit()
        db.refresh(movement)
        db.refresh(product)

        return movement_to_dict(movement, product)
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise
