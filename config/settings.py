import os
from dataclasses import dataclass, field
from typing import List
from dotenv import load_dotenv

load_dotenv()

@dataclass
class Settings:
    app_env: str
    use_mock_mcp: bool
    swiggy_env: str
    database_url: str
    encryption_key: str
    swiggy_mcp_base_url: str
    swiggy_instamart_mcp_base_url: str
    swiggy_token: str
    swiggy_auth_url: str
    swiggy_token_url: str
    swiggy_logout_url: str
    swiggy_register_url: str
    swiggy_client_id: str
    swiggy_client_secret: str
    swiggy_redirect_uri: str
    allow_place_order: bool
    frontend_base_url: str
    google_client_id: str = ""
    session_secret: str = ""
    cors_allowed_origins: List[str] = field(default_factory=list)
    cors_allowed_origin_regex: str = ""
    sentry_dsn: str = ""
    gemini_api_key: str = ""

def _normalize_database_url(url: str) -> str:
    """Hosted Postgres providers often hand out postgres://... URLs, a scheme
    SQLAlchemy 2.x no longer accepts."""
    if url.startswith("postgres://"):
        return "postgresql://" + url[len("postgres://"):]
    return url


def get_settings() -> Settings:
    cors_origins_str = os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
    origins = [orig.strip() for orig in cors_origins_str.split(",") if orig.strip()]
    
    return Settings(
        app_env=os.getenv("APP_ENV", "development"),
        use_mock_mcp=os.getenv("USE_MOCK_MCP", "true").lower() == "true",
        swiggy_env=os.getenv("SWIGGY_ENV", "mock"),
        database_url=_normalize_database_url(os.getenv("DATABASE_URL", "sqlite:///./nutriorder.db")),
        encryption_key=os.getenv("ENCRYPTION_KEY", ""),
        swiggy_mcp_base_url=os.getenv("SWIGGY_MCP_BASE_URL", "https://mcp.swiggy.com/food"),
        swiggy_instamart_mcp_base_url=os.getenv("SWIGGY_INSTAMART_MCP_BASE_URL", "https://mcp.swiggy.com/im"),
        swiggy_token=os.getenv("SWIGGY_TOKEN", ""),
        swiggy_auth_url=os.getenv("SWIGGY_AUTH_URL", "https://mcp.swiggy.com/auth/authorize"),
        swiggy_token_url=os.getenv("SWIGGY_TOKEN_URL", "https://mcp.swiggy.com/auth/token"),
        swiggy_logout_url=os.getenv("SWIGGY_LOGOUT_URL", "https://mcp.swiggy.com/auth/logout"),
        swiggy_register_url=os.getenv("SWIGGY_REGISTER_URL", "https://mcp.swiggy.com/auth/register"),
        swiggy_client_id=os.getenv("SWIGGY_CLIENT_ID", ""),
        swiggy_client_secret=os.getenv("SWIGGY_CLIENT_SECRET", ""),
        swiggy_redirect_uri=os.getenv("SWIGGY_REDIRECT_URI", "http://localhost:8000/auth/swiggy/callback"),
        allow_place_order=os.getenv("ALLOW_PLACE_ORDER", "false").lower() == "true",
        frontend_base_url=os.getenv("FRONTEND_BASE_URL", "http://localhost:3000"),
        google_client_id=os.getenv("GOOGLE_CLIENT_ID", ""),
        session_secret=os.getenv("SESSION_SECRET", ""),
        cors_allowed_origins=origins,
        cors_allowed_origin_regex=os.getenv("CORS_ALLOWED_ORIGIN_REGEX", ""),
        sentry_dsn=os.getenv("SENTRY_DSN", ""),
        gemini_api_key=os.getenv("GEMINI_API_KEY", "")
    )
