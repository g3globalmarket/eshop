const path = require("path");

/**
 * IMPORTANT: Do NOT use withNx wrapper as it breaks CSS handling in Next.js 15
 *
 * The @nx/next wrapper can interfere with Next.js's default webpack CSS loaders,
 * causing CSS files to be parsed as JavaScript. This is a known issue with
 * @nx/next@20.x when used with Next.js 15.
 *
 * Solution: Use vanilla Next.js config. Nx will still work via the @nx/next/plugin
 * registered in nx.json.
 */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        hostname: "ik.imagekit.io",
      },
    ],
  },
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  experimental: {
    esmExternals: true,
  },
  webpack: (config, options) => {
    // Add custom alias for packages (only modify resolve, don't touch module.rules)
    config.resolve.alias = {
      ...config.resolve.alias,
      "@packages": path.resolve(__dirname, "../../packages"),
      "@eshop/utils": path.resolve(__dirname, "../../packages/utils/src"),
    };

    return config;
  },
};

// Export vanilla Next.js config - @nx/next/plugin in nx.json handles Nx integration
module.exports = nextConfig;
