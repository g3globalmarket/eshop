// Load environment variables BEFORE any other imports
// This must be the FIRST import to ensure env vars are available
import "@packages/libs/env-loader";

// Validate required environment variables at startup (fail fast with clear error)
const requiredEnvVars = ['DATABASE_URL'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  console.error(`[FATAL] Missing required environment variables: ${missingVars.join(', ')}`);
  console.error(`[FATAL] Service cannot start without these variables.`);
  process.exit(1);
}

// Global error handlers
process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
  console.error('[api-gateway] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error: Error) => {
  console.error('[api-gateway] Uncaught Exception:', error);
  process.exit(1);
});

import express, { Router, Request, Response } from "express";
import cors from "cors";
import proxy from "express-http-proxy";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import initializeSiteConfig from "./libs/initializeSiteConfig";
import { register } from "prom-client";

// Import QPay metrics to ensure they're registered
import "./metrics/qpay.metrics";

const app = express();

// Environment-based configuration
const isProduction = process.env.NODE_ENV === "production";

// Production-safe CORS configuration
const allowedOrigins = isProduction
  ? [
      "https://nomadnet.shop",
      "https://sellers.nomadnet.shop",
      "https://admin.nomadnet.shop",
      "https://sandbox.nomadnet.shop", // ← добавлено
      "http://nginx",
      "http://localhost",
    ]
  : ["http://localhost:3000", "http://localhost:3001", "http://localhost:3002"];

app.use(
  cors({
    origin: allowedOrigins,
    allowedHeaders: ["Authorization", "Content-Type", "X-Requested-With"],
    credentials: true,
  })
);

// Use appropriate logging for production
app.use(morgan(isProduction ? "combined" : "dev"));

// Raw body parser for QPay webhook callback (must be before global JSON parser)
// This preserves raw request body bytes for HMAC signature verification
app.use("/payments/qpay/callback", express.raw({ type: "*/*", limit: "50mb" }));

app.use(express.json({ limit: "50mb" })); // Reduced from 100mb for security
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(cookieParser());

// Trust proxy settings for production (behind nginx/load balancer)
app.set("trust proxy", isProduction ? "loopback" : 1);

// Enhanced rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,
  message: { error: "Too many requests, please try again later!" },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => req.ip,
  skip: (req) => req.path === "/gateway-health", // Skip for health checks
});

app.use(limiter);

// ───────────────────────────────────────────────────────────────────────────────
// Simple.mn callbacks router (новое)
// ───────────────────────────────────────────────────────────────────────────────
const simpleRouter: Router = Router();

// health/ping для проверки
simpleRouter.get("/_health", (_req: Request, res: Response) => {
  res.status(200).send("OK");
});

// Коллбэки Simple — пока заглушки 200 (логируем тело)
simpleRouter.post("/success", (req: Request, res: Response) => {
  console.log("[Simple] success", { body: req.body });
  res.status(200).json({ ok: true });
});

simpleRouter.post("/fail", (req: Request, res: Response) => {
  console.log("[Simple] fail", { body: req.body });
  res.status(200).json({ ok: true });
});

simpleRouter.post("/notify", (req: Request, res: Response) => {
  console.log("[Simple] notify", { body: req.body });
  res.status(200).json({ ok: true });
});

// повесим весь префикс на /payments/simple
app.use("/payments/simple", simpleRouter);

// ───────────────────────────────────────────────────────────────────────────────
// QPay callbacks router
// ───────────────────────────────────────────────────────────────────────────────
import qpayRouter from "./(routes)/qpay";
app.use("/payments/qpay", qpayRouter);

// ───────────────────────────────────────────────────────────────────────────────
// Health check endpoint (gateway-level)
// ───────────────────────────────────────────────────────────────────────────────
app.get("/gateway-health", (_req, res) => {
  res.status(200).json({
    message: "API Gateway is healthy!",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
});

// Service URLs configuration
// SERVICE_URL_MODE can override isProduction behavior:
// - "local" => use localhost (for local dev even with NODE_ENV=production)
// - "docker" => use Docker service names
// - unset => use isProduction logic (backward compatible)
const serviceUrlMode = process.env.SERVICE_URL_MODE?.toLowerCase();
const useDockerServiceNames =
  serviceUrlMode === "docker" || (serviceUrlMode !== "local" && isProduction);

const getServiceUrl = (serviceName: string, port: number) => {
  if (useDockerServiceNames) {
    // Use Docker service names
    return `http://${serviceName}:${port}`;
  } else {
    // Use localhost for development
    return `http://localhost:${port}`;
  }
};

// Enhanced proxy configuration with error handling
const createProxyMiddleware = (serviceUrl: string, serviceName: string) => {
  return proxy(serviceUrl, {
    timeout: 30000, // 30s
    proxyReqOptDecorator: (
      proxyReqOpts: { headers: any },
      srcReq: { ip: any; get: (k: string) => any }
    ) => {
      proxyReqOpts.headers!["X-Forwarded-For"] = srcReq.ip;
      proxyReqOpts.headers!["X-Original-Host"] = srcReq.get("host");
      return proxyReqOpts;
    },
    proxyErrorHandler: (err: { message: any }, res: any) => {
      console.error(`Proxy error for ${serviceName}:`, err.message);
      if (!res.headersSent) {
        res.status(503).json({
          error: "Service temporarily unavailable",
          service: serviceName,
          timestamp: new Date().toISOString(),
        });
      }
    },
  });
};

// Route to microservices using Docker service names in production
app.use(
  "/recommendation",
  createProxyMiddleware(
    getServiceUrl("recommendation-service", 6007),
    "recommendation-service"
  )
);

app.use(
  "/chatting",
  createProxyMiddleware(
    getServiceUrl("chatting-service", 6006),
    "chatting-service"
  )
);

app.use(
  "/admin",
  createProxyMiddleware(getServiceUrl("admin-service", 6005), "admin-service")
);

app.use(
  "/order",
  createProxyMiddleware(getServiceUrl("order-service", 6003), "order-service")
);

app.use(
  "/seller",
  createProxyMiddleware(getServiceUrl("seller-service", 6004), "seller-service")
);

app.use(
  "/product",
  createProxyMiddleware(
    getServiceUrl("product-service", 6002),
    "product-service"
  )
);

// Add this before the default route
app.use(
  "/auth",
  createProxyMiddleware(getServiceUrl("auth-service", 6001), "auth-service")
);

// Prometheus metrics endpoint
app.get("/metrics", async (req, res) => {
  try {
    res.set("Content-Type", register.contentType);
    const metrics = await register.metrics();
    res.end(metrics);
  } catch (error) {
    console.error("[Metrics] Error generating metrics:", error);
    res.status(500).end("Error generating metrics");
  }
});

// Global error handler
app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("Global error handler:", err);
    if (!res.headersSent) {
      res.status(500).json({
        error: isProduction ? "Internal server error" : err.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// Handle 404s
app.use("*", (req, res) => {
  res.status(404).json({
    error: "Route not found",
    path: req.originalUrl,
    timestamp: new Date().toISOString(),
  });
});

const port = process.env.PORT || 8080;
const host = isProduction ? "0.0.0.0" : "localhost";

const server = app.listen(Number(port), host, () => {
  console.log(`🚀 API Gateway listening at http://${host}:${port}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
  const serviceModeDisplay = serviceUrlMode
    ? `${serviceUrlMode} (explicit)`
    : useDockerServiceNames
    ? "docker (auto)"
    : "local (auto)";
  console.log(`🔗 Service URL Mode: ${serviceModeDisplay}`);
  console.log(`🔗 CORS Origins: ${JSON.stringify(allowedOrigins)}`);

  try {
    initializeSiteConfig();
    console.log("✅ Site config initialized successfully!");
  } catch (error) {
    console.error("❌ Failed to initialize site config:", error);
  }
});

// Graceful shutdown handling
process.on("SIGTERM", () => {
  console.log("🛑 SIGTERM received, shutting down gracefully");
  server.close(() => {
    console.log("✅ Process terminated");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("🛑 SIGINT received, shutting down gracefully");
  server.close(() => {
    console.log("✅ Process terminated");
    process.exit(0);
  });
});

server.on("error", (error: any) => {
  console.error("❌ Server error:", error);
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use`);
    process.exit(1);
  }
});
