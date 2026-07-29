import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@ia/db", "@ia/whatsapp"],
  output: "standalone",
};

export default nextConfig;
