"use client";
import React, { useState, useEffect } from "react";
import { Receipt, Copy, CheckCircle, XCircle, Loader2, RefreshCw } from "lucide-react";
import { getQPayEbarimtInfo, type QPayEbarimtResponse } from "../../../utils/qpay-api";

interface EbarimtReceiptProps {
  sessionId: string;
  autoFetch?: boolean; // Auto-fetch on mount
}

/**
 * Ebarimt (Mongolian Tax Receipt) Display Component
 * Shows receipt info when available, with copy/download options
 */
const EbarimtReceipt: React.FC<EbarimtReceiptProps> = ({
  sessionId,
  autoFetch = true,
}) => {
  const [ebarimtData, setEbarimtData] = useState<QPayEbarimtResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchEbarimtInfo = async () => {
    if (!sessionId) {
      setError("Session ID is required");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await getQPayEbarimtInfo(sessionId);

      if (!data.ok && data.error) {
        setError(data.error);
      } else {
        setEbarimtData(data);
      }
    } catch (err: any) {
      console.error("[Ebarimt] Fetch error:", err);
      setError(err.message || "Failed to load Ebarimt info");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (autoFetch && sessionId) {
      fetchEbarimtInfo();
    }
  }, [sessionId, autoFetch]);

  const handleCopyReceiptId = async () => {
    if (ebarimtData?.ebarimt?.receiptId) {
      try {
        await navigator.clipboard.writeText(ebarimtData.ebarimt.receiptId);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (error) {
        console.error("Failed to copy:", error);
      }
    }
  };

  const handleOpenQR = () => {
    if (ebarimtData?.ebarimt?.qrData) {
      // Open QR in new tab
      const win = window.open();
      if (win) {
        win.document.write(`
          <html>
            <head><title>Ebarimt Receipt QR</title></head>
            <body style="margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#f3f4f6;">
              <img src="${ebarimtData.ebarimt.qrData}" alt="Ebarimt QR Code" style="max-width:90%;max-height:90vh;" />
            </body>
          </html>
        `);
      }
    }
  };

  // Don't render anything if no sessionId
  if (!sessionId) {
    return null;
  }

  // Loading state
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
        <div className="flex items-center gap-3 mb-4">
          <Receipt className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900">
            Ebarimt (Tax Receipt)
          </h3>
        </div>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
          <span className="ml-3 text-gray-600">Loading receipt info...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !ebarimtData) {
    return (
      <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
        <div className="flex items-center gap-3 mb-4">
          <Receipt className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900">
            Ebarimt (Tax Receipt)
          </h3>
        </div>
        <div className="flex items-center gap-2 text-red-600 text-sm">
          <XCircle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  // No data yet
  if (!ebarimtData) {
    return null;
  }

  const { ebarimt } = ebarimtData;

  // No Ebarimt requested (status is SKIPPED or null)
  if (!ebarimt.status || ebarimt.status === "SKIPPED") {
    return null;
  }

  return (
    <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Receipt className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900">
            Ebarimt (Tax Receipt)
          </h3>
        </div>
        
        {/* Refresh button */}
        <button
          onClick={fetchEbarimtInfo}
          disabled={loading}
          className="text-sm text-gray-600 hover:text-gray-800 transition flex items-center gap-1 disabled:opacity-50"
          title="Refresh receipt info"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      {/* REGISTERED: Receipt created successfully */}
      {ebarimt.status === "REGISTERED" && ebarimt.receiptId && (
        <div className="space-y-4">
          <div className="flex items-start gap-2 bg-green-50 border border-green-200 rounded-md p-3">
            <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-green-800">
                Receipt created successfully
              </p>
              <p className="text-xs text-green-700 mt-1">
                Your tax receipt has been registered with the Mongolian tax authority
              </p>
            </div>
          </div>

          {/* Receipt ID */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Receipt ID
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={ebarimt.receiptId}
                readOnly
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-sm font-mono"
              />
              <button
                onClick={handleCopyReceiptId}
                className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition flex items-center gap-2 text-sm"
                title="Copy receipt ID"
              >
                <Copy className="w-4 h-4" />
                <span className="hidden sm:inline">
                  {copied ? "Copied!" : "Copy"}
                </span>
              </button>
            </div>
          </div>

          {/* QR Code */}
          {ebarimt.qrData && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Receipt QR Code
              </label>
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <img
                  src={ebarimt.qrData}
                  alt="Ebarimt QR Code"
                  className="w-48 h-48 border-2 border-gray-200 rounded-md"
                  onError={(e) => {
                    console.error("QR image load error");
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
                <div className="flex-1 space-y-2">
                  <p className="text-sm text-gray-600">
                    Scan this QR code to view your receipt details
                  </p>
                  <button
                    onClick={handleOpenQR}
                    className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition text-sm"
                  >
                    Open QR in New Tab
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Created date */}
          {ebarimt.createdAt && (
            <p className="text-xs text-gray-500">
              Created: {new Date(ebarimt.createdAt).toLocaleString()}
            </p>
          )}
        </div>
      )}

      {/* ERROR: Receipt creation failed */}
      {ebarimt.status === "ERROR" && (
        <div className="space-y-3">
          <div className="flex items-start gap-2 bg-yellow-50 border border-yellow-200 rounded-md p-3">
            <XCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-yellow-800">
                Receipt creation failed
              </p>
              <p className="text-xs text-yellow-700 mt-1">
                We will retry automatically. If the issue persists, please contact support.
              </p>
              {ebarimt.lastError && (
                <p className="text-xs text-gray-600 mt-2 font-mono bg-white p-2 rounded border border-yellow-300">
                  {ebarimt.lastError}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Retrying automatically...</span>
          </div>
        </div>
      )}

      {/* PENDING: Receipt being generated (no status yet) */}
      {!ebarimt.status && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-blue-600 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Receipt is being generated...</span>
          </div>
          <p className="text-xs text-gray-600">
            Your receipt will be available shortly. This page will update automatically.
          </p>
        </div>
      )}
    </div>
  );
};

export default EbarimtReceipt;

