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

export const dynamic = 'force-dynamic';

const Page = () => {
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
        setQpaySessionId(urlQpaySessionId);
        setLoading(false);
        return;
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
      const qpayResponse = await startQPayPayment(payload);

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
      setError(err.message || "Failed to create payment. Please try again.");
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
    return (
      <div className="flex justify-center items-center min-h-[60vh] px-4">
        <div className="w-full text-center">
          <div className="flex justify-center mb-4">
            <XCircle className="text-red-500 w-10 h-10" />
          </div>
          <h2 className="text-xl font-semibold text-red-600 mb-2">
            Payment Failed
          </h2>
          <p className="text-sm text-gray-600 mb-6">
            {error} <br className="hidden sm:block" /> Please go back and try
            checking out again.
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
