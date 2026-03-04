const { createProxyMiddleware } = require("http-proxy-middleware");

module.exports = function (app) {
  const target =
    process.env.BACKEND_PROXY_TARGET || "https://vl-trck.shares.zrok.io/val-track/backend";
    // process.env.BACKEND_PROXY_TARGET || "http://localhost/val-track/backend";

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

