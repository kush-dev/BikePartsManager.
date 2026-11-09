from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


class SaleLineCreate(BaseModel):
    product_id: int = Field(gt=0)
    quantity: int = Field(gt=0, le=100000)
    unit_price: Decimal = Field(ge=0, max_digits=12, decimal_places=2)


class SaleCreate(BaseModel):
    items: list[SaleLineCreate] = Field(min_length=1, max_length=100)
    payment_method: Literal["Cash", "M-Pesa", "Card", "Other"] = "Cash"
    amount_received: Decimal = Field(ge=0, max_digits=12, decimal_places=2)


class SaleItemRead(BaseModel):
    product_id: int
    sku: str
    product_name: str
    quantity: int
    unit_price: Decimal
    unit_cost: Decimal
    line_total: Decimal


class SaleRead(BaseModel):
    id: int
    receipt_number: str
    subtotal: Decimal
    total_amount: Decimal
    amount_received: Decimal
    change_due: Decimal
    payment_method: str
    created_at: str
    items: list[SaleItemRead]
