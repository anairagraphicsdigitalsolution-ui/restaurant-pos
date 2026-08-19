/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: [
    "192.168.0.149",   // 👉 अपना IP डालो
    "10.32.255.207",
    "172.20.10.3",
    "192.168.29.241"  // (अगर ये भी use कर रहे हो)
  ],
}

module.exports = nextConfig