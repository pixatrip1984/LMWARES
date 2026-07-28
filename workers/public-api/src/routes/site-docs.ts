import { Hono } from 'hono';
import {
  AppError,
  type SiteDocCategory,
  type SiteDocPublicItem,
  type SiteDocsPublicLibrary,
} from '@starter/domain';
import { SiteDocsRepository } from '@starter/db';
import {
  isSiteDocImageExtension,
  parseInput,
  siteDocIdSchema,
  siteDocsProjectIdSchema,
} from '@starter/validation';
import type { Bindings, Variables } from '../env';

/** Subrouter esperado: /sites/:projectId/docs */
export const siteDocsPublic = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();

siteDocsPublic.get('/', async (c) => {
  const projectId = readProjectId(c.req.param('projectId'));
  const records = await new SiteDocsRepository(c.env.DB).listPublished(projectId);
  const origin = new URL(c.req.url).origin;
  const categories = new Map<string, SiteDocsPublicLibrary['categories'][number]>();
  const documents: SiteDocPublicItem[] = [];

  for (const record of records) {
    const { document, version } = record;
    if (!version.extension || !document.publishedAt) continue;
    if (document.category) categories.set(document.category.id, publicCategory(document.category));
    const base = `${origin}/sites/${encodeURIComponent(projectId)}/docs/${document.id}`;
    documents.push({
      id: document.id,
      title: document.title,
      description: document.description,
      categoryId: document.category?.id ?? null,
      categoryName: document.category?.name ?? null,
      categorySlug: document.category?.slug ?? null,
      metadata: document.metadata,
      sortOrder: document.sortOrder,
      version: version.version,
      originalName: version.originalName,
      extension: version.extension,
      contentType: record.contentType,
      sizeBytes: record.sizeBytes,
      publishedAt: document.publishedAt,
      downloadUrl: `${base}/download`,
      previewUrl: isSiteDocImageExtension(version.extension) ? `${base}/preview` : null,
    });
  }

  const library: SiteDocsPublicLibrary = {
    projectId,
    categories: [...categories.values()].sort(
      (left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name),
    ),
    documents,
  };
  return c.json(library, 200, {
    'Cache-Control': 'public, max-age=60, stale-while-revalidate=120',
  });
});

siteDocsPublic.get('/:docId/download', async (c) => {
  const projectId = readProjectId(c.req.param('projectId'));
  const documentId = parseInput(siteDocIdSchema, c.req.param('docId'));
  const stored = await new SiteDocsRepository(c.env.DB).getPublishedFile(projectId, documentId);
  if (!stored) throw AppError.notFound('Documento');

  const object = await c.env.MEDIA.get(stored.key);
  if (!object) throw AppError.notFound('Archivo');
  return new Response(object.body, {
    headers: {
      'Content-Type': stored.contentType,
      'Content-Length': String(object.size),
      'Content-Disposition': contentDisposition('attachment', stored.version.originalName),
      'X-Content-Type-Options': 'nosniff',
      'X-Download-Options': 'noopen',
      'Cache-Control': 'private, no-store',
      ETag: object.httpEtag,
    },
  });
});

siteDocsPublic.get('/:docId/preview', async (c) => {
  const projectId = readProjectId(c.req.param('projectId'));
  const documentId = parseInput(siteDocIdSchema, c.req.param('docId'));
  const stored = await new SiteDocsRepository(c.env.DB).getPublishedFile(projectId, documentId);
  if (!stored || !isSiteDocImageExtension(stored.version.extension)) {
    throw AppError.notFound('Previsualización');
  }

  const object = await c.env.MEDIA.get(stored.key);
  if (!object) throw AppError.notFound('Archivo');
  return new Response(object.body, {
    headers: {
      'Content-Type': stored.contentType,
      'Content-Length': String(object.size),
      'Content-Disposition': contentDisposition('inline', stored.version.originalName),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=300',
      ETag: object.httpEtag,
    },
  });
});

function readProjectId(value: string | undefined): string {
  return parseInput(siteDocsProjectIdSchema, value);
}

function publicCategory(category: SiteDocCategory): SiteDocsPublicLibrary['categories'][number] {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    description: category.description,
    sortOrder: category.sortOrder,
  };
}

function contentDisposition(kind: 'inline' | 'attachment', fileName: string): string {
  const asciiFallback = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${kind}; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
