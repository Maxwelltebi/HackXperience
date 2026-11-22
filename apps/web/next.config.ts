import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: ['@hx/shared', '@hx/db', '@hx/core', '@hx/emails'],
  // The database driver runs on the server only and is loaded from node_modules, not bundled.
  serverExternalPackages: ['postgres'],
  poweredByHeader: false,
  // Project images (R41) are served from the public Supabase Storage bucket, as they are:
  // components pass `unoptimized`, so they don't use Vercel's image optimization quota.
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co', pathname: '/storage/v1/object/public/**' },
    ],
  },
};

export default nextConfig;
