from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.category import Category
from app.models.product import Product
from app.schemas.product import ProductCreate, ProductRead, ProductUpdate

router = APIRouter(prefix="/api/products", tags=["products"])


def product_to_read(product: Product) -> dict:
    return {
        "id": product.id,
        "sku": product.sku,
        "name": product.name,
        "brand": product.brand,
        "category_id": product.category_id,
        "category_name": product.category.name if product.category else None,
        "cost_price": product.cost_price,
        "selling_price": product.selling_price,
        "quantity": product.quantity,
        "reorder_level": product.reorder_level,
        "description": product.description,
        "is_active": product.is_active,
    }


@router.get("", response_model=list[ProductRead])
def list_products(
    search: str | None = Query(default=None, max_length=120),
    category_id: int | None = None,
    include_inactive: bool = False,
    db: Session = Depends(get_db),
):
    stmt = select(Product).where(Product.is_active.is_(True) if not include_inactive else True)
    if category_id is not None:
        stmt = stmt.where(Product.category_id == category_id)
    if search and search.strip():
        term = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                Product.name.ilike(term),
                Product.sku.ilike(term),
                Product.brand.ilike(term),
            )
        )
    products = db.scalars(stmt.order_by(Product.name).limit(500)).all()
    return [product_to_read(p) for p in products]


@router.post("", response_model=ProductRead, status_code=status.HTTP_201_CREATED)
def create_product(payload: ProductCreate, db: Session = Depends(get_db)):
    if db.scalar(select(Product).where(func.lower(Product.sku) == payload.sku.lower())):
        raise HTTPException(status_code=409, detail="This SKU already exists.")
    if payload.category_id is not None and not db.get(Category, payload.category_id):
        raise HTTPException(status_code=422, detail="Selected category does not exist.")

    product = Product(**payload.model_dump())
    db.add(product)
    try:
        db.commit()
        db.refresh(product)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="This SKU already exists.")
    return product_to_read(product)


@router.put("/{product_id}", response_model=ProductRead)
def update_product(product_id: int, payload: ProductUpdate, db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if not product or not product.is_active:
        raise HTTPException(status_code=404, detail="Product not found.")

    duplicate = db.scalar(
        select(Product).where(
            func.lower(Product.sku) == payload.sku.lower(),
            Product.id != product_id,
        )
    )
    if duplicate:
        raise HTTPException(status_code=409, detail="This SKU is already used by another product.")
    if payload.category_id is not None and not db.get(Category, payload.category_id):
        raise HTTPException(status_code=422, detail="Selected category does not exist.")

    for key, value in payload.model_dump().items():
        setattr(product, key, value)
    try:
        db.commit()
        db.refresh(product)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Could not update product due to a conflicting value.")
    return product_to_read(product)


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_product(product_id: int, db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if not product or not product.is_active:
        raise HTTPException(status_code=404, detail="Product not found.")
    # Preserve records for future sales history and audit reporting.
    product.is_active = False
    db.commit()
    return None

@router.post("/{product_id}/reactivate", response_model=ProductRead)
def reactivate_product(product_id: int, db: Session = Depends(get_db)):
    product = db.get(Product, product_id)

    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")

    if product.is_active:
        raise HTTPException(
            status_code=400,
            detail="This product is already active."
        )

    product.is_active = True
    db.commit()
    db.refresh(product)

    return product_to_read(product)