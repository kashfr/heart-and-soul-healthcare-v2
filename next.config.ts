import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/progress-note/submissions",
        destination: "/admin/submissions",
        permanent: true,
      },
      {
        source: "/progress-note/submissions/:path*",
        destination: "/admin/submissions/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
