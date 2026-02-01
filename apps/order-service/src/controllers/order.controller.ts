import { NotFoundError, ValidationError } from "@packages/error-handler";
import prisma from "@packages/libs/prisma";
import redis from "@packages/libs/redis";
import { NextFunction, Request, Response } from "express";
import crypto from "crypto";
import Stripe from "stripe";
import { Prisma } from "@prisma/client";
import { sendEmail } from "../utils/send-email";
import { sendLog } from "@packages/utils/logs/send-logs";
import { getQPayClient } from "../payments/qpay.client";
import {
  qpayWebhookOutcomeTotal,
  qpayWebhookOutcomeDurationMs,
} from "../metrics/qpay.metrics";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-02-24.acacia" as any,
});

/**
 * Helper function to extract productId from cart items
 * Handles multiple possible shapes and validates MongoDB ObjectId format
 */
function extractProductId(item: any): string {
  // Try various property names used across the app
  let productId =
    item.productId ||
    item.product_id ||
    item.id ||
    item._id ||
    item.product?.id ||
    item.product?._id;

  // Handle MongoDB Extended JSON format: { $oid: "..." }
  if (productId && typeof productId === "object" && productId.$oid) {
    productId = productId.$oid;
  }

  // Validate productId is a valid MongoDB ObjectId (24 hex characters)
  if (!productId || typeof productId !== "string") {
    throw new ValidationError(`Invalid cart item: missing productId`, { item });
  }

  // MongoDB ObjectId validation: 24 hex characters
  if (!/^[0-9a-fA-F]{24}$/.test(productId)) {
    throw new ValidationError(
      `Invalid cart item: productId must be a valid MongoDB ObjectId (24 hex chars)`,
      { productId, item }
    );
  }

  return productId;
}

/**
 * Helper function to create orders from payment session
 * Extracted for reuse in both Stripe webhook and QPay confirm flows
 * Returns array of created order IDs
 */
export async function createOrdersFromSession(
  sessionData: string,
  userId: string,
  sessionKey: string,
  sessionId: string
): Promise<string[]> {
  const { cart, totalAmount, shippingAddressId, coupon } =
    JSON.parse(sessionData);

  const user = await prisma.users.findUnique({ where: { id: userId } });
  const name = user?.name!;
  const email = user?.email!;

  const shopGrouped = cart.reduce((acc: any, item: any) => {
    if (!acc[item.shopId]) acc[item.shopId] = [];
    acc[item.shopId].push(item);
    return acc;
  }, {});

  const createdOrderIds: string[] = [];

  for (const shopId in shopGrouped) {
    const orderItems = shopGrouped[shopId];

    let orderTotal = orderItems.reduce(
      (sum: number, p: any) => sum + p.quantity * p.sale_price,
      0
    );
    // Apply discount if applicable
    if (
      coupon &&
      coupon.discountedProductId &&
      orderItems.some((item: any) => {
        try {
          return extractProductId(item) === coupon.discountedProductId;
        } catch {
          return false;
        }
      })
    ) {
      const discountedItem = orderItems.find((item: any) => {
        try {
          return extractProductId(item) === coupon.discountedProductId;
        } catch {
          return false;
        }
      });
      if (discountedItem) {
        const discount =
          coupon.discountPercent > 0
            ? (discountedItem.sale_price *
                discountedItem.quantity *
                coupon.discountPercent) /
              100
            : coupon.discountAmount;

        orderTotal -= discount;
      }
    }

    // Create order with validated productIds
    const order = await prisma.orders.create({
      data: {
        userId,
        shopId,
        total: orderTotal,
        status: "Paid",
        shippingAddressId: shippingAddressId || null,
        couponCode: coupon?.code || null,
        discountAmount: coupon?.discountAmount || 0,
        items: {
          create: orderItems.map((item: any) => {
            const productId = extractProductId(item);
            return {
              productId,
              quantity: item.quantity,
              price: item.sale_price,
              selectedOptions: item.selectedOptions,
            };
          }),
        },
      },
    });

    // Track created order ID
    createdOrderIds.push(order.id);

    // Update product & analytics
    for (const item of orderItems) {
      const productId = extractProductId(item);
      const { quantity } = item;

      await prisma.products.update({
        where: { id: productId },
        data: {
          stock: { decrement: quantity },
          totalSales: { increment: quantity },
        },
      });

      await prisma.productAnalytics.upsert({
        where: { productId },
        create: {
          productId,
          shopId,
          purchases: quantity,
          lastViewedAt: new Date(),
        },
        update: {
          purchases: { increment: quantity },
        },
      });

      const existingAnalytics = await prisma.userAnalytics.findUnique({
        where: { userId },
      });

      const newAction = {
        productId,
        shopId,
        action: "purchase",
        timestamp: Date.now(),
      };

      const currentActions = Array.isArray(existingAnalytics?.actions)
        ? (existingAnalytics.actions as Prisma.JsonArray)
        : [];

      if (existingAnalytics) {
        await prisma.userAnalytics.update({
          where: { userId },
          data: {
            lastVisited: new Date(),
            actions: [...currentActions, newAction],
          },
        });
      } else {
        await prisma.userAnalytics.create({
          data: {
            userId,
            lastVisited: new Date(),
            actions: [newAction],
          },
        });
      }
    }

    // Send email for user
    await sendEmail(
      email,
      "🛍️ Your Eshop Order Confirmation",
      "order-confirmation",
      {
        name,
        cart,
        totalAmount: coupon?.discountAmount
          ? totalAmount - coupon?.discountAmount
          : totalAmount,
        trackingUrl: `/order/${order.id}`,
      }
    );

    // Create notifications for sellers
    const createdShopIds = Object.keys(shopGrouped);
    const sellerShops = await prisma.shops.findMany({
      where: { id: { in: createdShopIds } },
      select: {
        id: true,
        sellerId: true,
        name: true,
      },
    });

    for (const shop of sellerShops) {
      const firstProduct = shopGrouped[shop.id][0];
      const productTitle = firstProduct?.title || "new item";

      await prisma.notifications.create({
        data: {
          title: "🛒 New Order Received",
          message: `A customer just ordered ${productTitle} from your shop.`,
          creatorId: userId,
          receiverId: shop.sellerId,
          redirect_link: `https://eshop.com/order/${sessionId}`,
        },
      });
    }

    // Create notification for admin
    await prisma.notifications.create({
      data: {
        title: "📦 Platform Order Alert",
        message: `A new order was placed by ${name}.`,
        creatorId: userId,
        receiverId: "admin",
        redirect_link: `https://eshop.com/order/${sessionId}`,
      },
    });
  }

  // Delete session after successful order creation
  await redis.del(sessionKey);

  return createdOrderIds;
}

// create payment intent
export const createPaymentIntent = async (
  req: any,
  res: Response,
  next: NextFunction
) => {
  const { amount, sellerStripeAccountId, sessionId } = req.body;
  const paymentProvider = process.env.PAYMENT_PROVIDER || "stripe";

  // QPay path
  if (paymentProvider === "qpay") {
    try {
      // Validate QPay env vars
      if (
        !process.env.QPAY_CLIENT_ID ||
        !process.env.QPAY_CLIENT_SECRET ||
        !process.env.QPAY_INVOICE_CODE ||
        !process.env.QPAY_USD_TO_MNT_RATE
      ) {
        return res.status(500).json({
          error:
            "QPay configuration missing. Please set QPAY_CLIENT_ID, QPAY_CLIENT_SECRET, QPAY_INVOICE_CODE, and QPAY_USD_TO_MNT_RATE",
        });
      }

      // Get user email if available
      const user = await prisma.users.findUnique({
        where: { id: req.user.id },
        select: { email: true },
      });

      const qpayClient = getQPayClient();
      const invoice = await qpayClient.createInvoice({
        sessionId,
        userId: req.user.id,
        amountUsd: amount,
        userEmail: user?.email,
      });

      res.send({
        clientSecret: invoice.invoice_id, // Keep field name for compatibility
        provider: "qpay",
        qpay: {
          invoice_id: invoice.invoice_id,
          qr_text: invoice.qr_text,
          qr_image: invoice.qr_image,
          urls: invoice.urls,
        },
      });
    } catch (error: any) {
      console.error("QPay invoice creation error:", error);
      return next(error);
    }
    return;
  }

  // Stripe path (default)
  const customerAmount = Math.round(amount * 100);
  const platformFee = Math.floor(customerAmount * 0.1);

  console.log(sellerStripeAccountId);

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: customerAmount,
      currency: "usd",
      payment_method_types: ["card"],
      application_fee_amount: platformFee,
      transfer_data: {
        destination: sellerStripeAccountId,
      },
      metadata: {
        sessionId,
        userId: req.user.id,
      },
    });
    res.send({
      clientSecret: paymentIntent.client_secret,
    });
  } catch (error) {
    next(error);
  }
};

// create payment session
export const createPaymentSession = async (
  req: any,
  res: Response,
  next: NextFunction
) => {
  try {
    const { cart, selectedAddressId, coupon } = req.body;
    const userId = req.user.id;

    if (!cart || !Array.isArray(cart) || cart.length === 0) {
      return next(new ValidationError("Cart is empty or invalid."));
    }

    const normalizedCart = JSON.stringify(
      cart
        .map((item: any) => ({
          id: item.id,
          quantity: item.quantity,
          sale_price: item.sale_price,
          shopId: item.shopId,
          selectedOptions: item.selectedOptions || {},
        }))
        .sort((a, b) => a.id.localeCompare(b.id))
    );

    const keys = await redis.keys("payment-session:*");
    for (const key of keys) {
      const data = await redis.get(key);
      if (data) {
        const session = JSON.parse(data);
        if (session.userId === userId) {
          const existingCart = JSON.stringify(
            session.cart
              .map((item: any) => ({
                id: item.id,
                quantity: item.quantity,
                sale_price: item.sale_price,
                shopId: item.shopId,
                selectedOptions: item.selectedOptions || {},
              }))
              .sort((a: any, b: any) => a.id.localeCompare(b.id))
          );

          if (existingCart === normalizedCart) {
            return res.status(200).json({ sessionId: key.split(":")[1] });
          } else {
            await redis.del(key);
          }
        }
      }
    }

    // fetch sellers and their stripe accounts
    const uniqueShopIds = [...new Set(cart.map((item: any) => item.shopId))];

    const shops = await prisma.shops.findMany({
      where: {
        id: { in: uniqueShopIds },
      },
      select: {
        id: true,
        sellerId: true,
        sellers: {
          select: {
            stripeId: true,
          },
        },
      },
    });

    const sellerData = shops.map((shop) => ({
      shopId: shop.id,
      sellerId: shop.sellerId,
      stripeAccountOd: shop?.sellers?.stripeId,
    }));

    // calculate total
    const totalAmount = cart.reduce((total: number, item: any) => {
      return total + item.quantity * item.sale_price;
    }, 0);

    // create session payload
    const sessionId = crypto.randomUUID();

    const sessionData = {
      userId,
      cart,
      sellers: sellerData,
      totalAmount,
      shippingAddressId: selectedAddressId || null,
      coupon: coupon || null,
    };

    await redis.setex(
      `payment-session:${sessionId}`,
      600, //10 minutes
      JSON.stringify(sessionData)
    );

    return res.status(201).json({ sessionId });
  } catch (error) {
    next(error);
  }
};

// verifying payment session
export const verifyingPaymentSession = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const sessionId = req.query.sessionId as string;
    if (!sessionId) {
      return res.status(400).json({ error: "Session ID is required." });
    }

    // Fetch session from Redis
    const sessionKey = `payment-session:${sessionId}`;
    const sessionData = await redis.get(sessionKey);

    if (!sessionData) {
      return res.status(404).json({ error: "Session not found or expired." });
    }

    // Parse and return session
    const session = JSON.parse(sessionData);

    return res.status(200).json({
      success: true,
      session,
    });
  } catch (error) {
    return next(error);
  }
};

// create order
export const createOrder = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const stripeSignature = req.headers["stripe-signature"];
    if (!stripeSignature) {
      return res.status(400).send("Missing Stripe signature");
    }

    const rawBody = (req as any).rawBody;

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        rawBody,
        stripeSignature,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
    } catch (err: any) {
      console.error("Webhook signature verification failed.", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === "payment_intent.succeeded") {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const sessionId = paymentIntent.metadata.sessionId;
      const userId = paymentIntent.metadata.userId;

      const sessionKey = `payment-session:${sessionId}`;
      const sessionData = await redis.get(sessionKey);

      if (!sessionData) {
        console.warn("Session data expired or missing for", sessionId);
        return res
          .status(200)
          .send("No session found, skipping order creation");
      }

      await createOrdersFromSession(sessionData, userId, sessionKey, sessionId);
    }
    res.status(200).json({ received: true });
  } catch (error) {
    console.log(error);
    return next(error);
  }
};

// get sellers orders
export const getSellerOrders = async (
  req: any,
  res: Response,
  next: NextFunction
) => {
  try {
    const shop = await prisma.shops.findUnique({
      where: {
        sellerId: req.seller.id,
      },
    });

    // fetch all orders for this shop
    const orders = await prisma.orders.findMany({
      where: {
        shopId: shop?.id,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.status(201).json({
      success: true,
      orders,
    });
  } catch (error) {
    next(error);
  }
};

// get order details
export const getOrderDetails = async (
  req: any,
  res: Response,
  next: NextFunction
) => {
  try {
    console.log("ffff");
    const orderId = req.params.id;

    const order = await prisma.orders.findUnique({
      where: {
        id: orderId,
      },
      include: {
        items: true,
      },
    });

    if (!order) {
      return next(new NotFoundError("Order not found with the id!"));
    }

    const shippingAddress = order.shippingAddressId
      ? await prisma.address.findUnique({
          where: {
            id: order?.shippingAddressId,
          },
        })
      : null;

    const coupon = order.couponCode
      ? await prisma?.discount_codes.findUnique({
          where: {
            discountCode: order.couponCode,
          },
        })
      : null;

    // fetch all products details in one go
    const productIds = order.items.map((item) => item.productId);

    const products = await prisma.products.findMany({
      where: {
        id: { in: productIds },
      },
      select: {
        id: true,
        title: true,
        images: true,
      },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));

    const items = order.items.map((item) => ({
      ...item,
      selectedOptions: item.selectedOptions,
      product: productMap.get(item.productId) || null,
    }));

    res.status(200).json({
      success: true,
      order: {
        ...order,
        items,
        shippingAddress,
        couponCode: coupon,
      },
    });
  } catch (error) {
    next(error);
  }
};

// update order status
export const updateDeliveryStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { orderId } = req.params;
    const { deliveryStatus } = req.body;

    if (!orderId || !deliveryStatus) {
      return res
        .status(400)
        .json({ error: "Missing order ID or delivery status." });
    }

    const allowedStatuses = [
      "Ordered",
      "Packed",
      "Shipped",
      "Out for Delivery",
      "Delivered",
    ];
    if (!allowedStatuses.includes(deliveryStatus)) {
      return next(new ValidationError("Invalid delivery status."));
    }

    const existingOrder = await prisma.orders.findUnique({
      where: { id: orderId },
    });

    if (!existingOrder) {
      return next(new NotFoundError("Order not found!"));
    }

    const updatedOrder = await prisma.orders.update({
      where: { id: orderId },
      data: {
        deliveryStatus,
        updatedAt: new Date(),
      },
    });

    return res.status(200).json({
      success: true,
      message: "Delivery status updated successfully.",
      order: updatedOrder,
    });
  } catch (error) {
    return next(error);
  }
};

// confirm QPay payment
export const confirmQPayPayment = async (
  req: any,
  res: Response,
  next: NextFunction
) => {
  try {
    // DEBUG: Runtime marker to confirm this handler is executed
    if (process.env.INTERNAL_WEBHOOK_DEBUG === "true") {
      console.log("### QPAY_HANDLER_HIT ###", {
        handler: "confirmQPayPayment",
        url: req.originalUrl,
        invoiceId: req.body?.invoiceId,
        status: req.body?.status,
        sessionFromPayload:
          req.body?.payload?.sender_invoice_no ?? req.body?.payload?.sessionId,
      });
    }

    const { sessionId, invoiceId } = req.body;

    if (!sessionId || !invoiceId) {
      return res.status(400).json({
        error: "sessionId and invoiceId are required",
      });
    }

    const sessionKey = `payment-session:${sessionId}`;
    const sessionData = await redis.get(sessionKey);

    // Idempotent: if session missing, return success but created=false
    if (!sessionData) {
      if (process.env.INTERNAL_WEBHOOK_DEBUG === "true") {
        console.log("### confirmQPayPayment returning SESSION_MISSING ###", {
          sessionId,
          invoiceId,
          handler: "confirmQPayPayment",
          url: req.originalUrl,
        });
      }
      return res.status(200).json({
        success: true,
        created: false,
        reason: "SESSION_MISSING",
        sessionId,
        invoiceId,
        ...(process.env.INTERNAL_WEBHOOK_DEBUG === "true" && {
          handler: "confirmQPayPayment",
          url: req.originalUrl,
        }),
      });
    }

    const session = JSON.parse(sessionData);

    // Verify user owns this session
    if (session.userId !== req.user.id) {
      return res.status(403).json({
        error: "Unauthorized: session does not belong to this user",
      });
    }

    // Check if invoice is paid
    const qpayClient = getQPayClient();
    const paymentCheck = await qpayClient.checkInvoicePaid(invoiceId);

    if (!paymentCheck.paid) {
      return res.status(200).json({
        success: true,
        paid: false,
      });
    }

    // Payment is paid, create orders
    await createOrdersFromSession(
      sessionData,
      session.userId,
      sessionKey,
      sessionId
    );

    return res.status(200).json({
      success: true,
      paid: true,
      created: true,
      ...(process.env.INTERNAL_WEBHOOK_DEBUG === "true" && {
        handler: "confirmQPayPayment",
        url: req.originalUrl,
      }),
    });
  } catch (error: any) {
    console.error("QPay confirm payment error:", error);
    return next(error);
  }
};

// verify coupon code
export const verifyCouponCode = async (
  req: any,
  res: Response,
  next: NextFunction
) => {
  try {
    const { couponCode, cart } = req.body;

    if (!couponCode || !cart || cart.length === 0) {
      return next(new ValidationError("Coupon code and cart are required!"));
    }

    // Fetch the discount code
    const discount = await prisma.discount_codes.findUnique({
      where: { discountCode: couponCode },
    });

    if (!discount) {
      return next(new ValidationError("Coupon code isn't valid!"));
    }

    // Find matching product that includes this discount code
    const matchingProduct = cart.find((item: any) =>
      item.discount_codes?.some((d: any) => d === discount.id)
    );

    if (!matchingProduct) {
      return res.status(200).json({
        valid: false,
        discount: 0,
        discountAmount: 0,
        message: "No matching product found in cart for this coupon",
      });
    }

    let discountAmount = 0;
    const price = matchingProduct.sale_price * matchingProduct.quantity;

    if (discount.discountType === "percentage") {
      discountAmount = (price * discount.discountValue) / 100;
    } else if (discount.discountType === "flat") {
      discountAmount = discount.discountValue;
    }

    // Prevent discount from being greater than total price
    discountAmount = Math.min(discountAmount, price);

    res.status(200).json({
      valid: true,
      discount: discount.discountValue,
      discountAmount: discountAmount.toFixed(2),
      discountedProductId: matchingProduct.id,
      discountType: discount.discountType,
      message: "Discount applied to 1 eligible product",
    });
  } catch (error) {
    next(error);
  }
};

// get user orders
export const getUserOrders = async (
  req: any,
  res: Response,
  next: NextFunction
) => {
  try {
    const orders = await prisma.orders.findMany({
      where: {
        userId: req.user.id,
      },
      include: {
        items: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.status(201).json({
      success: true,
      orders,
    });
  } catch (error) {
    return next(error);
  }
};

// get admin orders
export const getAdminOrders = async (
  req: any,
  res: Response,
  next: NextFunction
) => {
  try {
    // Fetch all orders
    const orders = await prisma.orders.findMany({
      include: {
        user: true,
        shop: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
    res.status(200).json({
      success: true,
      orders,
    });
  } catch (error) {
    next(error);
  }
};

// Internal webhook handler for QPay payment notifications
// Called by API Gateway after signature verification
export const handleQPayWebhook = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // ============================================================================
  // METRICS: Start timer and prepare tracking
  // ============================================================================
  const start = Date.now();
  const isInternalRequest = req.headers["x-internal-request"] === "true";
  const source = isInternalRequest ? "internal" : "public";
  let outcome:
    | "ORDER_CREATED"
    | "DUPLICATE"
    | "NOT_PAID"
    | "AMOUNT_MISMATCH"
    | "SESSION_MISSING"
    | "INVALID_TOKEN"
    | "INVOICE_MISMATCH"
    | "PAYMENT_CHECK_FAILED"
    | "ERROR" = "ERROR"; // Default to ERROR

  try {
    // DEBUG: Runtime marker to confirm this handler is executed
    if (process.env.INTERNAL_WEBHOOK_DEBUG === "true") {
      console.log("### QPAY_HANDLER_HIT ###", {
        handler: "handleQPayWebhook",
        url: req.originalUrl,
        invoiceId: req.body?.invoiceId,
        status: req.body?.status,
        sessionFromPayload:
          req.body?.payload?.sender_invoice_no ?? req.body?.payload?.sessionId,
      });
    }

    const isPublicRequest = !isInternalRequest;

    // For PUBLIC requests, verify callback token
    if (isPublicRequest) {
      const sessionIdFromQuery = String(req.query.sessionId ?? "").trim();
      const tokenFromQuery = String(req.query.token ?? "").trim();

      if (!sessionIdFromQuery || !tokenFromQuery) {
        console.warn("[QPay Public Webhook] Missing sessionId or token", {
          sessionId: sessionIdFromQuery,
          hasToken: !!tokenFromQuery,
        });
        outcome = "ERROR"; // Validation error
        return res.status(400).json({
          ok: false,
          error: "sessionId and token query parameters are required",
        });
      }

      // Load session to verify token (try Redis first, then DB)
      const sessionKey = `payment-session:${sessionIdFromQuery}`;
      let sessionData = await redis.get(sessionKey);
      let storedToken: string | null = null;

      if (sessionData) {
        try {
          const session = JSON.parse(sessionData);
          storedToken = session.qpayCallbackToken;
        } catch {
          // Ignore parse error
        }
      }

      // If not in Redis or token not found, check database
      if (!storedToken) {
        const dbSession = await prisma.qPayPaymentSession.findUnique({
          where: { sessionId: sessionIdFromQuery },
        });
        storedToken = dbSession?.callbackToken ?? null;
      }

      // Verify token matches
      if (!storedToken || storedToken !== tokenFromQuery) {
        console.warn("[QPay Public Webhook] Invalid callback token", {
          sessionId: sessionIdFromQuery,
          hasStoredToken: !!storedToken,
          tokenMatch: storedToken === tokenFromQuery,
        });
        outcome = "INVALID_TOKEN";
        return res.status(403).json({
          ok: false,
          reason: "INVALID_CALLBACK_TOKEN",
          error: "Invalid or missing callback token",
        });
      }

      console.info("[QPay Public Webhook] Token verified", {
        sessionId: sessionIdFromQuery,
      });
    }

    // Normalize inputs upfront to avoid hidden whitespace issues
    const invoiceId = String(req.body?.invoiceId ?? "").trim();
    const status = String(req.body?.status ?? "").trim();
    const payload = req.body?.payload;

    if (!invoiceId || !status) {
      outcome = "ERROR"; // Validation error
      return res.status(400).json({
        success: false,
        error: "invoiceId and status are required",
      });
    }

    // ============================================================================
    // IDEMPOTENCY CHECK - MUST HAPPEN BEFORE ANY SESSION/REDIS CHECKS
    // This ensures duplicate webhooks return DUPLICATE even if Redis session is expired/deleted
    // ============================================================================
    console.info("[QPay Webhook] Checking idempotency", { invoiceId });

    const existing = await prisma.qPayProcessedInvoice.findUnique({
      where: { invoiceId },
    });

    if (existing) {
      // DUPLICATE FOUND - Return immediately without checking Redis/session
      const derivedSessionId =
        existing.sessionId ??
        payload?.sender_invoice_no ??
        payload?.sessionId ??
        null;

      console.info("✅ [QPay Webhook] DUPLICATE detected", {
        invoiceId,
        orderIds: existing.orderIds ?? [],
      });

      outcome = "DUPLICATE";
      return res.status(200).json({
        success: true,
        processed: false,
        reason: "DUPLICATE",
        invoiceId,
        sessionId: derivedSessionId,
        orderIds: existing.orderIds ?? [],
        processedAt: existing.processedAt,
        ...(process.env.INTERNAL_WEBHOOK_DEBUG === "true" && {
          handler: "handleQPayWebhook",
          url: req.originalUrl,
        }),
      });
    }

    console.info(
      "[QPay Webhook] No duplicate found, proceeding with new invoice",
      { invoiceId }
    );

    // ============================================================================
    // SESSION VALIDATION - Only reached if NOT duplicate
    // ============================================================================

    // Extract sessionId from query params (primary) or fallback to payload
    // QPay webhook callback URL includes: ?sessionId=...
    const sessionId = String(
      req.query.sessionId ??
        payload?.sender_invoice_no ??
        payload?.sessionId ??
        ""
    ).trim();

    if (!sessionId) {
      console.warn(
        "[QPay Webhook] Missing sessionId in query/payload (NEW invoice)",
        { invoiceId, query: req.query }
      );
      outcome = "SESSION_MISSING";
      return res.status(200).json({
        success: true,
        processed: false,
        reason: "NO_SESSION_ID",
        invoiceId,
        ...(process.env.INTERNAL_WEBHOOK_DEBUG === "true" && {
          handler: "handleQPayWebhook",
          url: req.originalUrl,
        }),
      });
    }

    // Check Redis for payment session
    const sessionKey = `payment-session:${sessionId}`;
    let sessionData = await redis.get(sessionKey);
    let session: any;
    let loadedFromDb = false;

    if (!sessionData) {
      // Redis session missing - try loading from database (fallback)
      console.warn(
        "⚠️ [QPay Webhook] Redis session missing, checking database...",
        {
          invoiceId,
          sessionId,
        }
      );

      const dbSession = await prisma.qPayPaymentSession.findUnique({
        where: { sessionId },
      });

      if (!dbSession) {
        console.warn("⚠️ [QPay Webhook] SESSION_MISSING (not in Redis or DB)", {
          invoiceId,
          sessionId,
        });
        outcome = "SESSION_MISSING";
        return res.status(200).json({
          success: true,
          processed: false,
          reason: "SESSION_MISSING",
          invoiceId,
          sessionId,
          ...(process.env.INTERNAL_WEBHOOK_DEBUG === "true" && {
            handler: "handleQPayWebhook",
            url: req.originalUrl,
          }),
        });
      }

      // Load session from database
      session = dbSession.payload as any;
      // Ensure invoiceId is set (from DB)
      if (dbSession.invoiceId && !session.qpayInvoiceId) {
        session.qpayInvoiceId = dbSession.invoiceId;
      }
      loadedFromDb = true;

      console.info(
        "✅ [QPay Webhook] Session loaded from database (Redis expired)",
        {
          sessionId,
          invoiceId,
          userId: session.userId,
        }
      );
    } else {
      session = JSON.parse(sessionData);
    }

    // ============================================================================
    // PAYMENT VERIFICATION - Always verify via QPay API (source of truth)
    // Do NOT trust webhook payload - only use QPay payment/check API
    // ============================================================================

    // Get stored invoiceId from session
    const storedInvoiceId = session.qpayInvoiceId;
    if (!storedInvoiceId) {
      console.warn("[QPay Webhook] No qpayInvoiceId in session", {
        sessionId,
        invoiceId,
      });
      outcome = "ERROR"; // Configuration/data error
      return res.status(200).json({
        success: true,
        processed: false,
        reason: "NO_INVOICE_ID_IN_SESSION",
        invoiceId,
        sessionId,
        ...(process.env.INTERNAL_WEBHOOK_DEBUG === "true" && {
          handler: "handleQPayWebhook",
          url: req.originalUrl,
        }),
      });
    }

    // Verify invoiceId from webhook matches session
    if (invoiceId !== storedInvoiceId) {
      console.warn("[QPay Webhook] Invoice ID mismatch", {
        webhookInvoiceId: invoiceId,
        sessionInvoiceId: storedInvoiceId,
        sessionId,
      });
      outcome = "INVOICE_MISMATCH";
      return res.status(200).json({
        success: true,
        processed: false,
        reason: "INVOICE_ID_MISMATCH",
        invoiceId,
        sessionId,
        ...(process.env.INTERNAL_WEBHOOK_DEBUG === "true" && {
          handler: "handleQPayWebhook",
          url: req.originalUrl,
        }),
      });
    }

    // Call QPay API to verify payment (source of truth)
    const qpayClient = getQPayClient();
    let paymentCheckResult;
    try {
      paymentCheckResult = await qpayClient.paymentCheckInvoice(invoiceId);
    } catch (error: any) {
      console.error("[QPay Webhook] Payment check API failed", {
        invoiceId,
        sessionId,
        error: error.message,
      });
      // Acknowledge webhook even if check fails (QPay will retry)
      outcome = "PAYMENT_CHECK_FAILED";
      return res.status(200).json({
        success: true,
        processed: false,
        reason: "PAYMENT_CHECK_API_FAILED",
        error: error.message,
        invoiceId,
        sessionId,
        ...(process.env.INTERNAL_WEBHOOK_DEBUG === "true" && {
          handler: "handleQPayWebhook",
          url: req.originalUrl,
        }),
      });
    }

    // Determine if payment is PAID and extract payment_id
    const paidRow = paymentCheckResult.rows?.find(
      (r) => r.payment_status === "PAID"
    );
    const isPaid = !!paidRow;
    const paidAmount = Number(paymentCheckResult.paid_amount ?? 0);
    const paymentId = paidRow?.payment_id ?? null;

    // Get expected amount from session
    const expectedAmountUsd = Number(
      session.totalAmount ?? session.amount ?? 0
    );
    const usdToMntRate = parseFloat(process.env.QPAY_USD_TO_MNT_RATE || "3400");
    const expectedAmountMnt = Math.round(expectedAmountUsd * usdToMntRate);

    // Verify amount (allow small tolerance for rounding)
    const amountOk = Math.abs(paidAmount - expectedAmountMnt) < 1;

    console.log("[QPay Webhook] Payment verification result", {
      invoiceId,
      sessionId,
      isPaid,
      paidAmount,
      expectedAmountMnt,
      amountOk,
      paymentId,
      statuses: paymentCheckResult.rows?.map((r) => r.payment_status) ?? [],
    });

    // If NOT paid or amount mismatch, acknowledge but don't create order
    if (!isPaid || !amountOk) {
      // Update lastCheckAt in database for monitoring
      await prisma.qPayPaymentSession
        .updateMany({
          where: { sessionId },
          data: {
            lastCheckAt: new Date(),
          },
        })
        .catch((err) =>
          console.warn("[QPay] Failed to update lastCheckAt:", err.message)
        );

      outcome = !isPaid ? "NOT_PAID" : "AMOUNT_MISMATCH";
      return res.status(200).json({
        success: true,
        processed: false,
        reason: !isPaid ? "NOT_PAID" : "AMOUNT_MISMATCH",
        isPaid,
        paidAmount,
        expectedAmountMnt,
        invoiceId,
        sessionId,
        ...(process.env.INTERNAL_WEBHOOK_DEBUG === "true" && {
          handler: "handleQPayWebhook",
          url: req.originalUrl,
        }),
      });
    }

    // ============================================================================
    // PAYMENT CONFIRMED - Create orders with idempotency
    // ============================================================================

    // Create processed invoice record EARLY to prevent race conditions
    // This acts as a lock before creating orders
    let processedRecord;
    try {
      processedRecord = await prisma.qPayProcessedInvoice.create({
        data: {
          invoiceId,
          sessionId,
          status: "PAID", // Use verified status
          orderIds: [], // Will be updated after order creation
        },
      });
    } catch (error: any) {
      // Race condition: another request already created this record
      if (
        error.code === 11000 ||
        error.message?.includes("duplicate") ||
        error.code === "P2002"
      ) {
        const existingRace = await prisma.qPayProcessedInvoice.findUnique({
          where: { invoiceId },
        });

        console.info(
          "✅ [QPay Webhook] DUPLICATE detected (race condition during create)",
          {
            invoiceId,
            orderIds: existingRace?.orderIds ?? [],
          }
        );

        outcome = "DUPLICATE";
        return res.status(200).json({
          success: true,
          processed: false,
          reason: "DUPLICATE",
          invoiceId,
          sessionId: existingRace?.sessionId ?? sessionId,
          orderIds: existingRace?.orderIds ?? [],
          processedAt: existingRace?.processedAt,
          ...(process.env.INTERNAL_WEBHOOK_DEBUG === "true" && {
            handler: "handleQPayWebhook",
            url: req.originalUrl,
          }),
        });
      }
      throw error;
    }

    // Create orders from session
    const createdOrderIds = await createOrdersFromSession(
      sessionData,
      session.userId,
      sessionKey,
      sessionId
    );

    // Update processed record with created order IDs
    await prisma.qPayProcessedInvoice.update({
      where: { id: processedRecord.id },
      data: {
        orderIds: createdOrderIds,
        status: "PAID",
        sessionId,
      },
    });

    // Update payment session status in database and store paymentId
    await prisma.qPayPaymentSession.updateMany({
      where: { sessionId },
      data: {
        status: "PAID",
        lastCheckAt: new Date(),
        paymentId: paymentId ?? undefined, // Store QPay payment_id for Ebarimt
      },
    });

    console.log("✅ [QPay Webhook] Successfully processed VERIFIED payment", {
      invoiceId,
      sessionId,
      userId: session.userId,
      orderIds: createdOrderIds,
      paidAmount,
      loadedFromDb,
    });

    outcome = "ORDER_CREATED";
    return res.status(200).json({
      success: true,
      processed: true,
      invoiceId,
      sessionId,
      orderIds: createdOrderIds,
      paidAmount,
      ...(process.env.INTERNAL_WEBHOOK_DEBUG === "true" && {
        handler: "handleQPayWebhook",
        url: req.originalUrl,
      }),
    });
  } catch (error: any) {
    // Log detailed error with request context for debugging
    const errorContext: any = {
      error: error.message,
      stack: error.stack,
    };

    // Add request context if available
    if (req.body) {
      errorContext.invoiceId = req.body.invoiceId;
      errorContext.status = req.body.status;
      errorContext.sessionId =
        req.body.payload?.sender_invoice_no || req.body.payload?.sessionId;
    }

    console.error("[QPay Webhook] Error processing webhook", errorContext);

    // Outcome defaults to ERROR if not already set
    // (outcome is already "ERROR" by default)

    // In debug mode with internal request, return detailed error info
    if (
      process.env.INTERNAL_WEBHOOK_DEBUG === "true" &&
      req.headers["x-internal-request"] === "true"
    ) {
      return res.status(500).json({
        success: false,
        error: error.message,
        name: error.name,
        ...(error.code && { code: error.code }),
        ...(error.meta && { meta: error.meta }),
        stack: error.stack,
      });
    }

    return next(error);
  } finally {
    // ============================================================================
    // METRICS: Record outcome and duration
    // ============================================================================
    const duration = Date.now() - start;
    qpayWebhookOutcomeTotal.inc({ source, outcome });
    qpayWebhookOutcomeDurationMs.observe({ source, outcome }, duration);
  }
};

// Endpoint to create payment session + QPay invoice
// Supports both internal (x-internal-request) and public (JWT auth) calls
export const seedPaymentSessionInternal = async (
  req: any, // Using any to access req.user from isAuthenticated middleware
  res: Response,
  next: NextFunction
) => {
  try {
    const isInternalRequest = req.headers["x-internal-request"] === "true";
    const isPublicRequest = !isInternalRequest;

    // For PUBLIC requests: authenticate and extract userId from JWT
    let authenticatedUserId: string | null = null;
    if (isPublicRequest) {
      // isAuthenticated middleware should have set req.user
      if (!req.user || !req.user.id) {
        return res.status(401).json({
          success: false,
          error: "Authentication required",
        });
      }
      authenticatedUserId = req.user.id;
    }

    // Parse request body based on request type
    let sessionData: any;
    let providedSessionId: string | undefined;
    let ttlSec: number | undefined;

    if (isInternalRequest) {
      // Internal request format: { sessionId?, ttlSec?, sessionData: {...} }
      ({ sessionId: providedSessionId, ttlSec, sessionData } = req.body);
    } else {
      // Public request format: { cart, sellers, totalAmount, ... }
      // Convert to sessionData format and inject authenticated userId
      const {
        sessionId: providedId,
        cart,
        sellers,
        totalAmount,
        shippingAddressId,
        coupon,
        ...otherFields
      } = req.body;

      providedSessionId = providedId;
      ttlSec = undefined; // Use default

      sessionData = {
        userId: authenticatedUserId, // From JWT (trusted)
        cart,
        sellers,
        totalAmount,
        shippingAddressId: shippingAddressId ?? null,
        coupon: coupon ?? null,
        ...otherFields,
      };
    }

    // Validate sessionData
    if (!sessionData) {
      return res.status(400).json({
        success: false,
        error: "sessionData is required",
      });
    }

    // For public requests, ensure userId is from JWT (not body)
    if (isPublicRequest && authenticatedUserId) {
      sessionData.userId = authenticatedUserId;
    }

    if (typeof sessionData.userId !== "string") {
      return res.status(400).json({
        success: false,
        error: "sessionData.userId must be a string",
      });
    }

    if (!Array.isArray(sessionData.cart)) {
      return res.status(400).json({
        success: false,
        error: "sessionData.cart must be an array",
      });
    }

    if (!Array.isArray(sessionData.sellers)) {
      return res.status(400).json({
        success: false,
        error: "sessionData.sellers must be an array",
      });
    }

    if (typeof sessionData.totalAmount !== "number") {
      return res.status(400).json({
        success: false,
        error: "sessionData.totalAmount must be a number",
      });
    }

    // Generate sessionId if not provided
    const sessionId = providedSessionId || crypto.randomUUID();
    const usedTtl = ttlSec ?? 600; // Default 10 minutes

    // Generate callback token for public webhook verification
    const callbackToken = crypto.randomBytes(16).toString("hex");

    // Calculate expiry for DB (optional but helpful)
    const expiresAt = new Date(Date.now() + usedTtl * 1000);

    // Store initial session in Redis (including callback token)
    const sessionKey = `payment-session:${sessionId}`;
    const sessionDataWithToken = {
      ...sessionData,
      qpayCallbackToken: callbackToken,
    };
    await redis.setex(
      sessionKey,
      usedTtl,
      JSON.stringify(sessionDataWithToken)
    );

    // Persist session to database (resilient to Redis expiry)
    await prisma.qPayPaymentSession.upsert({
      where: { sessionId },
      create: {
        sessionId,
        provider: "qpay",
        userId: sessionData.userId,
        amount: sessionData.totalAmount,
        currency: "MNT",
        payload: sessionData as any,
        status: "PENDING",
        callbackToken,
        expiresAt,
      },
      update: {
        userId: sessionData.userId,
        amount: sessionData.totalAmount,
        payload: sessionData as any,
        status: "PENDING",
        callbackToken,
        expiresAt,
      },
    });

    console.log("[QPay] Seeded payment session (Redis + DB)", {
      sessionId,
      ttlSec: usedTtl,
      userId: sessionData.userId,
      expiresAt,
    });

    // Create QPay invoice and get QR data
    let invoiceData: {
      invoiceId: string;
      qrText: string;
      qrImage: string;
      shortUrl: string;
      deeplinks?: Array<any>;
    } | null = null;

    try {
      const qpayClient = getQPayClient();
      const invoice = await qpayClient.createInvoiceSimple({
        sessionId,
        userId: sessionData.userId,
        amount: sessionData.totalAmount,
        description: `Order session ${sessionId}`,
        callbackToken,
      });

      invoiceData = {
        invoiceId: invoice.invoice_id,
        qrText: invoice.qr_text,
        qrImage: invoice.qr_image,
        shortUrl: invoice.qPay_shortUrl,
        deeplinks: invoice.qPay_deeplink,
      };

      // Update Redis session with invoice data (preserve callbackToken)
      const enrichedSessionData = {
        ...sessionData,
        qpayCallbackToken: callbackToken, // Preserve token
        qpayInvoiceId: invoice.invoice_id,
        qpayQrText: invoice.qr_text,
        qpayQrImage: invoice.qr_image,
        qpayShortUrl: invoice.qPay_shortUrl,
        qpayDeeplinks: invoice.qPay_deeplink,
        qpayCreatedAt: new Date().toISOString(),
      };

      await redis.setex(
        sessionKey,
        usedTtl,
        JSON.stringify(enrichedSessionData)
      );

      // Update database record with invoiceId
      await prisma.qPayPaymentSession.update({
        where: { sessionId },
        data: {
          invoiceId: invoice.invoice_id,
          payload: enrichedSessionData as any,
        },
      });

      // Log invoice creation with order metadata (no secrets)
      const orderCount = sessionData.cart?.length || 0;
      console.log("[QPay] Invoice created successfully", {
        sessionId,
        invoiceId: invoice.invoice_id,
        invoiceId_len: invoice.invoice_id?.length || 0,
        amount: sessionData.totalAmount,
        orderCount,
        userId: sessionData.userId,
      });
    } catch (error: any) {
      console.error("[QPay] Failed to create invoice", {
        sessionId,
        error: error.message,
        stack: error.stack,
      });

      // Store error in session for debugging (preserve callbackToken)
      const sessionWithError = {
        ...sessionData,
        qpayCallbackToken: callbackToken, // Preserve token
        qpayInvoiceCreateError: error.message,
      };
      await redis.setex(sessionKey, usedTtl, JSON.stringify(sessionWithError));

      return res.status(500).json({
        success: false,
        error: "Failed to create QPay invoice",
        details: error.message,
        sessionId,
        ttlSec: usedTtl,
      });
    }

    return res.status(200).json({
      success: true,
      sessionId,
      ttlSec: usedTtl,
      invoice: invoiceData,
    });
  } catch (error: any) {
    console.error("[QPay] Error seeding payment session", {
      error: error.message,
      stack: error.stack,
    });
    return next(error);
  }
};

// Internal endpoint to get QPay payment status (for client polling)
export const getQPayPaymentStatus = async (
  req: any, // Using any to access req.user from isAuthenticated middleware
  res: Response,
  next: NextFunction
) => {
  try {
    const isInternalRequest = req.headers["x-internal-request"] === "true";

    // Determine userId based on request type
    let requestUserId: string = "";

    if (isInternalRequest) {
      // Internal request: userId can be passed via query parameter (optional, for gateway forwarding)
      requestUserId = String(req.query.userId ?? "").trim();
    } else {
      // Public request: userId comes from authenticated user (required)
      // This assumes isAuthenticated middleware has run and set req.user
      if (!req.user || !req.user.id) {
        return res.status(401).json({
          ok: false,
          error: "Authentication required",
        });
      }
      requestUserId = req.user.id;
    }

    const sessionId = String(req.query.sessionId ?? "").trim();

    if (!sessionId) {
      return res.status(400).json({
        ok: false,
        error: "sessionId query parameter is required",
      });
    }

    // Load payment session from database (source of truth)
    const dbSession = await prisma.qPayPaymentSession.findUnique({
      where: { sessionId },
    });

    if (!dbSession) {
      return res.status(200).json({
        ok: true,
        sessionId,
        status: "SESSION_NOT_FOUND",
        invoiceId: null,
        orderIds: null,
        paidAmount: null,
        expectedAmount: null,
        lastCheckAt: null,
      });
    }

    // Ownership verification: If userId is provided (from gateway), verify it matches session owner
    if (requestUserId && dbSession.userId !== requestUserId) {
      console.warn("[QPay Status] Ownership violation attempt", {
        sessionId,
        requestUserId,
        sessionUserId: dbSession.userId,
      });
      return res.status(403).json({
        ok: false,
        error: "Access denied: This session does not belong to you",
      });
    }

    const invoiceId = dbSession.invoiceId;
    const expectedAmount = dbSession.amount;
    let status = dbSession.status;
    let orderIds: string[] | null = null;
    let paidAmount: number | null = null;

    // If invoice exists, check if order was already created (PROCESSED)
    if (invoiceId) {
      const processedInvoice = await prisma.qPayProcessedInvoice.findUnique({
        where: { invoiceId },
      });

      if (processedInvoice) {
        // Order already created - return PROCESSED
        return res.status(200).json({
          ok: true,
          sessionId,
          status: "PROCESSED",
          invoiceId,
          orderIds: processedInvoice.orderIds ?? [],
          paidAmount: expectedAmount,
          expectedAmount,
          lastCheckAt: dbSession.lastCheckAt?.toISOString() ?? null,
          processedAt: processedInvoice.processedAt?.toISOString() ?? null,
        });
      }
    }

    // If status is CANCELLED or EXPIRED, return immediately (no QPay API check)
    // User has cancelled or session expired - stop polling
    if (status === "CANCELLED" || status === "EXPIRED") {
      return res.status(200).json({
        ok: true,
        sessionId,
        status,
        invoiceId,
        orderIds: null,
        paidAmount: null,
        expectedAmount,
        lastCheckAt: dbSession.lastCheckAt?.toISOString() ?? null,
        cancelledAt: dbSession.cancelledAt?.toISOString() ?? null,
      });
    }

    // If status is already PAID but no order yet, return PAID
    if (status === "PAID") {
      return res.status(200).json({
        ok: true,
        sessionId,
        status: "PAID",
        invoiceId,
        orderIds: null,
        paidAmount: expectedAmount,
        expectedAmount,
        lastCheckAt: dbSession.lastCheckAt?.toISOString() ?? null,
      });
    }

    // If status is PENDING and invoice exists, optionally check payment status
    if (status === "PENDING" && invoiceId) {
      // Rate limiting: Don't check QPay API if we checked recently (< 10 seconds ago)
      const now = new Date();
      const lastCheckAt = dbSession.lastCheckAt;
      const shouldCheckApi =
        !lastCheckAt || now.getTime() - lastCheckAt.getTime() > 10000; // 10 seconds

      if (shouldCheckApi) {
        try {
          // Call QPay API to verify payment status
          const qpayClient = getQPayClient();
          const paymentCheckResult = await qpayClient.paymentCheckInvoice(
            invoiceId
          );

          // Determine if payment is PAID
          const isPaid = paymentCheckResult.rows?.some(
            (r) => r.payment_status === "PAID"
          );
          paidAmount = Number(paymentCheckResult.paid_amount ?? 0);

          // Verify amount (with tolerance for rounding)
          const amountOk = Math.abs(paidAmount - expectedAmount) < 1;

          // Update database with check timestamp
          if (isPaid && amountOk) {
            // Payment verified - update status to PAID
            await prisma.qPayPaymentSession.update({
              where: { sessionId },
              data: {
                status: "PAID",
                lastCheckAt: now,
              },
            });
            status = "PAID";
          } else {
            // Still pending or amount mismatch - just update lastCheckAt
            await prisma.qPayPaymentSession.update({
              where: { sessionId },
              data: {
                lastCheckAt: now,
              },
            });
          }

          console.log("[QPay Status] Payment check completed", {
            sessionId,
            invoiceId,
            isPaid,
            paidAmount,
            expectedAmount,
            amountOk,
          });
        } catch (error: any) {
          console.error("[QPay Status] Failed to check payment status", {
            sessionId,
            invoiceId,
            error: error.message,
          });
          // Don't fail the status endpoint if QPay API fails
          // Return cached status instead
        }
      } else {
        console.log("[QPay Status] Skipping API check (rate limited)", {
          sessionId,
          lastCheckAt: lastCheckAt?.toISOString(),
          secondsSinceLastCheck: lastCheckAt
            ? (now.getTime() - lastCheckAt.getTime()) / 1000
            : null,
        });
      }
    }

    // Return final status
    return res.status(200).json({
      ok: true,
      sessionId,
      status,
      invoiceId,
      orderIds,
      paidAmount,
      expectedAmount,
      lastCheckAt: dbSession.lastCheckAt?.toISOString() ?? null,
    });
  } catch (error: any) {
    console.error("[QPay Status] Error getting payment status", {
      error: error.message,
      stack: error.stack,
    });
    return next(error);
  }
};

/**
 * Get Ebarimt (Mongolian e-receipt) info for a payment session
 * Used by frontend to display receipt on order success page
 *
 * Endpoint: GET /api/internal/payments/qpay/ebarimt?sessionId=...
 * Auth: JWT required (via gateway), ownership verified
 * Returns: Ebarimt receipt info (NO PII - receiver field excluded)
 */
export const getQPayEbarimtInfo = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Determine request type: internal (x-internal-request) or public (JWT via gateway)
    const isInternalRequest = req.headers["x-internal-request"] === "true";
    const requestUserId = (req as any).user?.id; // JWT userId from gateway

    // For internal requests, no auth required (for testing/admin)
    // For public requests, JWT is required
    if (!isInternalRequest && !requestUserId) {
      return res.status(401).json({
        ok: false,
        error: "Authentication required",
      });
    }

    const sessionId = String(req.query.sessionId ?? "").trim();

    if (!sessionId) {
      return res.status(400).json({
        ok: false,
        error: "sessionId query parameter is required",
      });
    }

    console.info("[QPay Ebarimt] Getting Ebarimt info", {
      sessionId,
      requestUserId,
      isInternal: isInternalRequest,
    });

    // Load session from database
    const dbSession = await prisma.qPayPaymentSession.findUnique({
      where: { sessionId },
      select: {
        sessionId: true,
        userId: true,
        status: true,
        invoiceId: true,
        paymentId: true,
        ebarimtStatus: true,
        ebarimtReceiptId: true,
        ebarimtQrData: true,
        ebarimtCreatedAt: true,
        ebarimtLastError: true,
      },
    });

    if (!dbSession) {
      console.warn("[QPay Ebarimt] Session not found", { sessionId });
      return res.status(404).json({
        ok: false,
        error: "Session not found",
      });
    }

    // Ownership verification: If userId is provided (from gateway), verify it matches session owner
    if (requestUserId && dbSession.userId !== requestUserId) {
      console.warn("[QPay Ebarimt] Ownership violation attempt", {
        sessionId,
        requestUserId,
        sessionUserId: dbSession.userId,
      });
      return res.status(403).json({
        ok: false,
        error: "Access denied: This session does not belong to you",
      });
    }

    // Build safe response (NO PII - exclude receiver field)
    const response = {
      ok: true,
      sessionId,
      status: dbSession.status,
      invoiceId: dbSession.invoiceId ?? null,
      paymentId: dbSession.paymentId ?? null,
      ebarimt: {
        status: dbSession.ebarimtStatus ?? null, // REGISTERED | ERROR | SKIPPED | null
        receiptId: dbSession.ebarimtReceiptId ?? null,
        qrData: dbSession.ebarimtQrData ?? null,
        createdAt: dbSession.ebarimtCreatedAt?.toISOString() ?? null,
        lastError: dbSession.ebarimtLastError ?? null, // Include for debugging (user-facing)
      },
    };

    console.info("[QPay Ebarimt] Ebarimt info retrieved", {
      sessionId,
      ebarimtStatus: dbSession.ebarimtStatus,
      hasReceiptId: !!dbSession.ebarimtReceiptId,
    });

    return res.status(200).json(response);
  } catch (error: any) {
    console.error("[QPay Ebarimt] Error getting Ebarimt info", {
      error: error.message,
      stack: error.stack,
    });
    return next(error);
  }
};

/**
 * Cancel a QPay payment session
 * User can cancel while waiting for payment (before PAID/PROCESSED)
 *
 * Endpoint: POST /api/payments/qpay/cancel
 * Auth: JWT required (via gateway), ownership verified
 * Body: { sessionId: string }
 *
 * Policy: If user cancels but later pays anyway, webhook will still create order (money received)
 * But reconciliation won't check cancelled sessions, and frontend stops polling
 */
export const cancelQPayPayment = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const requestUserId = (req as any).user?.id; // JWT userId from gateway

    if (!requestUserId) {
      return res.status(401).json({
        ok: false,
        error: "Authentication required",
      });
    }

    const sessionId = String(req.body?.sessionId ?? "").trim();

    if (!sessionId) {
      return res.status(400).json({
        ok: false,
        error: "sessionId is required in request body",
      });
    }

    console.info("[QPay Cancel] Cancelling payment session", {
      sessionId,
      requestUserId,
    });

    // Load session from database
    const dbSession = await prisma.qPayPaymentSession.findUnique({
      where: { sessionId },
      select: {
        sessionId: true,
        userId: true,
        status: true,
        invoiceId: true,
      },
    });

    if (!dbSession) {
      console.warn("[QPay Cancel] Session not found", { sessionId });
      return res.status(404).json({
        ok: false,
        error: "Session not found",
      });
    }

    // Ownership verification
    if (dbSession.userId !== requestUserId) {
      console.warn("[QPay Cancel] Ownership violation attempt", {
        sessionId,
        requestUserId,
        sessionUserId: dbSession.userId,
      });
      return res.status(403).json({
        ok: false,
        error: "Access denied: This session does not belong to you",
      });
    }

    // Check if session can be cancelled (only PENDING can be cancelled)
    if (dbSession.status === "PROCESSED") {
      return res.status(400).json({
        ok: false,
        error: "Cannot cancel: Order already created",
        status: dbSession.status,
      });
    }

    if (dbSession.status === "CANCELLED") {
      // Already cancelled - return success (idempotent)
      return res.status(200).json({
        ok: true,
        message: "Payment already cancelled",
        sessionId,
        status: "CANCELLED",
      });
    }

    // Cancel the session
    await prisma.qPayPaymentSession.update({
      where: { sessionId },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
      },
    });

    console.info("✅ [QPay Cancel] Payment session cancelled", {
      sessionId,
      previousStatus: dbSession.status,
      userId: requestUserId,
    });

    return res.status(200).json({
      ok: true,
      message: "Payment cancelled successfully",
      sessionId,
      status: "CANCELLED",
    });
  } catch (error: any) {
    console.error("[QPay Cancel] Error cancelling payment", {
      error: error.message,
      stack: error.stack,
    });
    return next(error);
  }
};
