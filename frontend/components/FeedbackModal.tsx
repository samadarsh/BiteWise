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

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl w-full max-w-md flex flex-col gap-6 text-left">
        <div>
          <h3 className="text-xl font-bold text-slate-100">Help Us Personalize NutriOrder</h3>
          <p className="text-xs text-slate-400 mt-1">We adjust your future recommendation weightings based on this feedback.</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-xs">
          {/* Stars Selection */}
          <div>
            <label className="block font-semibold text-slate-400 mb-1.5">Rate this recommendation:</label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  type="button"
                  key={star}
                  onClick={() => setRating(star)}
                  className={`text-2xl transition ${rating >= star ? "text-amber-400" : "text-slate-700"}`}
                >
                  ★
                </button>
              ))}
            </div>
          </div>

          {/* Satiety question */}
          <div>
            <label className="block font-semibold text-slate-400 mb-1.5">Satiety level (was it filling?):</label>
            <select
              value={filling}
              onChange={(e) => setFilling(e.target.value)}
              className="w-full bg-slate-950/85 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-200 focus:outline-none"
            >
              <option value="not_filling">Too light / Not filling</option>
              <option value="standard">Perfect match / Satiated</option>
              <option value="very_filling">Too heavy / Extremely filling</option>
            </select>
          </div>

          {/* Spice tolerance feedback */}
          <div>
            <label className="block font-semibold text-slate-400 mb-1.5">Spice levels:</label>
            <select
              value={spicy}
              onChange={(e) => setSpicy(e.target.value)}
              className="w-full bg-slate-950/85 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-200 focus:outline-none"
            >
              <option value="not_spicy">Bland / Could be spicier</option>
              <option value="standard">Just right</option>
              <option value="too_spicy">Too spicy / Violates preference</option>
            </select>
          </div>

          {/* Re-order intent */}
          <div>
            <label className="block font-semibold text-slate-400 mb-1.5">Would you order this again?</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-1.5 text-slate-300">
                <input
                  type="radio"
                  name="again"
                  checked={again === true}
                  onChange={() => setAgain(true)}
                  className="accent-emerald-500"
                />
                Yes
              </label>
              <label className="flex items-center gap-1.5 text-slate-300">
                <input
                  type="radio"
                  name="again"
                  checked={again === false}
                  onChange={() => setAgain(false)}
                  className="accent-emerald-500"
                />
                No
              </label>
            </div>
          </div>

          <div className="flex gap-3 mt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-slate-950 border border-slate-800 hover:bg-slate-900 text-slate-300 font-semibold py-3 rounded-xl transition text-center"
            >
              Skip
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-800 text-slate-950 font-bold py-3 rounded-xl transition text-center"
            >
              {loading ? "Submitting..." : "Submit Feedback"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
