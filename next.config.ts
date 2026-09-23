import type { NextConfig } from 'next';

const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/$/, '');
const projectRoot = process.cwd();

const nextConfig: NextConfig = {
  basePath,
  outputFileTracingRoot: projectRoot,
  turbopack: { root: projectRoot },

  // Keep browser source maps disabled in production to reduce build output.
  productionBrowserSourceMaps: false,

  experimental: {
    // Import large packages on demand.
    optimizePackageImports: ['lucide-react', 'date-fns', 'recharts'],
  },

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
