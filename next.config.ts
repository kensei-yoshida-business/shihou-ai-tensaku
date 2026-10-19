import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse は Node 専用の依存を含むのでバンドルしない
  serverExternalPackages: ["pdf-parse"],
  // pdf.js はワーカーを実行時に動的 import するため、Vercel の関数に自動では同梱されない。明示的に含める
  outputFileTracingIncludes: {
    "/api/extract-pdf": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
