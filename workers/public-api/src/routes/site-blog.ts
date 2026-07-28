import { Hono } from 'hono';
import { AppError } from '@starter/domain';
import {
  SiteBlogRepository,
  type SiteBlogArticleRecord,
} from '@starter/db';
import {
  listSiteBlogArticlesQuerySchema,
  parseInput,
  siteBlogProjectIdSchema,
} from '@starter/validation';
import type { Bindings, Variables } from '../env';
import { mediaUrl } from '../lib/media';

/**
 * Subrouter para montar en:
 *   /sites/:projectId/blog
 */
export const siteBlogPublic = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();

siteBlogPublic.get('/', async (c) => {
  const projectId = readProjectId(c.req.param());
  const query = parseInput(listSiteBlogArticlesQuerySchema, c.req.query());
  const repo = new SiteBlogRepository(c.env.DB);
  await requireProject(repo, projectId);

  const page = await repo.listPublishedForProject(projectId, query);
  return c.json({
    ...page,
    items: page.items.map((article) => toArticleView(c, article)),
  });
});

siteBlogPublic.get('/:slug', async (c) => {
  const projectId = readProjectId(c.req.param());
  const slug = c.req.param('slug')!;
  const repo = new SiteBlogRepository(c.env.DB);
  await requireProject(repo, projectId);

  const article = await repo.getPublishedBySlug(projectId, slug);
  if (!article) throw AppError.notFound('Artículo');
  return c.json(toArticleView(c, article));
});

async function requireProject(repo: SiteBlogRepository, projectId: string): Promise<void> {
  if (!(await repo.projectExists(projectId))) throw AppError.notFound('Proyecto');
}

function readProjectId(params: Record<string, string>): string {
  return parseInput(siteBlogProjectIdSchema, params['projectId']);
}

function toArticleView(c: Parameters<typeof mediaUrl>[0], article: SiteBlogArticleRecord) {
  return {
    ...article,
    coverImage: article.coverImage
      ? {
          ...article.coverImage,
          url: mediaUrl(c, article.coverImage.key),
        }
      : null,
  };
}
