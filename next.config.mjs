/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  async headers() {
    return [
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }, { key: 'Service-Worker-Allowed', value: '/' }] },
      ...['/api/:path*', '/dashboard/:path*', '/login', '/aprobacion/:path*'].map((source) => ({ source, headers: [{ key: 'Cache-Control', value: 'private, no-store, max-age=0' }] })),
    ];
  },
  experimental: {
    serverComponentsExternalPackages: ['pdfkit'],
  },
};

export default nextConfig;
