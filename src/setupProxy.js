const { createProxyMiddleware } = require("http-proxy-middleware");
const fs = require("fs");
const path = require("path");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};

  const parsed = {};
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;

    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
    parsed[key] = value;
  }

  return parsed;
}

module.exports = function (app) {
  const backendEnv = parseEnvFile(path.resolve(__dirname, "../backend/.env"));

  const isProduction = ["1", "true", "yes", "on"].includes(
    String(process.env.IS_PRODUCTION || backendEnv.IS_PRODUCTION || "")
      .trim()
      .toLowerCase(),
  );

  const target =
    process.env.BACKEND_PROXY_TARGET ||
    backendEnv.BACKEND_PROXY_TARGET ||
    (isProduction
      ? "https://vl-trck.shares.zrok.io/val-track/backend"
      : "http://localhost/val-track/backend");

  // Frontend calls /backend/api/*.php on the same origin.
  // CRA dev server forwards those to local XAMPP backend.
  app.use(
    "/backend/api",
    createProxyMiddleware({
      target,
      changeOrigin: true,
      secure: false,
      pathRewrite: {
        "^/backend/api": "/api",
      },
      logLevel: "warn",
    }),
  );
};
