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
      // Keep the staff portal and the auth screens out of search results.
      // AuthGuard is client-side, so these routes answer a crawler with a 200
      // shell — enough for Google to crawl and evaluate them. A header covers
      // every current and future /admin route without touching each page, and
      // reaches route handlers that can't export `metadata`.
      //
      // Deliberately NOT paired with a robots.txt Disallow: Google has to fetch
      // the page to see this directive, so blocking the crawl would strand any
      // URL it already knows about.
      {
        source: "/admin/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/login",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/reset-password",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
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
