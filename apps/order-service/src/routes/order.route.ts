import isAuthenticated from "@packages/middleware/isAuthenticated";
import express, { Router } from "express";
import {
  createPaymentIntent,
  createPaymentSession,
  getAdminOrders,
  getOrderDetails,
  getSellerOrders,
  getUserOrders,
  updateDeliveryStatus,
  verifyCouponCode,
  verifyingPaymentSession,
  confirmQPayPayment,
  handleQPayWebhook,
  seedPaymentSessionInternal,
  getQPayPaymentStatus,
  getQPayEbarimtInfo,
  cancelQPayPayment,
} from "../controllers/order.controller";
import { isAdmin, isSeller } from "@packages/middleware/authorizeRoles";

const router: Router = express.Router();

router.post("/create-payment-intent", isAuthenticated, createPaymentIntent);
router.post("/create-payment-session", isAuthenticated, createPaymentSession);
router.post("/qpay/confirm", isAuthenticated, confirmQPayPayment);
router.get(
  "/verifying-payment-session",
  isAuthenticated,
  verifyingPaymentSession
);
router.get("/get-seller-orders", isAuthenticated, isSeller, getSellerOrders);
router.get("/get-order-details/:id", isAuthenticated, getOrderDetails);
router.put(
  "/update-status/:orderId",
  isAuthenticated,
  isSeller,
  updateDeliveryStatus
);
router.put("/verify-coupon", isAuthenticated, verifyCouponCode);
router.get("/get-user-orders", isAuthenticated, getUserOrders);
router.get("/get-admin-orders", isAuthenticated, isAdmin, getAdminOrders);

// Internal webhook endpoint (no auth required - protected by X-Internal-Request header)
router.post("/internal/payments/qpay/webhook", handleQPayWebhook);

// Internal endpoint to seed payment session for testing
router.post("/internal/payments/qpay/seed-session", seedPaymentSessionInternal);

// Internal endpoint to get payment status (for client polling)
router.get("/internal/payments/qpay/status", getQPayPaymentStatus);

// Public endpoint to get payment status (authenticated, via gateway)
router.get("/payments/qpay/status", isAuthenticated, getQPayPaymentStatus);

// Internal endpoint to get Ebarimt info (for testing/admin)
router.get("/internal/payments/qpay/ebarimt", getQPayEbarimtInfo);

// Public endpoint to get Ebarimt info (authenticated, via gateway)
router.get("/payments/qpay/ebarimt", isAuthenticated, getQPayEbarimtInfo);

// Public endpoint to cancel payment session (authenticated, via gateway)
router.post("/payments/qpay/cancel", isAuthenticated, cancelQPayPayment);

// Public webhook endpoint for QPay callbacks (token-based auth, no JWT)
router.post("/payments/qpay/webhook", handleQPayWebhook);

// Public endpoint to create payment session (authenticated, via gateway)
router.post(
  "/payments/qpay/seed-session",
  isAuthenticated,
  seedPaymentSessionInternal
);

export default router;
