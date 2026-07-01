from typing import Any, Dict, List, Optional
from mcp.mcp_client import SwiggyFoodMCPClient

from backend.db.session import SessionLocal
from backend.db.models import SwiggyToken
from backend.auth.sessions import decrypt_token

class ProductionSwiggyClient:
    """
    Production Swiggy MCP Client Wrapper.
    Loads encrypted OAuth tokens from database and exposes normalized Swiggy tools.
    """
    def __init__(self, user_id: str) -> None:
        self.user_id = user_id
        self._client: Optional[SwiggyFoodMCPClient] = None

    async def _get_initialized_client(self) -> SwiggyFoodMCPClient:
        """
        Retrieves user credentials from DB, decrypts them, and initializes the HTTP client.
        """
        if self._client:
            return self._client
            
        # Open a DB connection session
        db = SessionLocal()
        try:
            token_record = db.query(SwiggyToken).filter(SwiggyToken.user_id == self.user_id).first()
            if not token_record:
                raise ValueError(f"No Swiggy token registered for user: {self.user_id}")
                
            # Decrypt token
            decrypted_token = decrypt_token(token_record.encrypted_access_token)
            
            self._client = SwiggyFoodMCPClient(
                base_url=None,  # Defaults to staging URL
                token=decrypted_token
            )
            return self._client
        finally:
            db.close()

    async def get_addresses(self) -> List[Dict[str, Any]]:
        client = await self._get_initialized_client()
        return client.get_addresses()

    async def search_menu(self, address_id: str, query: str) -> List[Dict[str, Any]]:
        client = await self._get_initialized_client()
        return client.search_menu(addressId=address_id, query=query)
        
    # TODO: Add wrappers for update_food_cart, place_food_order, get_food_orders, etc.
