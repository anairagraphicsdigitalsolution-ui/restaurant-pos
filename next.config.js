/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep local development origins; production traffic is served by Vercel.
  allowedDevOrigins: [
    "192.168.0.149",
    "10.32.255.207",
    "172.20.10.3",
    "192.168.29.241"
  ],

  // Let Vercel/CDN and the browser handle compressed responses.
  compress: true,
  poweredByHeader: false,
}

module.exports = nextConfig
