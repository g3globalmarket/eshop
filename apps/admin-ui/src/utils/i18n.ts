// Mongolian-only i18n utility for admin-ui
// All translations are Mongolian - no English fallback

const translations: Record<string, string> = {
  // Navigation
  "nav.dashboard": "Хянах самбар",
  "nav.users": "Хэрэглэгчид",
  "nav.sellers": "Борлуулагчид",
  "nav.products": "Бүтээгдэхүүн",
  "nav.orders": "Захиалгууд",
  "nav.payments": "Төлбөр",
  "nav.events": "Үйл явдлууд",
  "nav.notifications": "Мэдэгдэл",
  "nav.management": "Удирдлага",
  "nav.loggers": "Лог",
  "nav.customization": "Хувийн тохиргоо",
  "nav.logout": "Гарах",
  
  // Common
  "common.loading": "Ачаалж байна…",
  "common.error": "Алдаа",
  "common.success": "Амжилттай",
  "common.required": "Заавал",
  "common.back": "Буцах",
  "common.cancel": "Цуцлах",
  "common.confirm": "Баталгаажуулах",
  "common.save": "Хадгалах",
  "common.delete": "Устгах",
  "common.edit": "Засах",
  "common.search": "Хайх",
  "common.continue": "Үргэлжлүүлэх",
  "common.payment": "Төлбөр",
  "common.pay": "Төлөх",
  "common.order": "Захиалга",
  "common.orders": "Захиалгууд",
  "common.total": "Нийт",
  "common.status": "Төлөв",
  "common.date": "Огноо",
  "common.time": "Цаг",
  "common.view": "Харах",
  "common.details": "Дэлгэрэнгүй",
  "common.actions": "Үйлдлүүд",
  "common.filter": "Шүүх",
  "common.sort": "Эрэмбэлэх",
  "common.all": "Бүгд",
  "common.none": "Байхгүй",
  "common.yes": "Тийм",
  "common.no": "Үгүй",
  "common.close": "Хаах",
  "common.open": "Нээх",
  "common.refresh": "Сэргээх",
  "common.export": "Экспорт",
  "common.import": "Импорт",
  "common.print": "Хэвлэх",
  "common.download": "Татаж авах",
  "common.upload": "Байршуулах",
  
  // Dashboard
  "dashboard.title": "Хянах самбар",
  "dashboard.welcome": "Тавтай морил",
  "dashboard.overview": "Тойм",
  "dashboard.statistics": "Статистик",
  "dashboard.recentActivity": "Сүүлийн үйл ажиллагаа",
  
  // Users
  "users.title": "Хэрэглэгчид",
  "users.list": "Хэрэглэгчдийн жагсаалт",
  "users.add": "Хэрэглэгч нэмэх",
  "users.edit": "Хэрэглэгч засах",
  "users.delete": "Хэрэглэгч устгах",
  "users.name": "Нэр",
  "users.email": "И-мэйл",
  "users.phone": "Утас",
  "users.role": "Эрх",
  "users.active": "Идэвхтэй",
  "users.inactive": "Идэвхгүй",
  
  // Sellers
  "sellers.title": "Борлуулагчид",
  "sellers.list": "Борлуулагчдын жагсаалт",
  "sellers.shop": "Дэлгүүр",
  "sellers.products": "Бүтээгдэхүүн",
  "sellers.orders": "Захиалга",
  "sellers.revenue": "Орлого",
  
  // Products
  "products.title": "Бүтээгдэхүүн",
  "products.list": "Бүтээгдэхүүний жагсаалт",
  "products.add": "Бүтээгдэхүүн нэмэх",
  "products.edit": "Бүтээгдэхүүн засах",
  "products.delete": "Бүтээгдэхүүн устгах",
  "products.name": "Нэр",
  "products.price": "Үнэ",
  "products.stock": "Нөөц",
  "products.category": "Ангилал",
  "products.description": "Тайлбар",
  
  // Orders
  "orders.title": "Захиалгууд",
  "orders.list": "Захиалгын жагсаалт",
  "orders.view": "Захиалга харах",
  "orders.id": "Захиалгын ID",
  "orders.customer": "Харилцагч",
  "orders.total": "Нийт",
  "orders.status": "Төлөв",
  "orders.pending": "Хүлээгдэж байна",
  "orders.processing": "Боловсруулж байна",
  "orders.completed": "Дууссан",
  "orders.cancelled": "Цуцлагдсан",
  
  // Payments
  "payments.title": "Төлбөр",
  "payments.list": "Төлбөрийн жагсаалт",
  "payments.amount": "Дүн",
  "payments.method": "Арга",
  "payments.status": "Төлөв",
  "payments.date": "Огноо",
  
  // Error messages
  "error.generic": "Алдаа гарлаа. Дахин оролдоно уу.",
  "error.network": "Сүлжээний алдаа. Интернэт холболтоо шалгана уу.",
  "error.notFound": "Олдсонгүй",
  "error.unauthorized": "Эрх хязгаарлагдсан",
  "error.serverError": "Серверийн алдаа",
  "error.loadingFailed": "Ачааллахад алдаа гарлаа",
  "error.saveFailed": "Хадгалахад алдаа гарлаа",
  "error.deleteFailed": "Устгахад алдаа гарлаа",
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
