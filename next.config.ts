import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Sales resources can be uploaded up to 5 MB (F20, D-037); leave room for form overhead.
    serverActions: { bodySizeLimit: "5.5mb" },
  },
};

export default nextConfig;
