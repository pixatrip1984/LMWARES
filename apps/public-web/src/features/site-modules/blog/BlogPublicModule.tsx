import { useEffect, useMemo, useState } from 'react';
import {
  AppError,
  type SiteBlogArticlePage,
  type SiteBlogArticleView,
} from '@starter/domain';
import { createHttpClient } from '@starter/api-client';
import './blogPublicModule.css';

export interface BlogPublicModuleProps {
  projectId: string;
  apiBaseUrl?: string;
}

export function BlogPublicModule({
  projectId,
  apiBaseUrl = import.meta.env.VITE_PUBLIC_API_URL ?? 'http://127.0.0.1:8887',
}: BlogPublicModuleProps) {
  const http = useMemo(() => createHttpClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);
  const [page, setPage] = useState<SiteBlogArticlePage | null>(null);
  const [article, setArticle] = useState<SiteBlogArticleView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const basePath = `/sites/${encodeURIComponent(projectId)}/blog`;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setArticle(null);
    setError(null);

    http
      .get<SiteBlogArticlePage>(basePath)
      .then((result) => {
        if (active) setPage(result);
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
  }, [basePath, http]);

  async function openArticle(slug: string) {
    setLoading(true);
    setError(null);
    try {
      setArticle(await http.get<SiteBlogArticleView>(`${basePath}/${encodeURIComponent(slug)}`));
    } catch (cause) {
      setError(readError(cause, 'No se pudo cargar el artículo.'));
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <section className="lmw-blog-public">
        <div className="lmw-blog-public__state">Cargando blog…</div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="lmw-blog-public">
        <div className="lmw-blog-public__state is-error">{error}</div>
      </section>
    );
  }

  if (article) {
    return (
      <section className="lmw-blog-public">
        <button type="button" className="lmw-blog-public__back" onClick={() => setArticle(null)}>
          ← Volver al blog
        </button>
        <article className="lmw-blog-public-detail">
          {article.coverImage ? (
            <img className="lmw-blog-public-detail__cover" src={article.coverImage.url} alt="" />
          ) : null}
          <div className="lmw-blog-public-detail__content">
            <div className="lmw-blog-public__meta">
              <span>{article.category}</span>
              <time dateTime={article.publishedAt ?? undefined}>
                {article.publishedAt ? formatDate(article.publishedAt) : ''}
              </time>
            </div>
            <h1>{article.title}</h1>
            {article.summary ? (
              <p className="lmw-blog-public-detail__summary">{article.summary}</p>
            ) : null}
            <div
              className="lmw-blog-public-rich-text"
              // `bodyHtml` sólo proviene del endpoint público y ya fue sanitizado en el Worker.
              dangerouslySetInnerHTML={{ __html: article.bodyHtml }}
            />
          </div>
        </article>
      </section>
    );
  }

  const articles = page?.items ?? [];
  return (
    <section className="lmw-blog-public">
      <header className="lmw-blog-public__header">
        <span>Ideas, guías y novedades</span>
        <h1>Blog</h1>
        <p>Contenido útil preparado por nuestro equipo.</p>
      </header>

      {articles.length === 0 ? (
        <div className="lmw-blog-public__state">Aún no hay artículos publicados.</div>
      ) : (
        <div className="lmw-blog-public-grid">
          {articles.map((item) => (
            <article className="lmw-blog-public-card" key={item.id}>
              <button type="button" onClick={() => void openArticle(item.slug)}>
                {item.coverImage ? (
                  <img src={item.coverImage.url} alt="" loading="lazy" />
                ) : (
                  <span className="lmw-blog-public-card__placeholder" aria-hidden="true" />
                )}
                <span className="lmw-blog-public-card__content">
                  <span className="lmw-blog-public__meta">
                    <span>{item.category}</span>
                    <time dateTime={item.publishedAt ?? undefined}>
                      {item.publishedAt ? formatDate(item.publishedAt) : ''}
                    </time>
                  </span>
                  <strong>{item.title}</strong>
                  {item.summary ? <span>{item.summary}</span> : null}
                  <em>Leer artículo →</em>
                </span>
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(new Date(value));
}

function readError(cause: unknown, fallback: string): string {
  return cause instanceof AppError ? cause.message : fallback;
}
