"use client";
import {
  CheckCircle,
  Loader2,
  XCircle,
  Copy,
  ExternalLink,
  Ban,
} from "lucide-react";
import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  getQPayPaymentStatus,
  formatQRImage,
  cancelQPayPayment,
  type QPayPaymentStatus,
} from "../../../utils/qpay-api";
import { useTranslation } from "../../../utils/i18n";
import { formatMNT } from "@eshop/utils/src/currency";

const QPayCheckoutForm = ({
  initialSessionId,
  invoiceData,
  cartItems,
  coupon,
}: {
  initialSessionId: string;
  invoiceData: {
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
  };
  cartItems: any[];
  coupon: any;
}) => {
  const { t } = useTranslation();
  const router = useRouter();
  const [status, setStatus] = useState<QPayPaymentStatus>("PENDING");
  const [statusText, setStatusText] = useState(t("qpay.waitingForPayment"));
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [polling, setPolling] = useState(true);
  const [copied, setCopied] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlightRef = useRef(false);
  const maxPollTime = 300000; // 5 minutes
  const pollStartTime = useRef<number>(Date.now());
  const sessionIdRef = useRef(initialSessionId);

  const total = cartItems.reduce(
    (sum, item) => sum + item.sale_price * item.quantity,
    0
  );

  const qrImageSrc = formatQRImage(invoiceData.qrImage);

  // Update status text based on current status
  useEffect(() => {
    switch (status) {
      case "PENDING":
        setStatusText(t("qpay.waitingForPayment"));
        break;
      case "PAID":
        setStatusText(t("qpay.paymentReceived"));
        break;
      case "PROCESSED":
        setStatusText(t("qpay.orderCreated"));
        break;
      case "FAILED":
        setStatusText(t("qpay.paymentFailed"));
        break;
      case "CANCELLED":
        setStatusText(t("qpay.paymentCancelled"));
        break;
      case "EXPIRED":
        setStatusText(t("qpay.sessionExpired"));
        break;
      case "SESSION_NOT_FOUND":
        setStatusText(t("qpay.sessionNotFound"));
        break;
    }
  }, [status, t]);

  // Handle cancel payment
  const handleCancelPayment = async () => {
    const sessionId = sessionIdRef.current;

    if (!sessionId || cancelling) {
      return;
    }

    // Confirm cancellation
    const confirmed = window.confirm(
      t("qpay.confirmCancel")
    );

    if (!confirmed) {
      return;
    }

    setCancelling(true);

    try {
      await cancelQPayPayment(sessionId);

      // Stop polling
      setPolling(false);
      setStatus("CANCELLED");

      console.info("[QPay] Payment cancelled by user", { sessionId });
    } catch (error: any) {
      console.error("[QPay] Failed to cancel payment:", error);
      setErrorMsg(error.message || t("qpay.cancelFailed"));
    } finally {
      setCancelling(false);
    }
  };

  // Copy QR text to clipboard
  const handleCopyQR = async () => {
    try {
      await navigator.clipboard.writeText(invoiceData.qrText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  // Poll for payment status
  useEffect(() => {
    if (!polling || status === "PROCESSED" || status === "FAILED") return;

    const sessionId = sessionIdRef.current;

    if (!sessionId) {
      setStatus("FAILED");
      setErrorMsg(t("error.generic"));
      setPolling(false);
      return;
    }

    // Reset timeout timer when polling starts
    pollStartTime.current = Date.now();

    const checkPaymentStatus = async () => {
      // Prevent overlapping requests
      if (inFlightRef.current) {
        return;
      }

      // Stop polling if max time exceeded
      if (Date.now() - pollStartTime.current > maxPollTime) {
        setStatus("FAILED");
        setErrorMsg(t("error.generic"));
        setPolling(false);
        return;
      }

      inFlightRef.current = true;
      try {
        const result = await getQPayPaymentStatus(sessionId);

        if (!result.ok && result.error) {
          console.warn("[QPay] Status check warning:", result.error);
          // Continue polling on transient errors
          return;
        }

        // Update status
        setStatus(result.status);

        // Handle different statuses
        if (
          result.status === "PROCESSED" &&
          result.orderIds &&
          result.orderIds.length > 0
        ) {
          // Payment complete, order created
          setPolling(false);
          setTimeout(() => {
            // Include sessionId in URL for Ebarimt display
            router.push(
              `/order/${result.orderIds![0]}?qpaySessionId=${encodeURIComponent(
                sessionId
              )}`
            );
          }, 1500);
        } else if (result.status === "SESSION_NOT_FOUND") {
          setPolling(false);
          setErrorMsg(t("qpay.sessionNotFound"));
        } else if (result.status === "FAILED") {
          setPolling(false);
          setErrorMsg(result.error || t("qpay.paymentFailed"));
        } else if (result.status === "CANCELLED") {
          setPolling(false);
          setErrorMsg(t("qpay.paymentCancelled"));
        } else if (result.status === "EXPIRED") {
          setPolling(false);
          setErrorMsg(t("qpay.sessionExpired"));
        }
        // If PENDING or PAID, continue polling
      } catch (error: any) {
        console.error("[QPay] Payment check error:", error);
        // Continue polling on error (might be transient network issue)
      } finally {
        inFlightRef.current = false;
      }
    };

    // Initial check
    checkPaymentStatus();

    // Poll every 3 seconds
    pollIntervalRef.current = setInterval(checkPaymentStatus, 3000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [polling, status, router]);

  return (
    <div className="flex justify-center items-center min-h-[80vh] px-4 my-10">
      <div className="bg-white w-full max-w-lg p-8 rounded-md shadow space-y-6">
        <h2 className="text-3xl font-bold text-center mb-2">{t("common.payment")}</h2>

        {/* Order Summary */}
        <div className="bg-gray-100 p-4 rounded-md text-sm text-gray-700 space-y-2 max-h-52 overflow-y-auto">
          {cartItems.map((item, idx) => (
            <div key={idx} className="flex justify-between text-sm pb-1">
              <span>
                {item.quantity} × {item.title}
              </span>
              <span>{formatMNT(item.quantity * item.sale_price)}</span>
            </div>
          ))}

          {!!coupon?.discountAmount && (
            <div className="flex justify-between font-semibold pt-2 border-t border-t-gray-300 mt-2">
              <span>Хөнгөлөлт</span>
              <span className="text-green-600">
                {formatMNT(coupon?.discountAmount || 0)}
              </span>
            </div>
          )}

          <div className="flex justify-between font-semibold mt-2">
            <span>{t("cart.total")}</span>
            <span>{formatMNT(total - (coupon?.discountAmount || 0))}</span>
          </div>
        </div>

        {/* QR Code and Payment Options */}
        {(status === "PENDING" || status === "PAID") && (
          <div className="flex flex-col items-center space-y-4">
            {/* QR Code */}
            <div className="bg-white p-4 rounded-lg border-2 border-gray-200 shadow-sm">
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

            {/* QR Text Copy Button */}
            <button
              onClick={handleCopyQR}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800 transition"
            >
              <Copy className="w-4 h-4" />
              {copied ? t("qpay.invoiceIdCopied") : t("qpay.copyInvoiceId")}
            </button>

            <p className="text-sm text-gray-600 text-center">
              {t("qpay.scanQRCode")}
            </p>

            {/* Short URL Link */}
            {invoiceData.shortUrl && (
              <a
                href={invoiceData.shortUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 transition"
              >
                <ExternalLink className="w-4 h-4" />
                {t("qpay.orPayViaBank")}
              </a>
            )}

            {/* Deep Links */}
            {invoiceData.deeplinks && invoiceData.deeplinks.length > 0 && (
              <div className="w-full space-y-2">
                <p className="text-sm font-semibold text-gray-700 text-center">
                  {t("qpay.orPayViaBank")}:
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {invoiceData.deeplinks.map((deeplink, idx) => (
                    <a
                      key={idx}
                      href={deeplink.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 bg-blue-600 text-white py-2 px-3 rounded-md hover:bg-blue-700 transition text-sm font-medium"
                      title={deeplink.description || deeplink.name}
                    >
                      {deeplink.logo && (
                        <img
                          src={deeplink.logo}
                          alt={deeplink.name}
                          className="w-5 h-5 object-contain"
                        />
                      )}
                      <span className="truncate">{deeplink.name}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Status Indicator */}
            {polling && (
              <div className="flex items-center gap-2 text-blue-600 text-sm">
                <Loader2 className="animate-spin w-4 h-4" />
                <span>{statusText}</span>
              </div>
            )}

            {/* Cancel Button */}
            {(status === "PENDING" || status === "PAID") && polling && (
              <button
                onClick={handleCancelPayment}
                disabled={cancelling}
                className="w-full mt-4 px-4 py-2 border border-red-300 text-red-600 rounded-md hover:bg-red-50 transition text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Ban className="w-4 h-4" />
                {cancelling ? t("qpay.cancelling") : t("qpay.cancelPayment")}
              </button>
            )}
          </div>
        )}

        {/* Processing/Success State */}
        {status === "PROCESSED" && (
          <div className="flex flex-col items-center gap-4">
            <CheckCircle className="w-16 h-16 text-green-500" />
            <p className="text-lg font-semibold text-green-600">{statusText}</p>
            <p className="text-sm text-gray-600">{t("common.loading")}</p>
          </div>
        )}

        {/* Error/Cancelled/Expired State */}
        {(status === "FAILED" ||
          status === "SESSION_NOT_FOUND" ||
          status === "CANCELLED" ||
          status === "EXPIRED") && (
          <div className="flex flex-col items-center gap-4">
            <XCircle className="w-16 h-16 text-red-500" />
            <p className="text-lg font-semibold text-red-600">{statusText}</p>
            {errorMsg && <p className="text-sm text-gray-600">{errorMsg}</p>}
            {status === "CANCELLED" && (
              <p className="text-sm text-gray-600 text-center">
                Сагсаасаа шинэ төлбөр эхлүүлж болно
              </p>
            )}
            {status === "EXPIRED" && (
              <p className="text-sm text-gray-600 text-center">
                Төлбөрийн хуудас 30 минутын идэвхгүй байдлын дараа дуусна
              </p>
            )}
            <button
              onClick={() => router.push("/cart")}
              className="bg-blue-600 text-white px-5 py-2 rounded-md hover:bg-blue-700 transition text-sm font-medium"
            >
              {t("checkout.backToCart")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default QPayCheckoutForm;
