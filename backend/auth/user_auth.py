import secrets
import requests
import datetime
from typing import Dict, Any, Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Response, Request
from sqlalchemy.orm import Session

from backend.db.session import get_db
from backend.db.models import User, UserProfile, SwiggyToken
from backend.auth.sessions import clear_session_cookies, decrypt_token, get_current_user_id, set_session_cookies, sign_session
from backend.auth.rate_limiter import mutating_rate_limiter
from config.settings import get_settings

router = APIRouter(prefix="/auth", tags=["App Authentication"])


class GoogleLoginRequest(BaseModel):
    id_token: Optional[str] = None
    access_token: Optional[str] = None
    email: Optional[str] = None
    name: Optional[str] = None
    avatar_url: Optional[str] = None


def _is_swiggy_token_valid(token_record: Optional[SwiggyToken]) -> bool:
    """A token record existing isn't enough — an expired token shouldn't show
    as 'connected' just because nothing has cleaned up the row yet."""
    return bool(
        token_record
        and token_record.encrypted_access_token
        and token_record.expires_at
        and token_record.expires_at > datetime.datetime.now()
    )


@router.get("/me")
async def get_my_profile(
    request: Request,
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Returns current authenticated user details, dietary profile, and Swiggy connection status.
    Strictly checks active session cookie (bitewise_session / nutriorder_session).
    """
    try:
        user_id = await get_current_user_id(request, strict=True)
    except HTTPException:
        return {"authenticated": False, "user": None}

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return {"authenticated": False, "user": None}

    token_record = db.query(SwiggyToken).filter(SwiggyToken.user_id == user_id).first()
    swiggy_connected = _is_swiggy_token_valid(token_record)
    settings = get_settings()

    profile_data = None
    if user.profile:
        profile_data = {
            "protein_target": user.profile.protein_target,
            "calorie_target": user.profile.calorie_target,
            "diet_preference": user.profile.diet_preference,
            "allergies": user.profile.allergies,
            "dislikes": user.profile.dislikes,
            "favorite_cuisines": user.profile.favorite_cuisines,
            "fitness_goal": user.profile.fitness_goal,
            "age": user.profile.age,
            "gender": user.profile.gender,
            "height_cm": user.profile.height_cm,
            "weight_kg": user.profile.weight_kg,
            "activity_level": user.profile.activity_level,
            "meal_budget_default": user.profile.meal_budget_default,
            "spice_tolerance": user.profile.spice_tolerance,
        }

    return {
        "authenticated": True,
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "avatar_url": user.avatar_url,
            "auth_provider": user.auth_provider,
            "swiggy_connected": swiggy_connected,
            "mcp_mode": "mock" if settings.use_mock_mcp else "live",
            "created_at": user.created_at.isoformat() if user.created_at else None,
            "profile": profile_data
        }
    }


@router.post("/guest")
async def create_guest_session(
    response: Response,
    db: Session = Depends(get_db),
    _rate_limit = Depends(mutating_rate_limiter)
) -> Dict[str, Any]:
    """
    Creates a guest session and sets HTTPOnly cookies.
    """
    user_id = f"guest_{secrets.token_hex(6)}"
    user = User(id=user_id, swiggy_user_ref=f"swiggy_ref_{user_id}", auth_provider="guest")
    db.add(user)

    profile = UserProfile(
        user_id=user_id,
        protein_target=35,
        calorie_target=650,
        diet_preference="any",
        allergies=[],
        dislikes=[],
        favorite_cuisines=["indian"],
        fitness_goal="maintenance",
        age=None,
        height_cm=None,
        weight_kg=None,
        activity_level="moderate",
        spice_tolerance="medium"
    )
    db.add(profile)
    db.commit()

    set_session_cookies(response, user_id)

    return {
        "success": True,
        "user_id": user_id,
        "session_token": sign_session(user_id),
        "auth_provider": "guest",
        "message": "Guest session created."
    }


@router.post("/google")
async def login_with_google(
    payload: GoogleLoginRequest,
    response: Response,
    db: Session = Depends(get_db),
    _rate_limit = Depends(mutating_rate_limiter)
) -> Dict[str, Any]:
    """
    Authenticates or registers an App User by verifying a Google id_token server-side.
    """
    settings = get_settings()

    email = None
    name = payload.name
    avatar_url = payload.avatar_url

    if payload.id_token:
        if settings.use_mock_mcp and payload.id_token.startswith("mock_"):
            # Mock-mode-only bypass — strictly USE_MOCK_MCP, never APP_ENV
            # (the same conflation bug fixed elsewhere this session: on any
            # local dev machine APP_ENV=development by default, which would
            # otherwise let this fire even with USE_MOCK_MCP=false and let
            # anyone log in as a fake account with zero verification).
            email = payload.email or "mockgoogleuser@gmail.com"
            name = name or "Mock Google User"
        elif not settings.google_client_id:
            if not settings.use_mock_mcp:
                raise HTTPException(status_code=500, detail="Google sign-in is not configured on this server (GOOGLE_CLIENT_ID missing).")
            email = payload.email or "mockgoogleuser@gmail.com"
            name = name or "Mock Google User"
        else:
            # Server-side verification of Google ID token
            try:
                verify_res = requests.get(
                    "https://oauth2.googleapis.com/tokeninfo",
                    params={"id_token": payload.id_token},
                    timeout=10
                )
                if verify_res.status_code != 200:
                    raise HTTPException(status_code=401, detail="Google token verification failed.")
                
                token_data = verify_res.json()
                if token_data.get("aud") != settings.google_client_id:
                    raise HTTPException(status_code=401, detail="Google token audience mismatch.")

                if str(token_data.get("email_verified", "")).lower() != "true":
                    raise HTTPException(status_code=401, detail="Google account email is not verified.")

                email = token_data.get("email")
                if not email:
                    raise HTTPException(status_code=401, detail="Google token payload missing email.")
                
                name = token_data.get("name") or token_data.get("given_name") or name
                avatar_url = token_data.get("picture") or avatar_url
            except requests.exceptions.RequestException as e:
                raise HTTPException(status_code=502, detail=f"Failed to reach Google OAuth server: {str(e)}")
    elif payload.access_token:
        # Popup-based OAuth2 implicit flow (google.accounts.oauth2.initTokenClient)
        # yields an access_token, not an id_token — verify it against Google's
        # userinfo endpoint instead of tokeninfo.
        if settings.use_mock_mcp and payload.access_token.startswith("mock_"):
            email = payload.email or "mockgoogleuser@gmail.com"
            name = name or "Mock Google User"
        elif not settings.google_client_id:
            if not settings.use_mock_mcp:
                raise HTTPException(status_code=500, detail="Google sign-in is not configured on this server (GOOGLE_CLIENT_ID missing).")
            email = payload.email or "mockgoogleuser@gmail.com"
            name = name or "Mock Google User"
        else:
            try:
                verify_res = requests.get(
                    "https://www.googleapis.com/oauth2/v3/userinfo",
                    headers={"Authorization": f"Bearer {payload.access_token}"},
                    timeout=10
                )
                if verify_res.status_code != 200:
                    raise HTTPException(status_code=401, detail="Google token verification failed.")

                userinfo = verify_res.json()
                if str(userinfo.get("email_verified", "")).lower() != "true":
                    raise HTTPException(status_code=401, detail="Google account email is not verified.")

                email = userinfo.get("email")
                if not email:
                    raise HTTPException(status_code=401, detail="Google token payload missing email.")

                name = userinfo.get("name") or userinfo.get("given_name") or name
                avatar_url = userinfo.get("picture") or avatar_url
            except requests.exceptions.RequestException as e:
                raise HTTPException(status_code=502, detail=f"Failed to reach Google OAuth server: {str(e)}")
    elif settings.use_mock_mcp and payload.email:
        # Mock-mode-only fallback when id_token is omitted entirely
        email = payload.email
    else:
        raise HTTPException(status_code=400, detail="Google id_token is required for authentication.")

    user = db.query(User).filter(User.email == email).first()

    if not user:
        user_id = f"google_{secrets.token_hex(6)}"
        user = User(
            id=user_id,
            email=email,
            name=name or email.split("@")[0],
            avatar_url=avatar_url,
            auth_provider="google"
        )
        db.add(user)

        profile = UserProfile(
            user_id=user_id,
            protein_target=35,
            calorie_target=650,
            diet_preference="any",
            allergies=[],
            dislikes=[],
            favorite_cuisines=["indian"],
            fitness_goal="maintenance",
            age=None,
            height_cm=None,
            weight_kg=None,
            activity_level="moderate",
            spice_tolerance="medium"
        )
        db.add(profile)
        db.commit()
    else:
        # Update user metadata
        if name:
            user.name = name
        if avatar_url:
            user.avatar_url = avatar_url
        user.auth_provider = "google"
        db.commit()

    set_session_cookies(response, user.id)

    token_record = db.query(SwiggyToken).filter(SwiggyToken.user_id == user.id).first()
    swiggy_connected = _is_swiggy_token_valid(token_record)

    return {
        "success": True,
        "session_token": sign_session(user.id),
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "avatar_url": user.avatar_url,
            "auth_provider": "google",
            "swiggy_connected": swiggy_connected
        }
    }


@router.post("/logout")
async def logout(request: Request, response: Response, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    Revokes the user's Swiggy-side session (best-effort, real mode only) and
    always deletes the local token, then clears BiteWise's own session
    cookies. Previously this only did the cookie clear, so the Swiggy access
    token stayed valid at Swiggy's end for its full 5-day lifetime even after
    a BiteWise logout.
    """
    settings = get_settings()
    try:
        user_id = await get_current_user_id(request, strict=False)
    except Exception:
        user_id = None

    if user_id:
        token_record = db.query(SwiggyToken).filter(SwiggyToken.user_id == user_id).first()
        if token_record:
            if not settings.use_mock_mcp:
                # Best-effort: Swiggy's docs only document that this endpoint
                # exists ("POST /auth/logout — revoke the current session"),
                # no request/response shape beyond Bearer auth is published,
                # so this must never block BiteWise's own logout on failure.
                try:
                    token = decrypt_token(token_record.encrypted_access_token)
                    requests.post(
                        settings.swiggy_logout_url,
                        headers={"Authorization": f"Bearer {token}"},
                        timeout=10,
                    )
                except Exception:
                    pass
            db.delete(token_record)
            db.commit()

    clear_session_cookies(response)
    return {"success": True, "message": "Logged out successfully."}
