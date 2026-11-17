import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  env: {NEXT_PUBLIC_RELAY_VERCEL: process.env.VERCEL === '1' ? '1' : '0'},
};

export default nextConfig;
