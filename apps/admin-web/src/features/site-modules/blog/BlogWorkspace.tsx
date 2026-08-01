import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AppError,
  type SiteBlogArticleStatus,
  type SiteBlogArticleView,
  type SiteBlogBlock,
  type SiteBlogBody,
} from '@starter/domain';
import type { CreateSiteBlogArticleInput } from '@starter/validation';
import { blogApi } from './blogApi';
import './blogWorkspace.css';

export interface BlogWorkspaceProps {
  projectId: string;
}

interface PreviewArticle {
  title: string;
  summary: string | null;
  category: string;
  slug: string;
  status: SiteBlogArticleStatus;
  coverUrl: string | null;
  bodyHtml: string;
  publishedAt: string | null;
}

const EMPTY_DRAFT: CreateSiteBlogArticleInput = {
  title: '',
  slug: '',
  summary: null,
  coverImageId: null,
  category: 'Noticias',
  body: {
    format: 'blocks',
    blocks: [{ type: 'paragraph', text: '' }],
  },
  status: 'draft',
};

export function BlogWorkspace({ projectId }: BlogWorkspaceProps) {
  const [articles, setArticles] = useState<SiteBlogArticleView[]>([]);
  const [selected, setSelected] = useState<SiteBlogArticleView | null>(null);
  const [persistedSlug, setPersistedSlug] = useState<string | null>(null);
  const [draft, setDraft] = useState<CreateSiteBlogArticleInput>(() => cloneDraft(EMPTY_DRAFT));
  const [preview, setPreview] = useState<PreviewArticle>(() => previewFromDraft(EMPTY_DRAFT, null));
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverObjectUrl, setCoverObjectUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<SiteBlogArticleStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadArticles = useCallback(async () => {
    const response = await blogApi.list(projectId);
    setArticles(response.items);
    return response.items;
  }, [projectId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    blogApi
      .list(projectId)
      .then(({ items }) => {
        if (!active) return;
        setArticles(items);
        if (items[0]) selectArticle(items[0]);
        else startNewArticle();
      })
      .catch((cause) => {
        if (active) setError(readError(cause, 'No se pudo cargar el blog.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [projectId]);

  useEffect(
    () => () => {
      if (coverObjectUrl) URL.revokeObjectURL(coverObjectUrl);
    },
    [coverObjectUrl],
  );

  const categories = useMemo(
    () => Array.from(new Set(articles.map((article) => article.category))).sort(),
    [articles],
  );

  function selectArticle(article: SiteBlogArticleView) {
    setSelected(article);
    setPersistedSlug(article.slug);
    const nextDraft = draftFromArticle(article);
    setDraft(nextDraft);
    setPreview(previewFromArticle(article));
    clearPendingCover();
    setError(null);
    setNotice(null);
  }

  function startNewArticle() {
    const next = cloneDraft(EMPTY_DRAFT);
    setSelected(null);
    setPersistedSlug(null);
    setDraft(next);
    setPreview(previewFromDraft(next, null));
    clearPendingCover();
    setError(null);
    setNotice(null);
  }

  function clearPendingCover() {
    setCoverFile(null);
    setCoverObjectUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  }

  function updateTitle(title: string) {
    setDraft((current) => {
      const previousAutomaticSlug = slugify(current.title);
      const shouldUpdateSlug = current.slug.length === 0 || current.slug === previousAutomaticSlug;
      return {
        ...current,
        title,
        slug: shouldUpdateSlug ? slugify(title) : current.slug,
      };
    });
  }

  function updateBodyMode(format: SiteBlogBody['format']) {
    setDraft((current) => {
      if (current.body.format === format) return current;
      let body: SiteBlogBody;
      if (format === 'html' && current.body.format === 'blocks') {
        body = {
          format: 'html',
          html: renderBlocksForPreview(current.body.blocks),
        };
      } else if (format === 'blocks' && current.body.format === 'html') {
        body = {
          format: 'blocks',
          blocks: [{ type: 'paragraph', text: current.body.html }],
        };
      } else {
        return current;
      }
      return { ...current, body };
    });
  }

  function updateBlock(index: number, block: SiteBlogBlock) {
    setDraft((current) => {
      if (current.body.format !== 'blocks') return current;
      const blocks = current.body.blocks.map((item, position) =>
        position === index ? block : item,
      );
      return { ...current, body: { format: 'blocks', blocks } };
    });
  }

  function addBlock() {
    setDraft((current) => {
      if (current.body.format !== 'blocks') return current;
      return {
        ...current,
        body: {
          format: 'blocks',
          blocks: [...current.body.blocks, { type: 'paragraph', text: '' }],
        },
      };
    });
  }

  function removeBlock(index: number) {
    setDraft((current) => {
      if (current.body.format !== 'blocks' || current.body.blocks.length === 1) {
        return current;
      }
      return {
        ...current,
        body: {
          format: 'blocks',
          blocks: current.body.blocks.filter((_, position) => position !== index),
        },
      };
    });
  }

  function moveBlock(index: number, direction: -1 | 1) {
    setDraft((current) => {
      if (current.body.format !== 'blocks') return current;
      const target = index + direction;
      if (target < 0 || target >= current.body.blocks.length) return current;
      const blocks = [...current.body.blocks];
      const moving = blocks[index];
      const displaced = blocks[target];
      if (!moving || !displaced) return current;
      blocks[index] = displaced;
      blocks[target] = moving;
      return { ...current, body: { format: 'blocks', blocks } };
    });
  }

  function chooseCover(file: File | null) {
    setCoverFile(file);
    setCoverObjectUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  function refreshPreview() {
    setPreview(
      previewFromDraft(
        draft,
        coverObjectUrl ?? selected?.coverImage?.url ?? null,
        selected?.publishedAt ?? null,
      ),
    );
    setNotice('Previsualización actualizada con los cambios locales.');
  }

  async function saveWithStatus(status: SiteBlogArticleStatus) {
    if (!draft.title.trim() || !draft.slug.trim() || !draft.category.trim()) {
      setError('Título, slug y categoría son obligatorios.');
      return;
    }

    setSaving(status);
    setError(null);
    setNotice(null);
    try {
      const payload: CreateSiteBlogArticleInput = { ...draft, status };
      const initialPayload: CreateSiteBlogArticleInput =
        coverFile && status === 'published' ? { ...payload, status: 'draft' } : payload;
      let saved =
        selected && persistedSlug
          ? await blogApi.update(projectId, persistedSlug, initialPayload)
          : await blogApi.create(projectId, initialPayload);

      if (coverFile) {
        saved = await blogApi.uploadCover(projectId, saved.slug, coverFile);
        if (status === 'published') {
          saved = await blogApi.update(projectId, saved.slug, {
            ...payload,
            coverImageId: saved.coverImageId,
          });
        }
      }

      const nextItems = await loadArticles();
      const canonical = nextItems.find((article) => article.id === saved.id) ?? saved;
      selectArticle(canonical);
      setPreview(previewFromArticle(canonical));
      setNotice(
        status === 'published'
          ? 'Artículo publicado.'
          : status === 'archived'
            ? 'Artículo archivado.'
            : canonical.publishedRevisionAt
              ? 'Borrador guardado. La versión pública anterior sigue activa.'
              : 'Borrador guardado.',
      );
    } catch (cause) {
      setError(readError(cause, 'No se pudo guardar el artículo.'));
    } finally {
      setSaving(null);
    }
  }

  return (
    <section className="lmw-blog-workspace" aria-label="Editor del blog">
      <header className="lmw-blog-toolbar">
        <div>
          <span className="lmw-blog-eyebrow">LMWares · módulo de sitio</span>
          <h1>Blog</h1>
        </div>
        <div className="lmw-blog-toolbar__actions">
          <button type="button" className="lmw-blog-button is-ghost" onClick={refreshPreview}>
            Previsualizar
          </button>
          <button
            type="button"
            className="lmw-blog-button is-secondary"
            disabled={saving !== null}
            onClick={() => void saveWithStatus('draft')}
          >
            {saving === 'draft' ? 'Guardando…' : 'Guardar borrador'}
          </button>
          <button
            type="button"
            className="lmw-blog-button is-primary"
            disabled={saving !== null}
            onClick={() => void saveWithStatus('published')}
          >
            {saving === 'published' ? 'Publicando…' : 'Publicar'}
          </button>
        </div>
      </header>

      {error ? <div className="lmw-blog-alert is-error">{error}</div> : null}
      {notice ? <div className="lmw-blog-alert is-success">{notice}</div> : null}

      <div className="lmw-blog-split">
        <div className="lmw-blog-preview-pane">
          <div className="lmw-blog-pane-heading">
            <div>
              <span>Previsualización del borrador</span>
              <strong>El sitio público cambia únicamente al publicar</strong>
            </div>
            <span className={`lmw-blog-status is-${preview.status}`}>
              {statusLabel(preview.status)}
            </span>
          </div>
          <ArticlePreview article={preview} />
        </div>

        <div className="lmw-blog-editor-pane">
          <div className="lmw-blog-article-switcher">
            <label>
              <span>Artículo</span>
              <select
                value={selected?.id ?? ''}
                disabled={loading}
                onChange={(event) => {
                  const article = articles.find((item) => item.id === event.target.value);
                  if (article) selectArticle(article);
                }}
              >
                <option value="">{loading ? 'Cargando…' : 'Nuevo artículo'}</option>
                {articles.map((article) => (
                  <option key={article.id} value={article.id}>
                    {article.title} · {articleStatusLabel(article)}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="lmw-blog-text-button" onClick={startNewArticle}>
              + Nuevo
            </button>
          </div>

          <div className="lmw-blog-form-grid">
            <label className="lmw-blog-field is-wide">
              <span>Título</span>
              <input
                value={draft.title}
                maxLength={240}
                onChange={(event) => updateTitle(event.target.value)}
                placeholder="Una guía útil para tus clientes"
              />
            </label>

            <label className="lmw-blog-field">
              <span>Slug</span>
              <input
                value={draft.slug}
                maxLength={120}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, slug: event.target.value }))
                }
                placeholder="guia-para-clientes"
              />
            </label>

            <label className="lmw-blog-field">
              <span>Categoría</span>
              <input
                value={draft.category}
                maxLength={120}
                list="lmw-blog-categories"
                onChange={(event) =>
                  setDraft((current) => ({ ...current, category: event.target.value }))
                }
              />
              <datalist id="lmw-blog-categories">
                {categories.map((category) => (
                  <option key={category} value={category} />
                ))}
              </datalist>
            </label>

            <label className="lmw-blog-field is-wide">
              <span>Resumen</span>
              <textarea
                rows={3}
                maxLength={700}
                value={draft.summary ?? ''}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    summary: event.target.value || null,
                  }))
                }
                placeholder="La idea principal en una o dos frases."
              />
            </label>

            <label className="lmw-blog-field">
              <span>Estado</span>
              <select
                value={draft.status}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    status: event.target.value as SiteBlogArticleStatus,
                  }))
                }
              >
                <option value="draft">Borrador</option>
                <option value="published">Publicado</option>
                <option value="archived">Archivado</option>
              </select>
            </label>

            <label className="lmw-blog-field">
              <span>Portada</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                onChange={(event) => chooseCover(event.target.files?.[0] ?? null)}
              />
              <small>JPG, PNG, WebP o AVIF. Máximo 5 MB.</small>
            </label>
          </div>

          <div className="lmw-blog-body-editor">
            <div className="lmw-blog-body-editor__heading">
              <div>
                <span>Cuerpo</span>
                <small>Artículo sencillo; no es un editor de cajas.</small>
              </div>
              <div className="lmw-blog-segmented" aria-label="Formato del cuerpo">
                <button
                  type="button"
                  className={draft.body.format === 'blocks' ? 'is-active' : ''}
                  onClick={() => updateBodyMode('blocks')}
                >
                  Bloques
                </button>
                <button
                  type="button"
                  className={draft.body.format === 'html' ? 'is-active' : ''}
                  onClick={() => updateBodyMode('html')}
                >
                  HTML
                </button>
              </div>
            </div>

            {draft.body.format === 'blocks' ? (
              <div className="lmw-blog-blocks">
                {draft.body.blocks.map((block, index) => (
                  <BlockEditor
                    key={`${index}-${block.type}`}
                    block={block}
                    index={index}
                    count={draft.body.format === 'blocks' ? draft.body.blocks.length : 0}
                    onChange={(next) => updateBlock(index, next)}
                    onMove={(direction) => moveBlock(index, direction)}
                    onRemove={() => removeBlock(index)}
                  />
                ))}
                <button type="button" className="lmw-blog-add-block" onClick={addBlock}>
                  + Agregar bloque
                </button>
              </div>
            ) : (
              <label className="lmw-blog-field is-wide">
                <span>HTML editorial</span>
                <textarea
                  className="lmw-blog-code"
                  rows={16}
                  maxLength={100_000}
                  value={draft.body.html}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      body: { format: 'html', html: event.target.value },
                    }))
                  }
                />
                <small>
                  El servidor elimina scripts, estilos, embeds, imágenes, atributos y protocolos no
                  permitidos.
                </small>
              </label>
            )}
          </div>

          {selected ? (
            <div className="lmw-blog-editor-footer">
              <span>Última actualización: {formatDate(selected.updatedAt)}</span>
              <button
                type="button"
                className="lmw-blog-text-button is-danger"
                disabled={saving !== null}
                onClick={() => void saveWithStatus('archived')}
              >
                {saving === 'archived' ? 'Archivando…' : 'Archivar'}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ArticlePreview({ article }: { article: PreviewArticle }) {
  return (
    <article className="lmw-blog-preview-card">
      {article.coverUrl ? (
        <img src={article.coverUrl} alt="" className="lmw-blog-preview-card__cover" />
      ) : (
        <div className="lmw-blog-preview-card__cover is-placeholder">
          <span>Portada del artículo</span>
        </div>
      )}
      <div className="lmw-blog-preview-card__content">
        <div className="lmw-blog-preview-card__meta">
          <span>{article.category || 'Sin categoría'}</span>
          <span>{article.publishedAt ? formatDate(article.publishedAt) : 'Sin publicar'}</span>
        </div>
        <h2>{article.title || 'Título del artículo'}</h2>
        {article.summary ? (
          <p className="lmw-blog-preview-card__summary">{article.summary}</p>
        ) : null}
        <div
          className="lmw-blog-rich-text"
          // El HTML local pasa por una política espejo; el servidor sigue siendo la autoridad.
          dangerouslySetInnerHTML={{ __html: article.bodyHtml }}
        />
        <div className="lmw-blog-preview-card__slug">/blog/{article.slug || 'nuevo-articulo'}</div>
      </div>
    </article>
  );
}

function BlockEditor({
  block,
  index,
  count,
  onChange,
  onMove,
  onRemove,
}: {
  block: SiteBlogBlock;
  index: number;
  count: number;
  onChange: (block: SiteBlogBlock) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <div className="lmw-blog-block">
      <div className="lmw-blog-block__toolbar">
        <select
          value={block.type}
          aria-label={`Tipo del bloque ${index + 1}`}
          onChange={(event) => onChange(newBlock(event.target.value))}
        >
          <option value="paragraph">Párrafo</option>
          <option value="heading">Subtítulo</option>
          <option value="quote">Cita</option>
          <option value="bulleted-list">Lista con viñetas</option>
          <option value="numbered-list">Lista numerada</option>
          <option value="divider">Separador</option>
        </select>
        <div>
          <button
            type="button"
            disabled={index === 0}
            onClick={() => onMove(-1)}
            aria-label="Subir bloque"
          >
            ↑
          </button>
          <button
            type="button"
            disabled={index === count - 1}
            onClick={() => onMove(1)}
            aria-label="Bajar bloque"
          >
            ↓
          </button>
          <button
            type="button"
            disabled={count === 1}
            onClick={onRemove}
            aria-label="Eliminar bloque"
          >
            ×
          </button>
        </div>
      </div>

      {block.type === 'heading' ? (
        <div className="lmw-blog-block__row">
          <select
            value={block.level}
            aria-label="Nivel del subtítulo"
            onChange={(event) => onChange({ ...block, level: Number(event.target.value) as 2 | 3 })}
          >
            <option value={2}>H2</option>
            <option value={3}>H3</option>
          </select>
          <input
            value={block.text}
            maxLength={300}
            onChange={(event) => onChange({ ...block, text: event.target.value })}
            placeholder="Subtítulo"
          />
        </div>
      ) : block.type === 'paragraph' ? (
        <textarea
          rows={5}
          maxLength={12_000}
          value={block.text}
          onChange={(event) => onChange({ ...block, text: event.target.value })}
          placeholder="Desarrolla una idea del artículo…"
        />
      ) : block.type === 'quote' ? (
        <>
          <textarea
            rows={4}
            maxLength={4_000}
            value={block.text}
            onChange={(event) => onChange({ ...block, text: event.target.value })}
            placeholder="Texto de la cita"
          />
          <input
            value={block.attribution ?? ''}
            maxLength={200}
            onChange={(event) => onChange({ ...block, attribution: event.target.value || null })}
            placeholder="Autor o fuente (opcional)"
          />
        </>
      ) : block.type === 'bulleted-list' || block.type === 'numbered-list' ? (
        <textarea
          rows={6}
          value={block.items.join('\n')}
          onChange={(event) =>
            onChange({
              ...block,
              items: event.target.value
                .split('\n')
                .map((item) => item.trim())
                .filter(Boolean),
            })
          }
          placeholder={'Un elemento por línea\nSegundo elemento'}
        />
      ) : (
        <div className="lmw-blog-block__divider" />
      )}
    </div>
  );
}

function newBlock(type: string): SiteBlogBlock {
  switch (type) {
    case 'heading':
      return { type: 'heading', level: 2, text: '' };
    case 'quote':
      return { type: 'quote', text: '', attribution: null };
    case 'bulleted-list':
      return { type: 'bulleted-list', items: [''] };
    case 'numbered-list':
      return { type: 'numbered-list', items: [''] };
    case 'divider':
      return { type: 'divider' };
    default:
      return { type: 'paragraph', text: '' };
  }
}

function cloneDraft(input: CreateSiteBlogArticleInput): CreateSiteBlogArticleInput {
  return structuredClone(input);
}

function draftFromArticle(article: SiteBlogArticleView): CreateSiteBlogArticleInput {
  return {
    title: article.title,
    slug: article.slug,
    summary: article.summary,
    coverImageId: article.coverImageId,
    category: article.category,
    body: structuredClone(article.body),
    status: article.status,
  };
}

function previewFromArticle(article: SiteBlogArticleView): PreviewArticle {
  return {
    title: article.title,
    slug: article.slug,
    summary: article.summary,
    category: article.category,
    status: article.status,
    coverUrl: article.coverImage?.url ?? null,
    bodyHtml: article.bodyHtml,
    publishedAt: article.publishedAt,
  };
}

function previewFromDraft(
  draft: CreateSiteBlogArticleInput,
  coverUrl: string | null,
  publishedAt: string | null = null,
): PreviewArticle {
  return {
    title: draft.title,
    slug: draft.slug,
    summary: draft.summary,
    category: draft.category,
    status: draft.status,
    coverUrl,
    bodyHtml:
      draft.body.format === 'blocks'
        ? renderBlocksForPreview(draft.body.blocks)
        : sanitizeHtmlForPreview(draft.body.html),
    publishedAt,
  };
}

function renderBlocksForPreview(blocks: SiteBlogBlock[]): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case 'heading':
          return `<h${block.level}>${escapeHtml(block.text)}</h${block.level}>`;
        case 'paragraph':
          return `<p>${escapeHtml(block.text).replace(/\n/g, '<br>')}</p>`;
        case 'quote':
          return `<blockquote><p>${escapeHtml(block.text)}</p>${
            block.attribution ? `<footer>${escapeHtml(block.attribution)}</footer>` : ''
          }</blockquote>`;
        case 'bulleted-list':
        case 'numbered-list': {
          const tag = block.type === 'bulleted-list' ? 'ul' : 'ol';
          return `<${tag}>${block.items
            .map((item) => `<li>${escapeHtml(item)}</li>`)
            .join('')}</${tag}>`;
        }
        case 'divider':
          return '<hr>';
      }
    })
    .join('');
}

function sanitizeHtmlForPreview(input: string): string {
  const parser = new DOMParser();
  const document = parser.parseFromString(input, 'text/html');
  const allowedTags = new Set([
    'P',
    'BR',
    'H2',
    'H3',
    'H4',
    'STRONG',
    'EM',
    'B',
    'I',
    'BLOCKQUOTE',
    'UL',
    'OL',
    'LI',
    'A',
    'CODE',
    'PRE',
    'HR',
  ]);
  const dropTags = new Set([
    'SCRIPT',
    'STYLE',
    'IFRAME',
    'OBJECT',
    'EMBED',
    'FORM',
    'INPUT',
    'BUTTON',
    'TEXTAREA',
    'SELECT',
    'SVG',
    'MATH',
    'CANVAS',
    'VIDEO',
    'AUDIO',
    'PICTURE',
    'IMG',
    'TEMPLATE',
    'NOSCRIPT',
  ]);

  for (const element of Array.from(document.body.querySelectorAll('*'))) {
    if (dropTags.has(element.tagName)) {
      element.remove();
      continue;
    }
    if (!allowedTags.has(element.tagName)) {
      element.replaceWith(...Array.from(element.childNodes));
      continue;
    }

    for (const attribute of Array.from(element.attributes)) {
      const allowed =
        element.tagName === 'A' &&
        (attribute.name.toLowerCase() === 'href' || attribute.name.toLowerCase() === 'title');
      if (!allowed) element.removeAttribute(attribute.name);
    }
    if (element.tagName === 'A') {
      const href = element.getAttribute('href');
      if (!href || !isSafePreviewHref(href)) element.removeAttribute('href');
      else element.setAttribute('rel', 'nofollow noopener noreferrer');
    }
  }

  return document.body.innerHTML;
}

function isSafePreviewHref(value: string): boolean {
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
    const url = new URL(href);
    return url.protocol === 'https:' || url.protocol === 'http:' || url.protocol === 'mailto:';
  } catch {
    return false;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function statusLabel(status: SiteBlogArticleStatus): string {
  if (status === 'published') return 'Publicado';
  if (status === 'archived') return 'Archivado';
  return 'Borrador';
}

function articleStatusLabel(article: SiteBlogArticleView): string {
  if (article.publishedRevisionAt && article.hasUnpublishedChanges) {
    return 'Publicado · cambios sin publicar';
  }
  if (article.publishedRevisionAt && article.status === 'draft') {
    return 'Publicado · borrador activo';
  }
  return statusLabel(article.status);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
  }).format(new Date(value));
}

function readError(cause: unknown, fallback: string): string {
  return cause instanceof AppError ? cause.message : fallback;
}
