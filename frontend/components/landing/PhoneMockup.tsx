"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";

interface Screen {
  src: string;
  alt: string;
  label: string;
}

interface Badge {
  text: string;
  className: string;
  delay: number;
  position: string;
}

const SCREENS: Screen[] = [
  { src: "/screenshots/nutriorder.png", alt: "NutriOrder AI meal search screen", label: "NutriOrder AI" },
  { src: "/screenshots/smartpantry.png", alt: "SmartPantry AI recipe coverage screen", label: "SmartPantry AI" },
];

const BADGES: Badge[] = [
  { text: "AI-Ranked", className: "top-10 -left-6 sm:-left-10 bg-nutri text-nutri-contrast", delay: 0, position: "left" },
  { text: "Safety-Gated", className: "bottom-24 -right-6 sm:-right-10 bg-brand text-brand-contrast", delay: 0.6, position: "right" },
];

export function PhoneMockup({ className }: { className?: string }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setActive((prev) => (prev + 1) % SCREENS.length), 4200);
    return () => clearInterval(id);
  }, []);

  return (
    <div className={`relative mx-auto w-[240px] sm:w-[270px] ${className ?? ""}`}>
      {/* Floating micro badges */}
      {BADGES.map((badge) => (
        <motion.span
          key={badge.text}
          className={`absolute z-20 rounded-full px-3 py-1.5 text-[11px] font-black uppercase tracking-wide shadow-lg ${badge.className}`}
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 3.4, delay: badge.delay, repeat: Infinity, ease: "easeInOut" }}
        >
          {badge.text}
        </motion.span>
      ))}

      {/* Device frame */}
      <div className="relative aspect-[9/19.5] w-full rounded-[2.6rem] border-[6px] border-[#0c1017] bg-[#0c1017] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.55)]">
        <div className="absolute left-1/2 top-0 z-10 h-5 w-24 -translate-x-1/2 rounded-b-2xl bg-[#0c1017]" />
        <div className="relative h-full w-full overflow-hidden rounded-[2.1rem] bg-[#080b10]">
          <AnimatePresence mode="wait">
            <motion.div
              key={SCREENS[active].src}
              className="relative h-full w-full"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
            >
              <Image
                src={SCREENS[active].src}
                alt={SCREENS[active].alt}
                fill
                sizes="270px"
                className="object-cover object-top"
              />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Screen-label dots */}
      <div className="mt-4 flex items-center justify-center gap-2">
        {SCREENS.map((screen, i) => (
          <button
            key={screen.src}
            type="button"
            aria-label={`Show ${screen.label}`}
            onClick={() => setActive(i)}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === active ? "w-6 bg-brand" : "w-1.5 bg-border-strong"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
