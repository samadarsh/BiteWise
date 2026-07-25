import React from "react";
import { useRouter } from "next/navigation";

export default function FirstOrderPrompt() {
  const router = useRouter();

  return (
    <div className="bg-info/5 border border-info/20 rounded-2xl p-5 flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-bold text-text">Order your first meal</h3>
        <p className="text-[11px] text-subtle mt-0.5">
          Place an order and we&apos;ll track it toward today&apos;s protein and calorie targets automatically.
        </p>
      </div>

      <button
        onClick={() => router.push("/app/nutriorder/order")}
        className="w-full bg-info hover:brightness-110 text-white font-bold py-3 rounded-xl text-sm transition flex items-center justify-center gap-2 shadow-md"
      >
        Find Food →
      </button>
    </div>
  );
}
