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

const paymentProvider = process.env.NEXT_PUBLIC_PAYMENT_PROVIDER || "stripe";
const stripePromise =
  paymentProvider === "stripe"
    ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLIC_KEY!)
    : null;

const Page = () => {
  const [clientSecret, setClientSecret] = useState("");
  const [qpayData, setQpayData] = useState<any>(null);
  const [cartItems, setCartItems] = useState<any[]>([]);
  const [coupon, setCoupon] = useState();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const router = useRouter();

  const sessionId = searchParams.get("sessionId");

  useEffect(() => {
    const fetchSessionAndClientSecret = async () => {
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

        if (intentRes.data.provider === "qpay") {
          setQpayData(intentRes.data.qpay);
          setClientSecret(intentRes.data.clientSecret); // invoice_id
        } else {
          setClientSecret(intentRes.data.clientSecret);
        }
      } catch (err: any) {
        console.error(err);
        setError("Something went wrong while preparing your payment.");
      } finally {
        setLoading(false);
      }
    };

    fetchSessionAndClientSecret();
  }, [sessionId]);

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

  if (paymentProvider === "qpay" && qpayData) {
    return (
      <QPayCheckoutForm
        invoiceId={clientSecret}
        qpayData={qpayData}
        cartItems={cartItems}
        coupon={coupon}
        sessionId={sessionId}
      />
    );
  }

  return (
    clientSecret &&
    stripePromise && (
      <Elements stripe={stripePromise} options={{ clientSecret, appearance }}>
        <CheckoutForm
          clientSecret={clientSecret}
          cartItems={cartItems}
          coupon={coupon}
          sessionId={sessionId}
        />
      </Elements>
    )
  );
};

export default Page;
