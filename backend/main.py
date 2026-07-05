from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import uuid
import time
from config.settings import get_settings
from agent.observability import log_info

# Import database session, engine and trigger models registration
from backend.db.session import engine, Base
import backend.db.models  # Registers SQLite/PostgreSQL models

# Import routers
from backend.auth import swiggy_oauth
from backend.users import routes as users_routes
from backend.orders import routes as orders_routes
from backend.recommendations import routes as recommendations_routes
from backend.coach import routes as coach_routes
from backend.demo import routes as demo_routes
from backend.household import routes as household_routes
from backend.pantry import routes as pantry_routes
from backend.grocery import routes as grocery_routes

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

            # Idempotent column check for order_sessions
            if inspector.has_table("order_sessions"):
                sess_columns = [col["name"] for col in inspector.get_columns("order_sessions")]
                with engine.begin() as conn:
                    if "selected_item_nutrition" not in sess_columns:
                        conn.execute(text("ALTER TABLE order_sessions ADD COLUMN selected_item_nutrition JSON"))

            with engine.begin() as conn:
                for col_name, col_type in new_columns:
                    if col_name not in columns:
                        conn.execute(text(f"ALTER TABLE user_profiles ADD COLUMN {col_name} {col_type}"))

# Request ID and logging middleware
@app.middleware("http")
async def add_request_id_and_logging(request: Request, call_next):
    request_id = str(uuid.uuid4())
    request.state.request_id = request_id

    method = request.method
    path = request.url.path

    start_time = time.time()
    response = await call_next(request)
    duration = time.time() - start_time

    response.headers["X-Request-ID"] = request_id

    log_info(
        f"Request finished. ID: {request_id} | {method} {path} | Status: {response.status_code} | Duration: {duration:.3f}s"
    )
    return response

# CORS configuration dynamically resolving allowed origins from settings
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins or ["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include modules
app.include_router(swiggy_oauth.router)
app.include_router(users_routes.router)
app.include_router(orders_routes.router)
app.include_router(recommendations_routes.router)
app.include_router(coach_routes.router)
app.include_router(demo_routes.router)
app.include_router(household_routes.router)
app.include_router(pantry_routes.router)
app.include_router(grocery_routes.router)

@app.get("/health")
async def health():
    """Health check route for container environments and status validation."""
    return {
        "status": "healthy",
        "app": "NutriOrder AI Production Backend"
    }

if __name__ == "__main__":
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
