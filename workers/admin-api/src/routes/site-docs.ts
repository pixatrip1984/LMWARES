import { Hono, type Context } from 'hono';
import {
  AppError,
  type SiteDocRejectionCode,
  type SiteDocVersion,
  type SiteDocWithCurrentVersion,
} from '@starter/domain';
import {
  createSiteDocCategorySchema,
  createSiteDocUploadSchema,
  inspectSiteDocUpload,
  isSiteDocImageExtension,
  parseInput,
  publishSiteDocSchema,
  sanitizeUntrustedSiteDocFilename,
  siteDocCandidateExtension,
  siteDocIdSchema,
  siteDocsProjectIdSchema,
  updateSiteDocCategorySchema,
  updateSiteDocSchema,
  type SiteDocUploadLike,
} from '@starter/validation';
import {
  AuditRepository,
  FileAssetsRepository,
  SiteDocsRepository,
  type SiteDocStoredFile,
} from '@starter/db';
import type { Bindings, Variables } from '../env';
import { requireWrite } from '../middleware/auth';

type DocsContext = Context<{
  Bindings: Bindings;
  Variables: Variables;
}>;

/**
 * Subrouter esperado:
 * /admin/projects/:projectId/modules/docs
 */
export const siteDocsAdmin = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();

siteDocsAdmin.get('/', async (c) => {
  const projectId = readProjectId(c.req.param('projectId'));
  return c.json(await new SiteDocsRepository(c.env.DB).listAdminLibrary(projectId));
});

siteDocsAdmin.post('/categories', requireWrite, async (c) => {
  const projectId = readProjectId(c.req.param('projectId'));
  const input = parseInput(createSiteDocCategorySchema, await readJson(c));
  const category = await new SiteDocsRepository(c.env.DB).createCategory({
    projectId,
    name: input.name,
    slug: input.slug,
    description: input.description ?? null,
    sortOrder: input.sortOrder,
    createdBy: c.get('admin').email,
  });
  await audit(c, 'site_docs.category.create', projectId, {
    categoryId: category.id,
    slug: category.slug,
  });
  return c.json(category, 201);
});

siteDocsAdmin.patch('/categories/:categoryId', requireWrite, async (c) => {
  const projectId = readProjectId(c.req.param('projectId'));
  const categoryId = parseInput(siteDocIdSchema, c.req.param('categoryId'));
  const patch = parseInput(updateSiteDocCategorySchema, await readJson(c));
  const category = await new SiteDocsRepository(c.env.DB).updateCategory(
    projectId,
    categoryId,
    patch,
  );
  if (!category) throw AppError.notFound('Categoría');
  await audit(c, 'site_docs.category.update', projectId, { categoryId });
  return c.json(category);
});

siteDocsAdmin.delete('/categories/:categoryId', requireWrite, async (c) => {
  const projectId = readProjectId(c.req.param('projectId'));
  const categoryId = parseInput(siteDocIdSchema, c.req.param('categoryId'));
  const deleted = await new SiteDocsRepository(c.env.DB).deleteCategory(projectId, categoryId);
  if (!deleted) throw AppError.notFound('Categoría');
  await audit(c, 'site_docs.category.delete', projectId, { categoryId });
  return c.body(null, 204);
});

siteDocsAdmin.post('/documents', requireWrite, async (c) => {
  const projectId = readProjectId(c.req.param('projectId'));
  const { file, fields } = await readUpload(c);
  const input = parseInput(createSiteDocUploadSchema, fields);
  const documentId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const docs = new SiteDocsRepository(c.env.DB);

  const version = await docs.beginDocumentUpload({
    documentId,
    versionId,
    projectId,
    title: input.title,
    description: input.description ?? null,
    categoryId: input.categoryId,
    accessLevel: input.accessLevel,
    downloadEnabled: input.downloadEnabled,
    metadata: input.metadata,
    sortOrder: input.sortOrder,
    originalName: sanitizeUntrustedSiteDocFilename(file.name),
    extension: siteDocCandidateExtension(file.name),
    declaredMime: normalizeMime(file.type),
    sizeBytes: safeSize(file.size),
    createdBy: c.get('admin').email,
  });

  const document = await processUpload(c, projectId, documentId, version, file);
  return c.json(document, 201);
});

siteDocsAdmin.post('/documents/:docId/versions', requireWrite, async (c) => {
  const projectId = readProjectId(c.req.param('projectId'));
  const documentId = parseInput(siteDocIdSchema, c.req.param('docId'));
  const { file } = await readUpload(c);
  const versionId = crypto.randomUUID();
  const docs = new SiteDocsRepository(c.env.DB);
  const version = await docs.beginVersionUpload({
    versionId,
    projectId,
    documentId,
    originalName: sanitizeUntrustedSiteDocFilename(file.name),
    extension: siteDocCandidateExtension(file.name),
    declaredMime: normalizeMime(file.type),
    sizeBytes: safeSize(file.size),
    createdBy: c.get('admin').email,
  });

  const document = await processUpload(c, projectId, documentId, version, file);
  return c.json(document, 201);
});

siteDocsAdmin.get('/documents/:docId/versions', async (c) => {
  const projectId = readProjectId(c.req.param('projectId'));
  const documentId = parseInput(siteDocIdSchema, c.req.param('docId'));
  return c.json(await new SiteDocsRepository(c.env.DB).listVersions(projectId, documentId));
});

siteDocsAdmin.patch('/documents/:docId', requireWrite, async (c) => {
  const projectId = readProjectId(c.req.param('projectId'));
  const documentId = parseInput(siteDocIdSchema, c.req.param('docId'));
  const patch = parseInput(updateSiteDocSchema, await readJson(c));
  const document = await new SiteDocsRepository(c.env.DB).updateDocument(
    projectId,
    documentId,
    patch,
  );
  if (!document) throw AppError.notFound('Documento');
  await audit(c, 'site_docs.document.update', projectId, {
    documentId,
    fields: Object.keys(patch),
  });
  return c.json(document);
});

siteDocsAdmin.post('/documents/:docId/publish', requireWrite, async (c) => {
  const projectId = readProjectId(c.req.param('projectId'));
  const documentId = parseInput(siteDocIdSchema, c.req.param('docId'));
  const { reason } = parseInput(publishSiteDocSchema, await readOptionalJson(c));
  const document = await new SiteDocsRepository(c.env.DB).publishDocument(projectId, documentId);
  await audit(c, 'site_docs.document.publish', projectId, {
    documentId,
    versionId: document.currentVersionId,
    reason: reason ?? null,
  });
  return c.json(document);
});

siteDocsAdmin.post('/documents/:docId/unpublish', requireWrite, async (c) => {
  const projectId = readProjectId(c.req.param('projectId'));
  const documentId = parseInput(siteDocIdSchema, c.req.param('docId'));
  const { reason } = parseInput(publishSiteDocSchema, await readOptionalJson(c));
  const document = await new SiteDocsRepository(c.env.DB).unpublishDocument(projectId, documentId);
  await audit(c, 'site_docs.document.unpublish', projectId, {
    documentId,
    versionId: document.currentVersionId,
    reason: reason ?? null,
  });
  return c.json(document);
});

siteDocsAdmin.get('/documents/:docId/versions/:versionId/preview', async (c) => {
  const projectId = readProjectId(c.req.param('projectId'));
  const documentId = parseInput(siteDocIdSchema, c.req.param('docId'));
  const versionId = parseInput(siteDocIdSchema, c.req.param('versionId'));
  const stored = await new SiteDocsRepository(c.env.DB).getAdminPreviewFile(
    projectId,
    documentId,
    versionId,
  );
  if (!stored) throw AppError.notFound('Versión');
  if (!isSiteDocImageExtension(stored.version.extension)) {
    throw new AppError(
      'validation_error',
      'Solo las imágenes validadas pueden previsualizarse dentro del navegador.',
    );
  }
  return streamImage(c, stored);
});

async function processUpload(
  c: DocsContext,
  projectId: string,
  documentId: string,
  version: SiteDocVersion,
  file: File & SiteDocUploadLike,
): Promise<SiteDocWithCurrentVersion> {
  const docs = new SiteDocsRepository(c.env.DB);
  await docs.setVersionStatus(projectId, documentId, version.id, 'quarantine');
  await docs.setVersionStatus(projectId, documentId, version.id, 'scanning');

  const inspection = await inspectSiteDocUpload(file);
  if (!inspection.accepted) {
    await docs.rejectVersion(projectId, documentId, version.id, inspection.code, inspection.reason);
    await audit(c, 'site_docs.version.reject', projectId, {
      documentId,
      versionId: version.id,
      version: version.version,
      code: inspection.code,
    });
    throw new AppError('validation_error', inspection.reason, {
      file: [inspection.code],
    });
  }

  const fileId = crypto.randomUUID();
  const key = siteDocObjectKey(projectId, documentId, version.version, fileId);
  const assets = new FileAssetsRepository(c.env.DB);
  let assetId: string | null = null;
  let objectWritten = false;

  try {
    await c.env.MEDIA.put(key, file, {
      httpMetadata: { contentType: inspection.detectedMime },
      customMetadata: {
        projectId,
        documentId,
        versionId: version.id,
        validator: inspection.report.validator,
      },
    });
    objectWritten = true;

    const asset = await assets.create({
      key,
      bucket: c.env.MEDIA_BUCKET_NAME,
      contentType: inspection.detectedMime,
      sizeBytes: file.size,
      originalName: inspection.fileName,
      checksum: null,
      createdBy: c.get('admin').email,
    });
    assetId = asset.id;

    const document = await docs.completeUpload({
      projectId,
      documentId,
      versionId: version.id,
      fileAssetId: asset.id,
      extension: inspection.extension,
      declaredMime: inspection.declaredMime,
      detectedMime: inspection.detectedMime,
      validation: inspection.report,
    });
    await audit(c, 'site_docs.version.clean', projectId, {
      documentId,
      versionId: version.id,
      version: version.version,
      fileAssetId: asset.id,
      validation: inspection.report,
    });
    return document;
  } catch (error) {
    await cleanupFailedUpload(c, assets, key, objectWritten, assetId);
    await safelyRejectStorageFailure(c, docs, projectId, documentId, version.id);
    throw error;
  }
}

async function cleanupFailedUpload(
  c: DocsContext,
  assets: FileAssetsRepository,
  key: string,
  objectWritten: boolean,
  assetId: string | null,
): Promise<void> {
  if (objectWritten) {
    try {
      await c.env.MEDIA.delete(key);
    } catch (error) {
      console.error(
        JSON.stringify({
          message: 'site_docs.r2_cleanup_failed',
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }
  if (assetId) {
    try {
      await assets.delete(assetId);
    } catch (error) {
      console.error(
        JSON.stringify({
          message: 'site_docs.file_asset_cleanup_failed',
          assetId,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }
}

async function safelyRejectStorageFailure(
  c: DocsContext,
  docs: SiteDocsRepository,
  projectId: string,
  documentId: string,
  versionId: string,
): Promise<void> {
  const code: SiteDocRejectionCode = 'storage_failed';
  try {
    await docs.rejectVersion(
      projectId,
      documentId,
      versionId,
      code,
      'La carga no pudo persistirse de forma consistente en R2 y D1.',
    );
    await audit(c, 'site_docs.version.reject', projectId, {
      documentId,
      versionId,
      code,
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        message: 'site_docs.reject_storage_failure_failed',
        projectId,
        documentId,
        versionId,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}

async function streamImage(c: DocsContext, stored: SiteDocStoredFile): Promise<Response> {
  const object = await c.env.MEDIA.get(stored.key);
  if (!object) throw AppError.notFound('Archivo');
  const headers = new Headers({
    'Content-Type': stored.contentType,
    'Content-Length': String(object.size),
    'Content-Disposition': contentDisposition('inline', stored.version.originalName),
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
    ETag: object.httpEtag,
  });
  return new Response(object.body, { headers });
}

async function audit(
  c: DocsContext,
  action: string,
  projectId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await new AuditRepository(c.env.DB).record({
    actorType: 'admin',
    actorId: c.get('admin').email,
    action,
    entityType: 'lmwares_project',
    entityId: projectId,
    metadata,
    ip: c.req.header('CF-Connecting-IP') ?? null,
    userAgent: c.req.header('User-Agent') ?? null,
  });
}

function siteDocObjectKey(
  projectId: string,
  documentId: string,
  version: number,
  fileId: string,
): string {
  return `sites/${projectId}/docs/${documentId}/v${version}/${fileId}`;
}

function readProjectId(value: string | undefined): string {
  return parseInput(siteDocsProjectIdSchema, value);
}

async function readUpload(c: DocsContext): Promise<{
  file: File & SiteDocUploadLike;
  fields: Record<string, string | undefined>;
}> {
  let body: Awaited<ReturnType<typeof c.req.parseBody>>;
  try {
    body = await c.req.parseBody();
  } catch {
    throw new AppError('validation_error', 'El multipart de carga no es válido.');
  }
  const candidate = body['file'];
  if (
    !candidate ||
    typeof candidate === 'string' ||
    Array.isArray(candidate) ||
    typeof candidate.arrayBuffer !== 'function'
  ) {
    throw new AppError('validation_error', 'Falta el archivo "file".');
  }
  return {
    file: candidate,
    fields: {
      title: stringField(body['title']),
      description: stringField(body['description']),
      categoryId: stringField(body['categoryId']),
      accessLevel: stringField(body['accessLevel']),
      downloadEnabled: stringField(body['downloadEnabled']),
      sortOrder: stringField(body['sortOrder']),
      metadata: stringField(body['metadata']),
    },
  };
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

async function readJson(c: DocsContext): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new AppError('validation_error', 'Cuerpo JSON inválido.');
  }
}

async function readOptionalJson(c: DocsContext): Promise<unknown> {
  const contentLength = c.req.header('Content-Length');
  if (contentLength === '0') return {};
  try {
    return await c.req.json();
  } catch {
    return {};
  }
}

function normalizeMime(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return normalized ? normalized.slice(0, 160) : null;
}

function safeSize(value: number): number {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function contentDisposition(kind: 'inline' | 'attachment', fileName: string): string {
  const asciiFallback = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${kind}; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
