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
  experimental: {
    serverActions: {
      // The referral and contact forms are Server Actions, which POST to the
      // page's own URL and are CSRF-checked by comparing Origin against Host.
      //
      // The apex -> www redirect below is a 308, so it preserves the POST body
      // and replays it against www — but the Origin header still says apex, and
      // the mismatch would make Next reject the submission. That only bites
      // someone who had a form open on the apex when a deploy landed, or who
      // reached it from an old apex bookmark, but a silently dropped referral
      // is the worst failure this site has. Accept both hostnames.
      allowedOrigins: ["heartandsoulhc.org", "www.heartandsoulhc.org"],
    },
  },
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
      // Apex -> www. Both hostnames map to this same Cloud Run service and both
      // answered 200, so every page existed at two URLs. Canonical tags already
      // pointed at www, but a 308 consolidates the signals properly.
      //
      // `/api/*` is deliberately excluded. Cron callers, the shared-referral
      // token links, and form POSTs may address the apex directly, and a
      // cross-host redirect is a bad thing to put in front of them. Search
      // engines don't index /api, so there's nothing to gain there anyway.
      //
      // The host condition matches the apex exactly, so www requests don't
      // match and can't loop. `*.run.app` (health checks, direct service URL)
      // doesn't match either and is left alone.
      {
        source: "/:path((?!api/).*)",
        has: [{ type: "host", value: "heartandsoulhc\\.org" }],
        destination: "https://www.heartandsoulhc.org/:path",
        permanent: true,
      },
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
