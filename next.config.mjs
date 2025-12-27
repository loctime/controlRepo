/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Permitir todos los console.log en producción (Vercel)
  compiler: {
    removeConsole: false,
  },
}

export default nextConfig
