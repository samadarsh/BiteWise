from typing import Dict, Any, Union, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from backend.auth.sessions import get_current_user_id
from backend.auth.rate_limiter import mutating_rate_limiter
from backend.db.session import get_db
from backend.db.models import OrderSession
from backend.orders.state_machine import OrderStatus, transition_session_status
from backend.mcp.swiggy_client import ProductionSwiggyClient
from agent.memory import UserMemoryManager
from agent.personalization import PersonalizationEngine
from agent.pipeline import NutriOrderPipeline

router = APIRouter(prefix="/recommendations", tags=["Recommendations"])

from backend.recommendations.models import SearchRequestSchema
from backend.db.models import UserProfile

@router.post("/search")
async def search_recommendations(
    request: Union[SearchRequestSchema, str],
    query: Optional[str] = None,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
    _rate_limit = Depends(mutating_rate_limiter)
) -> Dict[str, Any]:
    """
    Executes the ranking pipeline for the session query, transitioning status to RECOMMENDATIONS_READY.
    Supports dynamic priority adjustments and constraint relaxation patches.
    """
    if isinstance(request, str):
        session_id = request
        query_str = query or ""
        priorities = None
        relaxation_patch = None
    else:
        session_id = request.session_id
        query_str = request.query
        priorities = request.priorities
        relaxation_patch = request.relaxation_patch

    # 1. Fetch OrderSession
    session_record = db.query(OrderSession).filter(
        OrderSession.id == session_id,
        OrderSession.user_id == user_id
    ).first()
    if not session_record:
        raise HTTPException(status_code=404, detail="Order session not found.")
        
    # Check transition compatibility
    current_status = OrderStatus(session_record.status)
    if current_status not in [OrderStatus.START, OrderStatus.ADDRESS_SELECTED, OrderStatus.SEARCHING, OrderStatus.RECOMMENDATIONS_READY]:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot query recommendations in state {current_status.value}"
        )
        
    # Transition status to SEARCHING
    transition_session_status(db, session_record, OrderStatus.SEARCHING)

    try:
        # 2. Instantiate Swiggy client
        swiggy = ProductionSwiggyClient(user_id=user_id)
        
        # 3. Instantiate DB-backed memory manager
        memory_mgr = UserMemoryManager(db=db, user_id=user_id)
        personalization = PersonalizationEngine()
        
        # 4. Fetch UserProfile for default thresholds
        profile_rec = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
        initial_constraints = {
            "addressId": session_record.address_id or "addr_home",
            "calorie_target": profile_rec.calorie_target if profile_rec else 650,
            "protein_target_g": profile_rec.protein_target if profile_rec else 35,
            "budget_max_rs": profile_rec.meal_budget_default if profile_rec else 300
        }

        # 5. Run ranking pipeline
        pipeline = NutriOrderPipeline(
            mcp_client=swiggy,
            memory_manager=memory_mgr,
            personalization_engine=personalization
        )
        
        address_id = session_record.address_id or "addr_home"
        results = pipeline.run_pipeline(
            raw_input=query_str,
            session_constraints=initial_constraints,
            address_id=address_id,
            skip_cart_update=True,
            custom_priorities=priorities,
            relaxation_patch=relaxation_patch
        )
        
        # 6. Save query and transition status to RECOMMENDATIONS_READY
        session_record.query = query_str
        transition_session_status(db, session_record, OrderStatus.RECOMMENDATIONS_READY)
        db.commit()
        
        # 7. Generate relaxation options if results are empty
        relaxation_options = []
        if not results.get("success", False) or not results.get("recommendations"):
            if profile_rec:
                current_budget = profile_rec.meal_budget_default or 300
                current_calories = profile_rec.calorie_target or 650
                current_protein = profile_rec.protein_target or 35
                
                if current_budget <= 400:
                    relaxation_options.append({
                        "label": f"Increase budget to Rs {current_budget + 100}",
                        "patch": {"budget_max_rs": current_budget + 100},
                        "impact": "Unlocks additional premium dining options"
                    })
                if current_calories <= 700:
                    relaxation_options.append({
                        "label": f"Allow up to {current_calories + 100} kcal",
                        "patch": {"calorie_target": current_calories + 100},
                        "impact": "Displays broader range of protein meals"
                    })
                if current_protein >= 25:
                    relaxation_options.append({
                        "label": f"Relax protein target to {max(20, current_protein - 10)}g",
                        "patch": {"protein_target": max(20, current_protein - 10)},
                        "impact": "Unlocks lighter healthy vegetarian options"
                    })
        
        results["relaxation_options"] = relaxation_options
        
        return {
            "success": True,
            "session_id": session_id,
            "status": OrderStatus.RECOMMENDATIONS_READY.value,
            "results": results
        }
    except Exception as e:
        transition_session_status(db, session_record, OrderStatus.FAILED)
        raise HTTPException(status_code=500, detail=f"Recommendation query failed: {str(e)}")
