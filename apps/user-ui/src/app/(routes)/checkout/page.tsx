"use client";
import axiosInstance from "apps/user-ui/src/utils/axiosInstance";
import { XCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import QPayCheckoutForm from "apps/user-ui/src/shared/components/checkout/qpayCheckoutForm";
import EbarimtForm, {
  type EbarimtFormData,
} from "apps/user-ui/src/shared/components/checkout/EbarimtForm";
import { startQPayPayment } from "../../../utils/qpay-api";
import { useTranslation } from "../../../utils/i18n";

export const dynamic = 'force-dynamic';

const Page = () => {
  const { t } = useTranslation();
  const [qpaySessionId, setQpaySessionId] = useState<string | null>(null);
  const [qpayInvoice, setQpayInvoice] = useState<any>(null);
  const [cartItems, setCartItems] = useState<any[]>([]);
  const [coupon, setCoupon] = useState();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionData, setSessionData] = useState<any>(null); // Store session data for QPay
  const [showEbarimtForm, setShowEbarimtForm] = useState(false); // Show Ebarimt form before payment
  const [creatingPayment, setCreatingPayment] = useState(false); // Loading state for payment creation
  const searchParams = useSearchParams();
  const router = useRouter();

  // Support both old sessionId (for backward compatibility) and new qpaySessionId (QPay flow)
  const urlSessionId = searchParams.get("sessionId");
  const urlQpaySessionId = searchParams.get("qpaySessionId");
  const urlEbarimtEnabled = searchParams.get("ebarimtEnabled") === "1";

  useEffect(() => {
    const initializePayment = async () => {
      // If qpaySessionId is in URL, we're resuming a QPay payment
      if (urlQpaySessionId) {
        console.log("[Checkout] Resuming QPay payment", {
          sessionId: `${urlQpaySessionId.substring(0, 8)}...`,
        });
        
        // Try to fetch invoice data from status endpoint
        try {
          const statusRes = await axiosInstance.get(
            `/payments/qpay/status?sessionId=${encodeURIComponent(urlQpaySessionId)}`
          );
          
          if (statusRes.data.ok && statusRes.data.invoiceId) {
            // Invoice exists, but we need QR data - fetch from session payload
            // For now, set sessionId and let component handle it
            // TODO: Add endpoint to get invoice data by sessionId
            setQpaySessionId(urlQpaySessionId);
            setLoading(false);
            return;
          } else {
            throw new Error("Session not found or invalid");
          }
        } catch (err: any) {
          console.error("[Checkout] Failed to resume payment", err);
          setError("Payment session expired or not found. Please start a new payment.");
          setLoading(false);
          return;
        }
      }

      // Otherwise, fetch session and create payment intent
      const sessionId = urlSessionId;

      if (!sessionId) {
        setError("Invalid session. Please try again.");
        setLoading(false);
        return;
      }

      try {
        const verifyRes = await axiosInstance.get(
          `/order/api/verifying-payment-session?sessionId=${sessionId}`
        );

        const { totalAmount, sellers, cart, coupon } = verifyRes.data.session;

        if (
          !sellers ||
          sellers.length === 0 ||
          totalAmount === undefined ||
          totalAmount === null
        ) {
          throw new Error("Invalid payment session data.");
        }

        setCartItems(cart);
        setCoupon(coupon);

        // QPay payment provider (only payment method)
        // Store session data for QPay (will be used after Ebarimt form)
        setSessionData({
          cart,
          sellers: sellers.map((s: any) => s.id || s.shopId || s),
          totalAmount: coupon?.discountAmount
            ? totalAmount - coupon?.discountAmount
            : totalAmount,
          shippingAddressId: verifyRes.data.session.shippingAddressId || null,
          coupon: coupon || null,
        });

        // Show Ebarimt form before starting payment
        setShowEbarimtForm(true);
        setLoading(false);
      } catch (err: any) {
        console.error("[Checkout] Error:", err);
        setError(
          err.message || "Something went wrong while preparing your payment."
        );
        setLoading(false);
      }
    };

    initializePayment();
  }, [urlSessionId, urlQpaySessionId]);

  // Handle Ebarimt form submission (QPay only)
  const handleEbarimtSubmit = async (ebarimtData: EbarimtFormData | null) => {
    if (!sessionData) {
      setError("Session data missing. Please try again.");
      return;
    }

    setCreatingPayment(true);
    setError(null);

    try {
      // Build payload with optional ebarimt data
      const payload: any = {
        ...sessionData,
      };

      if (ebarimtData) {
        payload.ebarimt = {
          receiverType: ebarimtData.receiverType,
          receiver: ebarimtData.receiver || undefined, // Don't send empty string
          districtCode: ebarimtData.districtCode,
          classificationCode: ebarimtData.classificationCode,
        };
      }

      // Create QPay payment session + invoice
      console.log("[Checkout] Creating QPay payment", {
        sessionId: urlSessionId ? `${urlSessionId.substring(0, 8)}...` : null,
        totalAmount: sessionData.totalAmount,
        itemCount: sessionData.cart?.length || 0,
        hasEbarimt: !!ebarimtData,
        endpoint: "/payments/qpay/seed-session",
      });
      
      const qpayResponse = await startQPayPayment(payload);

      // Validate response structure
      if (!qpayResponse) {
        throw new Error("No response from payment service.");
      }

      if (!qpayResponse.success) {
        const errorMsg = qpayResponse.error || qpayResponse.details || "Payment creation failed";
        throw new Error(errorMsg);
      }

      if (!qpayResponse.sessionId) {
        throw new Error("Payment session created but missing session ID.");
      }

      if (!qpayResponse.invoice) {
        throw new Error("Payment session created but missing invoice data (QR code).");
      }

      // Validate invoice has at least QR text or image
      if (!qpayResponse.invoice.qrText && !qpayResponse.invoice.qrImage) {
        throw new Error("Invoice created but missing QR code data.");
      }

      console.log("[Checkout] QPay payment created successfully", {
        sessionId: `${qpayResponse.sessionId.substring(0, 8)}...`,
        invoiceId: qpayResponse.invoice.invoiceId ? `${qpayResponse.invoice.invoiceId.substring(0, 8)}...` : null,
        invoiceId_len: qpayResponse.invoice.invoiceId?.length || 0,
        amount: sessionData.totalAmount,
        itemCount: sessionData.cart?.length || 0,
        hasEbarimt: !!ebarimtData,
        hasQR: !!qpayResponse.invoice.qrImage || !!qpayResponse.invoice.qrText,
        hasDeeplinks: !!qpayResponse.invoice.deeplinks?.length,
      });

      setQpaySessionId(qpayResponse.sessionId);
      setQpayInvoice(qpayResponse.invoice);
      setShowEbarimtForm(false);

      // Update URL with qpaySessionId and ebarimtEnabled flag for refresh resilience
      const url = new URL(window.location.href);
      url.searchParams.set("qpaySessionId", qpayResponse.sessionId);
      if (ebarimtData) {
        url.searchParams.set("ebarimtEnabled", "1");
      }
      window.history.replaceState({}, "", url.toString());
    } catch (err: any) {
      console.error("[Checkout] QPay payment creation error:", err);
      
      // Extract error details from enhanced error object
      const status = err.status || err.response?.status;
      const statusText = err.statusText || err.response?.statusText;
      const responseData = err.responseData || err.response?.data;
      const endpoint = err.endpoint || err.config?.url || err.request?.url || "/payments/qpay/seed-session";
      const method = err.method || err.config?.method || "POST";
      
      // Log request details (no secrets)
      const errorDetails = {
        status,
        statusText,
        endpoint,
        method,
        hasSessionData: !!sessionData,
        sessionId: urlSessionId ? `${urlSessionId.substring(0, 8)}...` : null,
        responseData: responseData ? {
          success: responseData.success,
          error: responseData.error,
          details: responseData.details,
          requestId: responseData.requestId,
        } : null,
      };
      console.error("[Checkout] Error details:", errorDetails);
      
      // Provide user-friendly error message based on error type
      let errorMessage = t("checkout.failedToCreatePayment");
      let shouldRedirectToLogin = false;
      
      if (status === 404) {
        errorMessage = t("checkout.paymentEndpointNotFound");
      } else if (status === 401) {
        // Authentication required - show clear message and offer to redirect
        errorMessage = t("checkout.needToLogin");
        shouldRedirectToLogin = true;
      } else if (status === 403) {
        errorMessage = t("checkout.accessDenied");
      } else if (status === 502) {
        // QPay service unavailable
        errorMessage = t("checkout.serviceUnavailable") + (responseData?.details ? `: ${responseData.details}` : "");
      } else if (status >= 500) {
        errorMessage = t("checkout.serviceUnavailable");
      } else if (status === 400) {
        errorMessage = responseData?.error || responseData?.details || t("checkout.invalidPaymentRequest");
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
      
      // DO NOT redirect to receipt on failure - keep user on checkout page
      // Only redirect to login if authentication is required
      if (shouldRedirectToLogin) {
        setTimeout(() => {
          router.push("/login?redirect=/checkout" + (urlSessionId ? `?sessionId=${urlSessionId}` : ""));
        }, 2000);
      }
    } finally {
      setCreatingPayment(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[70vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    const isAuthError = error.includes("нэвтрэх") || error.includes("Нэвтрэх");
    
    return (
      <div className="flex justify-center items-center min-h-[60vh] px-4">
        <div className="w-full text-center">
          <div className="flex justify-center mb-4">
            <XCircle className="text-red-500 w-10 h-10" />
          </div>
          <h2 className="text-xl font-semibold text-red-600 mb-2">
            {isAuthError ? t("checkout.authenticationRequired") : t("checkout.paymentFailed")}
          </h2>
          <p className="text-sm text-gray-600 mb-6">
            {error} <br className="hidden sm:block" />
            {isAuthError && (
              <span className="block mt-2 text-blue-600">
                {t("checkout.redirectingToLogin")}
              </span>
            )}
          </p>
          <div className="flex gap-3 justify-center">
            {isAuthError ? (
              <button
                onClick={() => router.push("/login?redirect=/checkout" + (urlSessionId ? `?sessionId=${urlSessionId}` : ""))}
                className="bg-blue-600 text-white px-5 py-2 rounded-md hover:bg-blue-700 transition text-sm font-medium"
              >
                {t("checkout.goToLogin")}
              </button>
            ) : (
              <button
                onClick={() => router.push("/cart")}
                className="bg-blue-600 text-white px-5 py-2 rounded-md hover:bg-blue-700 transition text-sm font-medium"
              >
                {t("checkout.backToCart")}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // QPay flow (only payment method)
  // Show Ebarimt form before payment creation
  if (showEbarimtForm) {
    return (
      <div className="flex justify-center items-center min-h-[80vh] px-4 my-10">
        <EbarimtForm
          onSubmit={handleEbarimtSubmit}
          isLoading={creatingPayment}
        />
      </div>
    );
  }

  // Show payment QR code after session creation
  if (qpaySessionId) {
    // If we have invoice data, show it; otherwise component will load from sessionId
    if (qpayInvoice) {
      return (
        <QPayCheckoutForm
          initialSessionId={qpaySessionId}
          invoiceData={qpayInvoice}
          cartItems={cartItems}
          coupon={coupon}
        />
      );
    }

    // If resuming from URL (no invoice data), fetch it
    // For now, show loading (component will handle polling)
    return (
      <div className="flex justify-center items-center min-h-[70vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  // Fallback: should not reach here if sessionId is valid
  return (
    <div className="flex justify-center items-center min-h-[60vh] px-4">
      <div className="w-full text-center">
        <div className="flex justify-center mb-4">
          <XCircle className="text-red-500 w-10 h-10" />
        </div>
        <h2 className="text-xl font-semibold text-red-600 mb-2">
          Payment Setup Failed
        </h2>
        <p className="text-sm text-gray-600 mb-6">
          Unable to initialize payment. Please go back and try again.
        </p>
        <button
          onClick={() => router.push("/cart")}
          className="bg-blue-600 text-white px-5 py-2 rounded-md hover:bg-blue-700 transition text-sm font-medium"
        >
          Back to Cart
        </button>
      </div>
    </div>
  );
};

export default Page;
