import { Router } from "express";
import { db } from "@workspace/db";
import { productsTable, productCategoriesTable, userProductsTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { requireUser } from "../middlewares/auth";
import { toProxyUrl } from "../lib/storage/index";

const router = Router();
const BASE_URL = process.env.BASE_URL || "";

// ─── Helper: rewrite media URLs in a product object ───────────────────────────
function sanitizeProduct<T extends { id: number; audioUrl?: string | null; imageUrl?: string | null }>(p: T): T {
  return {
    ...p,
    audioUrl: p.audioUrl ? `${BASE_URL}/api/stream/audio/product/${p.id}` : null,
    imageUrl: toProxyUrl(p.imageUrl) ?? p.imageUrl ?? null,
  };
}

// GET /product-categories - public
router.get("/product-categories", async (_req, res) => {
  const cats = await db.select().from(productCategoriesTable).orderBy(asc(productCategoriesTable.sortOrder), asc(productCategoriesTable.id));
  res.json(cats);
});

// GET /products - public, grouped by category
router.get("/products", async (_req, res) => {
  const [cats, products] = await Promise.all([
    db.select().from(productCategoriesTable).orderBy(asc(productCategoriesTable.sortOrder), asc(productCategoriesTable.id)),
    db.select().from(productsTable).where(eq(productsTable.isPublished, true)).orderBy(asc(productsTable.createdAt)),
  ]);

  const grouped = cats.map(cat => ({
    ...cat,
    products: products.filter(p => p.categoryId === cat.id).map(sanitizeProduct),
  }));
  const uncategorized = products.filter(p => !p.categoryId).map(sanitizeProduct);

  res.json({ categories: grouped, uncategorized });
});

// GET /products/:id - public
router.get("/products/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "شناسه نامعتبر" }); return; }
  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, id)).limit(1);
  if (!product || !product.isPublished) { res.status(404).json({ error: "محصول یافت نشد" }); return; }
  res.json(sanitizeProduct(product));
});

// GET /user/products - authenticated
router.get("/user/products", requireUser, async (req, res) => {
  const userProducts = await db
    .select({ product: productsTable })
    .from(userProductsTable)
    .innerJoin(productsTable, eq(userProductsTable.productId, productsTable.id))
    .where(eq(userProductsTable.userId, req.user!.userId));
  res.json(userProducts.map((r) => sanitizeProduct(r.product)));
});

export default router;
