import secrets
import hashlib
import base64
import datetime
from typing import Dict, Any, Optional
from urllib.parse import urlencode
from fastapi import APIRouter, Depends, HTTPException, Query, Response, Cookie, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from backend.db.session import get_db
from backend.db.models import User, SwiggyToken, UserProfile, SwiggyClientRegistration
from backend.auth.sessions import (
    resolve_current_user_id,
    encrypt_token,
    get_current_user_id,
    set_session_cookies,
    should_use_secure_cookies,
    sign_oauth_state,
    sign_session,
    verify_oauth_state,
    verify_session,
)
from backend.auth.rate_limiter import mutating_rate_limiter
from config.settings import get_settings
from agent.observability import log_error

router = APIRouter(prefix="/auth", tags=["Authentication"])

def generate_pkce_pair():
    verifier = secrets.token_urlsafe(32)
    sha256 = hashlib.sha256(verifier.encode('utf-8')).digest()
    challenge = base64.urlsafe_b64encode(sha256).decode('utf-8').replace('=', '')
    return verifier, challenge

def _is_mock_mode() -> bool:
    """
    Strictly USE_MOCK_MCP — never APP_ENV. Real-mode OAuth testing normally
    happens from a local dev machine (APP_ENV=development is the default
    there), so folding app_env into this check meant the token-exchange
    decision below always took the mock/fabricated-token branch regardless of
    USE_MOCK_MCP, silently defeating real-mode testing.
    """
    return get_settings().use_mock_mcp

def _get_or_register_swiggy_client(db: Session) -> str:
    """
    Per Swiggy's authenticate.md: "You don't need to apply for or manage a
    client identity. Swiggy MCP supports Dynamic Client Registration (RFC
    7591) at POST /auth/register." A manually-configured SWIGGY_CLIENT_ID
    (from a builders@swiggy.in production application) always wins; failing
    that, self-register once per redirect_uri and cache the result so we
    don't re-register on every login.
    """
    settings = get_settings()
    if settings.swiggy_client_id:
        return settings.swiggy_client_id

    cached = db.query(SwiggyClientRegistration).filter(
        SwiggyClientRegistration.redirect_uri == settings.swiggy_redirect_uri
    ).first()
    if cached:
        return cached.client_id

    import requests

    try:
        res = requests.post(
            settings.swiggy_register_url,
            json={
                "client_name": "BiteWise",
                "redirect_uris": [settings.swiggy_redirect_uri],
                "grant_types": ["authorization_code"],
                "response_types": ["code"],
                "token_endpoint_auth_method": "none",
            },
            headers={"Content-Type": "application/json"},
            timeout=15,
        )
        res.raise_for_status()
        data = res.json()
        client_id = data.get("client_id")
        if not client_id:
            raise HTTPException(status_code=502, detail="Swiggy Dynamic Client Registration response missing client_id.")
    except HTTPException:
        raise
    except Exception as e:
        # Broad on purpose: DNS failures, timeouts, and bad JSON from a dead
        # endpoint all look different, but all mean the same thing here — the
        # registration attempt failed and the caller should get a clean 503
        # instead of the raw exception type surfacing.
        raise HTTPException(status_code=503, detail=f"Swiggy Dynamic Client Registration failed: {str(e)}")

    db.add(SwiggyClientRegistration(
        redirect_uri=settings.swiggy_redirect_uri,
        client_id=client_id,
        client_secret=data.get("client_secret"),
    ))
    db.commit()
    return client_id

@router.get("/swiggy/start")
def start_swiggy_oauth(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    _rate_limit = Depends(mutating_rate_limiter)
) -> Dict[str, str]:
    """
    Step 1 of Swiggy OAuth 2.1 PKCE Flow.
    Generates PKCE verifier, CSRF state, challenge, and sets HTTPOnly cookies.
    """
    settings = get_settings()
    # Gated on use_mock_mcp alone (not the broader _is_mock_or_dev helper) so
    # this always matches the mock-redirect bypass below, which checks the
    # same flag — otherwise APP_ENV=development + USE_MOCK_MCP=false (a real
    # local test) would silently build a real Swiggy authorize URL carrying
    # client_id=mock_client instead of registering a real one.
    if settings.use_mock_mcp:
        client_id = "mock_client"
    else:
        client_id = _get_or_register_swiggy_client(db)

    user_id = resolve_current_user_id(request, strict=True)
    secure_cookie = should_use_secure_cookies(request)
    samesite_setting = "none" if secure_cookie else "lax"

    state = sign_oauth_state(user_id)
    verifier, challenge = generate_pkce_pair()

    # Set cookies with short 10-minute expiry
    response.set_cookie(
        key="oauth_code_verifier",
        value=verifier,
        httponly=True,
        secure=secure_cookie,
        samesite=samesite_setting,
        max_age=600
    )
    response.set_cookie(
        key="oauth_state",
        value=state,
        httponly=True,
        secure=secure_cookie,
        samesite=samesite_setting,
        max_age=600
    )

    params = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": settings.swiggy_redirect_uri,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "scope": "mcp:tools",
        "state": state,
    }

    if settings.use_mock_mcp:
        # In mock mode, bypass Swiggy's auth portal to avoid whitelist wall during demos
        mock_redirect = f"{settings.swiggy_redirect_uri}?code=mock_code&state={state}"
        return {
            "code_challenge": challenge,
            "redirect_url": mock_redirect
        }

    return {
        "code_challenge": challenge,
        "redirect_url": f"{settings.swiggy_auth_url}?{urlencode(params)}"
    }

@router.get("/swiggy/callback")
def swiggy_oauth_callback(
    request: Request,
    response: Response,
    code: str = Query(..., description="Authorization code returned by Swiggy"),
    state: str = Query(None, description="CSRF state protection string"),
    return_json: bool = Query(False, description="If true, returns JSON instead of redirecting"),
    oauth_code_verifier: Optional[str] = Cookie(None),
    oauth_state: Optional[str] = Cookie(None),
    bitewise_session: Optional[str] = Cookie(None),
    nutriorder_session: Optional[str] = Cookie(None),
    db: Session = Depends(get_db)
):
    """
    Step 2 of Swiggy OAuth 2.1 PKCE Flow.
    Exchanges authorization code, encrypts token, and stores User Session in DB.
    """
    settings = get_settings()

    def clean_cookies():
        response.delete_cookie("oauth_code_verifier")
        response.delete_cookie("oauth_state")

    def handle_error(status_code: int, detail: str):
        log_error(f"Swiggy OAuth callback failed: {detail}", error_category="oauth_callback_error")
        if return_json:
            clean_cookies()
            raise HTTPException(status_code=status_code, detail=detail)

        from urllib.parse import quote
        redirect_res = RedirectResponse(
            url=f"{settings.frontend_base_url}/app?auth_error={quote(detail)}"
        )
        redirect_res.delete_cookie("oauth_code_verifier")
        redirect_res.delete_cookie("oauth_state")
        return redirect_res

    # CSRF check — always, in every mode: the state echoed back by Swiggy
    # must equal the one this browser was given by /auth/swiggy/start.
    if not oauth_state or state != oauth_state:
        return handle_error(
            400,
            "OAuth state parameter mismatch or session expired. Potential CSRF detected."
        )

    if not _is_mock_mode() and not oauth_code_verifier:
        return handle_error(
            400,
            "OAuth code verifier session expired or missing."
        )

    # The BiteWise user comes only from a state this server signed in
    # /auth/swiggy/start — never from anything the caller can write freely.
    session_user_id = verify_oauth_state(state)
    if not session_user_id:
        return handle_error(
            401,
            "Must be logged into BiteWise before connecting your Swiggy account."
        )

    # If the browser also carries a live BiteWise session, it must be the same
    # user that started the flow (stops a stolen state from linking a Swiggy
    # account onto whoever happens to open the link).
    current_session_user = None
    for candidate in (bitewise_session, nutriorder_session):
        current_session_user = verify_session(candidate)
        if current_session_user:
            break
    if current_session_user and current_session_user != session_user_id:
        return handle_error(
            401,
            "This Swiggy connection was started by a different BiteWise account. Please try again."
        )

    user = db.query(User).filter(User.id == session_user_id).first()
    if not user:
        return handle_error(
            401,
            "BiteWise session was not found. Please sign in again before connecting Swiggy."
        )

    # Live mode always exchanges the code with Swiggy — "mock_code" used to
    # fabricate a fake token here even with USE_MOCK_MCP=false.
    if not _is_mock_mode():
        import requests

        # Swiggy OAuth 2.1 PKCE token exchange payload — matches the documented
        # shape exactly (authenticate.md shows no client_id/client_secret here;
        # the PKCE code_verifier is what proves client identity, not a secret).
        payload = {
            "grant_type": "authorization_code",
            "code": code,
            "code_verifier": oauth_code_verifier or "mock_verifier",
            "redirect_uri": settings.swiggy_redirect_uri
        }

        try:
            token_res = requests.post(
                settings.swiggy_token_url,
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=15
            )
            token_res.raise_for_status()
            res_data = token_res.json()
            access_token = res_data.get("access_token")
            expires_in = res_data.get("expires_in", 432000)
            scope = res_data.get("scope", "mcp:tools")

            if not access_token:
                return handle_error(502, "Swiggy token response missing access_token.")
        except requests.exceptions.RequestException as e:
            status = e.response.status_code if hasattr(e, "response") and e.response else 502
            return handle_error(status, f"Swiggy token exchange failed: {str(e)}")
    else:
        # Mock mode fallback
        access_token = f"token_swiggy_{secrets.token_hex(16)}"
        expires_in = 432000
        scope = "mcp:tools"

    # Encrypt token securely
    encrypted = encrypt_token(access_token)

    if not user.swiggy_user_ref:
        user.swiggy_user_ref = f"swiggy_ref_{user.id}"

    # Upsert Swiggy Token for this user
    token_record = db.query(SwiggyToken).filter(SwiggyToken.user_id == user.id).first()
    if token_record:
        token_record.encrypted_access_token = encrypted
        token_record.expires_at = datetime.datetime.now() + datetime.timedelta(seconds=expires_in)
        token_record.scope = scope
    else:
        token_record = SwiggyToken(
            user_id=user.id,
            encrypted_access_token=encrypted,
            expires_at=datetime.datetime.now() + datetime.timedelta(seconds=expires_in),
            scope=scope
        )
        db.add(token_record)

    db.commit()

    # No BiteWise session cookie is issued here: the user is already logged
    # in (that's how /auth/swiggy/start knew who they were). Issuing one from
    # this unauthenticated GET is what turned a forged state into a login.
    if return_json:
        clean_cookies()
        return {
            "success": True,
            "user_id": user.id,
            "message": "Authenticated successfully. Encrypted credentials saved in DB.",
            "expires_in_seconds": expires_in
        }
    else:
        redirect_res = RedirectResponse(url=f"{settings.frontend_base_url}/app")
        # Clean oauth verifier/state cookies on successful redirect
        redirect_res.delete_cookie("oauth_code_verifier")
        redirect_res.delete_cookie("oauth_state")
        return redirect_res

@router.post("/demo-login")
def demo_login(request: Request, response: Response, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    Demo login endpoint for mock-mode testing.
    Auto-provisions a demo user and attaches the session cookie.
    """
    settings = get_settings()
    # Strictly use_mock_mcp (see _is_mock_mode's docstring) — demo-login
    # fabricates a fake "mock_access_token" SwiggyToken row, which must never
    # be available while USE_MOCK_MCP=false is actively being used to test a
    # real Swiggy connection.
    if not settings.use_mock_mcp:
        raise HTTPException(status_code=403, detail="Demo login is disabled outside mock mode.")
        
    user_id = f"user_demo_{secrets.token_hex(4)}"
    new_user = User(id=user_id, swiggy_user_ref=f"swiggy_demo_{user_id}", auth_provider="guest")
    db.add(new_user)
    
    # Save a mock Token
    encrypted = encrypt_token("mock_access_token")
    token_record = SwiggyToken(
        user_id=user_id,
        encrypted_access_token=encrypted,
        expires_at=datetime.datetime.now() + datetime.timedelta(days=5),
        scope="mcp:tools"
    )
    db.add(token_record)
    
    # Create Profile
    profile = UserProfile(
        user_id=user_id,
        protein_target=35,
        calorie_target=650,
        diet_preference="any",
        allergies=[],
        dislikes=[],
        favorite_cuisines=["indian"],
        fitness_goal="maintenance"
    )
    db.add(profile)
    db.commit()
    
    # Set BiteWise primary and legacy fallback cookies.
    set_session_cookies(request, response, user_id, max_age=432000)
    
    return {
        "success": True,
        "user_id": user_id,
        "session_token": sign_session(user_id),
        "message": "Demo login successful. Session cookie attached."
    }

@router.get("/swiggy/status")
def swiggy_status(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    Checks configuration completeness and staging credentials readiness without leaking secrets.
    """
    settings = get_settings()
    
    encryption_ok = False
    if settings.encryption_key:
        try:
            from backend.auth.sessions import _get_encryption_key
            _get_encryption_key()
            encryption_ok = True
        except Exception:
            pass
            
    db_connected = False
    try:
        from sqlalchemy import text
        db.execute(text("SELECT 1"))
        db_connected = True
    except Exception:
        pass

    # Doesn't call Swiggy's /auth/register here — that's a network call, and
    # this status endpoint gets polled. Just reports what's cached; the real
    # registration attempt (if needed) happens lazily on /auth/swiggy/start.
    registered_client = db.query(SwiggyClientRegistration).filter(
        SwiggyClientRegistration.redirect_uri == settings.swiggy_redirect_uri
    ).first()
    if settings.swiggy_client_id:
        client_id_source = "manual"
    elif registered_client:
        client_id_source = "dynamic_registration_cached"
    else:
        client_id_source = "not_yet_registered"

    return {
        "success": True,
        "use_mock_mcp": settings.use_mock_mcp,
        "swiggy_env": settings.swiggy_env,
        "database_connected": db_connected,
        "encryption_key_configured": encryption_ok,
        "client_id_configured": bool(settings.swiggy_client_id) or bool(registered_client),
        "client_id_source": client_id_source,
        "client_secret_configured": bool(settings.swiggy_client_secret),
        "redirect_uri_configured": bool(settings.swiggy_redirect_uri),
    }
