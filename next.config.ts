import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cloud Run packaging: emit the self-contained server bundle
  // (.next/standalone) that the Dockerfile copies into the runtime image.
  // No effect on Vercel builds (Vercel ignores it).
  output: 'standalone',
  // Pin the tracing root to the app itself — in a git worktree Next infers a
  // filesystem ancestor and mirrors the whole absolute path inside
  // .next/standalone, burying server.js.
  outputFileTracingRoot: process.cwd(),
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
