import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: ['@hx/shared', '@hx/db'],
  // The database driver runs on the server only and is loaded from node_modules, not bundled.
  serverExternalPackages: ['postgres'],
  poweredByHeader: false,
};

export default nextConfig;
