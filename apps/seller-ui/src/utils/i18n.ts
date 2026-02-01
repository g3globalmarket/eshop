// Mongolian-only i18n utility for seller-ui dashboard
// All translations are Mongolian - no English fallback

const translations: Record<string, string> = {
  // Dashboard
  "dashboard.title": "Хянах самбар",
  "dashboard.createProduct": "Бүтээгдэхүүн нэмэх",
  "dashboard.products": "Бүтээгдэхүүнүүд",
  "dashboard.allProducts": "Бүх бүтээгдэхүүн",
  "dashboard.orders": "Захиалгууд",
  "dashboard.customers": "Харилцагчид",
  "dashboard.settings": "Тохиргоо",
  "dashboard.save": "Хадгалах",
  "dashboard.cancel": "Цуцлах",
  "dashboard.payments": "Төлбөр",
  "dashboard.notifications": "Мэдэгдэл",
  "dashboard.inbox": "Ирсэн",
  "dashboard.discountCodes": "Хөнгөлөлтийн код",
  "dashboard.logout": "Гарах",
  "dashboard.mainMenu": "Үндсэн цэс",
  "dashboard.controllers": "Удирдлага",
  "dashboard.extras": "Нэмэлт",
  "dashboard.createEvent": "Үйл явдал нэмэх",
  "dashboard.allEvents": "Бүх үйл явдал",
  
  // Product Form
  "product.title": "Бүтээгдэхүүний нэр",
  "product.titlePlaceholder": "Бүтээгдэхүүний нэр оруулна уу",
  "product.shortDescription": "Богино тайлбар",
  "product.detailedDescription": "Дэлгэрэнгүй тайлбар",
  "product.price": "Үнэ",
  "product.regularPrice": "Энгийн үнэ",
  "product.salePrice": "Хямдруулсан үнэ",
  "product.stock": "Нөөц",
  "product.category": "Ангилал",
  "product.subCategory": "Дэд ангилал",
  "product.images": "Зураг",
  "product.create": "Нэмэх",
  "product.creating": "Нэмэж байна...",
  "product.descriptionPlaceholder": "Бүтээгдэхүүний богино тайлбар оруулна уу",
  "product.slug": "Холбоос",
  "product.tags": "Шошго",
  "product.brand": "Брэнд",
  "product.warranty": "Баталгаа",
  "product.cashOnDelivery": "Хүргэлтээр төлбөр",
  "product.videoUrl": "Видео холбоос",
  "product.colors": "Өнгө",
  "product.sizes": "Хэмжээ",
  "product.selectCategory": "Ангилал сонгох",
  "product.selectSubCategory": "Дэд ангилал сонгох",
  
  // Validation Messages
  "validation.titleRequired": "Бүтээгдэхүүний нэр заавал шаардлагатай",
  "validation.descriptionRequired": "Тайлбар заавал шаардлагатай",
  "validation.descriptionMaxWords": "Тайлбар {count} үгээс их байж болохгүй (Одоогийн: {current})",
  "validation.categoryRequired": "Ангилал заавал шаардлагатай",
  "validation.subCategoryRequired": "Дэд ангилал заавал шаардлагатай",
  "validation.slugRequired": "Холбоос заавал шаардлагатай!",
  "validation.slugInvalid": "Холбоос буруу формат! Зөвхөн жижиг үсэг, тоо, зураас ашиглана уу (жишээ: product-slug).",
  "validation.slugMinLength": "Холбоос хамгийн багадаа 3 тэмдэгт байх ёстой.",
  "validation.slugMaxLength": "Холбоос 50 тэмдэгтээс урт байж болохгүй.",
  
  // Loading/Error States
  "loading.categories": "Ангилал ачааллаж байна...",
  "error.loadCategories": "Ангилал ачаалахад алдаа гарлаа",
  "error.enterTitleForSlug": "Холбоос үүсгэхийн тулд бүтээгдэхүүний нэрийг оруулна уу!",
  "success.slugAvailable": "Холбоос боломжтой!",
  "info.slugNotAvailable": "Холбоос боломжгүй, шинэ санал болгосон!",
  "error.slugTaken": "Холбоос аль хэдийн ашиглагдсан байна, засварлаж үзнэ үү.",
  "error.slugValidationFailed": "Холбоос баталгаажуулахад алдаа гарлаа. Дахин оролдоно уу.",
  
  // Common
  "common.required": "Заавал",
  "common.maxWords": "Хамгийн ихдээ {count} үг",
  
  // Settings Page
  "settings.title": "Тохиргоо",
  "settings.saveChanges": "Өөрчлөлт хадгалах",
  "settings.cancel": "Цуцлах",
  "settings.savedSuccessfully": "Тохиргоо амжилттай хадгалагдлаа!",
  "settings.orderNotificationPreferences": "Захиалгын мэдэгдлийн тохиргоо",
  "settings.chooseNotificationMethod": "Захиалгын мэдэгдлийг хэрхэн хүлээн авахыг сонгоно уу (Имэйл, Веб, Апп).",
};

// Translate function - always returns Mongolian
export const t = (key: string, params?: Record<string, string | number>): string => {
  let text = translations[key] || key;
  
  // Replace params
  if (params) {
    Object.entries(params).forEach(([paramKey, value]) => {
      text = text.replace(`{${paramKey}}`, String(value));
    });
  }
  
  return text;
};

// Hook for React components
export const useTranslation = () => {
  return {
    t,
  };
};
