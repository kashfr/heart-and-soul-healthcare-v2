import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import readingTime from 'reading-time';

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  date: string;
  author: string;
  category: string;
  tags: string[];
  featuredImage?: string;
  excerpt: string;
  published: boolean;
  readingTime: string;
  content: string;
}

export const CATEGORIES = [
  'GAPP',
  'NOW/COMP',
  'ICWP',
  'EDWP',
  'Caregiver Resources',
  'Medicaid Guide',
  'Company News',
] as const;

export type BlogCategory = (typeof CATEGORIES)[number];

export const CATEGORY_COLORS: Record<string, string> = {
  'GAPP': 'teal',
  'NOW/COMP': 'gold',
  'ICWP': 'sage',
  'EDWP': 'primary',
  'Caregiver Resources': 'sage',
  'Medicaid Guide': 'gold',
  'Company News': 'teal',
};

const BLOG_DIR = path.join(process.cwd(), 'content', 'blog');

function parseMdxFile(fileName: string): BlogPost | null {
  const slug = fileName.replace(/\.mdx$/, '');
  const filePath = path.join(BLOG_DIR, fileName);
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const { data, content } = matter(fileContent);

  if (data.published === false) return null;

  const stats = readingTime(content);

  return {
    slug,
    title: data.title || '',
    description: data.description || '',
    date: data.date || '',
    author: data.author || 'Heart and Soul Healthcare',
    category: data.category || 'Company News',
    tags: data.tags || [],
    featuredImage: data.featuredImage,
    excerpt: data.excerpt || '',
    published: data.published !== false,
    readingTime: stats.text,
    content,
  };
}

export function getAllPosts(): BlogPost[] {
  if (!fs.existsSync(BLOG_DIR)) return [];

  const files = fs.readdirSync(BLOG_DIR).filter((f) => f.endsWith('.mdx'));
  const posts = files
    .map(parseMdxFile)
    .filter((post): post is BlogPost => post !== null);

  return posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getPostBySlug(slug: string): BlogPost | null {
  const filePath = path.join(BLOG_DIR, `${slug}.mdx`);
  if (!fs.existsSync(filePath)) return null;
  return parseMdxFile(`${slug}.mdx`);
}

export function getPostsByCategory(category: string): BlogPost[] {
  return getAllPosts().filter((post) => post.category === category);
}

export function getRelatedPosts(currentSlug: string, category: string, limit = 3): BlogPost[] {
  return getAllPosts()
    .filter((post) => post.slug !== currentSlug && post.category === category)
    .slice(0, limit);
}

export function getAllCategories(): string[] {
  const posts = getAllPosts();
  return [...new Set(posts.map((p) => p.category))];
}

export function getAllTags(): string[] {
  const posts = getAllPosts();
  return [...new Set(posts.flatMap((p) => p.tags))];
}
