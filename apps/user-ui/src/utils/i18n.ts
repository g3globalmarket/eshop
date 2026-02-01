// Mongolian-only i18n utility for user-ui
// All translations are Mongolian - no English fallback

const translations: Record<string, string> = {
  // Auth
  "auth.login": "Нэвтрэх",
  "auth.signup": "Бүртгүүлэх",
  "auth.logout": "Гарах",
  "auth.email": "И-мэйл",
  "auth.password": "Нууц үг",
  "auth.rememberMe": "Намайг сана",
  "auth.forgotPassword": "Нууц үгээ мартсан уу?",
  "auth.invalidCredentials": "Буруу нэвтрэх мэдээлэл!",
  "auth.loginToEshop": "Eshop-д нэвтрэх",
  "auth.dontHaveAccount": "Бүртгэл байхгүй юу?",
  "auth.orSignInWithEmail": "эсвэл И-мэйлээр нэвтрэх",
  "auth.emailRequired": "И-мэйл шаардлагатай",
  "auth.passwordRequired": "Нууц үг шаардлагатай",
  
  // Cart
  "cart.title": "Сагс",
  "cart.empty": "Сагс хоосон байна",
  "cart.addToCart": "Сагсанд нэмэх",
  "cart.removeFromCart": "Сагснаас хасах",
  "cart.checkout": "Төлбөр төлөх",
  "cart.continueShopping": "Дэлгүүр үргэлжлүүлэх",
  "cart.subtotal": "Дүн",
  "cart.total": "Нийт",
  "cart.couponCode": "Купон код",
  "cart.applyCoupon": "Купон хэрэглэх",
  "cart.couponCodeRequired": "Купон код шаардлагатай!",
  "cart.invalidCoupon": "Купон код буруу байна",
  
  // Checkout
  "checkout.title": "Төлбөр төлөх",
  "checkout.paymentFailed": "Төлбөр амжилтгүй",
  "checkout.authenticationRequired": "Нэвтрэх шаардлагатай",
  "checkout.backToCart": "Сагс руу буцах",
  "checkout.goToLogin": "Нэвтрэх хуудас руу орох",
  "checkout.redirectingToLogin": "Нэвтрэх хуудас руу шилжиж байна...",
  "checkout.failedToCreatePayment": "Төлбөр үүсгэхэд алдаа гарлаа. Дахин оролдоно уу.",
  "checkout.paymentEndpointNotFound": "Төлбөрийн эндпоинт олдсонгүй (404). Төлбөрийн үйлчилгээ боломжгүй байж магадгүй. Дэмжлэгтэй холбогдоно уу.",
  "checkout.needToLogin": "Төлбөр төлөхийн тулд нэвтрэх шаардлагатай. Нэвтрээд дахин оролдоно уу.",
  "checkout.accessDenied": "Хандах эрх хязгаарлагдсан. Бүртгэлийн эрхээ шалгана уу.",
  "checkout.serviceUnavailable": "Төлбөрийн үйлчилгээ түр хугацаанд боломжгүй. Хэсэг хугацааны дараа дахин оролдоно уу.",
  "checkout.invalidPaymentRequest": "Төлбөрийн хүсэлт буруу байна. Сагсаа шалгаад дахин оролдоно уу.",
  
  // QPay Checkout
  "qpay.waitingForPayment": "Төлбөр хүлээж байна...",
  "qpay.paymentReceived": "Төлбөр хүлээн авлаа. Захиалга боловсруулж байна...",
  "qpay.orderCreated": "Захиалга үүслээ! Шилжиж байна...",
  "qpay.paymentFailed": "Төлбөр амжилтгүй",
  "qpay.paymentCancelled": "Төлбөр цуцлагдлаа",
  "qpay.sessionExpired": "Хугацаа дууссан",
  "qpay.sessionNotFound": "Хуудас олдсонгүй",
  "qpay.scanQRCode": "QR код уншуулах",
  "qpay.orPayViaBank": "эсвэл Банкаар төлөх",
  "qpay.copyInvoiceId": "Инвойс ID хуулах",
  "qpay.cancelPayment": "Төлбөр цуцлах",
  "qpay.confirmCancel": "Энэ төлбөрийг цуцлахдаа итгэлтэй байна уу? Сагсаасаа шинэ төлбөр эхлүүлж болно.",
  "qpay.cancelling": "Цуцлаж байна...",
  "qpay.cancelFailed": "Төлбөр цуцлахад алдаа гарлаа",
  "qpay.invoiceIdCopied": "Инвойс ID хуулагдлаа!",
  
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
  
  // Navigation
  "nav.home": "Нүүр",
  "nav.products": "Бүтээгдэхүүн",
  "nav.cart": "Сагс",
  "nav.profile": "Профайл",
  "nav.orders": "Захиалгууд",
  "nav.wishlist": "Хүслийн жагсаалт",
  
  // Product
  "product.addToCart": "Сагсанд нэмэх",
  "product.outOfStock": "Нөөц дууссан",
  "product.inStock": "Нөөцтэй",
  "product.price": "Үнэ",
  "product.description": "Тайлбар",
  "product.reviews": "Сэтгэгдлүүд",
  "product.relatedProducts": "Холбоотой бүтээгдэхүүн",
  "product.brand": "Брэнд",
  "product.color": "Өнгө",
  "product.size": "Хэмжээ",
  "product.quantity": "Тоо ширхэг",
  "product.estimatedDelivery": "Хүлээгдэж буй хүргэлт",
  
  // Order
  "order.orderHistory": "Захиалгын түүх",
  "order.trackOrder": "Захиалга хянах",
  "order.orderId": "Захиалгын ID",
  "order.status": "Төлөв",
  "order.total": "Нийт",
  "order.date": "Огноо",
  "order.viewDetails": "Дэлгэрэнгүй харах",
  
  // Error messages
  "error.generic": "Алдаа гарлаа. Дахин оролдоно уу.",
  "error.network": "Сүлжээний алдаа. Интернэт холболтоо шалгана уу.",
  "error.notFound": "Олдсонгүй",
  "error.unauthorized": "Эрх хязгаарлагдсан",
  "error.serverError": "Серверийн алдаа",
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
