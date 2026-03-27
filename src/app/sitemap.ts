import type { MetadataRoute } from "next";

const siteUrl = "https://www.heartandsoulhc.org";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: siteUrl, lastModified: now, changeFrequency: "monthly", priority: 1.0 },
    { url: `${siteUrl}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${siteUrl}/contact`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${siteUrl}/referral`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${siteUrl}/programs/gapp`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${siteUrl}/programs/now-comp`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${siteUrl}/programs/icwp`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${siteUrl}/programs/edwp`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${siteUrl}/programs/other`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
  ];
}
