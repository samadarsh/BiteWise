import os
import secrets
import hashlib
import base64
import datetime
from typing import Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session
from backend.db.session import get_db
from backend.db.models import User, SwiggyToken, UserProfile
from backend.auth.sessions import encrypt_token

router = APIRouter(prefix="/auth", tags=["Authentication"])

def generate_pkce_pair():
    verifier = secrets.token_urlsafe(32)
    sha256 = hashlib.sha256(verifier.encode('utf-8')).digest()
    challenge = base64.urlsafe_b64encode(sha256).decode('utf-8').replace('=', '')
    return verifier, challenge

@router.get("/swiggy/start")
async def start_swiggy_oauth() -> Dict[str, str]:
    """
    Step 1 of Swiggy OAuth 2.1 PKCE Flow.
    Generates PKCE verifier and challenge, redirecting to Swiggy consent.
    """
    verifier, challenge = generate_pkce_pair()
    return {
        "code_challenge": challenge,
        "redirect_url": f"https://auth.swiggy.com/oauth/authorize?response_type=code&client_id=prod_client&code_challenge={challenge}&code_challenge_method=S256"
    }

@router.get("/swiggy/callback")
async def swiggy_oauth_callback(
    response: Response,
    code: str = Query(..., description="Authorization code returned by Swiggy"),
    state: str = Query(None, description="CSRF state protection string"),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Step 2 of Swiggy OAuth 2.1 PKCE Flow.
    Exchanges authorization code, encrypts token, and stores User Session in DB.
    """
    # Exchange code for token (simulated for stub callback validation)
    simulated_token = f"token_swiggy_{secrets.token_hex(16)}"
    
    # Encrypt token securely
    encrypted = encrypt_token(simulated_token)
    
    # Create User
    user_id = f"user_{secrets.token_hex(4)}"
    new_user = User(id=user_id, swiggy_user_ref=f"swiggy_ref_{user_id}")
    db.add(new_user)
    
    # Save Token
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
        "message": "Authenticated successfully. Encrypted credentials saved in DB.",
        "expires_in_seconds": 432000
    }

@router.post("/demo-login")
async def demo_login(response: Response, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    Demo login endpoint for mock-mode testing.
    Auto-provisions a demo user and attaches the session cookie.
    """
    is_mock = os.getenv("USE_MOCK_MCP", "true").lower() == "true" or os.getenv("APP_ENV") == "development"
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
