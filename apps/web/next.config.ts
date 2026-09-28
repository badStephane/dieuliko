import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // CV uploads go through a Server Action: 5 MB file + multipart overhead (the API caps the file at 5 MB).
      // Next has no per-action limit, so this applies to every Server Action: keep new ones small by design.
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
