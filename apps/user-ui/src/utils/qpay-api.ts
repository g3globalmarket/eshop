/**
 * QPay API Client
 * Handles communication with API Gateway for QPay payment flows
 */

import axiosInstance from "./axiosInstance";

export interface QPayInvoice {
  invoiceId: string;
  qrText: string;
  qrImage: string;
  shortUrl: string;
  deeplinks?: Array<{
    name: string;
    link: string;
    logo?: string;
    description?: string;
  }>;
}

export interface QPayEbarimtData {
  receiverType?: string; // CITIZEN | ORGANIZATION
  receiver?: string; // Registration/ID number (optional, PII)
  districtCode?: string; // Tax district code
  classificationCode?: string; // Product classification code
}

export interface QPayStartPaymentRequest {
  cart: Array<{
    productId: string;
    quantity: number;
    sale_price: number;
    shopId: string;
    title?: string;
    [key: string]: any;
  }>;
  sellers: string[];
  totalAmount: number;
  shippingAddressId?: string | null;
  coupon?: any;
  ebarimt?: QPayEbarimtData; // Optional Ebarimt (Mongolian e-receipt) data
}

export interface QPayStartPaymentResponse {
  success: boolean;
  sessionId: string;
  ttlSec: number;
  invoice: QPayInvoice;
  error?: string;
  details?: string;
}

export type QPayPaymentStatus =
  | "PENDING"
  | "PAID"
  | "PROCESSED"
  | "FAILED"
  | "CANCELLED"
  | "EXPIRED"
  | "SESSION_NOT_FOUND";

export interface QPayStatusResponse {
  ok: boolean;
  sessionId: string;
  status: QPayPaymentStatus;
  invoiceId: string | null;
  orderIds: string[] | null;
  paidAmount: number | null;
  expectedAmount: number | null;
  lastCheckAt: string | null;
  processedAt?: string | null;
  error?: string;
}

/**
 * Start a QPay payment session
 * Creates payment session + QPay invoice in one request
 *
 * @param payload - Payment details (cart, sellers, totalAmount, etc.)
 * @returns Payment session ID and invoice data (QR code, deeplinks)
 */
export async function startQPayPayment(
  payload: QPayStartPaymentRequest
): Promise<QPayStartPaymentResponse> {
  try {
    const response = await axiosInstance.post<QPayStartPaymentResponse>(
      "/payments/qpay/seed-session",
      payload
    );

    if (!response.data.success) {
      throw new Error(
        response.data.error || "Failed to create payment session"
      );
    }

    return response.data;
  } catch (error: any) {
    // Extract meaningful error message
    const errorMessage =
      error.response?.data?.error ||
      error.response?.data?.details ||
      error.response?.data?.message ||
      error.message ||
      "Failed to start QPay payment";

    console.error("[QPay API] Start payment error:", errorMessage);

    throw new Error(errorMessage);
  }
}

/**
 * Get QPay payment status
 * Polls the payment status endpoint to check if payment is complete
 *
 * @param sessionId - Payment session ID
 * @returns Current payment status
 */
export async function getQPayPaymentStatus(
  sessionId: string
): Promise<QPayStatusResponse> {
  try {
    const response = await axiosInstance.get<QPayStatusResponse>(
      `/payments/qpay/status?sessionId=${encodeURIComponent(sessionId)}`
    );

    return response.data;
  } catch (error: any) {
    // Extract meaningful error message
    const errorMessage =
      error.response?.data?.error ||
      error.response?.data?.message ||
      error.message ||
      "Failed to check payment status";

    console.error("[QPay API] Status check error:", errorMessage);

    // For status checks, we want to return a failed state rather than throwing
    // so the UI can handle it gracefully and keep polling
    return {
      ok: false,
      sessionId,
      status: "FAILED",
      invoiceId: null,
      orderIds: null,
      paidAmount: null,
      expectedAmount: null,
      lastCheckAt: null,
      error: errorMessage,
    };
  }
}

/**
 * Utility: Format QR image URL
 * Ensures QR image has proper data URI prefix
 */
export function formatQRImage(qrImage: string): string {
  if (qrImage.startsWith("data:") || qrImage.startsWith("http")) {
    return qrImage;
  }
  return `data:image/png;base64,${qrImage}`;
}

/**
 * Utility: Get status display text
 */
export function getStatusDisplayText(status: QPayPaymentStatus): string {
  switch (status) {
    case "PENDING":
      return "Waiting for payment...";
    case "PAID":
      return "Payment received. Processing order...";
    case "PROCESSED":
      return "Order created! Redirecting...";
    case "FAILED":
      return "Payment failed";
    case "CANCELLED":
      return "Payment cancelled";
    case "EXPIRED":
      return "Session expired";
    case "SESSION_NOT_FOUND":
      return "Session not found";
    default:
      return "Unknown status";
  }
}

/**
 * Cancel QPay payment response
 */
export interface QPayCancelResponse {
  ok: boolean;
  message?: string;
  sessionId: string;
  status: string;
  error?: string;
}

/**
 * Cancel a QPay payment session
 * User can cancel while waiting for payment
 *
 * @param sessionId - Payment session ID
 * @returns Cancellation result
 */
export async function cancelQPayPayment(
  sessionId: string
): Promise<QPayCancelResponse> {
  try {
    const response = await axiosInstance.post<QPayCancelResponse>(
      "/payments/qpay/cancel",
      { sessionId }
    );

    return response.data;
  } catch (error: any) {
    // Extract meaningful error message
    const errorMessage =
      error.response?.data?.error ||
      error.response?.data?.message ||
      error.message ||
      "Failed to cancel payment";

    console.error("[QPay API] Cancel error:", errorMessage);

    throw new Error(errorMessage);
  }
}

/**
 * Ebarimt (Mongolian e-receipt) Response
 */
export interface QPayEbarimtResponse {
  ok: boolean;
  sessionId: string;
  status: string; // PENDING | PAID | PROCESSED
  invoiceId: string | null;
  paymentId: string | null;
  ebarimt: {
    status: string | null; // REGISTERED | ERROR | SKIPPED | null
    receiptId: string | null;
    qrData: string | null; // base64 image or URL
    createdAt: string | null; // ISO date string
    lastError: string | null; // Error message if creation failed
  };
  error?: string;
}

/**
 * Get Ebarimt (Mongolian e-receipt) info for a payment session
 * Used to display receipt on order success page
 *
 * @param sessionId - Payment session ID
 * @returns Ebarimt receipt info
 */
export async function getQPayEbarimtInfo(
  sessionId: string
): Promise<QPayEbarimtResponse> {
  try {
    const response = await axiosInstance.get<QPayEbarimtResponse>(
      `/payments/qpay/ebarimt?sessionId=${encodeURIComponent(sessionId)}`
    );

    return response.data;
  } catch (error: any) {
    // Extract meaningful error message
    const errorMessage =
      error.response?.data?.error ||
      error.response?.data?.message ||
      error.message ||
      "Failed to get Ebarimt info";

    console.error("[QPay API] Ebarimt info error:", errorMessage);

    // Return a failed state rather than throwing
    return {
      ok: false,
      sessionId,
      status: "FAILED",
      invoiceId: null,
      paymentId: null,
      ebarimt: {
        status: null,
        receiptId: null,
        qrData: null,
        createdAt: null,
        lastError: null,
      },
      error: errorMessage,
    };
  }
}
