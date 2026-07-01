import os
from fastapi import Request, HTTPException
from fastapi.security import APIKeyCookie

# Secure session cookie setup
SESSION_COOKIE = APIKeyCookie(name="nutriorder_session", auto_error=False)

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

def _get_encryption_key() -> bytes:
    key_str = os.getenv("ENCRYPTION_KEY")
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

async def get_current_user_id(request: Request) -> str:
    """
    Dependency helper to resolve user session from HTTP-only secure cookie.
    """
    session_id = request.cookies.get("nutriorder_session")
    if not session_id:
        raise HTTPException(status_code=401, detail="Session expired or unauthenticated.")
    
    # TODO: Verify session validity in database
    return "user_1"
