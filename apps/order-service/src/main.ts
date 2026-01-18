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
  console.error('[order-service] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error: Error) => {
  console.error('[order-service] Uncaught Exception:', error);
  process.exit(1);
});

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import bodyParser from "body-parser";
import { errorMiddleware } from "@packages/error-handler/error-middleware";
import router from "./routes/order.route";
import { createOrder } from "./controllers/order.controller";
import {
  startQPayReconciliation,
  stopQPayReconciliation,
} from "./payments/qpay-reconcile.service";
import {
  startQPayCleanup,
  stopQPayCleanup,
} from "./payments/qpay-cleanup.service";
import { register } from "prom-client";

// Import QPay metrics to ensure they're registered
import "./metrics/qpay.metrics";

const app = express();
app.use(
  cors({
    origin: ["http://localhost:3000"],
    allowedHeaders: ["Authorization", "Content-Type"],
    credentials: true,
  })
);

app.post(
  "/api/create-order",
  bodyParser.raw({ type: "application/json" }),
  (req, res, next) => {
    (req as any).rawBody = req.body;
    next();
  },
  createOrder
);

app.use(express.json());
app.use(cookieParser());

app.get("/", (req, res) => {
  res.send({ message: "Welcome to order-service!" });
});

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

// Routes
app.use("/api", router);

app.use(errorMiddleware);

const port = process.env.PORT || 6003;
const server = app.listen(port, () => {
  console.log(`Listening at http://localhost:${port}/api`);

  // QPay auth debug (only when QPAY_DEBUG_AUTH=true)
  if (process.env.QPAY_DEBUG_AUTH === "true") {
    const authUrl =
      process.env.QPAY_AUTH_URL ||
      process.env.QPAY_TOKEN_URL ||
      "https://merchant.qpay.mn/v2/auth/token";
    const hasUsername = Boolean(
      process.env.QPAY_USERNAME ||
        process.env.QPAY_USER ||
        process.env.QPAY_MERCHANT_USERNAME ||
        process.env.QPAY_CLIENT_ID
    );
    const hasPassword = Boolean(
      process.env.QPAY_PASSWORD ||
        process.env.QPAY_PASS ||
        process.env.QPAY_CLIENT_SECRET
    );
    console.log("[QPay Auth Debug]", {
      authUrl,
      hasUsername,
      hasPassword,
    });
  }

  // Start QPay reconciliation service
  if (process.env.QPAY_RECONCILE_ENABLED !== "false") {
    startQPayReconciliation();
    console.log("[QPay] Reconciliation service started");
  } else {
    console.log(
      "[QPay] Reconciliation service disabled (QPAY_RECONCILE_ENABLED=false)"
    );
  }

  // Start QPay cleanup service
  if (process.env.QPAY_CLEANUP_ENABLED !== "false") {
    startQPayCleanup();
    console.log("[QPay] Cleanup service started");
  } else {
    console.log("[QPay] Cleanup service disabled (QPAY_CLEANUP_ENABLED=false)");
  }
});

server.on("error", console.error);

// Graceful shutdown
const shutdown = () => {
  console.log("\n[Server] Shutting down gracefully...");

  // Stop background services
  stopQPayReconciliation();
  stopQPayCleanup();

  server.close(() => {
    console.log("[Server] HTTP server closed");
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error("[Server] Forcing shutdown after timeout");
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
