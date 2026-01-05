"use client";
import { CheckCircle, Loader2, XCircle } from "lucide-react";
import React, { useState, useEffect, useRef } from "react";
import axiosInstance from "apps/user-ui/src/utils/axiosInstance";
import { useRouter } from "next/navigation";

const QPayCheckoutForm = ({
  invoiceId,
  qpayData,
  cartItems,
  coupon,
  sessionId,
}: {
  invoiceId: string;
  qpayData: {
    invoice_id: string;
    qr_text: string;
    qr_image: string;
    urls: Array<{
      name: string;
      description: string;
      link: string;
      logo: string;
    }>;
  };
  cartItems: any[];
  coupon: any;
  sessionId: string | null;
}) => {
  const router = useRouter();
  const [status, setStatus] = useState<"pending" | "success" | "failed">("pending");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [polling, setPolling] = useState(true);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlightRef = useRef(false);
  const maxPollTime = 180000; // 3 minutes
  const pollStartTime = useRef<number>(Date.now());

  const total = cartItems.reduce(
    (sum, item) => sum + item.sale_price * item.quantity,
    0
  );

  // Format QR image if needed
  const qrImageSrc =
    qpayData.qr_image.startsWith("data:") || qpayData.qr_image.startsWith("http")
      ? qpayData.qr_image
      : `data:image/png;base64,${qpayData.qr_image}`;

  // Poll for payment confirmation
  useEffect(() => {
    if (!polling || status !== "pending") return;

    // Stop helper function
    const stop = (nextStatus: "success" | "failed", msg?: string) => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      setPolling(false);
      if (msg) {
        setErrorMsg(msg);
      }
      setStatus(nextStatus);
    };

    // Check if sessionId is missing
    if (!sessionId) {
      stop("failed", "Missing session. Please try again.");
      return;
    }

    // Reset timeout timer when polling starts/restarts
    pollStartTime.current = Date.now();

    const checkPayment = async () => {
      // Prevent overlapping requests
      if (inFlightRef.current) {
        return;
      }

      // Stop polling if max time exceeded
      if (Date.now() - pollStartTime.current > maxPollTime) {
        stop("failed", "Payment timeout. Please try again.");
        return;
      }

      inFlightRef.current = true;
      try {
        const response = await axiosInstance.post("/order/api/qpay/confirm", {
          sessionId,
          invoiceId,
        });

        if (response.data.success && response.data.paid && response.data.created) {
          stop("success");
          // Redirect to success page after short delay
          setTimeout(() => {
            router.push(`/payment-success?sessionId=${sessionId}`);
          }, 1500);
        } else if (response.data.success && response.data.paid && !response.data.created) {
          // Already created (idempotent response)
          stop("success");
          setTimeout(() => {
            router.push(`/payment-success?sessionId=${sessionId}`);
          }, 1500);
        }
        // If not paid yet, continue polling
      } catch (error: any) {
        console.error("Payment check error:", error);
        // Continue polling on error (might be transient)
      } finally {
        inFlightRef.current = false;
      }
    };

    // Initial check
    checkPayment();

    // Poll every 2 seconds
    pollIntervalRef.current = setInterval(checkPayment, 2000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [polling, status, sessionId, invoiceId, router]);

  return (
    <div className="flex justify-center items-center min-h-[80vh] px-4 my-10">
      <div className="bg-white w-full max-w-lg p-8 rounded-md shadow space-y-6">
        <h2 className="text-3xl font-bold text-center mb-2">QPay Payment</h2>

        {/* Order Summary */}
        <div className="bg-gray-100 p-4 rounded-md text-sm text-gray-700 space-y-2 max-h-52 overflow-y-auto">
          {cartItems.map((item, idx) => (
            <div key={idx} className="flex justify-between text-sm pb-1">
              <span>
                {item.quantity} × {item.title}
              </span>
              <span>${(item.quantity * item.sale_price).toFixed(2)}</span>
            </div>
          ))}

          {!!coupon?.discountAmount && (
            <div className="flex justify-between font-semibold pt-2 border-t border-t-gray-300 mt-2">
              <span>Discount</span>
              <span className="text-green-600">
                ${coupon?.discountAmount?.toFixed(2)}
              </span>
            </div>
          )}

          <div className="flex justify-between font-semibold mt-2">
            <span>Total</span>
            <span>${(total - (coupon?.discountAmount || 0)).toFixed(2)}</span>
          </div>
        </div>

        {/* QR Code */}
        {status === "pending" && (
          <div className="flex flex-col items-center space-y-4">
            <div className="bg-white p-4 rounded-lg border-2 border-gray-200">
              <img
                src={qrImageSrc}
                alt="QPay QR Code"
                className="w-64 h-64 mx-auto"
                onError={(e) => {
                  console.error("QR image load error");
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </div>
            <p className="text-sm text-gray-600 text-center">
              Scan the QR code with your QPay app to complete payment
            </p>

            {/* Deep Links */}
            {qpayData.urls && qpayData.urls.length > 0 && (
              <div className="w-full space-y-2">
                <p className="text-sm font-semibold text-gray-700">Or use:</p>
                {qpayData.urls.map((url, idx) => (
                  <a
                    key={idx}
                    href={url.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition text-center text-sm font-medium"
                  >
                    {url.name}
                  </a>
                ))}
              </div>
            )}

            {polling && (
              <div className="flex items-center gap-2 text-blue-600 text-sm">
                <Loader2 className="animate-spin w-4 h-4" />
                <span>Waiting for payment confirmation...</span>
              </div>
            )}
          </div>
        )}

        {/* Success State */}
        {status === "success" && (
          <div className="flex flex-col items-center gap-4">
            <CheckCircle className="w-16 h-16 text-green-500" />
            <p className="text-lg font-semibold text-green-600">
              Payment successful!
            </p>
            <p className="text-sm text-gray-600">Redirecting to confirmation...</p>
          </div>
        )}

        {/* Error State */}
        {status === "failed" && (
          <div className="flex flex-col items-center gap-4">
            <XCircle className="w-16 h-16 text-red-500" />
            <p className="text-lg font-semibold text-red-600">Payment failed</p>
            {errorMsg && <p className="text-sm text-gray-600">{errorMsg}</p>}
            <button
              onClick={() => router.push("/cart")}
              className="bg-blue-600 text-white px-5 py-2 rounded-md hover:bg-blue-700 transition text-sm font-medium"
            >
              Back to Cart
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default QPayCheckoutForm;

