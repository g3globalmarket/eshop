"use client";
import React, { useState } from "react";
import { Receipt } from "lucide-react";
import { useTranslation } from "../../../utils/i18n";

export interface EbarimtFormData {
  receiverType: string;
  receiver: string;
  districtCode: string;
  classificationCode: string;
}

interface EbarimtFormProps {
  onSubmit: (data: EbarimtFormData | null) => void;
  isLoading?: boolean;
}

/**
 * Ebarimt (Mongolian e-receipt) Input Form
 * Allows users to optionally request an Ebarimt receipt with their payment
 */
const EbarimtForm: React.FC<EbarimtFormProps> = ({ onSubmit, isLoading }) => {
  const { t } = useTranslation();
  const [needsEbarimt, setNeedsEbarimt] = useState(false);
  const [formData, setFormData] = useState<EbarimtFormData>({
    receiverType: "CITIZEN",
    receiver: "",
    districtCode: process.env.NEXT_PUBLIC_QPAY_EBARIMT_DISTRICT_CODE || "3505",
    classificationCode:
      process.env.NEXT_PUBLIC_QPAY_EBARIMT_CLASSIFICATION_CODE || "0000010",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof EbarimtFormData, string>>>({});

  const handleCheckboxChange = (checked: boolean) => {
    setNeedsEbarimt(checked);
    setErrors({}); // Clear errors when toggling
  };

  const handleInputChange = (field: keyof EbarimtFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error for this field
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof EbarimtFormData, string>> = {};

    if (!needsEbarimt) {
      return true; // No validation needed if Ebarimt not requested
    }

    // Receiver is optional, but validate if provided
    if (formData.receiver) {
      const trimmedReceiver = formData.receiver.trim();
      if (trimmedReceiver.length > 20) {
        newErrors.receiver = "Хамгийн ихдээ 20 тэмдэгт";
      }
      // Only allow alphanumeric
      if (!/^[a-zA-Z0-9]*$/.test(trimmedReceiver)) {
        newErrors.receiver = "Зөвхөн үсэг болон тоо зөвшөөрөгдөнө";
      }
    }

    // District code validation
    const trimmedDistrict = formData.districtCode.trim();
    if (!trimmedDistrict) {
      newErrors.districtCode = "Дүүргийн код шаардлагатай";
    } else if (!/^\d+$/.test(trimmedDistrict)) {
      newErrors.districtCode = "Зөвхөн тоо байх ёстой";
    }

    // Classification code validation
    const trimmedClassification = formData.classificationCode.trim();
    if (!trimmedClassification) {
      newErrors.classificationCode = "Ангиллын код шаардлагатай";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleContinueClick = () => {
    if (!validateForm()) {
      return;
    }

    if (needsEbarimt) {
      // Submit with trimmed values
      onSubmit({
        receiverType: formData.receiverType,
        receiver: formData.receiver.trim() || undefined, // Don't send empty string
        districtCode: formData.districtCode.trim(),
        classificationCode: formData.classificationCode.trim(),
      });
    } else {
      // No Ebarimt requested
      onSubmit(null);
    }
  };

  return (
    <div className="bg-white w-full max-w-lg p-8 rounded-md shadow space-y-6">
      <div className="flex items-center gap-3 mb-4">
        <Receipt className="w-6 h-6 text-blue-600" />
        <h2 className="text-2xl font-bold">Төлбөрийн мэдээлэл</h2>
      </div>

      {/* Ebarimt Checkbox */}
      <div className="flex items-start space-x-3 p-4 bg-blue-50 rounded-md border border-blue-200">
        <input
          type="checkbox"
          id="needsEbarimt"
          checked={needsEbarimt}
          onChange={(e) => handleCheckboxChange(e.target.checked)}
          disabled={isLoading}
          className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
        />
        <label htmlFor="needsEbarimt" className="flex-1 cursor-pointer">
          <div className="font-semibold text-gray-900">Эбаримт баримт хэрэгтэй юу?</div>
          <div className="text-sm text-gray-600 mt-1">
            Хэрэв та энэ худалдан авалтад Монголын татварын баримт (Эбаримт) хэрэгтэй бол үүнийг сонгоно уу
          </div>
        </label>
      </div>

      {/* Ebarimt Form Fields (shown when checkbox is checked) */}
      {needsEbarimt && (
        <div className="space-y-4 p-4 bg-gray-50 rounded-md border border-gray-200">
          <p className="text-sm text-gray-600 mb-3">
            Эбаримтын мэдээлэлээ оруулна уу:
          </p>

          {/* Receiver Type */}
          <div>
            <label
              htmlFor="receiverType"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Хүлээн авагчийн төрөл <span className="text-red-500">*</span>
            </label>
            <select
              id="receiverType"
              value={formData.receiverType}
              onChange={(e) => handleInputChange("receiverType", e.target.value)}
              disabled={isLoading}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            >
              <option value="CITIZEN">Иргэн</option>
              <option value="ORGANIZATION">Байгууллага</option>
            </select>
          </div>

          {/* Receiver ID/Registration (Optional) */}
          <div>
            <label
              htmlFor="receiver"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              {formData.receiverType === "CITIZEN"
                ? "Иргэний регистр / Бүртгэл"
                : "Байгууллагын бүртгэл"}
              <span className="text-gray-500 text-xs ml-2">(Сонголттой)</span>
            </label>
            <input
              type="text"
              id="receiver"
              value={formData.receiver}
              onChange={(e) => handleInputChange("receiver", e.target.value)}
              disabled={isLoading}
              maxLength={20}
              placeholder={
                formData.receiverType === "CITIZEN"
                  ? "жишээ: 88614450"
                  : "жишээ: 1234567890"
              }
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 ${
                errors.receiver ? "border-red-500" : "border-gray-300"
              }`}
            />
            {errors.receiver && (
              <p className="text-red-500 text-xs mt-1">{errors.receiver}</p>
            )}
            <p className="text-xs text-gray-500 mt-1">
              Бүртгэлийн дугаар байхгүй бол хоосон үлдээнэ үү
            </p>
          </div>

          {/* District Code */}
          <div>
            <label
              htmlFor="districtCode"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Татварын дүүргийн код <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="districtCode"
              value={formData.districtCode}
              onChange={(e) => handleInputChange("districtCode", e.target.value)}
              disabled={isLoading}
              placeholder="3505"
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 ${
                errors.districtCode ? "border-red-500" : "border-gray-300"
              }`}
            />
            {errors.districtCode && (
              <p className="text-red-500 text-xs mt-1">{errors.districtCode}</p>
            )}
          </div>

          {/* Classification Code */}
          <div>
            <label
              htmlFor="classificationCode"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Бүтээгдэхүүний ангиллын код <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="classificationCode"
              value={formData.classificationCode}
              onChange={(e) =>
                handleInputChange("classificationCode", e.target.value)
              }
              disabled={isLoading}
              placeholder="0000010"
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 ${
                errors.classificationCode ? "border-red-500" : "border-gray-300"
              }`}
            />
            {errors.classificationCode && (
              <p className="text-red-500 text-xs mt-1">
                {errors.classificationCode}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Continue Button */}
      <button
        onClick={handleContinueClick}
        disabled={isLoading}
        className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
            {t("common.loading")}
          </span>
        ) : (
          t("checkout.title")
        )}
      </button>

      {/* Privacy Note */}
      {needsEbarimt && formData.receiver && (
        <p className="text-xs text-gray-500 text-center">
          🔒 Таны бүртгэлийн мэдээлэл шифрлэгдсэн бөгөөд аюулгүй хадгалагдана
        </p>
      )}
    </div>
  );
};

export default EbarimtForm;

