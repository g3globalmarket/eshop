import prisma from "@packages/libs/prisma";
import { NextFunction, Response, Request } from "express";
import { recommendProducts } from "../services/recommendationService";

// helper: популярные товары для анонима
async function getPopularProducts(limit = 10) {
  return prisma.products.findMany({
    include: { images: true, Shop: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

// GET /recommendation/api/get-recommendation-products
export const getRecommendedProducts = async (
  req: Request & { user?: { id?: string } },
  res: Response,
  next: NextFunction
) => {
  try {
    // 1) userId может прийти из middleware или из заголовка, а может не прийти вовсе
    const rawUserId =
      req?.user?.id ?? (req.headers["x-user-id"] as string | undefined) ?? null;

    // 2) Если пользователя нет — не падаем, отдаем популярное
    if (!rawUserId) {
      const popular = await getPopularProducts(10);
      return res.status(200).json({ success: true, recommendations: popular });
    }

    const userId = String(rawUserId);

    // 3) Подтягиваем весь пул товаров один раз (можно оптимизировать и хранить в кеше)
    const products = await prisma.products.findMany({
      include: { images: true, Shop: true },
    });

    // 4) Аналитика пользователя (может отсутствовать)
    const userAnalytics = await prisma.userAnalytics.findUnique({
      where: { userId },
      select: { actions: true, recommendations: true, lastTrained: true },
    });

    const now = new Date();
    let recommendedProducts = [];

    if (!userAnalytics) {
      // нет аналитики — вернем популярное и создадим пустую запись на будущее (без обязательности)
      recommendedProducts = await getPopularProducts(10);
      // необязательно: можно асинхронно инициировать запись
      // void prisma.userAnalytics.create({ data: { userId, actions: [], recommendations: [], lastTrained: null }});
    } else {
      const actions = Array.isArray(userAnalytics.actions)
        ? (userAnalytics.actions as any[])
        : [];

      const recommendations = Array.isArray(userAnalytics.recommendations)
        ? (userAnalytics.recommendations as string[])
        : [];

      const lastTrainedTime = userAnalytics.lastTrained
        ? new Date(userAnalytics.lastTrained)
        : null;

      const hoursDiff = lastTrainedTime
        ? (now.getTime() - lastTrainedTime.getTime()) / (1000 * 60 * 60)
        : Infinity;

      if (actions.length < 50) {
        // данных мало — вернем популярное
        recommendedProducts = await getPopularProducts(10);
      } else if (hoursDiff < 3 && recommendations.length > 0) {
        // используем кэш рекомендованных id
        const ids = new Set(recommendations.map(String));
        recommendedProducts = products.filter((p) => ids.has(String(p.id)));
        if (recommendedProducts.length === 0) {
          recommendedProducts = await getPopularProducts(10);
        }
      } else {
        // пересчет рекомендаций
        const recommendedProductIds = await recommendProducts(userId, products);
        const ids = new Set(recommendedProductIds.map(String));
        recommendedProducts = products.filter((p) => ids.has(String(p.id)));

        // обновим кэш
        await prisma.userAnalytics.upsert({
          where: { userId },
          update: { recommendations: recommendedProductIds, lastTrained: now },
          create: {
            userId,
            actions: [],
            recommendations: recommendedProductIds,
            lastTrained: now,
          },
        });

        if (recommendedProducts.length === 0) {
          recommendedProducts = await getPopularProducts(10);
        }
      }
    }

    return res
      .status(200)
      .json({ success: true, recommendations: recommendedProducts });
  } catch (error) {
    // не отдаём 500 пользователю — лучше пустой список + лог
    console.error("getRecommendedProducts error:", error);
    return res
      .status(200)
      .json({ success: true, recommendations: [], note: "fallback" });
    // если принципиально нужен 500 — замените на next(error)
    // return next(error);
  }
};
