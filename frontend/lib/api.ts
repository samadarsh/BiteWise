export const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

/**
 * Standard API error wrapper.
 */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

/**
 * Standard fetch helper that attaches cookies and parses JSON.
 */
async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, {
    ...options,
    credentials: "include", // Send and receive session cookies
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    let errMsg = "An unexpected error occurred.";
    try {
      const data = await response.json();
      errMsg = data.detail || data.message || errMsg;
    } catch {
      try {
        errMsg = await response.text() || errMsg;
      } catch {
        // Fallback
      }
    }
    throw new ApiError(errMsg, response.status);
  }

  return response.json() as Promise<T>;
}

// Type Interfaces
export interface UserProfile {
  protein_target: number;
  calorie_target: number;
  diet_preference: string;
  allergies: string[];
  dislikes: string[];
  favorite_cuisines: string[];
  fitness_goal: string;
  age?: number | null;
  gender?: string | null;
  height_cm?: number | null;
  weight_kg?: number | null;
  activity_level: string;
  meal_budget_default: number;
  preferred_meal_times: Record<string, string>;
  spice_tolerance: string;
  daily_calories?: number;
  daily_protein?: number;
}

export interface Address {
  id: string;
  label: string;
  display_text: string;
}

export interface OrderSessionResponse {
  session_id: string;
  status: string;
}

export interface RecommendationMeal {
  id: string;
  name: string;
  restaurant: string;
  price: number;
  eta: string;
  protein: string;
  calories: string;
  score: number;
  reasons: string[];
  why_this_meal?: string[];
  tradeoffs?: string[];
  confidence?: number;
  is_estimated?: boolean;
  restaurant_id?: string;
  item_id?: string;
  restaurant_name?: string;
  distance_km?: number;
  delivery_time_spoken?: string;
  short_description?: string;
}

export interface RecommendationResponse {
  success: boolean;
  session_id: string;
  status: string;
  results: {
    success: boolean;
    recommendation: {
      item_id: string;
      restaurant_id: string;
      restaurant_name: string;
      name?: string;
      item_name?: string;
      price: number;
      delivery_time_min: number;
      protein_g: number;
      calories?: number;
      [key: string]: unknown;
    };
    recommendations: Array<{
      item_id: string;
      restaurant_id: string;
      restaurant_name: string;
      name?: string;
      item_name?: string;
      price: number;
      delivery_time_min: number;
      protein_g: number;
      calories?: number;
      match_score?: number;
      explanations?: string[];
      why_this_meal?: string[];
      tradeoffs?: string[];
      confidence?: number;
      is_estimated?: boolean;
      [key: string]: unknown;
    }>;
    relaxation_options?: Array<{
      label: string;
      patch: Record<string, unknown>;
      impact: string;
    }>;
  };
}

export interface CartInfo {
  restaurantId: string;
  restaurantName?: string;
  cartItems: Array<{
    itemId: string;
    quantity: number;
  }>;
  total?: number;
  applied_coupon?: string;
  discount_amount?: number;
  bill?: {
    total: number;
  };
}

export interface CartResponse {
  session_id: string;
  cart: CartInfo;
  status: string;
}

export interface ConfirmResponse {
  session_id: string;
  confirmed: boolean;
  status: string;
}

export interface PlaceOrderResponse {
  session_id: string;
  order_res?: {
    orderId: string;
    status: string;
    message?: string;
  };
  order_id?: string;
  status: string;
}

export interface Coupon {
  code: string;
  description: string;
  discount_amount: number;
  requiresOnlinePayment: boolean;
}

export interface CouponsResponse {
  success: boolean;
  coupons: Coupon[];
}

export interface CoachStatusResponse {
  target_calories: number;
  target_protein: number;
  consumed_calories: number;
  consumed_protein: number;
  remaining_calories: number;
  remaining_protein: number;
}

export interface NutritionEntry {
  id: number;
  user_id: string;
  entry_date: string;
  meal_name: string;
  restaurant_name?: string | null;
  calories: number;
  protein_g: number;
  carbs_g?: number | null;
  fat_g?: number | null;
  source: string;
  confidence: number;
  is_estimated: boolean;
  order_session_id?: string | null;
  created_at: string;
}

export interface CoachNextMealResponse {
  success: boolean;
  message: string;
  target_met?: boolean;
  status?: string;
  today_status?: CoachStatusResponse;
  results?: RecommendationResponse;
}

export interface SwiggyOAuthStartResponse {
  code_challenge: string;
  redirect_url: string;
}

export interface HouseholdMember {
  id: string;
  household_id: string;
  user_id?: string | null;
  name: string;
  dietary_preference: string;
  allergies: string[];
  calorie_target?: number | null;
  protein_target?: number | null;
}

export interface Household {
  id: string;
  name: string;
  members: HouseholdMember[];
}

export interface PantryItem {
  id: string;
  household_id: string;
  item_name: string;
  quantity: number;
  unit: string;
  min_threshold?: number | null;
  updated_at: string;
}

export interface GroceryListItem {
  id: string;
  grocery_list_id: string;
  item_name: string;
  quantity: number;
  unit: string;
  is_purchased: boolean;
  added_at: string;
}

export interface GroceryList {
  id: string;
  household_id: string;
  name: string;
  items: GroceryListItem[];
}

export interface CartPreviewItem {
  item_name: string;
  quantity: number;
  unit: string;
  matched_product_name: string;
  price_in_rupees: number;
  stock_status: string;
}

export interface CartPreview {
  items: CartPreviewItem[];
  total_items_count: number;
  total_estimated_cost_rupees: number;
}

// API Endpoints
export const api = {
  /**
   * Starts the real Swiggy OAuth PKCE flow.
   */
  async startSwiggyOAuth(): Promise<SwiggyOAuthStartResponse> {
    return apiFetch<SwiggyOAuthStartResponse>("/auth/swiggy/start");
  },

  /**
   * Performs a direct root-level backend health check.
   */
  async getHealth(): Promise<{ status: string; app: string }> {
    return apiFetch<{ status: string; app: string }>("/health");
  },

  /**
   * Retrieves the Swiggy config/status information.
   */
  async getSwiggyStatus(): Promise<{
    success: boolean;
    use_mock_mcp: boolean;
    swiggy_env: string;
    database_connected: boolean;
    encryption_key_configured: boolean;
    client_id_configured: boolean;
    client_secret_configured: boolean;
    redirect_uri_configured: boolean;
  }> {
    return apiFetch<{
      success: boolean;
      use_mock_mcp: boolean;
      swiggy_env: string;
      database_connected: boolean;
      encryption_key_configured: boolean;
      client_id_configured: boolean;
      client_secret_configured: boolean;
      redirect_uri_configured: boolean;
    }>("/auth/swiggy/status");
  },

  /**
   * Triggers a mock/demo login.
   */
  async demoLogin(): Promise<{ success: boolean; user_id: string; message: string }> {
    return apiFetch<{ success: boolean; user_id: string; message: string }>("/auth/demo-login", {
      method: "POST",
    });
  },

  /**
   * Retrieves the authenticated user's profile.
   */
  async getProfile(): Promise<UserProfile> {
    return apiFetch<UserProfile>("/me/profile");
  },

  /**
   * Updates the authenticated user's profile.
   */
  async updateProfile(profile: UserProfile): Promise<{ message: string }> {
    return apiFetch<{ message: string }>("/me/profile", {
      method: "PUT",
      body: JSON.stringify(profile),
    });
  },

  /**
   * Retrieves the user's saved Swiggy addresses.
   */
  async getAddresses(): Promise<Address[]> {
    return apiFetch<Address[]>("/me/addresses");
  },

  /**
   * Starts a new order session.
   */
  async startOrderSession(): Promise<OrderSessionResponse> {
    return apiFetch<OrderSessionResponse>("/orders/session/start", {
      method: "POST",
    });
  },

  /**
   * Selects the active address for the order session.
   */
  async selectAddress(sessionId: string, addressId: string): Promise<{ session_id: string; status: string }> {
    return apiFetch<{ session_id: string; status: string }>(
      `/orders/session/${sessionId}/select-address?address_id=${encodeURIComponent(addressId)}`,
      { method: "POST" }
    );
  },

  /**
   * Retrieves recommended meals for the session.
   */
  async searchRecommendations(
    sessionId: string,
    query: string,
    priorities?: Record<string, number>,
    relaxationPatch?: Record<string, unknown>
  ): Promise<RecommendationResponse> {
    return apiFetch<RecommendationResponse>(
      `/recommendations/search`,
      {
        method: "POST",
        body: JSON.stringify({
          session_id: sessionId,
          query: query,
          priorities: priorities,
          relaxation_patch: relaxationPatch
        })
      }
    );
  },

  /**
   * Selects a meal candidate in the session.
   */
  async selectItem(sessionId: string, restaurantId: string, itemId: string): Promise<unknown> {
    return apiFetch<unknown>(
      `/orders/session/${sessionId}/select-item?restaurant_id=${encodeURIComponent(restaurantId)}&item_id=${encodeURIComponent(itemId)}`,
      { method: "POST" }
    );
  },

  /**
   * Syncs the selected item to the Swiggy cart.
   */
  async syncCart(sessionId: string): Promise<CartResponse> {
    return apiFetch<CartResponse>(`/orders/session/${sessionId}/cart`, {
      method: "POST",
    });
  },

  /**
   * Fetches the current cart for review.
   */
  async reviewCart(sessionId: string): Promise<CartResponse> {
    return apiFetch<CartResponse>(`/orders/session/${sessionId}/cart`, {
      method: "GET",
    });
  },

  /**
   * Confirms order details.
   */
  async confirmOrder(sessionId: string): Promise<ConfirmResponse> {
    return apiFetch<ConfirmResponse>(`/orders/session/${sessionId}/confirm`, {
      method: "POST",
    });
  },

  /**
   * Places the final Swiggy order (COD).
   */
  async placeOrder(sessionId: string, confirmed: boolean): Promise<PlaceOrderResponse> {
    return apiFetch<PlaceOrderResponse>(
      `/orders/session/${sessionId}/place?user_confirmed=${confirmed ? "true" : "false"}`,
      { method: "POST" }
    );
  },

  /**
   * Submits user feedback for the order session.
   */
  async submitFeedback(
    sessionId: string,
    feedback: { rating: number; filling?: string; spicy?: string; again: boolean }
  ): Promise<unknown> {
    return apiFetch<unknown>(
      `/orders/session/${sessionId}/feedback`,
      {
        method: "POST",
        body: JSON.stringify(feedback)
      }
    );
  },

  /**
   * Fetches applicable coupons for the session.
   */
  async fetchCoupons(sessionId: string): Promise<CouponsResponse> {
    return apiFetch<CouponsResponse>(`/orders/session/${sessionId}/coupons`);
  },

  /**
   * Applies a coupon code to the session cart.
   */
  async applyCoupon(sessionId: string, couponCode: string): Promise<CartResponse> {
    return apiFetch<CartResponse>(`/orders/session/${sessionId}/coupon/apply`, {
      method: "POST",
      body: JSON.stringify({ coupon_code: couponCode }),
    });
  },

  /**
   * Fetches the user's daily health targets and consumed totals.
   */
  async getCoachStatus(): Promise<CoachStatusResponse> {
    return apiFetch<CoachStatusResponse>("/coach/today");
  },

  /**
   * Manually logs a meal entry.
   */
  async addManualEntry(entry: { meal_name: string; calories: number; protein_g: number; carbs_g?: number; fat_g?: number }): Promise<NutritionEntry> {
    return apiFetch<NutritionEntry>("/coach/manual-entry", {
      method: "POST",
      body: JSON.stringify(entry),
    });
  },

  /**
   * Fetches today's nutrition logs.
   */
  async getCoachHistory(): Promise<NutritionEntry[]> {
    return apiFetch<NutritionEntry[]>("/coach/history");
  },

  /**
   * Generates coach recommended next meals based on remaining targets.
   */
  async getCoachNextMeal(): Promise<CoachNextMealResponse> {
    return apiFetch<CoachNextMealResponse>("/coach/next-meal", {
      method: "POST",
    });
  },

  /**
   * Resets all session and demo database records for the current user.
   */
  async resetDemo(): Promise<{ success: boolean; message: string }> {
    return apiFetch<{ success: boolean; message: string }>("/demo/reset", {
      method: "POST",
    });
  },

  /**
   * Seeds demo data (biometrics, saved addresses, history logs).
   */
  async seedDemo(): Promise<{ success: boolean; message: string }> {
    return apiFetch<{ success: boolean; message: string }>("/demo/seed", {
      method: "POST",
    });
  },

  /**
   * Retrieves the household for the current user.
   */
  async getHousehold(): Promise<Household> {
    return apiFetch<Household>("/household/my-home");
  },

  /**
   * Adds a member to the household.
   */
  async addHouseholdMember(member: { name: string; dietary_preference: string; allergies: string[]; calorie_target?: number; protein_target?: number }): Promise<HouseholdMember> {
    return apiFetch<HouseholdMember>("/household/members", {
      method: "POST",
      body: JSON.stringify(member)
    });
  },

  /**
   * Updates a household member.
   */
  async updateHouseholdMember(memberId: string, member: { name: string; dietary_preference: string; allergies: string[]; calorie_target?: number; protein_target?: number }): Promise<HouseholdMember> {
    return apiFetch<HouseholdMember>(`/household/members/${memberId}`, {
      method: "PUT",
      body: JSON.stringify(member)
    });
  },

  /**
   * Removes a member from the household.
   */
  async deleteHouseholdMember(memberId: string): Promise<{ success: boolean; message: string }> {
    return apiFetch<{ success: boolean; message: string }>(`/household/members/${memberId}`, {
      method: "DELETE"
    });
  },

  /**
   * Lists all pantry items.
   */
  async getPantry(): Promise<PantryItem[]> {
    return apiFetch<PantryItem[]>("/pantry");
  },

  /**
   * Adds or updates a pantry item.
   */
  async addOrUpdatePantryItem(item: { item_name: string; quantity: number; unit: string; min_threshold?: number }): Promise<PantryItem> {
    return apiFetch<PantryItem>("/pantry", {
      method: "POST",
      body: JSON.stringify(item)
    });
  },

  /**
   * Removes an item from the pantry.
   */
  async deletePantryItem(itemId: string): Promise<{ success: boolean; message: string }> {
    return apiFetch<{ success: boolean; message: string }>(`/pantry/${itemId}`, {
      method: "DELETE"
    });
  },

  /**
   * Retrieves the active grocery list.
   */
  async getGroceryList(): Promise<GroceryList> {
    return apiFetch<GroceryList>("/grocery-list");
  },

  /**
   * Adds an item to the grocery list.
   */
  async addGroceryItem(item: { item_name: string; quantity: number; unit: string }): Promise<GroceryListItem> {
    return apiFetch<GroceryListItem>("/grocery-list/items", {
      method: "POST",
      body: JSON.stringify(item)
    });
  },

  /**
   * Updates grocery list item purchased status.
   */
  async updateGroceryItem(itemId: string, isPurchased: boolean): Promise<GroceryListItem> {
    return apiFetch<GroceryListItem>(`/grocery-list/items/${itemId}`, {
      method: "PUT",
      body: JSON.stringify({ is_purchased: isPurchased })
    });
  },

  /**
   * Removes an item from the grocery list.
   */
  async deleteGroceryItem(itemId: string): Promise<{ success: boolean; message: string }> {
    return apiFetch<{ success: boolean; message: string }>(`/grocery-list/items/${itemId}`, {
      method: "DELETE"
    });
  },

  /**
   * Scans a recipe and auto-provisions missing ingredients.
   */
  async matchRecipeIngredients(recipe: { recipe_name: string; ingredients: { name: string; qty: number; unit: string }[]; planned_for_date: string }): Promise<{
    success: boolean;
    recipe_plan_id: string;
    added_to_grocery_list: { name: string; quantity: number; unit: string; reason: string }[];
    available_in_pantry: { name: string; quantity: number; unit: string }[];
  }> {
    return apiFetch<{
      success: boolean;
      recipe_plan_id: string;
      added_to_grocery_list: { name: string; quantity: number; unit: string; reason: string }[];
      available_in_pantry: { name: string; quantity: number; unit: string }[];
    }>("/grocery-list/recipe-match", {
      method: "POST",
      body: JSON.stringify(recipe)
    });
  },

  /**
   * Simulates/previews building the Instamart cart based on unpurchased items.
   */
  async getCartPreview(): Promise<CartPreview> {
    return apiFetch<CartPreview>("/grocery-list/cart-preview", {
      method: "POST"
    });
  },
};
