import type { MetadataRoute } from "next";
import { listShops, listProducts } from "@/lib/products";
import { productPath } from "@/lib/product-url";

export const dynamic = "force-dynamic";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://doprent.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [{ items: products }, shops] = await Promise.all([listProducts({ limit: 1000 }), listShops()]);
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${SITE}/shops`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
  ];

  const dressPages: MetadataRoute.Sitemap = products.map((d) => ({
    url: d.tag_code ? `${SITE}${productPath({ slug: d.slug, tag_code: d.tag_code })}` : `${SITE}/product/${d.slug}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  const boutiquePages: MetadataRoute.Sitemap = shops.map((b) => ({
    url: `${SITE}/shop/${b.slug}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [...staticPages, ...dressPages, ...boutiquePages];
}
