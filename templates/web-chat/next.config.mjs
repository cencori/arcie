/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  // arcie is a Node-only package (native SQLite bindings for memory, dynamic
  // agent-file imports). Marking it external tells Next's server bundler to
  // load it at runtime instead of trying to trace/bundle its README + deps.
  serverExternalPackages: ["arcie", "@libsql/client", "libsql", "better-sqlite3"],
  // Lets Next's compiler traverse to ../../node_modules/arcie (parent workspace)
  // or the `npm link`ed dev symlink.
  experimental: {
    externalDir: true,
  },
};

export default nextConfig;
