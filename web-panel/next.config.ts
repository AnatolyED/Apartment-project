import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdf-lib', 'pdf-parse', 'sharp'],
  outputFileTracingExcludes: {
    '/dashboard/apartments/import': [
      './Dockerfile',
      './README.md',
      './drizzle/**/*',
      './next-dev-*.log',
      './next.config.ts',
      './scripts/**/*',
      './tests/**/*',
      './tsconfig.tsbuildinfo',
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '20mb',
    },
  },
};

export default nextConfig;
