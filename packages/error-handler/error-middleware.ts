import { AppError } from "./index";
import { NextFunction, Request, Response } from "express";

export const errorMiddleware = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Log error details with request context (do not log sensitive headers/cookies)
  const requestContext = {
    method: req.method,
    url: req.originalUrl,
    statusCode: err instanceof AppError ? err.statusCode : 500,
  };

  if (err instanceof AppError) {
    console.error("AppError:", {
      ...requestContext,
      message: err.message,
      stack: err.stack,
      ...(err.details && { details: err.details }),
    });

    return res.status(err.statusCode).json({
      status: "error",
      message: err.message,
      ...(err.details && { details: err.details }),
    });
  }

  // Unhandled error - log full stack trace
  console.error("Unhandled error:", {
    ...requestContext,
    message: err.message,
    stack: err.stack,
    error: err,
  });

  return res.status(500).json({
    error: "Something went wrong, please try again!",
  });
};
