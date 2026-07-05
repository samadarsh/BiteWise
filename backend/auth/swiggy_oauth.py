import os
import secrets
import hashlib
import base64
import datetime
from typing import Dict, Any, Optional
from urllib.parse import urlencode
from fastapi import APIRouter, Depends, HTTPException, Query, Response, Cookie
from sqlalchemy.orm import Session
from backend.db.session import get_db
from backend.db.models import User, SwiggyToken, UserProfile
from backend.auth.sessions import encrypt_token
from config.settings import get_settings

router = APIRouter(prefix="/auth", tags=["Authentication"])

def generate_pkce_pair():
    verifier = secrets.token_urlsafe(32)
    sha256 = hashlib.sha256(verifier.encode('utf-8')).digest()
    challenge = base64.urlsafe_b64encode(sha256).decode('utf-8').replace('=', '')
    return verifier, challenge

def _is_mock_or_dev() -> bool:
    settings = get_settings()
    return settings.use_mock_mcp or settings.app_env == "development"

@router.get("/swiggy/start")
async def start_swiggy_oauth(response: Response) -> Dict[str, str]:
    """
    Step 1 of Swiggy OAuth 2.1 PKCE Flow.
    Generates PKCE verifier, CSRF state, challenge, and sets HTTPOnly cookies.
    """
    settings = get_settings()
    client_id = settings.swiggy_client_id or ("mock_client" if _is_mock_or_dev() else "")
    if not client_id:
        raise HTTPException(status_code=503, detail="SWIGGY_CLIENT_ID is not configured.")

    is_local = settings.use_mock_mcp or settings.app_env == "development"
    secure_cookie = not is_local

    state = secrets.token_urlsafe(16)
    verifier, challenge = generate_pkce_pair()

    # Set cookies with short 10-minute expiry
    response.set_cookie(
        key="oauth_code_verifier",
        value=verifier,
        httponly=True,
        secure=secure_cookie,
        samesite="lax",
        max_age=600
    )
    response.set_cookie(
        key="oauth_state",
        value=state,
        httponly=True,
        secure=secure_cookie,
        samesite="lax",
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
    return {
        "code_challenge": challenge,
        "redirect_url": f"{settings.swiggy_auth_url}?{urlencode(params)}"
    }

from fastapi.responses import RedirectResponse

@router.get("/swiggy/callback")
async def swiggy_oauth_callback(
    response: Response,
    code: str = Query(..., description="Authorization code returned by Swiggy"),
    state: str = Query(None, description="CSRF state protection string"),
    return_json: bool = Query(False, description="If true, returns JSON instead of redirecting"),
    oauth_code_verifier: Optional[str] = Cookie(None),
    oauth_state: Optional[str] = Cookie(None),
    db: Session = Depends(get_db)
):
    """
    Step 2 of Swiggy OAuth 2.1 PKCE Flow.
    Exchanges authorization code, encrypts token, and stores User Session in DB.
    """
    def clean_cookies():
        response.delete_cookie("oauth_code_verifier")
        response.delete_cookie("oauth_state")

    def handle_error(status_code: int, detail: str):
        if return_json:
            clean_cookies()
            raise HTTPException(status_code=status_code, detail=detail)

        from urllib.parse import quote
        settings = get_settings()
        redirect_res = RedirectResponse(
            url=f"{settings.frontend_base_url}/?auth_error={quote(detail)}"
        )
        redirect_res.delete_cookie("oauth_code_verifier")
        redirect_res.delete_cookie("oauth_state")
        return redirect_res

    # State validation
    if not state or state != oauth_state:
        return handle_error(
            400,
            "OAuth state parameter mismatch or session expired. Potential CSRF detected."
        )

    if not oauth_code_verifier:
        return handle_error(
            400,
            "OAuth code verifier session expired or missing."
        )

    if not _is_mock_or_dev():
        import requests
        settings = get_settings()

        payload = {
            "grant_type": "authorization_code",
            "client_id": settings.swiggy_client_id,
            "client_secret": settings.swiggy_client_secret,
            "code": code,
            "code_verifier": oauth_code_verifier,
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
            detail = f"Failed to exchange authorization code: {str(e)}"
            if hasattr(e, "response") and e.response:
                try:
                    err_json = e.response.json()
                    detail = err_json.get("error_description") or err_json.get("error") or detail
                except Exception:
                    pass
            return handle_error(status, detail)
    else:
        # Mock mode fallback
        access_token = f"token_swiggy_{secrets.token_hex(16)}"
        expires_in = 432000
        scope = "mcp:tools"

    # Encrypt token securely
    encrypted = encrypt_token(access_token)

    # Create User
    user_id = f"user_{secrets.token_hex(4)}"
    new_user = User(id=user_id, swiggy_user_ref=f"swiggy_ref_{user_id}")
    db.add(new_user)

    # Save Token
    token_record = SwiggyToken(
        user_id=user_id,
        encrypted_access_token=encrypted,
        expires_at=datetime.datetime.now() + datetime.timedelta(seconds=expires_in),
        scope=scope
    )
    db.add(token_record)

    # Create Profile
    profile = UserProfile(
        user_id=user_id,
        protein_target=30,
        calorie_target=600,
        diet_preference="any",
        allergies=[],
        dislikes=[],
        favorite_cuisines=["indian"],
        fitness_goal="maintenance"
    )
    db.add(profile)

    db.commit()

    if return_json:
        # Set cookie on injected response parameter
        response.set_cookie(
            key="nutriorder_session",
            value=user_id,
            httponly=True,
            secure=False,
            samesite="lax",
            max_age=432000
        )
        clean_cookies()
        return {
            "success": True,
            "user_id": user_id,
            "message": "Authenticated successfully. Encrypted credentials saved in DB.",
            "expires_in_seconds": 432000
        }
    else:
        settings = get_settings()
        redirect_res = RedirectResponse(url=f"{settings.frontend_base_url}/app")
        redirect_res.set_cookie(
            key="nutriorder_session",
            value=user_id,
            httponly=True,
            secure=False,
            samesite="lax",
            max_age=432000
        )
        # Clean oauth verifier/state cookies on successful redirect
        redirect_res.delete_cookie("oauth_code_verifier")
        redirect_res.delete_cookie("oauth_state")
        return redirect_res

@router.post("/demo-login")
async def demo_login(response: Response, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    Demo login endpoint for mock-mode testing.
    Auto-provisions a demo user and attaches the session cookie.
    """
    settings = get_settings()
    is_mock = settings.use_mock_mcp or settings.app_env == "development"
    if not is_mock:
        raise HTTPException(status_code=403, detail="Demo login is disabled in production mode.")
        
    user_id = f"user_demo_{secrets.token_hex(4)}"
    new_user = User(id=user_id, swiggy_user_ref=f"swiggy_demo_{user_id}")
    db.add(new_user)
    
    # Save a mock Token
    encrypted = encrypt_token("mock_access_token")
    token_record = SwiggyToken(
        user_id=user_id,
        encrypted_access_token=encrypted,
        expires_at=datetime.datetime.now() + datetime.timedelta(days=5),
        scope="food:read food:write"
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
    
    # Set Cookie
    response.set_cookie(
        key="nutriorder_session",
        value=user_id,
        httponly=True,
        secure=False,  # Allow HTTP for local testing
        samesite="lax",
        max_age=432000
    )
    
    return {
        "success": True,
        "user_id": user_id,
        "message": "Demo login successful. Session cookie attached."
    }

@router.post("/logout")
async def logout(response: Response) -> Dict[str, Any]:
    """
    Clears the authenticated user's session cookie.
    """
    response.delete_cookie("nutriorder_session")
    return {"success": True, "message": "Logged out successfully."}

@router.get("/swiggy/status")
async def swiggy_status(db: Session = Depends(get_db)) -> Dict[str, Any]:
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
        
    return {
        "success": True,
        "use_mock_mcp": settings.use_mock_mcp,
        "swiggy_env": settings.swiggy_env,
        "database_connected": db_connected,
        "encryption_key_configured": encryption_ok,
        "client_id_configured": bool(settings.swiggy_client_id),
        "client_secret_configured": bool(settings.swiggy_client_secret),
        "redirect_uri_configured": bool(settings.swiggy_redirect_uri),
    }
