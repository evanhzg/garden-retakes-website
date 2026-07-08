/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Ensure the Aiven CA certificate (if used via ?sslcert=ca.pem) ships
    // inside the serverless function bundles on Vercel.
    outputFileTracingIncludes: {
      "/*": ["./prisma/ca.pem"],
    },
  },
};

export default nextConfig;
