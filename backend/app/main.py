from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text, select
from sqlalchemy.orm import Session

from pwdlib import PasswordHash

from app.api import (
    auth,
    categories,
    products,
    sales,
    stock_movements,
    reports,
)

from app.core.config import settings
from app.db.session import Base, engine, SessionLocal
from app.models import (
    Category,
    Product,
    Sale,
    SaleItem,
    StockMovement,
    FinancialEntry,
    AppUser,
    AuthSession,
)


password_hash = PasswordHash.recommended()


def create_default_admin():
    db: Session = SessionLocal()

    try:
        existing_user = db.scalar(
            select(AppUser).where(
                AppUser.username == settings.admin_username
            )
        )

        if existing_user:
            return

        admin = AppUser(
            username=settings.admin_username,
            password_hash=password_hash.hash(
                settings.admin_password
            ),
            full_name="System Administrator",
            role="admin",
            is_active=True,
        )

        db.add(admin)
        db.commit()

    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):

    Base.metadata.create_all(bind=engine)

    create_default_admin()

    yield


app = FastAPI(
    title="BikeParts Manager API",
    version="0.2.0",
    description="Inventory, sales, reports and authentication API.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://crmbikesmanager.netlify.app"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Public authentication routes
app.include_router(auth.router)


# All business routes require an authenticated user
protected_dependencies = [
    Depends(auth.get_current_user)
]

app.include_router(
    categories.router,
    dependencies=protected_dependencies,
)

app.include_router(
    products.router,
    dependencies=protected_dependencies,
)

app.include_router(
    sales.router,
    dependencies=protected_dependencies,
)

app.include_router(
    stock_movements.router,
    dependencies=protected_dependencies,
)

app.include_router(
    reports.router,
    dependencies=protected_dependencies,
)


@app.get("/api/health", tags=["health"])
def health_check():

    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))

    return {
        "status": "ok",
        "database": "connected",
    }