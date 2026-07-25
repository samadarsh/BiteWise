from typing import Any, Dict, List, Optional, Union
from mcp.mcp_client import SwiggyInstamartMCPClient
from mcp.instamart_mock import MockSwiggyInstamartMCP
from backend.db.session import SessionLocal
from backend.db.models import SwiggyToken
from backend.auth.sessions import decrypt_token
from config.settings import get_settings

class ProductionSwiggyInstamartClient:
    """
    Production Swiggy Instamart MCP Client Wrapper. Mirrors ProductionSwiggyClient
    (the Food equivalent) — same token loading, same USE_MOCK_MCP fallback.
    """
    def __init__(self, user_id: str) -> None:
        self.user_id = user_id
        self._client: Optional[Union[SwiggyInstamartMCPClient, MockSwiggyInstamartMCP]] = None

    def _get_initialized_client(self) -> Union[SwiggyInstamartMCPClient, MockSwiggyInstamartMCP]:
        if self._client:
            return self._client

        settings = get_settings()
        if settings.use_mock_mcp:
            self._client = MockSwiggyInstamartMCP(user_id=self.user_id)
            return self._client

        db = SessionLocal()
        try:
            token_record = db.query(SwiggyToken).filter(SwiggyToken.user_id == self.user_id).first()
            if not token_record:
                raise ValueError(f"No Swiggy token registered for user: {self.user_id}")

            decrypted_token = decrypt_token(token_record.encrypted_access_token)

            self._client = SwiggyInstamartMCPClient(
                base_url=settings.swiggy_instamart_mcp_base_url,
                token=decrypted_token
            )
            return self._client
        finally:
            db.close()

    def search_products(self, addressId: str, query: str) -> List[Dict[str, Any]]:
        client = self._get_initialized_client()
        if isinstance(client, MockSwiggyInstamartMCP):
            return client.search_products(query=query)
        return client.search_products(addressId=addressId, query=query)

    def update_cart(self, addressId: str, items: List[Dict[str, Any]]) -> Dict[str, Any]:
        client = self._get_initialized_client()
        if isinstance(client, MockSwiggyInstamartMCP):
            return client.update_cart(items=items)
        return client.update_cart(selectedAddressId=addressId, items=items)

    def get_cart(self) -> Dict[str, Any]:
        client = self._get_initialized_client()
        return client.get_cart()

    def checkout(self, addressId: str, paymentMethod: str = "COD") -> Dict[str, Any]:
        client = self._get_initialized_client()
        return client.checkout(addressId=addressId, paymentMethod=paymentMethod)

    def get_orders(self, count: Optional[int] = 10) -> List[Dict[str, Any]]:
        client = self._get_initialized_client()
        if isinstance(client, MockSwiggyInstamartMCP):
            return client.get_orders(count=count or 10)
        res = client.get_orders(count=count)
        return res if isinstance(res, list) else res.get("orders", [])
