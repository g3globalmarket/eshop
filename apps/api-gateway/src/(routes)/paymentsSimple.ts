// src/routes/paymentsSimple.ts
import express, { Router, Request, Response } from "express";

const router: Router = express.Router();

// health/ping
router.get("/_health", (_req: Request, res: Response) => {
  res.status(200).send("OK");
});

// Simple.mn callbacks — пока заглушки 200
router.post("/success", (req: Request, res: Response) => {
  console.log("[Simple] success", { body: req.body });
  res.status(200).json({ ok: true });
});

router.post("/fail", (req: Request, res: Response) => {
  console.log("[Simple] fail", { body: req.body });
  res.status(200).json({ ok: true });
});

router.post("/notify", (req: Request, res: Response) => {
  console.log("[Simple] notify", { body: req.body });
  res.status(200).json({ ok: true });
});

export default router;
