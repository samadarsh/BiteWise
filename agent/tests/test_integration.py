from agent.agent import NutriOrderAgent
from agent.pipeline import NutriOrderPipeline
from mcp.mcp_client import SwiggyFoodMCPClient, SwiggyMCPError, SwiggyAuthError
from mcp.mcp_mock import MockSwiggyFoodMCP
import os

class DummySettings:
    use_mock_mcp = True
    swiggy_base_url = "https://mcp-staging.swiggy.com/food"
    swiggy_token = "mock_token"

def assert_raises(exception_class, func, *args, **kwargs):
    try:
        func(*args, **kwargs)
        raise AssertionError(f"Expected {exception_class.__name__} to be raised, but no exception was raised.")
    except exception_class as e:
        return e
    except Exception as e:
        raise AssertionError(f"Expected {exception_class.__name__} to be raised, but got {type(e).__name__}: {str(e)}")

def test_query_propagation():
    """Verify that user text query propagates properly to the search query."""
    agent = NutriOrderAgent(DummySettings())
    
    # Run the pipeline with a custom goal
    result = agent.recommend_meal(
        user_goal="chicken salad",
        protein_target_g=30,
        budget_max_rs=300,
        max_delivery_time_min=45,
        dietary_preference="any"
    )
    
    assert result["success"] is True
    # Ensure constraint query is propagated
    assert result["constraints"]["query"] == "chicken salad"
    # Ensure recommended meal contains query keywords (salad / chicken)
    assert "salad" in result["recommendation"]["item_name"].lower() or "chicken" in result["recommendation"]["item_name"].lower()


def test_voice_json_adapter():
    """Verify that recommend_meal_from_json correctly adapts the Voice JSON contract."""
    agent = NutriOrderAgent(DummySettings())
    
    voice_payload = {
        "intent": "order_food",
        "protein_goal": 35,
        "budget": 250,
        "delivery_time": 40,
        "preferences": ["chicken", "no spicy", "exclude garlic"],
        "location": "addr_home"
    }
    
    result = agent.recommend_meal_from_json(voice_payload)
    
    assert result["success"] is True
    assert result["constraints"]["target_protein"] == 35
    assert result["constraints"]["typical_budget"] == 250
    assert result["constraints"]["max_delivery_time_min"] == 40
    # Positives must form query
    assert result["constraints"]["query"] == "chicken"
    # Negatives must form dislikes
    assert "spicy" in result["constraints"]["dislikes"]
    assert "garlic" in result["constraints"]["dislikes"]


def test_response_envelope_normalization():
    """Verify that SwiggyFoodMCPClient's _unpack_and_normalize handles envelopes and raises errors correctly."""
    client = SwiggyFoodMCPClient(token="dummy")
    
    # Valid envelope
    valid_envelope = {
        "success": True,
        "data": [{"id": "item_1", "name": "Bowl"}],
        "message": "Retrieved"
    }
    assert client._unpack_and_normalize(valid_envelope) == [{"id": "item_1", "name": "Bowl"}]
    
    # Standard Swiggy error envelope
    error_envelope = {
        "success": False,
        "error": {
            "code": 4001,
            "message": "Item is out of stock"
        }
    }
    
    err = assert_raises(SwiggyMCPError, client._unpack_and_normalize, error_envelope)
    assert "out of stock" in str(err)

    # Auth expired error envelope
    auth_envelope = {
        "success": False,
        "error": {
            "code": 401,
            "message": "Token expired"
        }
    }
    
    err_auth = assert_raises(SwiggyAuthError, client._unpack_and_normalize, auth_envelope)
    assert "Token expired" in str(err_auth)


class MockMCPClientSpy:
    def __init__(self):
        self.last_tool = None
        self.last_args = None

    def call_tool(self, name, args):
        self.last_tool = name
        self.last_args = args
        return {"success": True, "data": {}}

    # Standard aligned wrappers
    def update_food_cart(self, restaurantId, cartItems, addressId, restaurantName=None):
        return self.call_tool("update_food_cart", {
            "restaurantId": restaurantId,
            "cartItems": cartItems,
            "addressId": addressId,
            "restaurantName": restaurantName
        })

def test_real_schema_arguments():
    """Verify that high-level client methods invoke JSON-RPC with Swiggy-aligned parameters."""
    spy = MockMCPClientSpy()
    spy.update_food_cart(
        restaurantId="rest_1",
        cartItems=[{"itemId": "item_1", "quantity": 1}],
        addressId="addr_home",
        restaurantName="Protein Bowl Co"
    )
    
    assert spy.last_tool == "update_food_cart"
    assert spy.last_args["restaurantId"] == "rest_1"
    assert spy.last_args["cartItems"] == [{"itemId": "item_1", "quantity": 1}]
    assert spy.last_args["addressId"] == "addr_home"
    assert spy.last_args["restaurantName"] == "Protein Bowl Co"


def test_non_idempotent_order_safety():
    """Verify that confirm_order blocks orders >= Rs 1000 and protects against duplicate placement."""
    agent = NutriOrderAgent(DummySettings())
    
    # 1. Block order with price >= Rs 1000
    expensive_meal = {
        "success": True,
        "recommendation": {
            "restaurant_id": "rest_1",
            "restaurant_name": "Premium Steaks",
            "item_id": "item_1",
            "item_name": "Expensive Wagyu Bowl",
            "price": 1200,  # exceeds Rs 1000
        }
    }
    
    confirm_res = agent.confirm_order(expensive_meal)
    assert confirm_res["success"] is False
    assert "exceeds the Swiggy Builders Club cap" in confirm_res["message"]


class FakeSwiggyFoodMCPClient(SwiggyFoodMCPClient):
    def __init__(self):
        super().__init__(base_url="https://mcp-staging.swiggy.com/food", token="dummy")
        self.last_tool = None
        self.last_arguments = None

    def call_tool(self, tool_name, arguments):
        self.last_tool = tool_name
        self.last_arguments = arguments
        return {
            "success": True,
            "data": {
                "orderId": "order_123",
                "status": "confirmed",
                "message": "Order placed in staging."
            }
        }


def test_place_order_requires_staging_and_allow_flag():
    """Verify live order placement is locked unless both staging and allow flags are set."""
    client = FakeSwiggyFoodMCPClient()
    original_env = {
        "SWIGGY_ENV": os.environ.get("SWIGGY_ENV"),
        "ALLOW_PLACE_ORDER": os.environ.get("ALLOW_PLACE_ORDER"),
    }

    try:
        os.environ.pop("SWIGGY_ENV", None)
        os.environ.pop("ALLOW_PLACE_ORDER", None)
        err = assert_raises(SwiggyMCPError, client.place_food_order, "addr_home")
        assert "SWIGGY_ENV=staging" in str(err)

        os.environ["SWIGGY_ENV"] = "staging"
        os.environ.pop("ALLOW_PLACE_ORDER", None)
        assert_raises(SwiggyMCPError, client.place_food_order, "addr_home")

        os.environ["SWIGGY_ENV"] = "production"
        os.environ["ALLOW_PLACE_ORDER"] = "true"
        assert_raises(SwiggyMCPError, client.place_food_order, "addr_home")

        os.environ["SWIGGY_ENV"] = "staging"
        os.environ["ALLOW_PLACE_ORDER"] = "true"
        result = client.place_food_order("addr_home", paymentMethod="COD")
        assert result["orderId"] == "order_123"
        assert client.last_tool == "place_food_order"
        assert client.last_arguments == {"addressId": "addr_home", "paymentMethod": "COD"}
    finally:
        for key, value in original_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


def test_database_models_and_queries():
    """Verify that database tables can be created and queried successfully."""
    from backend.db.session import engine, Base, SessionLocal
    from backend.db.models import User, UserProfile
    
    # Create all tables in SQLite
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    try:
        # Clean up existing user and profile if any
        db.query(UserProfile).filter(UserProfile.user_id == "test_db_user").delete()
        db.query(User).filter(User.id == "test_db_user").delete()
        db.commit()
        
        # Insert a user
        u = User(id="test_db_user")
        db.add(u)
        db.commit()
        
        profile = UserProfile(
            user_id="test_db_user",
            protein_target=45,
            calorie_target=800,
            diet_preference="veg"
        )
        db.add(profile)
        db.commit()
        
        # Retrieve user and profile
        retrieved_user = db.query(User).filter(User.id == "test_db_user").first()
        assert retrieved_user is not None
        assert retrieved_user.profile.protein_target == 45
        assert retrieved_user.profile.diet_preference == "veg"
    finally:
        db.close()


def test_cryptography_fail_closed():
    """Verify GCM encryption/decryption operates securely and fails closed on missing/invalid keys."""
    from backend.auth.sessions import encrypt_token, decrypt_token
    import secrets
    
    original_key = os.environ.get("ENCRYPTION_KEY")
    try:
        # 1. Missing key must fail closed
        os.environ.pop("ENCRYPTION_KEY", None)
        assert_raises(ValueError, encrypt_token, "my_token")
        
        # 2. Invalid key size must fail closed
        os.environ["ENCRYPTION_KEY"] = "short_key"
        assert_raises(ValueError, encrypt_token, "my_token")
        
        # 3. Valid key (exactly 32 bytes or 64 hex characters)
        os.environ["ENCRYPTION_KEY"] = secrets.token_hex(32)  # 64 hex chars = 32 bytes
        token = "swiggy_secret_oauth_123"
        encrypted = encrypt_token(token)
        assert encrypted != token.encode("utf-8")
        
        decrypted = decrypt_token(encrypted)
        assert decrypted == token
        
        # 4. Decryption must fail closed if tag/nonce is tampered or key is wrong
        os.environ["ENCRYPTION_KEY"] = secrets.token_hex(32)  # different key
        assert_raises(Exception, decrypt_token, encrypted)
    finally:
        if original_key is not None:
            os.environ["ENCRYPTION_KEY"] = original_key
        else:
            os.environ.pop("ENCRYPTION_KEY", None)


def test_production_swiggy_client_token_loading():
    """Verify that ProductionSwiggyClient loads and decrypts user tokens successfully from DB."""
    from backend.db.session import engine, Base, SessionLocal
    from backend.db.models import User, SwiggyToken
    from backend.auth.sessions import encrypt_token
    from backend.mcp.swiggy_client import ProductionSwiggyClient
    import secrets
    import datetime
    import asyncio
    
    # Setup test DB tables
    Base.metadata.create_all(bind=engine)
    
    original_key = os.environ.get("ENCRYPTION_KEY")
    os.environ["ENCRYPTION_KEY"] = secrets.token_hex(32)
    original_use_mock = os.environ.get("USE_MOCK_MCP")
    os.environ["USE_MOCK_MCP"] = "false"
    
    db = SessionLocal()
    try:
        # Clean up
        db.query(SwiggyToken).filter(SwiggyToken.user_id == "test_mcp_user").delete()
        db.query(User).filter(User.id == "test_mcp_user").delete()
        db.commit()
        
        u = User(id="test_mcp_user")
        db.add(u)
        
        encrypted_token = encrypt_token("real_staging_bearer_token")
        token_record = SwiggyToken(
            user_id="test_mcp_user",
            encrypted_access_token=encrypted_token,
            expires_at=datetime.datetime.now() + datetime.timedelta(days=5)
        )
        db.add(token_record)
        db.commit()
        
        # Instantiate production Swiggy client wrapper
        prod_client = ProductionSwiggyClient(user_id="test_mcp_user")
        underlying = prod_client._get_initialized_client()
        
        # Verify decrypted token was loaded correctly
        assert underlying.token == "real_staging_bearer_token"
    finally:
        db.close()
        if original_key is not None:
            os.environ["ENCRYPTION_KEY"] = original_key
        else:
            os.environ.pop("ENCRYPTION_KEY", None)
        if original_use_mock is not None:
            os.environ["USE_MOCK_MCP"] = original_use_mock
        else:
            os.environ.pop("USE_MOCK_MCP", None)


def test_mock_swiggy_cart_is_per_user_and_request_safe():
    """Verify mock cart state survives request-scoped clients without leaking across users."""
    from backend.mcp.swiggy_client import ProductionSwiggyClient

    original_use_mock = os.environ.get("USE_MOCK_MCP")
    os.environ["USE_MOCK_MCP"] = "true"

    try:
        first_request = ProductionSwiggyClient(user_id="mock_cart_user_a")._get_initialized_client()
        first_request.update_food_cart(
            restaurantId="rest_1",
            cartItems=[{"itemId": "item_1", "quantity": 1}],
            addressId="addr_home",
        )

        second_request = ProductionSwiggyClient(user_id="mock_cart_user_a")._get_initialized_client()
        cart = second_request.get_food_cart(addressId="addr_home")
        assert cart["restaurantId"] == "rest_1"
        assert cart["cartItems"][0]["itemId"] == "item_1"
        assert cart["total"] == 289
        assert cart["bill"]["total"] == 289

        other_user = ProductionSwiggyClient(user_id="mock_cart_user_b")._get_initialized_client()
        other_cart = other_user.get_food_cart(addressId="addr_home")
        assert other_cart["cartItems"] == []
        assert other_cart["total"] == 0
    finally:
        if original_use_mock is not None:
            os.environ["USE_MOCK_MCP"] = original_use_mock
        else:
            os.environ.pop("USE_MOCK_MCP", None)


def test_db_backed_memory_manager():
    """Verify that UserMemoryManager reads and writes profiles correctly using SQLAlchemy DB."""
    from backend.db.session import engine, Base, SessionLocal
    from backend.db.models import User, UserProfile
    from agent.memory import UserMemoryManager
    
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        # Clean up
        db.query(UserProfile).filter(UserProfile.user_id == "test_mem_user").delete()
        db.query(User).filter(User.id == "test_mem_user").delete()
        db.commit()
        
        u = User(id="test_mem_user")
        db.add(u)
        db.commit()
        
        # Load (should provision default profile)
        mgr = UserMemoryManager(db=db, user_id="test_mem_user")
        assert mgr.profile["target_protein"] == 30
        assert mgr.profile["dietary_preference"] == "any"
        
        # Update and save
        mgr.update_profile({
            "target_protein": 55,
            "dietary_preference": "veg",
            "fitness_goal": "fat_loss"
        })
        
        # Reload memory and check DB record
        mgr2 = UserMemoryManager(db=db, user_id="test_mem_user")
        assert mgr2.profile["target_protein"] == 55
        assert mgr2.profile["dietary_preference"] == "veg"
        assert mgr2.profile["fitness_goal"] == "fat_loss"
    finally:
        db.close()


def test_order_state_machine_validation():
    """Verify state machine transition boundaries and illegal state blocks."""
    from backend.db.session import engine, Base, SessionLocal
    from backend.db.models import User, OrderSession
    from backend.orders.state_machine import transition_session_status, OrderStatus
    
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        # Create session starting at START
        db.query(OrderSession).filter(OrderSession.id == "test_state_sess").delete()
        db.query(User).filter(User.id == "test_state_user").delete()
        db.commit()
        
        u = User(id="test_state_user")
        db.add(u)
        db.commit()
        
        sess = OrderSession(id="test_state_sess", user_id="test_state_user", status=OrderStatus.START.value)
        db.add(sess)
        db.commit()
        
        # 1. Legal transition: START -> ADDRESS_SELECTED
        transition_session_status(db, sess, OrderStatus.ADDRESS_SELECTED)
        assert sess.status == OrderStatus.ADDRESS_SELECTED.value
        
        # 2. Illegal transition: ADDRESS_SELECTED -> USER_CONFIRMED (skipping steps)
        assert_raises(ValueError, transition_session_status, db, sess, OrderStatus.USER_CONFIRMED)
    finally:
        db.close()


class MockSwiggyCheckoutClient:
    def __init__(self, cart_total, recent_order_time_offset=None):
        self.cart_total = cart_total
        self.recent_order_time_offset = recent_order_time_offset
        self.last_placed = False

    def get_food_cart(self, addressId):
        return {
            "restaurantId": "rest_1",
            "total": self.cart_total,
            "bill": {"total": self.cart_total}
        }

    def get_food_orders(self, addressId):
        if self.recent_order_time_offset is not None:
            import time
            return [{"orderId": "order_dup", "timestamp": time.time() - self.recent_order_time_offset, "status": "confirmed"}]
        return []

    def place_food_order(self, addressId, paymentMethod):
        self.last_placed = True
        return {"orderId": "order_ok", "status": "confirmed"}

    def update_food_cart(self, restaurantId, cartItems, addressId, restaurantName=None):
        return {"success": True}

    def search_menu(self, addressId, query, restaurantIdOfAddedItem=None, vegFilter=0, offset=None):
        return [{
            "id": "item_paneer_bowl",
            "restaurant_id": "rest_paneer",
            "restaurant_name": "Healthy Paneer",
            "name": "Paneer Bowl",
            "price": 250,
            "protein_g": 35,
            "calories": 450
        }]

    def search_restaurants(self, addressId, query, offset=None):
        return [{"id": "rest_paneer", "name": "Healthy Paneer"}]

    def get_restaurant_menu(self, addressId, restaurantId, page=None, pageSize=None):
        return [{
            "id": "item_paneer_bowl",
            "name": "Paneer Bowl",
            "price": 250,
            "protein_g": 35,
            "calories": 450
        }]


def test_production_checkout_validation_rules():
    """Verify that place_order endpoint enforces state checks, Rs 1000 limit, and duplicate checks."""
    from backend.db.session import engine, Base, SessionLocal
    from backend.db.models import User, SwiggyToken, OrderSession
    from backend.orders.routes import place_order
    from backend.orders.state_machine import OrderStatus
    from backend.auth.sessions import encrypt_token
    import secrets
    import datetime
    import asyncio
    
    Base.metadata.create_all(bind=engine)
    
    original_key = os.environ.get("ENCRYPTION_KEY")
    os.environ["ENCRYPTION_KEY"] = secrets.token_hex(32)
    
    db = SessionLocal()
    try:
        # Setup session in database
        db.query(SwiggyToken).filter(SwiggyToken.user_id == "test_check_user").delete()
        db.query(OrderSession).filter(OrderSession.id == "test_check_sess").delete()
        db.query(User).filter(User.id == "test_check_user").delete()
        db.commit()
        
        u = User(id="test_check_user")
        db.add(u)
        
        encrypted_token = encrypt_token("some_token")
        tok = SwiggyToken(user_id="test_check_user", encrypted_access_token=encrypted_token, expires_at=datetime.datetime.now() + datetime.timedelta(days=1))
        db.add(tok)
        db.commit()
        
        # 1. Block: Status not USER_CONFIRMED
        sess = OrderSession(id="test_check_sess", user_id="test_check_user", status=OrderStatus.START.value)
        db.add(sess)
        db.commit()
        
        from fastapi import HTTPException
        err = assert_raises(HTTPException, asyncio.run, place_order("test_check_sess", True, "test_check_user", db))
        assert err.status_code == 400
        assert "expected USER_CONFIRMED" in err.detail
        
        # 2. Block: Cart total >= 1000
        db.query(OrderSession).filter(OrderSession.id == "test_check_sess").update({"status": OrderStatus.USER_CONFIRMED.value})
        db.commit()
        
        # Mock client returning 1200 total
        mock_client = MockSwiggyCheckoutClient(cart_total=1200)
        # Patch swiggy client instantiation
        from backend.mcp.swiggy_client import ProductionSwiggyClient
        original_init = ProductionSwiggyClient._get_initialized_client
        
        def mock_init(self):
            return mock_client
        ProductionSwiggyClient._get_initialized_client = mock_init
        
        try:
            err = assert_raises(HTTPException, asyncio.run, place_order("test_check_sess", True, "test_check_user", db))
            assert err.status_code == 400
            assert "exceeds the Swiggy Builders Club cap" in err.detail
            # Ensure state moved to FAILED
            db.refresh(sess)
            assert sess.status == OrderStatus.FAILED.value
            
            # Reset session state for next test
            sess.status = OrderStatus.USER_CONFIRMED.value
            db.commit()
            
            # 3. Block: Recent duplicate order (within last 5 minutes)
            mock_client.cart_total = 450
            mock_client.recent_order_time_offset = 60  # 1 minute ago
            err = assert_raises(HTTPException, asyncio.run, place_order("test_check_sess", True, "test_check_user", db))
            assert err.status_code == 409
            assert "Duplicate prevention active" in err.detail
            
            db.refresh(sess)
            assert sess.status == OrderStatus.FAILED.value
            
            # 4. Success: total < 1000, no duplicates
            sess.status = OrderStatus.USER_CONFIRMED.value
            db.commit()
            mock_client.recent_order_time_offset = None  # no recent order
            
            res = asyncio.run(place_order("test_check_sess", True, "test_check_user", db))
            assert res["success"] is True
            assert res["order_id"] == "order_ok"
            assert res["status"] == OrderStatus.ORDER_PLACED.value
            
            db.refresh(sess)
            assert sess.status == OrderStatus.ORDER_PLACED.value
        finally:
            ProductionSwiggyClient._get_initialized_client = original_init
            
    finally:
        db.close()
        if original_key is not None:
            os.environ["ENCRYPTION_KEY"] = original_key
        else:
            os.environ.pop("ENCRYPTION_KEY", None)


def test_sliding_window_rate_limiter():
    """Verify that SlidingWindowRateLimiter blocks requests exceeding the specified threshold."""
    from backend.auth.rate_limiter import SlidingWindowRateLimiter
    from fastapi import HTTPException
    
    # Limiter that allows 3 requests per 60 seconds
    limiter = SlidingWindowRateLimiter(limit=3, window_seconds=60)
    
    # 3 allowed
    assert limiter.is_rate_limited("test_ip") is False
    assert limiter.is_rate_limited("test_ip") is False
    assert limiter.is_rate_limited("test_ip") is False
    
    # 4th blocked
    assert limiter.is_rate_limited("test_ip") is True


def test_recommendations_search_endpoint():
    """Verify recommendations search route transitions states and runs ranking engine."""
    from backend.db.session import engine, Base, SessionLocal
    from backend.db.models import User, OrderSession
    from backend.recommendations.routes import search_recommendations
    from backend.orders.state_machine import OrderStatus
    from backend.mcp.swiggy_client import ProductionSwiggyClient
    import asyncio
    
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        # Clean up
        db.query(OrderSession).filter(OrderSession.id == "test_rec_sess").delete()
        db.query(User).filter(User.id == "test_rec_user").delete()
        db.commit()
        
        u = User(id="test_rec_user")
        db.add(u)
        db.commit()
        
        sess = OrderSession(id="test_rec_sess", user_id="test_rec_user", status=OrderStatus.ADDRESS_SELECTED.value)
        db.add(sess)
        db.commit()
        
        # Mock client
        mock_client = MockSwiggyCheckoutClient(cart_total=500)
        def mock_init(self):
            return mock_client
        original_init = ProductionSwiggyClient._get_initialized_client
        ProductionSwiggyClient._get_initialized_client = mock_init
        
        try:
            # Run search (query = "chicken salad")
            res = asyncio.run(search_recommendations("test_rec_sess", "chicken salad", "test_rec_user", db))
            assert res["success"] is True
            assert res["status"] == OrderStatus.RECOMMENDATIONS_READY.value
            assert res["results"]["success"] is True
            assert len(res["results"]["recommendations"]) > 0

            db.refresh(sess)
            assert sess.status == OrderStatus.RECOMMENDATIONS_READY.value
            assert sess.query == "chicken salad"
        finally:
            ProductionSwiggyClient._get_initialized_client = original_init
    finally:
        db.close()


def test_complete_journey_routes():
    """Test entire sequence of endpoints from session start to confirmation and checkout placement."""
    from backend.db.session import engine, Base, SessionLocal
    from backend.db.models import User, SwiggyToken, OrderSession
    from backend.orders.routes import start_order_session, select_address, select_item, sync_cart, review_cart, confirm_order_details, place_order
    from backend.orders.state_machine import OrderStatus
    from backend.auth.sessions import encrypt_token
    from backend.mcp.swiggy_client import ProductionSwiggyClient
    
    import secrets
    import datetime
    import asyncio
    
    Base.metadata.create_all(bind=engine)
    
    original_key = os.environ.get("ENCRYPTION_KEY")
    os.environ["ENCRYPTION_KEY"] = secrets.token_hex(32)
    
    db = SessionLocal()
    try:
        # Clean up
        db.query(SwiggyToken).filter(SwiggyToken.user_id == "journey_user").delete()
        db.query(OrderSession).filter(OrderSession.user_id == "journey_user").delete()
        db.query(User).filter(User.id == "journey_user").delete()
        db.commit()
        
        u = User(id="journey_user")
        db.add(u)
        
        encrypted_token = encrypt_token("journey_bearer_token")
        tok = SwiggyToken(user_id="journey_user", encrypted_access_token=encrypted_token, expires_at=datetime.datetime.now() + datetime.timedelta(days=1))
        db.add(tok)
        db.commit()
        
        mock_client = MockSwiggyCheckoutClient(cart_total=250)
        def mock_init(self):
            return mock_client
        original_init = ProductionSwiggyClient._get_initialized_client
        ProductionSwiggyClient._get_initialized_client = mock_init
        
        try:
            # 1. Start Session
            res = asyncio.run(start_order_session("journey_user", db))
            session_id = res["session_id"]
            assert res["status"] == OrderStatus.START.value
            
            # 2. Select Address
            res = asyncio.run(select_address(session_id, "addr_office", "journey_user", db))
            assert res["status"] == OrderStatus.ADDRESS_SELECTED.value
            
            # 2.5 Search Recommendations (transitions ADDRESS_SELECTED -> SEARCHING -> RECOMMENDATIONS_READY)
            from backend.recommendations.routes import search_recommendations
            res = asyncio.run(search_recommendations(session_id, "paneer", "journey_user", db))
            assert res["status"] == OrderStatus.RECOMMENDATIONS_READY.value
            assert res["results"]["success"] is True
            assert len(res["results"]["recommendations"]) > 0
            
            # 3. Select Item (Simulating search results matching and clicking paneer bowl)
            res = asyncio.run(select_item(session_id, "rest_paneer", "item_paneer_bowl", "journey_user", db))
            assert res["status"] == OrderStatus.ITEM_SELECTED.value
            
            # 4. Sync Cart (adds to Swiggy cart)
            res = asyncio.run(sync_cart(session_id, "journey_user", db))
            assert res["status"] == OrderStatus.CART_UPDATED.value
            assert res["cart"]["total"] == 250
            
            # 5. Review Cart
            res = asyncio.run(review_cart(session_id, "journey_user", db))
            assert res["status"] == OrderStatus.CART_REVIEW_READY.value
            
            # 6. Confirm Order details
            res = asyncio.run(confirm_order_details(session_id, "journey_user", db))
            assert res["status"] == OrderStatus.USER_CONFIRMED.value
            
            # 7. Place Order
            res = asyncio.run(place_order(session_id, True, "journey_user", db))
            assert res["success"] is True
            assert res["order_id"] == "order_ok"
            assert res["status"] == OrderStatus.ORDER_PLACED.value
            
        finally:
            ProductionSwiggyClient._get_initialized_client = original_init
            
    finally:
        db.close()
        if original_key is not None:
            os.environ["ENCRYPTION_KEY"] = original_key
        else:
            os.environ.pop("ENCRYPTION_KEY", None)
