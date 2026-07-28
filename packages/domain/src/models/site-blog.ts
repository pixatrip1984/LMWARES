import type { Id, IsoDateTime, Timestamps } from '../common';

export const SITE_BLOG_ARTICLE_STATUSES = ['draft', 'published', 'archived'] as const;
export type SiteBlogArticleStatus = (typeof SITE_BLOG_ARTICLE_STATUSES)[number];

export const SITE_BLOG_BODY_FORMATS = ['blocks', 'html'] as const;
export type SiteBlogBodyFormat = (typeof SITE_BLOG_BODY_FORMATS)[number];

export type SiteBlogBlock =
  | {
      type: 'heading';
      level: 2 | 3;
      text: string;
    }
  | {
      type: 'paragraph';
      text: string;
    }
  | {
      type: 'quote';
      text: string;
      attribution: string | null;
    }
  | {
      type: 'bulleted-list' | 'numbered-list';
      items: string[];
    }
  | {
      type: 'divider';
    };

export interface SiteBlogBlocksBody {
  format: 'blocks';
  blocks: SiteBlogBlock[];
}

/**
 * HTML editorial ingresado por el admin. En respuestas del servidor, `html`
 * ya contiene el resultado de la política conservadora de sanitización.
 */
export interface SiteBlogHtmlBody {
  format: 'html';
  html: string;
}

export type SiteBlogBody = SiteBlogBlocksBody | SiteBlogHtmlBody;

/** Referencia D1 al FileAsset que vive físicamente en R2. */
export interface SiteBlogCoverAsset {
  id: Id;
  key: string;
  contentType: string;
}

/** Artículo canónico almacenado por proyecto/tenant. */
export interface SiteBlogArticle extends Timestamps {
  id: Id;
  projectId: string;
  slug: string;
  title: string;
  summary: string | null;
  coverImageId: Id | null;
  coverImage: SiteBlogCoverAsset | null;
  category: string;
  body: SiteBlogBody;
  /** HTML final seguro que consumen el preview y el módulo público. */
  bodyHtml: string;
  status: SiteBlogArticleStatus;
  publishedAt: IsoDateTime | null;
}

/** Proyección HTTP con la URL pública de la portada ya resuelta. */
export interface SiteBlogArticleView extends Omit<SiteBlogArticle, 'coverImage'> {
  coverImage: (SiteBlogCoverAsset & { url: string }) | null;
}

export interface SiteBlogArticlePage {
  items: SiteBlogArticleView[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}
