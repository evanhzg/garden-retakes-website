/** @type {import('next').NextConfig} */
const nextConfig = {
  // `next dev` and `next build` both write .next, and running them together
  // corrupts the dev server with a bogus PageNotFoundError. Setting
  // NEXT_DIST_DIR lets a verification build run in its own directory while the
  // dev server keeps going.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    serverComponentsExternalPackages: ["@ianlucas/cs2-lib"],
    // Ensure the Aiven CA certificate (if used via ?sslcert=ca.pem) ships
    // inside the serverless function bundles on Vercel.
    outputFileTracingIncludes: {
      "/*": ["./prisma/ca.pem"],
    },
  },
};

export default nextConfig;
