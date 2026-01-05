/**
 * QPay API Client
 * Minimal implementation for invoice creation and payment checking
 */

interface QPayTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

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
  rows: Array<{
    payment_id: string;
    payment_status: string;
    [key: string]: any;
  }>;
}

interface TokenCache {
  token: string;
  expiresAt: number;
}

class QPayClient {
  private baseUrl: string;
  private clientId: string;
  private clientSecret: string;
  private invoiceCode: string;
  private tokenCache: TokenCache | null = null;

  constructor() {
    this.baseUrl = process.env.QPAY_BASE_URL || "https://merchant-sandbox.qpay.mn";
    this.clientId = process.env.QPAY_CLIENT_ID || "";
    this.clientSecret = process.env.QPAY_CLIENT_SECRET || "";
    this.invoiceCode = process.env.QPAY_INVOICE_CODE || "";

    if (!this.clientId || !this.clientSecret || !this.invoiceCode) {
      console.warn("QPay credentials not configured. QPay features will be disabled.");
    }
  }

  /**
   * Get access token with in-memory caching
   * Uses Basic auth with client_id/client_secret
   */
  async getAccessToken(): Promise<string> {
    // Check cache
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now() + 60000) {
      // Buffer: refresh 1 minute before expiry
      return this.tokenCache.token;
    }

    const authString = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");

    try {
      const response = await fetch(`${this.baseUrl}/v2/auth/token`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${authString}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`QPay token request failed: ${response.status} ${errorText}`);
      }

      const data: QPayTokenResponse = await response.json();

      // Cache token
      this.tokenCache = {
        token: data.access_token,
        expiresAt: Date.now() + (data.expires_in - 60) * 1000, // Buffer 60s
      };

      return data.access_token;
    } catch (error: any) {
      throw new Error(`Failed to get QPay access token: ${error.message}`);
    }
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
        throw new Error(`QPay invoice creation failed: ${response.status} ${errorText}`);
      }

      const data: QPayInvoiceResponse = await response.json();
      return data;
    } catch (error: any) {
      throw new Error(`Failed to create QPay invoice: ${error.message}`);
    }
  }

  /**
   * Check if invoice is paid
   */
  async checkInvoicePaid(invoiceId: string): Promise<{
    paid: boolean;
    paymentId?: string;
    raw: any;
  }> {
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

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`QPay payment check failed: ${response.status} ${errorText}`);
      }

      const data: QPayPaymentCheckResponse = await response.json();

      // Check if any payment has status "PAID"
      const paidPayment = data.rows?.find((row) => row.payment_status === "PAID");

      return {
        paid: !!paidPayment,
        paymentId: paidPayment?.payment_id,
        raw: data,
      };
    } catch (error: any) {
      throw new Error(`Failed to check QPay invoice payment: ${error.message}`);
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

