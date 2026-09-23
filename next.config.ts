import type { NextConfig } from 'next';

const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/$/, '');

const nextConfig: NextConfig = {
  basePath,

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
