/** @type {import('next').NextConfig} */
const nextConfig = {
  // Sync routes use the Node runtime (googleapis + node:crypto).
  serverExternalPackages: ["googleapis"],
};
export default nextConfig;
