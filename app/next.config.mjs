/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 is a native module — must run server-side only
  // In Next.js 14 this option lives under experimental
  experimental: {
    serverComponentsExternalPackages: ["better-sqlite3"],
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
