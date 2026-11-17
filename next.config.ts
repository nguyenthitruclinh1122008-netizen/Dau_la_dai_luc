import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Các package có native/WASM — giữ nguyên bên ngoài bundle
  serverExternalPackages: ["postgres", "@electric-sql/pglite"],
  // jar Premium nằm ngoài public/ (không cho tải lậu URL trực tiếp) —
  // nhét theo lambda của route tải Premium khi deploy Vercel
  outputFileTracingIncludes: {
    "/api/download/premium": ["./assets/jar/**"],
    "/api/download/free": ["./assets/jar/**"],
  },
};

export default nextConfig;
