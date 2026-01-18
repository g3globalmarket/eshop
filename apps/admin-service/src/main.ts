import express from "express";
import cookieParser from "cookie-parser";
import { errorMiddleware } from "@packages/error-handler/error-middleware";
import router from "./routes/admin.route";

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
  console.error('[admin-service] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error: Error) => {
  console.error('[admin-service] Uncaught Exception:', error);
  process.exit(1);
});

const app = express();
app.use(express.json());
app.use(cookieParser());

app.get("/", (req, res) => {
  res.send({ message: "Welcome to admin-service!" });
});

// routes
app.use("/api", router);

app.use(errorMiddleware);

const port = process.env.PORT || 6005;
const server = app.listen(port, () => {
  console.log(`Listening at http://localhost:${port}/api`);
});
server.on("error", console.error);
