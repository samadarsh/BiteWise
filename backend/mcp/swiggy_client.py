import os
from typing import Any, Dict, List, Optional, Union
from mcp.mcp_client import SwiggyFoodMCPClient
from mcp.mcp_mock import MockSwiggyFoodMCP
from backend.db.session import SessionLocal
from backend.db.models import SwiggyToken
from backend.auth.sessions import decrypt_token

class ProductionSwiggyClient:
    """
    Production Swiggy MCP Client Wrapper.
    Loads encrypted OAuth tokens from database and exposes normalized Swiggy tools.
    All methods are synchronous to align with the AI recommendation pipeline execution.
    """
    def __init__(self, user_id: str) -> None:
        self.user_id = user_id
        self._client: Optional[Union[SwiggyFoodMCPClient, MockSwiggyFoodMCP]] = None

    def _get_initialized_client(self) -> Union[SwiggyFoodMCPClient, MockSwiggyFoodMCP]:
        """
        Retrieves user credentials from DB, decrypts them, and initializes the HTTP client.
        If USE_MOCK_MCP=true, returns MockSwiggyFoodMCP instead.
        """
        if self._client:
            return self._client

        # Mock mode fallback
        if os.getenv("USE_MOCK_MCP", "true").lower() == "true":
            self._client = MockSwiggyFoodMCP(user_id=self.user_id)
            return self._client
            
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

    def get_addresses(self) -> List[Dict[str, Any]]:
        client = self._get_initialized_client()
        return client.get_addresses()

    def search_menu(self, addressId: str, query: str, restaurantIdOfAddedItem: Optional[str] = None, vegFilter: Optional[int] = None, offset: Optional[int] = None) -> List[Dict[str, Any]]:
        client = self._get_initialized_client()
        return client.search_menu(
            addressId=addressId,
            query=query,
            restaurantIdOfAddedItem=restaurantIdOfAddedItem,
            vegFilter=vegFilter,
            offset=offset
        )

    def search_restaurants(self, addressId: str, query: str, offset: Optional[int] = None) -> List[Dict[str, Any]]:
        client = self._get_initialized_client()
        return client.search_restaurants(addressId=addressId, query=query, offset=offset)

    def get_restaurant_menu(self, addressId: str, restaurantId: str, page: Optional[int] = None, pageSize: Optional[int] = None) -> List[Dict[str, Any]]:
        client = self._get_initialized_client()
        return client.get_restaurant_menu(addressId=addressId, restaurantId=restaurantId, page=page, pageSize=pageSize)

    def update_food_cart(self, restaurantId: str, cartItems: List[Dict[str, Any]], addressId: str, restaurantName: Optional[str] = None) -> Dict[str, Any]:
        client = self._get_initialized_client()
        return client.update_food_cart(restaurantId=restaurantId, cartItems=cartItems, addressId=addressId, restaurantName=restaurantName)

    def get_food_cart(self, addressId: str, restaurantName: Optional[str] = None) -> Dict[str, Any]:
        client = self._get_initialized_client()
        return client.get_food_cart(addressId=addressId, restaurantName=restaurantName)

    def place_food_order(self, addressId: str, paymentMethod: Optional[str] = "COD") -> Dict[str, Any]:
        client = self._get_initialized_client()
        return client.place_food_order(addressId=addressId, paymentMethod=paymentMethod)

    def get_food_orders(self, addressId: str, orderCount: Optional[int] = None) -> List[Dict[str, Any]]:
        client = self._get_initialized_client()
        return client.get_food_orders(addressId=addressId, orderCount=orderCount)

    def track_food_order(self, orderId: str) -> Dict[str, Any]:
        client = self._get_initialized_client()
        return client.track_food_order(orderId=orderId)
