/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: [
    "192.168.29.241",   // 👉 अपना IP डालो
    "10.32.255.207"  // (अगर ये भी use कर रहे हो)
  ],
}

module.exports = nextConfig