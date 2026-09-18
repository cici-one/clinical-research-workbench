import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
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
