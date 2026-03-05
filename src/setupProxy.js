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

  // Local CRA proxy should default to local Apache.
  // If you want zrok while developing, explicitly set BACKEND_PROXY_TARGET.
  const localDefaultTarget = "http://localhost/val-track/backend";
  const prodDefaultTarget = "https://vl-trck.shares.zrok.io";

  const target =
    process.env.BACKEND_PROXY_TARGET ||
    backendEnv.BACKEND_PROXY_TARGET ||
    (isProduction ? prodDefaultTarget : localDefaultTarget);

  // Frontend may call either /backend/api/* or /val-track/backend/api/*.
  // CRA dev server forwards both to the configured backend target.
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

  app.use(
    "/val-track/backend/api",
    createProxyMiddleware({
      target,
      changeOrigin: true,
      secure: false,
      pathRewrite: {
        "^/val-track/backend/api": "/api",
      },
      logLevel: "warn",
    }),
  );
};
