import os
from fastapi import Request, HTTPException, Response
from fastapi.security import APIKeyCookie
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from config.settings import get_settings

# Secure session cookie setup (primary: bitewise_session, fallback: nutriorder_session)
SESSION_COOKIE_NAMES = ("bitewise_session", "nutriorder_session")
BITEWISE_SESSION_COOKIE = APIKeyCookie(name="bitewise_session", auto_error=False)
LEGACY_SESSION_COOKIE = APIKeyCookie(name="nutriorder_session", auto_error=False)


def should_use_secure_cookies() -> bool:
    settings = get_settings()
    is_local = settings.use_mock_mcp or settings.app_env == "development"
    return not is_local


def set_session_cookies(response: Response, user_id: str, max_age: int = 30 * 86400) -> None:
    for cookie_name in SESSION_COOKIE_NAMES:
        response.set_cookie(
            key=cookie_name,
            value=user_id,
            httponly=True,
            secure=should_use_secure_cookies(),
            samesite="lax",
            max_age=max_age
        )


def clear_session_cookies(response: Response) -> None:
    for cookie_name in SESSION_COOKIE_NAMES:
        response.delete_cookie(cookie_name)


def _get_encryption_key() -> bytes:
    key_str = get_settings().encryption_key
    if not key_str:
        raise ValueError("ENCRYPTION_KEY environment variable is not configured.")
    try:
        # Handle hex string keys
        key_bytes = bytes.fromhex(key_str)
        if len(key_bytes) == 32:
            return key_bytes
    except ValueError:
        pass
    
    key_bytes = key_str.encode("utf-8")
    if len(key_bytes) == 32:
        return key_bytes
        
    raise ValueError("ENCRYPTION_KEY must be exactly 32 bytes (or 64 hex characters).")


def encrypt_token(plain_token: str) -> bytes:
    """
    Encrypts a plaintext token using AES-256-GCM.
    Fails closed if the key is missing or invalid.
    """
    key = _get_encryption_key()
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)  # Standard 12-byte GCM nonce
    encrypted = aesgcm.encrypt(nonce, plain_token.encode("utf-8"), None)
    return nonce + encrypted


def decrypt_token(encrypted_token_bytes: bytes) -> str:
    """
    Decrypts an AES-256-GCM encrypted token.
    Fails closed on authentication tag mismatch or invalid key.
    """
    key = _get_encryption_key()
    if len(encrypted_token_bytes) < 12:
        raise ValueError("Invalid encrypted token payload.")
        
    nonce = encrypted_token_bytes[:12]
    ciphertext = encrypted_token_bytes[12:]
    aesgcm = AESGCM(key)
    decrypted = aesgcm.decrypt(nonce, ciphertext, None)
    return decrypted.decode("utf-8")


async def get_current_user_id(request: Request, strict: bool = False) -> str:
    """
    Dependency helper to resolve user session from HTTP-only secure cookie.
    Checks bitewise_session cookie first, then nutriorder_session.
    If strict=True, requires an explicit session and will not fallback to demo_user.
    """
    session_id = request.cookies.get("bitewise_session") or request.cookies.get("nutriorder_session")
    
    settings = get_settings()
    is_mock = settings.use_mock_mcp or settings.app_env == "development"
    
    if not session_id and is_mock and not strict:
        # Check overrides for Swagger testing
        session_id = request.headers.get("x-user-id") or request.query_params.get("user_id")

    if not session_id:
        if is_mock and not strict:
            session_id = "demo_user"
        else:
            raise HTTPException(status_code=401, detail="Session expired or unauthenticated.")

    from backend.db.session import SessionLocal
    from backend.db.models import User, UserProfile
    
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == session_id).first()
        if not user:
            if is_mock and not strict:
                # Auto-provision user & default profile in mock mode
                user = User(id=session_id, swiggy_user_ref=f"swiggy_{session_id}_ref", auth_provider="guest")
                db.add(user)
                # Auto-provision profile
                profile = UserProfile(
                    user_id=session_id,
                    fitness_goal="maintenance",
                    calorie_target=650,
                    protein_target=35,
                    diet_preference="any",
                    allergies=[],
                    dislikes=[],
                    favorite_cuisines=["indian"]
                )
                db.add(profile)
                db.commit()
            else:
                raise HTTPException(status_code=401, detail="User session not found in database.")
        return session_id
    finally:
        db.close()
