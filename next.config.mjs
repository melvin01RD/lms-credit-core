/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  async headers() {
    return ['/api/:path*', '/dashboard/:path*', '/login'].map((source) => ({
      source, headers: [{ key: 'Cache-Control', value: 'private, no-store, max-age=0' }],
    }));
  },
  experimental: {
    serverComponentsExternalPackages: ['pdfkit'],
  },
};

export default nextConfig;
