const BASE_URL = "http://localhost:8000";

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

// API Endpoints
export const api = {
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
};
