import secrets
import requests
from typing import Dict, Any, Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Response, Request
from sqlalchemy.orm import Session

from backend.db.session import get_db
from backend.db.models import User, UserProfile, SwiggyToken
from backend.auth.sessions import clear_session_cookies, get_current_user_id, set_session_cookies
from config.settings import get_settings

router = APIRouter(prefix="/auth", tags=["App Authentication"])


class GoogleLoginRequest(BaseModel):
    id_token: Optional[str] = None
    email: Optional[str] = None
    name: Optional[str] = None
    avatar_url: Optional[str] = None


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
    swiggy_connected = bool(token_record and token_record.encrypted_access_token)

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
            "created_at": user.created_at.isoformat() if user.created_at else None,
            "profile": profile_data
        }
    }


@router.post("/guest")
async def create_guest_session(
    response: Response,
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Creates a guest session and sets HTTPOnly cookies.
    """
    user_id = f"guest_{secrets.token_hex(6)}"
    user = User(id=user_id, auth_provider="guest")
    db.add(user)

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

    set_session_cookies(response, user_id)

    return {
        "success": True,
        "user_id": user_id,
        "auth_provider": "guest",
        "message": "Guest session created."
    }


@router.post("/google")
async def login_with_google(
    payload: GoogleLoginRequest,
    response: Response,
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Authenticates or registers an App User by verifying a Google id_token server-side.
    """
    settings = get_settings()
    is_local = settings.use_mock_mcp or settings.app_env == "development"

    email = None
    name = payload.name
    avatar_url = payload.avatar_url

    if payload.id_token:
        if is_local and payload.id_token.startswith("mock_"):
            # Mock mode bypass for developer tests
            email = payload.email or "mockgoogleuser@gmail.com"
            name = name or "Mock Google User"
        else:
            if not settings.google_client_id:
                raise HTTPException(status_code=503, detail="GOOGLE_CLIENT_ID is not configured.")

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
    elif is_local and payload.email:
        # Dev fallback when id_token is omitted
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
            fitness_goal="maintenance"
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
    swiggy_connected = bool(token_record and token_record.encrypted_access_token)

    return {
        "success": True,
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
async def logout(response: Response) -> Dict[str, Any]:
    """
    Clears current BiteWise session cookies.
    """
    clear_session_cookies(response)
    return {"success": True, "message": "Logged out successfully."}
