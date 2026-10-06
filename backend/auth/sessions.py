import os
import base64
import binascii
import hmac
import hashlib
import secrets
import time
from typing import Optional, Tuple
from fastapi import Request, HTTPException, Response
from fastapi.security import APIKeyCookie
from sqlalchemy.exc import IntegrityError
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from config.settings import get_settings

# Secure session cookie setup (primary: bitewise_session, fallback: nutriorder_session)
SESSION_COOKIE_NAMES = ("bitewise_session", "nutriorder_session")
BITEWISE_SESSION_COOKIE = APIKeyCookie(name="bitewise_session", auto_error=False)
LEGACY_SESSION_COOKIE = APIKeyCookie(name="nutriorder_session", auto_error=False)


def should_use_secure_cookies(request: Request) -> bool:
    """
    Secure/SameSite=None cookies only work reliably when the connection is
    actually HTTPS — a browser won't consistently persist a Secure cookie
    set over plain http:// and then return it on a later top-level
    navigation (exactly what an OAuth redirect back from Swiggy is).

    Previously this was `not settings.use_mock_mcp` — real mode always
    forced Secure/SameSite=None, mock mode never did, regardless of the
    actual connection. That broke the real Swiggy OAuth callback on local
    dev (real mode running on plain http://localhost): the oauth_state/
    oauth_code_verifier cookies from /auth/swiggy/start silently failed to
    round-trip, so the callback's CSRF state check always failed with
    "OAuth state parameter mismatch" even on a fully correct login.

    Detects the actual scheme, honoring X-Forwarded-Proto for a
    reverse-proxied deployment (Vercel/Render terminate TLS in front of the
    app, so request.url.scheme as FastAPI sees it is "http" even in
    production unless this header is trusted).
    """
    forwarded_proto = request.headers.get("x-forwarded-proto", "").split(",")[0].strip().lower()
    scheme = forwarded_proto or request.url.scheme
    return scheme == "https"


def _get_session_secret() -> bytes:
    """Secret material for HMAC-signing session tokens. Prefers SESSION_SECRET,
    falls back to the already-required ENCRYPTION_KEY."""
    settings = get_settings()
    secret = settings.session_secret or settings.encryption_key
    if not secret:
        raise ValueError("Neither SESSION_SECRET nor ENCRYPTION_KEY is configured for session signing.")
    return secret.encode("utf-8")


SESSION_TTL_SECONDS = 30 * 86400
# /auth/me hands out a fresh token once the current one is this old, so an
# active user's 30-day session slides forward instead of expiring.
SESSION_RENEW_AFTER_SECONDS = 7 * 86400


def sign_session(user_id: str, issued_at_ms: Optional[int] = None) -> str:
    """Produce a tamper-evident session token `<user_id>.<issued_at_ms>.<hmac>`.

    The issue time lets tokens expire (SESSION_TTL_SECONDS) and be revoked
    (User.sessions_revoked_at). The old format `<user_id>.<hmac>` had
    neither: a leaked token worked forever, even after logout.

    If no secret is configured (only possible in a misconfigured local dev box),
    degrade to the raw user_id; verify_session rejects it.
    """
    try:
        secret = _get_session_secret()
    except Exception:
        return user_id
    issued = issued_at_ms if issued_at_ms is not None else int(time.time() * 1000)
    body = f"{user_id}.{issued}"
    sig = hmac.new(secret, body.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{body}.{sig}"


def parse_session(value: Optional[str]) -> Optional[Tuple[str, Optional[int]]]:
    """Returns (user_id, issued_at_ms) for a validly-signed, unexpired token.

    issued_at_ms is None for a legacy `<user_id>.<hmac>` token: those are
    still accepted (so existing guests keep their accounts) until the user
    logs out, which revokes them. Constant-time comparison; never trusts an
    unsigned value."""
    if not value or "." not in value:
        return None
    body, _, sig = value.rpartition(".")
    if not body or not sig:
        return None
    try:
        expected = hmac.new(_get_session_secret(), body.encode("utf-8"), hashlib.sha256).hexdigest()
    except Exception:
        return None
    if not hmac.compare_digest(sig, expected):
        return None

    user_part, dot, issued = body.rpartition(".")
    if dot and user_part and issued.isdigit():
        issued_ms = int(issued)
        now = time.time()
        if issued_ms / 1000 + SESSION_TTL_SECONDS < now or issued_ms / 1000 > now + 300:
            return None
        return user_part, issued_ms
    # App user ids never contain ".", so a dot-free body is a legacy token.
    return body, None


def verify_session(value: Optional[str]) -> Optional[str]:
    """Return the user_id from a validly-signed, unexpired session token, else None."""
    parsed = parse_session(value)
    return parsed[0] if parsed else None


def session_is_revoked(user, issued_at_ms: Optional[int]) -> bool:
    """True when the user logged out after this token was issued (legacy
    tokens, which carry no issue time, count as issued before any logout)."""
    revoked_at = getattr(user, "sessions_revoked_at", None)
    if not revoked_at:
        return False
    if issued_at_ms is None:
        return True
    return issued_at_ms <= int(revoked_at.timestamp() * 1000)


OAUTH_STATE_MAX_AGE_SECONDS = 600


def sign_oauth_state(user_id: str, now: Optional[float] = None) -> str:
    """Build a Swiggy OAuth `state` value that binds the flow to the BiteWise
    user who started it: `<nonce>.<user_id>.<issued_at>.<hmac>`.

    The callback trusts the user id only because this server signed it —
    previously state was the plain string `<random>:<user_id>`, so anyone
    could hand-craft a state naming another user and be logged in as them."""
    nonce = secrets.token_urlsafe(16)
    issued_at = int(now if now is not None else time.time())
    payload = f"{nonce}.{user_id}.{issued_at}"
    sig = hmac.new(_get_session_secret(), f"oauth_state:{payload}".encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{payload}.{sig}"


def verify_oauth_state(state: Optional[str], now: Optional[float] = None) -> Optional[str]:
    """Return the user id from a state produced by sign_oauth_state, or None
    if it is malformed, tampered with, or older than OAUTH_STATE_MAX_AGE_SECONDS."""
    if not state or state.count(".") < 3:
        return None
    payload, _, sig = state.rpartition(".")
    nonce, _, rest = payload.partition(".")
    user_id, _, issued_raw = rest.rpartition(".")
    if not nonce or not user_id or not issued_raw.isdigit():
        return None
    try:
        expected = hmac.new(_get_session_secret(), f"oauth_state:{payload}".encode("utf-8"), hashlib.sha256).hexdigest()
    except Exception:
        return None
    if not hmac.compare_digest(sig, expected):
        return None
    age = (now if now is not None else time.time()) - int(issued_raw)
    if age < 0 or age > OAUTH_STATE_MAX_AGE_SECONDS:
        return None
    return user_id


def set_session_cookies(request: Request, response: Response, user_id: str, max_age: int = 30 * 86400) -> None:
    is_secure = should_use_secure_cookies(request)
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


def clear_session_cookies(request: Request, response: Response) -> None:
    is_secure = should_use_secure_cookies(request)
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

    # Base64 of 32 random bytes — what render.yaml's `generateValue: true`
    # produces; previously rejected, which broke Swiggy connect on Render.
    try:
        decoded = base64.b64decode(key_str, validate=True)
        if len(decoded) == 32:
            return decoded
    except (ValueError, binascii.Error):
        pass

    raise ValueError("ENCRYPTION_KEY must be 32 bytes: 64 hex characters, 32 raw characters, or base64 of 32 bytes.")


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


def get_current_user_id(request: Request, strict: bool = False) -> str:
    """FastAPI dependency wrapper — see resolve_current_user_id.

    Plain `def` on purpose: FastAPI runs sync dependencies in its threadpool.
    As `async def`, this ran its blocking DB pool checkout on the event loop;
    under ~15+ concurrent requests the pool ran dry, the loop blocked waiting
    for a connection, and the loop is also what schedules the teardown that
    returns connections — so the server deadlocked until the 30s pool timeout.
    """
    return resolve_current_user_id(request, strict=strict)


def resolve_current_user_id(request: Request, strict: bool = False) -> str:
    """
    Resolve the authenticated user from the request.

    Only a validly HMAC-signed session token (delivered via the session cookie
    or an Authorization Bearer header) is trusted. Unsigned values and the
    x-user-id / ?user_id inputs are ignored, so identity cannot be spoofed.

    Mock mode only adds one convenience: a request with no session at all
    (and strict=False) falls back to the shared "demo_user" account.
    """
    settings = get_settings()
    is_mock = settings.use_mock_mcp

    cookie_val = request.cookies.get("bitewise_session") or request.cookies.get("nutriorder_session")

    bearer_val = None
    auth_header = request.headers.get("authorization")
    if auth_header and auth_header.lower().startswith("bearer "):
        bearer_val = auth_header[7:].strip()

    # Only a validly-signed session token is ever trusted — in every mode.
    # Mock mode used to also accept an unsigned cookie/Bearer/x-user-id/
    # ?user_id value, which let anyone act as any user on the public demo
    # instance just by knowing (or guessing) their user id.
    from backend.db.session import SessionLocal
    from backend.db.models import User, UserProfile

    session_id = None
    issued_at_ms = None
    db = SessionLocal()
    try:
        for candidate in (cookie_val, bearer_val):
            parsed = parse_session(candidate)
            if not parsed:
                continue
            candidate_user = db.query(User).filter(User.id == parsed[0]).first()
            if candidate_user is not None and session_is_revoked(candidate_user, parsed[1]):
                continue
            session_id, issued_at_ms = parsed
            break
    finally:
        db.close()

    if not session_id:
        if is_mock and not strict:
            session_id = "demo_user"
        else:
            raise HTTPException(status_code=401, detail="Session expired or unauthenticated.")

    # /auth/me reads this to decide whether to hand out a renewed token.
    request.state.session_issued_at_ms = issued_at_ms

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
                try:
                    db.commit()
                except IntegrityError:
                    # A concurrent request provisioned the same user first.
                    db.rollback()
            else:
                raise HTTPException(status_code=401, detail="User session not found in database.")
        return session_id
    finally:
        db.close()
