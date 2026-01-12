"use client";
import { loadStripe, Appearance } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";
import axiosInstance from "apps/user-ui/src/utils/axiosInstance";
import { XCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import CheckoutForm from "apps/user-ui/src/shared/components/checkout/checkoutForm";
import QPayCheckoutForm from "apps/user-ui/src/shared/components/checkout/qpayCheckoutForm";
import EbarimtForm, {
  type EbarimtFormData,
} from "apps/user-ui/src/shared/components/checkout/EbarimtForm";
import { startQPayPayment } from "../../../utils/qpay-api";

export const dynamic = 'force-dynamic';

const paymentProvider = process.env.NEXT_PUBLIC_PAYMENT_PROVIDER || "stripe";
const stripePromise =
  paymentProvider === "stripe"
    ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLIC_KEY!)
    : null;

const Page = () => {
  const [clientSecret, setClientSecret] = useState("");
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

  // Support both old sessionId (Stripe/old flow) and new qpaySessionId (QPay new flow)
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

        // Handle QPay payment provider
        if (paymentProvider === "qpay") {
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
        } else {
          // Stripe flow
          const sellerStripeAccountId = sellers[0].stripeAccountOd;
          const intentRes = await axiosInstance.post(
            "/order/api/create-payment-intent",
            {
              amount: coupon?.discountAmount
                ? totalAmount - coupon?.discountAmount
                : totalAmount,
              sellerStripeAccountId,
              sessionId,
            }
          );

          setClientSecret(intentRes.data.clientSecret);
          setLoading(false);
        }
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

  const appearance: Appearance = {
    theme: "stripe",
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

  // QPay flow
  if (paymentProvider === "qpay") {
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
  }

  // Stripe flow
  return (
    clientSecret &&
    stripePromise && (
      <Elements stripe={stripePromise} options={{ clientSecret, appearance }}>
        <CheckoutForm
          clientSecret={clientSecret}
          cartItems={cartItems}
          coupon={coupon}
          sessionId={urlSessionId}
        />
      </Elements>
    )
  );
};

export default Page;
