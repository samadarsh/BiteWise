from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn
import uuid
import time
from config.settings import get_settings
from agent.observability import log_info
from mcp.mcp_client import SwiggyMCPError, SwiggyAuthError
from backend.orders.state_machine import IllegalTransitionError

# Import database session, engine and trigger models registration
from backend.db.session import engine, Base
import backend.db.models  # Registers SQLite/PostgreSQL models

# Error tracking — a no-op unless SENTRY_DSN is set (unset in local dev and
# CI); previously nothing here meant unhandled exceptions only ever existed
# in raw stdout logs, with nobody alerted in production.
_early_settings = get_settings()
if _early_settings.sentry_dsn:
    import sentry_sdk

    sentry_sdk.init(
        dsn=_early_settings.sentry_dsn,
        environment=_early_settings.app_env,
        send_default_pii=False,
    )

# Import routers
from backend.auth import swiggy_oauth, user_auth
from backend.users import routes as users_routes
from backend.orders import routes as orders_routes
from backend.recommendations import routes as recommendations_routes
from backend.coach import routes as coach_routes
from backend.demo import routes as demo_routes
from backend.household import routes as household_routes
from backend.pantry import routes as pantry_routes
from backend.grocery import routes as grocery_routes

app = FastAPI(
    title="BiteWise API",
    description="BiteWise backend for NutriOrder AI, SmartPantry AI, OAuth, user memory, and safe Swiggy MCP execution.",
    version="1.0.0"
)

# Startup DB initialization hook
@app.on_event("startup")
def init_db():
    # 1. Create any missing tables first
    Base.metadata.create_all(bind=engine)

    # 2. Run SQLite-specific idempotent migrations
    if "sqlite" in engine.dialect.name:
        from sqlalchemy import inspect, text
        inspector = inspect(engine)

        if inspector.has_table("users"):
            user_cols = [col["name"] for col in inspector.get_columns("users")]
            with engine.begin() as conn:
                if "email" not in user_cols:
                    conn.execute(text("ALTER TABLE users ADD COLUMN email VARCHAR"))
                if "name" not in user_cols:
                    conn.execute(text("ALTER TABLE users ADD COLUMN name VARCHAR"))
                if "avatar_url" not in user_cols:
                    conn.execute(text("ALTER TABLE users ADD COLUMN avatar_url VARCHAR"))
                if "auth_provider" not in user_cols:
                    conn.execute(text("ALTER TABLE users ADD COLUMN auth_provider VARCHAR DEFAULT 'guest'"))
                if "sessions_revoked_at" not in user_cols:
                    conn.execute(text("ALTER TABLE users ADD COLUMN sessions_revoked_at DATETIME"))
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
                ("spice_tolerance", "VARCHAR DEFAULT 'medium'"),
                ("priority_weights", "JSON DEFAULT '{}'")
            ]
            with engine.begin() as conn:
                for col_name, col_type in new_columns:
                    if col_name not in columns:
                        conn.execute(text(f"ALTER TABLE user_profiles ADD COLUMN {col_name} {col_type}"))

        # Idempotent column check for order_sessions (runs independently of user_profiles)
        if inspector.has_table("order_sessions"):
            sess_columns = [col["name"] for col in inspector.get_columns("order_sessions")]
            with engine.begin() as conn:
                if "selected_item_nutrition" not in sess_columns:
                    conn.execute(text("ALTER TABLE order_sessions ADD COLUMN selected_item_nutrition JSON"))
                if "mcp_mode" not in sess_columns:
                    conn.execute(text("ALTER TABLE order_sessions ADD COLUMN mcp_mode VARCHAR"))

        # Idempotent column check for nutrition_entries (runs independently of user_profiles)
        if inspector.has_table("nutrition_entries"):
            nutrition_columns = [col["name"] for col in inspector.get_columns("nutrition_entries")]
            with engine.begin() as conn:
                if "micronutrients" not in nutrition_columns:
                    conn.execute(text("ALTER TABLE nutrition_entries ADD COLUMN micronutrients JSON"))

        # Idempotent column check for pantry_items (runs independently of user_profiles)
        if inspector.has_table("pantry_items"):
            pantry_columns = [col["name"] for col in inspector.get_columns("pantry_items")]
            with engine.begin() as conn:
                if "stock_level" not in pantry_columns:
                    conn.execute(text("ALTER TABLE pantry_items ADD COLUMN stock_level VARCHAR DEFAULT 'full'"))
                if "category" not in pantry_columns:
                    conn.execute(text("ALTER TABLE pantry_items ADD COLUMN category VARCHAR DEFAULT 'Other'"))
                if "expiry_date" not in pantry_columns:
                    conn.execute(text("ALTER TABLE pantry_items ADD COLUMN expiry_date DATE"))
                if "added_at" not in pantry_columns:
                    conn.execute(text("ALTER TABLE pantry_items ADD COLUMN added_at DATETIME"))
                if "is_bulk" not in pantry_columns:
                    conn.execute(text("ALTER TABLE pantry_items ADD COLUMN is_bulk BOOLEAN DEFAULT 0"))
                if "bulk_use_count" not in pantry_columns:
                    conn.execute(text("ALTER TABLE pantry_items ADD COLUMN bulk_use_count INTEGER DEFAULT 0"))

    # 3. Reap long-abandoned guest accounts (no scheduler infra exists yet —
    # a server restart is the simplest trigger available that still stops
    # unbounded growth from POST /auth/guest, which has no TTL otherwise).
    from backend.db.session import SessionLocal
    from backend.auth.cleanup import reap_stale_guest_accounts
    cleanup_db = SessionLocal()
    try:
        reap_stale_guest_accounts(cleanup_db)
    finally:
        cleanup_db.close()

# Request body size limit — a JSON API has no legitimate reason to accept a
# multi-megabyte body; this is a cheap guard against obviously-abusive
# requests before they reach any route handler. The one exception is the
# food-image-scan upload, where real phone photos routinely exceed 2MB.
MAX_REQUEST_BODY_BYTES = 2 * 1024 * 1024  # 2MB
MAX_IMAGE_UPLOAD_BYTES = 8 * 1024 * 1024  # 8MB
IMAGE_UPLOAD_PATHS = {"/coach/scan-food-image"}


@app.middleware("http")
async def limit_request_body_size(request: Request, call_next):
    limit = MAX_IMAGE_UPLOAD_BYTES if request.url.path in IMAGE_UPLOAD_PATHS else MAX_REQUEST_BODY_BYTES
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            if int(content_length) > limit:
                return JSONResponse(status_code=413, content={"detail": "Request body too large."})
        except ValueError:
            pass
    return await call_next(request)


# Security headers — CSP is deliberately not set here: this API also serves
# FastAPI's own /docs and /redoc pages, which load their assets from a CDN,
# so a strict default-src would break them without path-specific tuning.
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    # Browsers ignore this over plain HTTP, so it's harmless in local dev
    # and takes effect automatically once served over real HTTPS.
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


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
cors_origins = settings.cors_allowed_origins or ["http://localhost:3000", "http://127.0.0.1:3000"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    # Only an explicitly configured pattern (e.g. your own Vercel preview
    # URLs: https://bitewise-[a-z0-9-]+\.vercel\.app). The old hard-coded
    # https://.*\.vercel\.app let ANY site anyone deploys on Vercel make
    # credentialed calls with a visitor's BiteWise session.
    allow_origin_regex=settings.cors_allowed_origin_regex or None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(SwiggyMCPError)
async def swiggy_mcp_error_handler(request: Request, exc: SwiggyMCPError) -> JSONResponse:
    """
    Backstop for any Swiggy MCP call-site that lets the real exception type
    survive (rather than flattening it into a generic 500) — one consistent
    contract for the frontend: 401 + swiggy_reauth_required when the user's
    Swiggy token is expired/invalid, 502 for any other MCP-layer failure.
    """
    if isinstance(exc, SwiggyAuthError):
        # A dead token (revoked on Swiggy's side, e.g. the user logged out of
        # Swiggy directly) only surfaces here — the first time it's actually
        # used. Purge the local row now so swiggy_connected correctly flips
        # to False on the very next /auth/me check instead of staying stale
        # until the token's natural expires_at.
        try:
            from backend.auth.sessions import get_current_user_id
            from backend.db.session import SessionLocal
            from backend.db.models import SwiggyToken

            # strict: a session-less mock request must not purge demo_user's token.
            user_id = await get_current_user_id(request, strict=True)
            if user_id:
                db = SessionLocal()
                try:
                    db.query(SwiggyToken).filter(SwiggyToken.user_id == user_id).delete()
                    db.commit()
                finally:
                    db.close()
        except Exception:
            pass
        return JSONResponse(status_code=401, content={"error_code": "swiggy_reauth_required", "detail": exc.message})
    return JSONResponse(status_code=exc.status_code or 502, content={"error_code": "swiggy_mcp_error", "detail": exc.message})

@app.exception_handler(IllegalTransitionError)
async def illegal_transition_handler(request: Request, exc: IllegalTransitionError) -> JSONResponse:
    return JSONResponse(
        status_code=409,
        content={
            "error_code": "order_step_out_of_order",
            "detail": (
                f"That step isn't available right now (order is at {exc.current.value}). "
                "Start a new order or pick your meal again."
            ),
        },
    )

# Include modules
app.include_router(user_auth.router)
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
        "app": "BiteWise API"
    }

if __name__ == "__main__":
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
