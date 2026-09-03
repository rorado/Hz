import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
    ],
  },
  experimental: {
    // The company-logo upload goes through a Server Action; the default
    // body limit is 1 MB. Allow up to 5 MB so a 4 MB logo (plus multipart
    // overhead) gets through — the action itself hard-caps the file at
    // 4 MB (MAX_LOGO_BYTES) with a friendly validation error.
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;
