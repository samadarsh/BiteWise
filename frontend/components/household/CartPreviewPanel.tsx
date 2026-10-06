import React, { useEffect, useState } from "react";
import { api, Address, CartPreview, InstamartCheckoutResponse, isSwiggyReauthError, SWIGGY_REAUTH_MESSAGE } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";

interface CartPreviewPanelProps {
  onGetCartPreview: (addressId?: string) => Promise<CartPreview>;
  onOrderPlaced?: () => void;
}

const MIN_ORDER_RUPEES = 99;
const MAX_ORDER_RUPEES = 1000;

function truncateAddressText(text: string, max = 60): string {
  // Native <select> dropdowns size their open popup to the widest <option>
  // text and can't be constrained with CSS — real Swiggy addresses run 100+
  // chars, so the popup balloons unless the option text itself is capped.
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

const TRACKING_STEPS = [
  { label: "Placed", desc: "Order sent to Instamart" },
  { label: "Packed", desc: "Items picked & packed" },
  { label: "Out for Delivery", desc: "On the way to you" },
  { label: "Delivered", desc: "Order complete" },
];

function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}

export default function CartPreviewPanel({ onGetCartPreview, onOrderPlaced }: CartPreviewPanelProps) {
  const { refreshAuth } = useAuth();
  const [preview, setPreview] = useState<CartPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddress, setSelectedAddress] = useState("");
  const [checkoutConfirmed, setCheckoutConfirmed] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState("");
  const [placedOrder, setPlacedOrder] = useState<InstamartCheckoutResponse | null>(null);
  const [trackingStep, setTrackingStep] = useState(0);

  useEffect(() => {
    api.getAddresses().then(setAddresses).catch(() => {});
  }, []);

  useEffect(() => {
    if (!placedOrder) return;
    let step = 0;
    const interval = setInterval(() => {
      step += 1;
      setTrackingStep(step);
      if (step >= 3) clearInterval(interval);
    }, 3000);
    return () => clearInterval(interval);
  }, [placedOrder]);

  const handleFetchPreview = async (addressId: string = selectedAddress) => {
    setLoading(true);
    setPlaceError("");
    try {
      const data = await onGetCartPreview(addressId || undefined);
      setPreview(data);
    } catch (err) {
      setPlaceError(`Failed to build cart preview: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const handlePlaceOrder = async () => {
    if (!checkoutConfirmed || !selectedAddress) return;
    setPlacing(true);
    setPlaceError("");
    try {
      // Swiggy's Instamart checkout tool only documents "UPI" or "Cash" for
      // paymentMethod — "COD" isn't a recognized value there.
      const res = await api.checkoutInstamartCart({ address_id: selectedAddress, payment_method: "Cash" });
      setPlacedOrder(res);
      onOrderPlaced?.();
    } catch (err) {
      if (isSwiggyReauthError(err)) {
        refreshAuth();
        setPlaceError(SWIGGY_REAUTH_MESSAGE);
      } else {
        setPlaceError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setPlacing(false);
    }
  };

  const handleReset = () => {
    setPlacedOrder(null);
    setTrackingStep(0);
    setPreview(null);
    setCheckoutConfirmed(false);
  };

  const total = preview?.total_estimated_cost_rupees ?? 0;

  if (placedOrder) {
    return (
      <div className="bg-surface backdrop-blur-md border border-border rounded-2xl p-6 shadow-xl flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 border-b border-border pb-4">
          <div>
            <span className="text-[10px] sm:text-xs bg-pantry/10 text-pantry border border-pantry/20 font-bold px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full uppercase tracking-wider">{placedOrder.partial ? "Partly Placed" : "Order Placed"}</span>
            <h3 className="text-lg font-bold mt-2 text-text">Tracking {placedOrder.order_id}</h3>
          </div>
          <div className="sm:text-right">
            <p className="text-[10px] sm:text-xs text-muted">Total</p>
            <p className="text-xl font-bold text-pantry">Rs {placedOrder.total.toFixed(2)}</p>
          </div>
        </div>

        <p className="text-[10px] text-subtle -mb-2">Illustrative progress only — BiteWise doesn&apos;t receive live delivery updates yet. Check the Swiggy app for real-time tracking.</p>
        <div className="relative w-full my-2 px-1 sm:px-8 overflow-visible">
          <div className="absolute left-[12.5%] right-[12.5%] top-4 sm:top-5 h-1 bg-border rounded-full" />
          <div className="absolute left-[12.5%] top-4 sm:top-5 h-1 bg-pantry rounded-full transition-all duration-1000" style={{ width: `${Math.min(75, Math.max(0, (trackingStep / 3) * 75))}%` }} />
          <div className="relative z-10 grid grid-cols-4 gap-0">
            {TRACKING_STEPS.map((step, idx) => {
              const active = trackingStep >= idx;
              const isCurrent = trackingStep === idx && trackingStep < 3;
              return (
                <div key={idx} className="flex min-w-0 flex-col items-center text-center">
                  <div className={`relative z-10 h-8 w-8 sm:h-10 sm:w-10 rounded-full flex items-center justify-center font-bold text-[10px] sm:text-xs border-2 transition-all duration-500 ${active ? "bg-pantry border-pantry text-pantry-contrast shadow-md" : "bg-surface-2 border-border-strong text-subtle"} ${isCurrent ? "ring-2 ring-pantry/30 ring-offset-2 ring-offset-surface" : ""}`}>
                    {active && trackingStep > idx ? (
                      <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    ) : isCurrent ? (
                      <div className="h-2 w-2 sm:h-2.5 sm:w-2.5 bg-pantry-contrast rounded-full animate-pulse" />
                    ) : (
                      idx + 1
                    )}
                  </div>
                  <p className={`max-w-full truncate text-[10px] sm:text-xs font-semibold mt-2 ${active ? "text-text" : "text-subtle"}`}>{step.label}</p>
                  <p className="text-[8px] sm:text-[10px] text-subtle max-w-[80px] mt-0.5 leading-tight hidden sm:block">{step.desc}</p>
                </div>
              );
            })}
          </div>
        </div>

        {placedOrder.partial && (
          <div className="bg-warning/10 border border-warning/20 rounded-xl p-3 text-xs text-text">
            ⚠️ {placedOrder.message || "Only part of this order went through — check your Swiggy app."}
          </div>
        )}

        {placedOrder.restocked_to_full.length > 0 && (
          <div className="bg-success/10 border border-success/20 rounded-xl p-3 text-xs text-success">
            🔄 Restocked to full: {placedOrder.restocked_to_full.join(", ")}
          </div>
        )}

        <button onClick={handleReset} className="self-center bg-surface-2 hover:bg-surface-3 border border-border text-text font-semibold px-5 py-2.5 rounded-lg text-xs transition-all">
          Build Another Cart
        </button>
      </div>
    );
  }

  return (
    <div className="bg-surface backdrop-blur-md border border-border rounded-2xl p-6 shadow-xl flex flex-col gap-6">
      <div className="flex justify-between items-center border-b border-border pb-4">
        <h3 className="text-lg font-bold text-text flex items-center gap-2">⚡ Instamart Checkout</h3>
        <button
          onClick={() => handleFetchPreview()}
          disabled={loading}
          className="text-xs font-semibold px-3 py-1.5 rounded bg-pantry hover:brightness-105 disabled:opacity-50 text-pantry-contrast transition"
        >
          {loading ? "Building..." : "Build Cart Preview"}
        </button>
      </div>

      {/* Resolved first, same as NutriOrder's Order page and Swiggy's own
          ordering pattern (get_addresses before search/cart/checkout). */}
      <div className="bg-surface-2 border border-border rounded-xl px-3 py-2.5 flex items-center gap-2 min-w-0">
        <svg className="h-4 w-4 text-pantry shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0 1 18 0Z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
        <span className="text-xs text-subtle font-semibold shrink-0">Delivering to</span>
        {addresses.length === 0 ? (
          <span className="text-xs text-subtle">No addresses found.</span>
        ) : (
          <select
            value={selectedAddress}
            onChange={(e) => {
              setSelectedAddress(e.target.value);
              // Instamart pricing/availability is per-address — a preview
              // built for another address (or none) must not be confirmed.
              // Rebuild it for the new address rather than making the user
              // start over.
              setCheckoutConfirmed(false);
              if (preview) {
                setPreview(null);
                handleFetchPreview(e.target.value);
              }
            }}
            className="min-w-0 flex-1 truncate text-sm font-bold text-text bg-surface border border-border rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-pantry cursor-pointer"
          >
            <option value="" disabled>
              Choose address…
            </option>
            {addresses.map((addr) => (
              <option key={addr.id} value={addr.id}>
                {addr.label} — {truncateAddressText(addr.display_text)}
              </option>
            ))}
          </select>
        )}
      </div>

      {!preview ? (
        <div className="py-6 text-center text-subtle text-sm">
          <p>Click &quot;Build Cart Preview&quot; to fetch product matches and price estimates from the Instamart catalog.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5 text-left">
          <div className="flex justify-between items-center bg-surface-2 border border-border rounded-xl p-4">
            <div>
              <p className="text-xs text-muted font-semibold uppercase tracking-wider">Estimated Total</p>
              <p className="text-2xl font-black text-pantry mt-1">₹{total.toFixed(2)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted font-semibold uppercase tracking-wider">Total Items</p>
              <p className="text-xl font-bold text-text mt-1">{preview.total_items_count} items</p>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-bold text-text uppercase tracking-wider">Matched Instamart Products:</p>
            {preview.items.length === 0 ? (
              <p className="text-xs text-subtle italic">No unpurchased items on your grocery list to match.</p>
            ) : (
              preview.items.map((item, idx) => (
                <div key={idx} className="bg-surface-2 border border-border rounded-lg p-3 flex justify-between items-center text-xs">
                  <div>
                    <p className="text-muted">List: <span className="font-semibold text-text">{item.item_name}</span> ({item.quantity} {item.unit})</p>
                    <p className="text-[11px] text-pantry/90 font-mono mt-1">↳ Matched: {item.matched_product_name}</p>
                  </div>
                  <div className="text-right flex flex-col items-end gap-1">
                    <span className="text-text font-bold">₹{item.price_in_rupees.toFixed(2)}</span>
                    <span className={`text-[9px] uppercase px-1.5 py-0.5 rounded font-black ${item.stock_status === "IN_STOCK" ? "bg-pantry/10 text-pantry border border-pantry/20" : "bg-info/10 text-info border border-info/20"}`}>
                      {item.stock_status === "IN_STOCK" ? "In Stock" : "Simulated"}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          {preview.items.length > 0 && (
            <>
              {total >= MAX_ORDER_RUPEES ? (
                <div className="bg-danger/10 border border-danger/20 rounded-xl p-3 flex items-start gap-2.5 text-xs">
                  <span className="text-danger text-sm">❌</span>
                  <div><p className="font-bold text-text">Order Cap Exceeded</p><p className="text-muted mt-0.5">Total of ₹{total.toFixed(2)} meets or exceeds the Rs {MAX_ORDER_RUPEES} safety limit. Checkout is blocked.</p></div>
                </div>
              ) : total < MIN_ORDER_RUPEES ? (
                <div className="bg-warning/10 border border-warning/20 rounded-xl p-3 flex items-start gap-2.5 text-xs">
                  <span className="text-warning text-sm">⚠️</span>
                  <div><p className="font-bold text-text">Below Minimum Order</p><p className="text-muted mt-0.5">Instamart requires at least Rs {MIN_ORDER_RUPEES}. Add more items to check out.</p></div>
                </div>
              ) : (
                <div className="bg-success/10 border border-success/20 rounded-xl p-3 flex items-start gap-2.5 text-xs">
                  <span className="text-success text-sm">🛡️</span>
                  <div><p className="font-bold text-text">Safety Checks Passed</p><p className="text-muted mt-0.5">Total is within the Rs {MIN_ORDER_RUPEES}–{MAX_ORDER_RUPEES} order range.</p></div>
                </div>
              )}

              <label className="flex items-center gap-3 cursor-pointer select-none border border-border rounded-xl p-3 bg-surface-2 hover:bg-surface-3 transition">
                <input type="checkbox" checked={checkoutConfirmed} onChange={(e) => setCheckoutConfirmed(e.target.checked)} className="accent-pantry h-4 w-4 rounded cursor-pointer" />
                <div className="text-xs"><p className="font-semibold text-text">I confirm these details are correct</p><p className="text-subtle text-[10px] mt-0.5">Orders are only placed after your explicit confirmation. This replaces anything already in your Instamart cart.</p></div>
              </label>

              {placeError && <p className="text-xs text-danger">{placeError}</p>}

              <button
                onClick={handlePlaceOrder}
                disabled={placing || !checkoutConfirmed || !selectedAddress || total < MIN_ORDER_RUPEES || total >= MAX_ORDER_RUPEES}
                className="w-full bg-pantry hover:brightness-105 disabled:opacity-50 disabled:cursor-not-allowed text-pantry-contrast font-bold py-3 rounded-xl transition flex items-center justify-center gap-2 shadow-md uppercase tracking-wider text-xs"
              >
                {placing ? (
                  <>
                    <Spinner className="h-4 w-4 text-pantry-contrast" />
                    Placing Order…
                  </>
                ) : (
                  "Place COD Order on Instamart"
                )}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
