import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['youtube-dl-exec', '@deepgram/sdk'],
};

export default nextConfig;
