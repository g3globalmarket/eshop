/**
 * QPay API Client
 * Uses Redis-based token caching via QPayAuthService
 */

import { getQPayAuthService } from "./qpay-auth.service";
import {
  qpayPaymentCheckTotal,
  qpayPaymentCheckDurationMs,
} from "../metrics/qpay.metrics";

interface QPayInvoiceResponse {
  invoice_id: string;
  qr_text: string;
  qr_image: string;
  urls: Array<{
    name: string;
    description: string;
    link: string;
    logo: string;
  }>;
}

interface QPayPaymentCheckResponse {
  count: number;
  paid_amount: number;
  rows: Array<{
    payment_id: string;
    payment_status: string;
    payment_amount: number;
    [key: string]: any;
  }>;
}

interface QPayInvoiceSimpleRequest {
  invoice_code: string;
  sender_invoice_no: string;
  invoice_receiver_code: string;
  invoice_description: string;
  amount: number;
  callback_url: string;
}

interface QPayInvoiceSimpleResponse {
  invoice_id: string;
  qr_text: string;
  qr_image: string;
  qPay_shortUrl: string;
  qPay_deeplink?: Array<any>;
}

interface QPayEbarimtV3Request {
  payment_id: string;
  ebarimt_receiver_type: string; // CITIZEN | BUSINESS
  ebarimt_receiver?: string; // Optional, registration number or citizen ID
  district_code: string; // Tax district code
  classification_code: string; // Product classification code
}

interface QPayEbarimtV3Response {
  ebarimt_receipt_id: string;
  ebarimt_qr_data: string;
  barimt_status?: string; // REGISTERED | etc
  status?: string;
  [key: string]: any; // Other fields from response
}

class QPayClient {
  private baseUrl: string;
  private invoiceCode: string;
  private authService: ReturnType<typeof getQPayAuthService>;

  constructor() {
    this.baseUrl =
      process.env.QPAY_BASE_URL || "https://merchant-sandbox.qpay.mn";
    this.invoiceCode = process.env.QPAY_INVOICE_CODE || "";
    this.authService = getQPayAuthService();

    if (!this.invoiceCode) {
      console.warn(
        "QPay invoice code not configured. Invoice creation will fail."
      );
    }
  }

  /**
   * Get access token (delegates to auth service with Redis caching)
   */
  async getAccessToken(): Promise<string> {
    return await this.authService.getAccessToken();
  }

  /**
   * Create QPay invoice
   */
  async createInvoice(input: {
    sessionId: string;
    userId: string;
    amountUsd: number;
    userEmail?: string;
  }): Promise<QPayInvoiceResponse> {
    const token = await this.getAccessToken();
    const usdToMntRate = parseFloat(process.env.QPAY_USD_TO_MNT_RATE || "3400");
    const amountMnt = Math.round(input.amountUsd * usdToMntRate);

    const requestBody = {
      invoice_code: this.invoiceCode,
      sender_invoice_no: input.sessionId, // Idempotency anchor
      invoice_receiver_code: input.userEmail || input.userId,
      invoice_description: `Eshop order session ${input.sessionId}`,
      amount: amountMnt,
    };

    try {
      const response = await fetch(`${this.baseUrl}/v2/invoice`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `QPay invoice creation failed: ${response.status} ${errorText}`
        );
      }

      const data: QPayInvoiceResponse = await response.json();
      return data;
    } catch (error: any) {
      throw new Error(`Failed to create QPay invoice: ${error.message}`);
    }
  }

  /**
   * Create QPay invoice (simple) - returns QR code data
   * Uses cached Bearer token from auth service
   */
  async createInvoiceSimple(input: {
    sessionId: string;
    userId: string;
    amount: number; // Amount in MNT
    description?: string;
    callbackToken: string; // Token for public webhook verification
  }): Promise<QPayInvoiceSimpleResponse> {
    const token = await this.getAccessToken();

    // Sanitize sender_invoice_no - must be alphanumeric only
    const sanitizedInvoiceNo = input.sessionId.replace(/[^a-zA-Z0-9]/g, "");

    // Build public callback URL with sessionId and token
    const callbackUrlBase =
      process.env.QPAY_CALLBACK_PUBLIC_BASE_URL || "http://localhost:8080";
    const callbackUrl = `${callbackUrlBase}/payments/qpay/webhook?sessionId=${encodeURIComponent(
      input.sessionId
    )}&token=${encodeURIComponent(input.callbackToken)}`;

    const requestBody: QPayInvoiceSimpleRequest = {
      invoice_code: this.invoiceCode,
      sender_invoice_no: sanitizedInvoiceNo,
      invoice_receiver_code: input.userId || sanitizedInvoiceNo,
      invoice_description:
        input.description || `Order ${input.sessionId} ${input.amount} MNT`,
      amount: input.amount,
      callback_url: callbackUrl,
    };

    try {
      const response = await fetch(`${this.baseUrl}/v2/invoice`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `QPay invoice creation failed: ${response.status} ${errorText}`
        );
      }

      const data: QPayInvoiceSimpleResponse = await response.json();

      console.log("[QPay] Invoice created successfully", {
        invoice_id: data.invoice_id,
        sessionId: input.sessionId,
        amount: input.amount,
      });

      return data;
    } catch (error: any) {
      throw new Error(`Failed to create QPay invoice: ${error.message}`);
    }
  }

  /**
   * Check payment status for an invoice (full response)
   * This is the source of truth - webhook payloads should be verified against this API
   */
  async paymentCheckInvoice(
    invoiceId: string
  ): Promise<QPayPaymentCheckResponse> {
    const start = Date.now();
    let resultLabel: "ok" | "error" = "ok";
    let httpStatusLabel = "unknown";

    const token = await this.getAccessToken();

    const requestBody = {
      object_type: "INVOICE",
      object_id: invoiceId,
      offset: {
        page_number: 1,
        page_limit: 100,
      },
    };

    try {
      const response = await fetch(`${this.baseUrl}/v2/payment/check`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      // Capture HTTP status
      httpStatusLabel = String(response.status);

      if (!response.ok) {
        resultLabel = "error";
        const errorText = await response.text();
        throw new Error(
          `QPay payment check failed: ${response.status} ${errorText}`
        );
      }

      const data: QPayPaymentCheckResponse = await response.json();

      // Increment success counter
      qpayPaymentCheckTotal.inc({ result: "ok", http_status: httpStatusLabel });

      console.log("[QPay] Payment check completed", {
        invoiceId,
        count: data.count,
        paid_amount: data.paid_amount,
        statuses: data.rows?.map((r) => r.payment_status) ?? [],
      });

      return data;
    } catch (error: any) {
      // Increment error counter
      resultLabel = "error";

      // Try to extract HTTP status from error if available
      if (error?.response?.status) {
        httpStatusLabel = String(error.response.status);
      }

      qpayPaymentCheckTotal.inc({
        result: "error",
        http_status: httpStatusLabel,
      });

      throw new Error(`Failed to check QPay invoice payment: ${error.message}`);
    } finally {
      // Observe duration in histogram
      const duration = Date.now() - start;
      qpayPaymentCheckDurationMs.observe({ result: resultLabel }, duration);
    }
  }

  /**
   * Check if invoice is paid (simple boolean check)
   * @deprecated Use paymentCheckInvoice() for webhook verification
   */
  async checkInvoicePaid(invoiceId: string): Promise<{
    paid: boolean;
    paymentId?: string;
    raw: any;
  }> {
    const data = await this.paymentCheckInvoice(invoiceId);

    // Check if any payment has status "PAID"
    const paidPayment = data.rows?.find((row) => row.payment_status === "PAID");

    return {
      paid: !!paidPayment,
      paymentId: paidPayment?.payment_id,
      raw: data,
    };
  }

  /**
   * Create Ebarimt (Mongolian e-receipt) via QPay V3 API
   * This is called AFTER payment is confirmed as PAID
   * Never throws - returns error in response if fails
   */
  async createEbarimtV3(input: QPayEbarimtV3Request): Promise<{
    success: boolean;
    data?: QPayEbarimtV3Response;
    error?: string;
  }> {
    try {
      const token = await this.getAccessToken();

      const requestBody: QPayEbarimtV3Request = {
        payment_id: input.payment_id,
        ebarimt_receiver_type: input.ebarimt_receiver_type,
        district_code: input.district_code,
        classification_code: input.classification_code,
      };

      // Only include receiver if provided (it's optional)
      if (input.ebarimt_receiver) {
        requestBody.ebarimt_receiver = input.ebarimt_receiver;
      }

      const response = await fetch(`${this.baseUrl}/v2/ebarimt_v3/create`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[QPay Ebarimt] Creation failed", {
          status: response.status,
          error: errorText,
          paymentId: input.payment_id,
        });
        return {
          success: false,
          error: `QPay Ebarimt creation failed: ${
            response.status
          } ${errorText.substring(0, 200)}`,
        };
      }

      const data: QPayEbarimtV3Response = await response.json();

      console.log("[QPay Ebarimt] Created successfully", {
        paymentId: input.payment_id,
        receiptId: data.ebarimt_receipt_id,
        status: data.barimt_status ?? data.status ?? "REGISTERED",
      });

      return {
        success: true,
        data,
      };
    } catch (error: any) {
      console.error("[QPay Ebarimt] Unexpected error", {
        paymentId: input.payment_id,
        error: error.message,
      });
      return {
        success: false,
        error: `Failed to create Ebarimt: ${error.message}`,
      };
    }
  }
}

// Singleton instance
let qpayClientInstance: QPayClient | null = null;

export function getQPayClient(): QPayClient {
  if (!qpayClientInstance) {
    qpayClientInstance = new QPayClient();
  }
  return qpayClientInstance;
}
