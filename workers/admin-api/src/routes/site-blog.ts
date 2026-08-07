import { Hono } from 'hono';
import { AppError } from '@starter/domain';
import { defaultProjectConfig, extFromContentType } from '@starter/config';
import {
  createRepositories,
  SiteBlogRepository,
  type SiteBlogArticleRecord,
  type SiteBlogStoredBody,
} from '@starter/db';
import {
  createSiteBlogArticleSchema,
  parseInput,
  siteBlogProjectIdSchema,
  type SiteBlogBodyInput,
  updateSiteBlogArticleSchema,
} from '@starter/validation';
import type { Bindings, Variables } from '../env';
import { mediaUrl } from '../lib/media';
import { requireStarterClientRuntime } from '../lib/starter-project-authorization';
import { requireWrite } from '../middleware/auth';

/**
 * Subrouter para montar en:
 *   /admin/projects/:projectId/modules/blog
 *
 * Se mantiene relativo (`/` y `/:slug`) para que el índice del Worker decida
 * el montaje sin acoplar esta vertical al router principal.
 */
export const siteBlogAdmin = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();

siteBlogAdmin.use('*', async (c, next) => {
  await requireStarterClientRuntime(c.env.DB, c.req.param('projectId')!);
  await next();
});

siteBlogAdmin.get('/', async (c) => {
  const projectId = readProjectId(c.req.param());
  const repo = new SiteBlogRepository(c.env.DB);
  await requireProject(repo, projectId);

  const items = await repo.listAllForProject(projectId);
  return c.json({ items: items.map((article) => toArticleView(c.env, article)) });
});

siteBlogAdmin.post('/', requireWrite, async (c) => {
  const projectId = readProjectId(c.req.param());
  const input = parseInput(createSiteBlogArticleSchema, await readJson(c));
  const repo = new SiteBlogRepository(c.env.DB);
  await requireProject(repo, projectId);

  if (await repo.getBySlug(projectId, input.slug)) {
    throw new AppError('conflict', `Ya existe un artículo con slug "${input.slug}".`);
  }

  const normalized = await normalizeBody(input.body);
  const created = await repo.create({
    projectId,
    slug: input.slug,
    title: input.title,
    summary: input.summary,
    coverImageId: input.coverImageId,
    category: input.category,
    body: normalized.body,
    bodyHtml: normalized.bodyHtml,
    status: input.status,
    changedBy: c.get('admin').email,
  });

  await audit(c, projectId, created.id, 'site_blog.article.create', {
    slug: created.slug,
    status: created.status,
  });

  return c.json(toArticleView(c.env, created), 201);
});

siteBlogAdmin.get('/:slug', async (c) => {
  const projectId = readProjectId(c.req.param());
  const slug = c.req.param('slug')!;
  const repo = new SiteBlogRepository(c.env.DB);
  await requireProject(repo, projectId);

  const article = await repo.getBySlug(projectId, slug);
  if (!article) throw AppError.notFound('Artículo');
  return c.json(toArticleView(c.env, article));
});

siteBlogAdmin.patch('/:slug', requireWrite, async (c) => {
  const projectId = readProjectId(c.req.param());
  const currentSlug = c.req.param('slug')!;
  const input = parseInput(updateSiteBlogArticleSchema, await readJson(c));
  const repo = new SiteBlogRepository(c.env.DB);
  await requireProject(repo, projectId);

  const existing = await repo.getBySlug(projectId, currentSlug);
  if (!existing) throw AppError.notFound('Artículo');
  if (input.slug && input.slug !== currentSlug && (await repo.getBySlug(projectId, input.slug))) {
    throw new AppError('conflict', `Ya existe un artículo con slug "${input.slug}".`);
  }

  const normalized = input.body ? await normalizeBody(input.body) : null;
  const updated = await repo.update(projectId, currentSlug, {
    slug: input.slug,
    title: input.title,
    summary: input.summary,
    coverImageId: input.coverImageId,
    category: input.category,
    body: normalized?.body,
    bodyHtml: normalized?.bodyHtml,
    status: input.status,
    statusReason: input.statusReason,
    changedBy: c.get('admin').email,
  });
  if (!updated) throw AppError.notFound('Artículo');

  await audit(
    c,
    projectId,
    updated.id,
    existing.status === updated.status ? 'site_blog.article.update' : 'site_blog.article.status',
    {
      slug: updated.slug,
      fromStatus: existing.status,
      toStatus: updated.status,
    },
  );

  return c.json(toArticleView(c.env, updated));
});

/**
 * POST /:slug con multipart/form-data adjunta/reemplaza la portada.
 * La ruta comparte el path de detalle para respetar el contrato del subrouter.
 */
siteBlogAdmin.post('/:slug', requireWrite, async (c) => {
  const projectId = readProjectId(c.req.param());
  const slug = c.req.param('slug')!;
  const repo = new SiteBlogRepository(c.env.DB);
  await requireProject(repo, projectId);

  const article = await repo.getBySlug(projectId, slug);
  if (!article) throw AppError.notFound('Artículo');

  const body = await c.req.parseBody();
  const file = body['file'];
  if (!file || typeof file === 'string' || Array.isArray(file)) {
    throw new AppError('validation_error', 'Falta el archivo "file".');
  }

  const limits = defaultProjectConfig.uploads;
  if (!limits.allowedImageTypes.includes(file.type)) {
    throw new AppError('validation_error', `Tipo de imagen no permitido: ${file.type}.`);
  }
  if (file.size > limits.maxImageBytes) {
    throw new AppError('validation_error', 'La portada excede el tamaño máximo permitido.');
  }

  const fileId = crypto.randomUUID();
  const extension = extFromContentType(file.type);
  const key = `site-blog/${projectId}/${article.id}/cover/${fileId}.${extension}`;
  const bytes = await file.arrayBuffer();
  await c.env.MEDIA.put(key, bytes, { httpMetadata: { contentType: file.type } });

  let updated: SiteBlogArticleRecord | null;
  try {
    updated = await repo.createAndAttachCover(projectId, slug, {
      key,
      bucket: c.env.MEDIA_BUCKET_NAME,
      contentType: file.type,
      sizeBytes: bytes.byteLength,
      originalName: file.name || null,
      createdBy: c.get('admin').email,
    });
    if (!updated) throw AppError.notFound('Artículo');
  } catch (error) {
    // Compensación: no dejar un objeto huérfano si el batch D1 no se confirma.
    await c.env.MEDIA.delete(key);
    throw error;
  }

  await audit(c, projectId, updated.id, 'site_blog.article.cover.attach', {
    fileAssetId: updated.coverImageId,
    key,
  });

  return c.json(toArticleView(c.env, updated));
});

async function requireProject(repo: SiteBlogRepository, projectId: string): Promise<void> {
  if (!(await repo.projectExists(projectId))) throw AppError.notFound('Proyecto');
}

async function audit(
  c: {
    env: Bindings;
    get: (key: 'admin') => Variables['admin'];
    req: { header: (name: string) => string | undefined };
  },
  projectId: string,
  articleId: string,
  action: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await createRepositories(c.env.DB).audit.record({
    actorType: 'admin',
    actorId: c.get('admin').email,
    action,
    entityType: 'lmwares_project',
    entityId: projectId,
    metadata: { articleId, ...metadata },
    ip: c.req.header('CF-Connecting-IP') ?? null,
    userAgent: c.req.header('User-Agent') ?? null,
  });
}

function readProjectId(params: Record<string, string>): string {
  return parseInput(siteBlogProjectIdSchema, params['projectId']);
}

function toArticleView(env: Bindings, article: SiteBlogArticleRecord) {
  return {
    ...article,
    coverImage: article.coverImage
      ? {
          ...article.coverImage,
          url: mediaUrl(env, article.coverImage.key),
        }
      : null,
  };
}

async function readJson(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new AppError('validation_error', 'Cuerpo JSON inválido.');
  }
}

async function normalizeBody(
  body: SiteBlogBodyInput,
): Promise<{ body: SiteBlogStoredBody; bodyHtml: string }> {
  if (body.format === 'blocks') {
    return {
      body,
      bodyHtml: renderBlocks(body.blocks),
    };
  }

  const safeHtml = await sanitizeSiteBlogHtml(body.html);
  return {
    body: { format: 'html', html: safeHtml },
    bodyHtml: safeHtml,
  };
}

/**
 * Política conservadora de HTML para artículos:
 * - sólo permite etiquetas editoriales de texto;
 * - elimina por completo scripts, estilos, formularios, embeds, SVG/MathML y medios;
 * - descarta todos los atributos salvo href/title seguros en enlaces;
 * - no admite class, id, style, data-*, eventos, imágenes ni HTML interactivo.
 *
 * No pretende limpiar HTML arbitrario para todos los usos. Su contrato está
 * deliberadamente limitado a contenido editorial acotado a 100 KB por Zod.
 * Si se amplía la lista, cada etiqueta/atributo/protocolo debe revisarse como
 * una nueva superficie XSS y de tracking.
 */
export async function sanitizeSiteBlogHtml(input: string): Promise<string> {
  const allowedTags = new Set([
    'p',
    'br',
    'h2',
    'h3',
    'h4',
    'strong',
    'em',
    'b',
    'i',
    'blockquote',
    'ul',
    'ol',
    'li',
    'a',
    'code',
    'pre',
    'hr',
  ]);
  const removeWithContent = new Set([
    'script',
    'style',
    'iframe',
    'object',
    'embed',
    'form',
    'input',
    'button',
    'textarea',
    'select',
    'option',
    'svg',
    'math',
    'canvas',
    'video',
    'audio',
    'picture',
    'img',
    'source',
    'track',
    'template',
    'noscript',
    'head',
    'meta',
    'link',
    'base',
  ]);

  const htmlWithoutDoctype = input.replace(/<!doctype[^>]*>/gi, '');
  const response = new Response(htmlWithoutDoctype, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });

  const transformed = new HTMLRewriter()
    .on('*', {
      element(element) {
        const tag = element.tagName.toLowerCase();
        if (removeWithContent.has(tag)) {
          element.remove();
          return;
        }
        if (!allowedTags.has(tag)) {
          element.removeAndKeepContent();
          return;
        }

        for (const attribute of element.attributes) {
          const name = attribute[0];
          if (!name) continue;
          const normalizedName = name.toLowerCase();
          const allowed = tag === 'a' && (normalizedName === 'href' || normalizedName === 'title');
          if (!allowed) element.removeAttribute(name);
        }

        if (tag === 'a') {
          const href = element.getAttribute('href');
          if (!href || !isSafeEditorialHref(href)) {
            element.removeAttribute('href');
          } else {
            element.setAttribute('rel', 'nofollow noopener noreferrer');
          }
        }
      },
      comments(comment) {
        comment.remove();
      },
    })
    .onDocument({
      comments(comment) {
        comment.remove();
      },
    })
    .transform(response);

  return transformed.text();
}

function isSafeEditorialHref(value: string): boolean {
  const href = value.trim();
  if (href.startsWith('#')) return true;
  if (
    (href.startsWith('/') && !href.startsWith('//')) ||
    href.startsWith('./') ||
    href.startsWith('../')
  ) {
    return true;
  }

  try {
    const parsed = new URL(href);
    return (
      parsed.protocol === 'https:' || parsed.protocol === 'http:' || parsed.protocol === 'mailto:'
    );
  } catch {
    return false;
  }
}

function renderBlocks(blocks: Extract<SiteBlogBodyInput, { format: 'blocks' }>['blocks']): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case 'heading':
          return `<h${block.level}>${escapeHtml(block.text)}</h${block.level}>`;
        case 'paragraph':
          return `<p>${escapeHtml(block.text).replace(/\n/g, '<br>')}</p>`;
        case 'quote': {
          const attribution = block.attribution
            ? `<footer>${escapeHtml(block.attribution)}</footer>`
            : '';
          return `<blockquote><p>${escapeHtml(block.text).replace(/\n/g, '<br>')}</p>${attribution}</blockquote>`;
        }
        case 'bulleted-list':
        case 'numbered-list': {
          const tag = block.type === 'bulleted-list' ? 'ul' : 'ol';
          const items = block.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
          return `<${tag}>${items}</${tag}>`;
        }
        case 'divider':
          return '<hr>';
      }
    })
    .join('');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
