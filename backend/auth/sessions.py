import os
import hmac
import hashlib
from typing import Optional
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


def _get_session_secret() -> bytes:
    """Secret material for HMAC-signing session tokens. Prefers SESSION_SECRET,
    falls back to the already-required ENCRYPTION_KEY."""
    settings = get_settings()
    secret = settings.session_secret or settings.encryption_key
    if not secret:
        raise ValueError("Neither SESSION_SECRET nor ENCRYPTION_KEY is configured for session signing.")
    return secret.encode("utf-8")


def sign_session(user_id: str) -> str:
    """Produce a tamper-evident session token of the form `<user_id>.<hmac>`.

    If no secret is configured (only possible in a misconfigured local dev box),
    degrade to the raw user_id so guest login still works; verify_session will
    then reject it and the dev/mock fallback in get_current_user_id takes over.
    """
    try:
        secret = _get_session_secret()
    except Exception:
        return user_id
    sig = hmac.new(secret, user_id.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{user_id}.{sig}"


def verify_session(value: Optional[str]) -> Optional[str]:
    """Return the user_id from a validly-signed session token, else None.

    Constant-time comparison. Never trusts an unsigned value."""
    if not value or "." not in value:
        return None
    user_id, _, sig = value.rpartition(".")
    if not user_id or not sig:
        return None
    try:
        expected = hmac.new(_get_session_secret(), user_id.encode("utf-8"), hashlib.sha256).hexdigest()
    except Exception:
        return None
    if hmac.compare_digest(sig, expected):
        return user_id
    return None


def set_session_cookies(response: Response, user_id: str, max_age: int = 30 * 86400) -> None:
    is_secure = should_use_secure_cookies()
    samesite = "none" if is_secure else "lax"
    signed_value = sign_session(user_id)
    for cookie_name in SESSION_COOKIE_NAMES:
        response.set_cookie(
            key=cookie_name,
            value=signed_value,
            httponly=True,
            secure=is_secure,
            samesite=samesite,
            max_age=max_age
        )


def clear_session_cookies(response: Response) -> None:
    is_secure = should_use_secure_cookies()
    samesite = "none" if is_secure else "lax"
    for cookie_name in SESSION_COOKIE_NAMES:
        response.delete_cookie(
            key=cookie_name,
            httponly=True,
            secure=is_secure,
            samesite=samesite,
        )


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
    Resolve the authenticated user from the request.

    Production/staging: only a validly HMAC-signed session token (delivered via the
    session cookie or an Authorization Bearer header) is trusted. Unsigned values and
    the x-user-id / ?user_id inputs are ignored, so identity cannot be spoofed.

    Mock/development: unsigned identifiers are additionally accepted so local demos
    and tests keep working without a real login.
    """
    settings = get_settings()
    is_mock = settings.use_mock_mcp or settings.app_env == "development"

    cookie_val = request.cookies.get("bitewise_session") or request.cookies.get("nutriorder_session")

    bearer_val = None
    auth_header = request.headers.get("authorization")
    if auth_header and auth_header.lower().startswith("bearer "):
        bearer_val = auth_header[7:].strip()

    header_val = request.headers.get("x-user-id") or request.query_params.get("user_id")

    # 1. Trusted path (all environments): a validly-signed session token.
    session_id = None
    for candidate in (cookie_val, bearer_val):
        verified = verify_session(candidate)
        if verified:
            session_id = verified
            break

    # 2. Dev/mock-only convenience: accept unsigned identifiers (legacy localStorage
    #    flow, direct header/query in tests). Never reachable in staging/production.
    if not session_id and is_mock:
        session_id = cookie_val or bearer_val or header_val

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
