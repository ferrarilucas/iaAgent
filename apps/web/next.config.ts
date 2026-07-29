import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@ia/db", "@ia/whatsapp"],
};

export default nextConfig;
