import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The public API reads the collector snapshot from disk at request time.
  // Next's tracing only follows `import`s, so the JSONL has to be listed
  // explicitly or the deployed function would not contain it.
  outputFileTracingIncludes: {
    "/api/v1/public/official-reports": [
      "./data/official/records.jsonl",
      "./data/official/manifest.json",
    ],
  },
  experimental: {
    serverActions: { bodySizeLimit: "12mb" },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "images.pexels.com" },
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
};

export default nextConfig;
