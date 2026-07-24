import React, { useState } from "react";

interface FeedbackModalProps {
  onSubmit: (feedback: { rating: number; filling: string; spicy: string; again: boolean }) => void;
  onClose: () => void;
  loading: boolean;
}

export default function FeedbackModal({ onSubmit, onClose, loading }: FeedbackModalProps) {
  const [rating, setRating] = useState<number>(5);
  const [filling, setFilling] = useState<string>("standard");
  const [spicy, setSpicy] = useState<string>("standard");
  const [again, setAgain] = useState<boolean>(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ rating, filling, spicy, again });
  };

  const selectCls = "w-full bg-surface-2 border border-border rounded-xl px-3.5 py-2.5 text-text focus:outline-none focus:border-nutri";

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-border p-8 rounded-2xl shadow-2xl w-full max-w-md flex flex-col gap-6 text-left">
        <div>
          <h3 className="text-xl font-bold text-text">Help Us Personalize NutriOrder</h3>
          <p className="text-xs text-muted mt-1">We adjust your future recommendation weightings based on this feedback.</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-xs">
          <div>
            <label className="block font-semibold text-muted mb-1.5">Rate this recommendation:</label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  type="button"
                  key={star}
                  onClick={() => setRating(star)}
                  aria-label={`${star} star${star > 1 ? "s" : ""}`}
                  className={`text-2xl transition ${rating >= star ? "text-brand" : "text-border-strong"}`}
                >
                  ★
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block font-semibold text-muted mb-1.5">Satiety level (was it filling?):</label>
            <select value={filling} onChange={(e) => setFilling(e.target.value)} className={selectCls}>
              <option value="not_filling">Too light / Not filling</option>
              <option value="standard">Perfect match / Satiated</option>
              <option value="very_filling">Too heavy / Extremely filling</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-muted mb-1.5">Spice levels:</label>
            <select value={spicy} onChange={(e) => setSpicy(e.target.value)} className={selectCls}>
              <option value="not_spicy">Bland / Could be spicier</option>
              <option value="standard">Just right</option>
              <option value="too_spicy">Too spicy / Violates preference</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-muted mb-1.5">Would you order this again?</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-1.5 text-text">
                <input type="radio" name="again" checked={again === true} onChange={() => setAgain(true)} className="accent-nutri" />
                Yes
              </label>
              <label className="flex items-center gap-1.5 text-text">
                <input type="radio" name="again" checked={again === false} onChange={() => setAgain(false)} className="accent-nutri" />
                No
              </label>
            </div>
          </div>

          <div className="flex gap-3 mt-4">
            <button type="button" onClick={onClose} className="flex-1 bg-surface-2 border border-border hover:bg-surface-3 text-muted font-semibold py-3 rounded-xl transition text-center">
              Skip
            </button>
            <button type="submit" disabled={loading} className="flex-1 bg-nutri hover:brightness-105 disabled:opacity-50 text-nutri-contrast font-bold py-3 rounded-xl transition text-center">
              {loading ? "Submitting…" : "Submit Feedback"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
