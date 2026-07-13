/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Produces a self-contained .next/standalone/ folder with only the
  // dependencies actually used at runtime — much smaller Docker image.
  output: "standalone",
};

export default nextConfig;
