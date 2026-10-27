import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Keep Turbopack inside the repo so it doesn't pick up stray lockfiles
  // from parent directories (e.g. C:\Users\<user>\package-lock.json).
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
