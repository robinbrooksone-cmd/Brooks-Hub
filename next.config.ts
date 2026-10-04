import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Default is 1MB, far below a real phone photo. Client-side
      // compression (see Dropzone.tsx) keeps most uploads well under this,
      // this is just a safety net for anything that skips compression.
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
