import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Lets a second `next dev` process (e.g. a demo-mode instance run
  // alongside the default live one) use its own build output directory
  // instead of colliding with this one's .next folder.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
