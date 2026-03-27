import type { MetadataRoute } from "next";
import { getAllPosts } from "@/lib/blog";

const siteUrl = "https://www.heartandsoulhc.org";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: siteUrl, lastModified: now, changeFrequency: "monthly", priority: 1.0 },
    { url: `${siteUrl}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${siteUrl}/blog`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${siteUrl}/contact`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${siteUrl}/referral`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${siteUrl}/programs/gapp`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${siteUrl}/programs/now-comp`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${siteUrl}/programs/icwp`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${siteUrl}/programs/edwp`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${siteUrl}/programs/other`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
  ];

  const blogPosts: MetadataRoute.Sitemap = getAllPosts().map((post) => ({
    url: `${siteUrl}/blog/${post.slug}`,
    lastModified: new Date(post.date),
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [...staticPages, ...blogPosts];
}
