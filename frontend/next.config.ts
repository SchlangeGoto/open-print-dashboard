import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // The production image sets NEXT_OUTPUT=standalone and runs the
  // self-contained server instead of copying the whole node_modules tree.
  output:
    process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
};

export default nextConfig;
