import React, { useState } from "react";
import { CartPreview } from "../../lib/api";

interface CartPreviewPanelProps {
  onGetCartPreview: () => Promise<CartPreview>;
}

export default function CartPreviewPanel({ onGetCartPreview }: CartPreviewPanelProps) {
  const [preview, setPreview] = useState<CartPreview | null>(null);
  const [loading, setLoading] = useState(false);

  const handleFetchPreview = async () => {
    setLoading(true);
    try {
      const data = await onGetCartPreview();
      setPreview(data);
    } catch (err) {
      alert("Failed to build cart preview: " + err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col gap-6">
      <div className="flex justify-between items-center border-b border-slate-800 pb-4">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          ⚡ Instamart Cart Preview
        </h3>
        <button
          onClick={handleFetchPreview}
          disabled={loading}
          className="text-xs font-semibold px-3 py-1.5 rounded bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-800 text-slate-950 transition"
        >
          {loading ? "Building..." : "Build Cart Preview"}
        </button>
      </div>

      {!preview ? (
        <div className="py-6 text-center text-slate-500 text-sm">
          <p>Click &quot;Build Cart Preview&quot; to fetch product matches and price estimates from Instamart catalog.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5 text-left">
          <div className="flex justify-between items-center bg-slate-950/60 border border-slate-800/80 rounded-xl p-4">
            <div>
              <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Estimated Total</p>
              <p className="text-2xl font-black text-emerald-400 mt-1">₹{preview.total_estimated_cost_rupees.toFixed(2)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Total Items</p>
              <p className="text-xl font-bold text-white mt-1">{preview.total_items_count} items</p>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-bold text-white uppercase tracking-wider">Matched Instamart Products:</p>
            {preview.items.length === 0 ? (
              <p className="text-xs text-slate-500 italic">No unpurchased items on your grocery list to match.</p>
            ) : (
              preview.items.map((item, idx) => (
                <div key={idx} className="bg-slate-950/30 border border-slate-800/40 rounded-lg p-3 flex justify-between items-center text-xs">
                  <div>
                    <p className="text-slate-400">List: <span className="font-semibold text-white">{item.item_name}</span> ({item.quantity} {item.unit})</p>
                    <p className="text-[11px] text-emerald-400/90 font-mono mt-1">↳ Matched: {item.matched_product_name}</p>
                  </div>
                  <div className="text-right flex flex-col items-end gap-1">
                    <span className="text-white font-bold">₹{item.price_in_rupees.toFixed(2)}</span>
                    <span className={`text-[9px] uppercase px-1.5 py-0.5 rounded font-black ${item.stock_status === "IN_STOCK" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-blue-500/10 text-blue-400 border border-blue-500/20"}`}>
                      {item.stock_status === "IN_STOCK" ? "In Stock" : "Simulated"}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-400/90">
            💡 <strong>Sprint 10 Safety Notice:</strong> Real Instamart order checkout is currently gated. This panel displays catalog pricing and product availability mapping only.
          </div>
        </div>
      )}
    </div>
  );
}
