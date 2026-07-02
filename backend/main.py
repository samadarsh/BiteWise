from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# Import database session, engine and trigger models registration
from backend.db.session import engine, Base
import backend.db.models  # Registers SQLite/PostgreSQL models

# Import routers
from backend.auth import swiggy_oauth
from backend.users import routes as users_routes
from backend.orders import routes as orders_routes
from backend.recommendations import routes as recommendations_routes

app = FastAPI(
    title="NutriOrder AI Production Backend",
    description="Multi-user FastAPI production server with OAuth, memory persistence, and order state machine.",
    version="1.0.0"
)

# Startup DB initialization hook
@app.on_event("startup")
def init_db():
    # 1. Create any missing tables first (e.g. order_feedbacks)
    Base.metadata.create_all(bind=engine)
    
    # 2. Run SQLite-specific idempotent migrations for UserProfile columns
    if "sqlite" in engine.dialect.name:
        from sqlalchemy import inspect, text
        inspector = inspect(engine)
        if inspector.has_table("user_profiles"):
            columns = [col["name"] for col in inspector.get_columns("user_profiles")]
            new_columns = [
                ("age", "INTEGER"),
                ("gender", "VARCHAR"),
                ("height_cm", "FLOAT"),
                ("weight_kg", "FLOAT"),
                ("activity_level", "VARCHAR DEFAULT 'moderate'"),
                ("meal_budget_default", "INTEGER DEFAULT 300"),
                ("preferred_meal_times", "JSON DEFAULT '{}'"),
                ("spice_tolerance", "VARCHAR DEFAULT 'medium'")
            ]
            with engine.begin() as conn:
                for col_name, col_type in new_columns:
                    if col_name not in columns:
                        conn.execute(text(f"ALTER TABLE user_profiles ADD COLUMN {col_name} {col_type}"))

# CORS configuration allowing explicit localhost frontend origin with credentials enabled
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include modules
app.include_router(swiggy_oauth.router)
app.include_router(users_routes.router)
app.include_router(orders_routes.router)
app.include_router(recommendations_routes.router)

@app.get("/health")
async def health():
    """Health check route for container environments and status validation."""
    return {
        "status": "healthy",
        "app": "NutriOrder AI Production Backend"
    }

if __name__ == "__main__":
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
