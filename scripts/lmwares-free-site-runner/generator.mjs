export function buildManifest({ job, intake, contacts, assets }) {
  const freePage = normalizeFreePage(intake.metadata?.freePage);
  const theme = resolveTheme({ intake, freePage });
  return {
    schema: 'lmwares.free-site.v1',
    generatedAt: new Date().toISOString(),
    generator: 'lmwares-free-site-runner/static-v2',
    job: {
      id: job.id,
      attempt: job.attempt,
    },
    intake: {
      id: intake.id,
      slug: intake.slug,
      siteName: intake.siteName,
      style: intake.style,
      audience: intake.audience,
      sector: intake.sector,
      primaryAction: intake.primaryAction,
    },
    freePage,
    theme: {
      name: theme.name,
      source: theme.source,
    },
    contacts: contacts.map(({ platform, value, label, publicVisible }) => ({
      platform,
      value,
      label,
      publicVisible,
    })),
    assets: assets.map(({ asset, fileAsset, mediaPath }) => ({
      id: asset.id,
      fileAssetId: fileAsset.id,
      contentType: fileAsset.contentType,
      sizeBytes: fileAsset.sizeBytes,
      checksum: fileAsset.checksum,
      mediaPath,
    })),
  };
}

export function renderSite({ intake, contacts, assets, manifest, apiUrl }) {
  const freePage = normalizeFreePage(intake.metadata?.freePage);
  const theme = resolveTheme({ intake, freePage });
  const copy = marketingCopyFor({ intake, freePage });
  const images = assets.map((entry) => ({
    ...entry,
    url: new URL(entry.mediaPath, apiUrl).toString(),
  }));
  const primaryImage = images[0]?.url ?? '';
  const gallery = images.slice(0, 5);
  const visibleContacts = contacts.filter((contact) => contact.publicVisible !== false);
  const contactCards = visibleContacts.map(toContactCard);
  const primaryCard = pickPrimaryContact(contactCards);
  const addressCard = contactCards.find((card) => card.platform === 'address');
  const quickFacts = [
    primaryCard ? { label: primaryCard.label, value: primaryCard.value, href: primaryCard.href } : null,
    freePage.hours ? { label: 'Horario', value: freePage.hours, href: null } : null,
    freePage.serviceArea ? { label: 'Zona de atención', value: freePage.serviceArea, href: null } : null,
    addressCard ? { label: 'Ubicación', value: addressCard.value, href: addressCard.href } : null,
  ].filter(Boolean);

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content="${escapeAttr(shorten(intake.businessDescription, 150))}" />
  <title>${escapeHtml(intake.siteName)} · Página informativa</title>
  <style>
    :root {
      color-scheme: light;
      --ink: ${theme.ink};
      --muted: ${theme.muted};
      --paper: ${theme.paper};
      --paper-2: ${theme.paper2};
      --navy: ${theme.navy};
      --navy-2: ${theme.navy2};
      --line: ${theme.line};
      --accent: ${theme.accent};
      --accent-2: ${theme.accent2};
      --accent-rgb: ${theme.accentRgb};
      --blue: ${theme.blue};
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      background: var(--paper);
      color: var(--ink);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    a { color: inherit; text-decoration: none; }
    button { font: inherit; }
    .shell { min-height: 100vh; overflow: hidden; }
    .topbar {
      align-items: center;
      background: linear-gradient(90deg, rgba(5, 22, 44, 0.98), rgba(9, 36, 69, 0.94));
      color: white;
      display: flex;
      gap: 16px;
      justify-content: space-between;
      padding: 16px clamp(18px, 4.8vw, 72px);
    }
    .brand {
      font-family: Georgia, "Times New Roman", serif;
      font-size: clamp(20px, 2.1vw, 32px);
      letter-spacing: -0.02em;
    }
    .top-actions { align-items: center; display: flex; gap: 10px; }
    .pill,
    .button {
      align-items: center;
      border-radius: 2px;
      display: inline-flex;
      font-size: 12px;
      font-weight: 900;
      gap: 10px;
      letter-spacing: 0.02em;
      min-height: 44px;
      padding: 0 18px;
    }
    .pill { border: 1px solid rgba(255,255,255,0.22); color: rgba(255,255,255,0.78); }
    .button { background: linear-gradient(135deg, var(--accent), var(--accent-2)); color: white; }
    .button.secondary {
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.35);
    }
    .hero {
      background: radial-gradient(circle at 10% 5%, rgba(var(--accent-rgb), 0.20), transparent 32%), var(--navy);
      color: white;
      display: grid;
      grid-template-columns: minmax(0, 0.86fr) minmax(340px, 1.14fr);
      min-height: 76vh;
    }
    .hero-copy {
      align-self: stretch;
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: clamp(42px, 7vw, 96px);
      position: relative;
      z-index: 2;
    }
    .eyebrow {
      color: var(--accent-2);
      font-size: 11px;
      font-weight: 900;
      letter-spacing: 0.18em;
      text-transform: uppercase;
    }
    h1 {
      font-family: Georgia, "Times New Roman", serif;
      font-size: clamp(50px, 7.4vw, 106px);
      font-weight: 400;
      letter-spacing: -0.07em;
      line-height: 0.92;
      margin: 18px 0 20px;
      max-width: 920px;
    }
    .summary {
      color: rgba(255, 255, 255, 0.80);
      font-size: clamp(15px, 1.28vw, 20px);
      line-height: 1.64;
      max-width: 720px;
    }
    .trust {
      border-left: 2px solid var(--accent);
      color: rgba(255,255,255,0.88);
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.02em;
      margin: 18px 0 0;
      padding-left: 14px;
    }
    .actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 34px; }
    .hero-image {
      min-height: 460px;
      overflow: hidden;
      position: relative;
    }
    .hero-image img {
      height: 100%;
      inset: 0;
      object-fit: cover;
      position: absolute;
      width: 100%;
    }
    .hero-image::after {
      background: linear-gradient(90deg, var(--navy), transparent 34%), linear-gradient(0deg, rgba(5, 22, 44, 0.20), transparent 56%);
      content: "";
      inset: 0;
      position: absolute;
    }
    .quick-facts {
      background: var(--paper-2);
      border-bottom: 1px solid var(--line);
      display: grid;
      grid-template-columns: repeat(${Math.max(quickFacts.length, 1)}, minmax(0, 1fr));
      padding: 0 clamp(18px, 4.8vw, 72px);
    }
    .fact {
      border-right: 1px solid var(--line);
      display: grid;
      gap: 5px;
      min-height: 108px;
      padding: 24px 22px;
    }
    .fact:first-child { border-left: 1px solid var(--line); }
    .fact span,
    .service-card span,
    .contact-card span {
      color: var(--accent);
      font-size: 11px;
      font-weight: 900;
      letter-spacing: 0.13em;
      text-transform: uppercase;
    }
    .fact strong {
      color: var(--ink);
      font-size: 15px;
      line-height: 1.42;
    }
    .fact a { color: var(--blue); font-size: 12px; font-weight: 900; }
    .section {
      padding: clamp(42px, 6.5vw, 84px) clamp(18px, 4.8vw, 72px);
    }
    .section h2 {
      font-family: Georgia, "Times New Roman", serif;
      font-size: clamp(32px, 4vw, 62px);
      font-weight: 400;
      letter-spacing: -0.05em;
      line-height: 0.98;
      margin: 0 0 14px;
    }
    .section > p {
      color: var(--muted);
      line-height: 1.65;
      margin: 0;
      max-width: 760px;
    }
    .services-grid {
      display: grid;
      gap: 14px;
      grid-template-columns: repeat(${Math.min(Math.max(freePage.services.length, 1), 4)}, minmax(0, 1fr));
      margin-top: 28px;
    }
    .service-card {
      background: #fff;
      border: 1px solid var(--line);
      box-shadow: 0 18px 52px rgba(8, 19, 36, 0.08);
      display: grid;
      gap: 18px;
      min-height: 156px;
      padding: 22px;
    }
    .service-card strong {
      align-self: end;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 28px;
      font-weight: 400;
      letter-spacing: -0.04em;
      line-height: 1;
    }
    .gallery {
      display: grid;
      gap: 8px;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      margin-top: 28px;
    }
    .gallery figure {
      background: #d8d1c6;
      margin: 0;
      min-height: 240px;
      overflow: hidden;
      position: relative;
    }
    .gallery figure:first-child {
      grid-column: span 2;
      grid-row: span 2;
      min-height: 488px;
    }
    .gallery img {
      height: 100%;
      object-fit: cover;
      width: 100%;
    }
    .contact {
      background: radial-gradient(circle at 12% 0%, rgba(var(--accent-rgb), 0.26), transparent 32%), linear-gradient(135deg, var(--navy), var(--navy-2));
      color: white;
      display: grid;
      gap: 28px;
      grid-template-columns: minmax(0, 0.78fr) minmax(320px, 1fr);
      padding: clamp(44px, 7vw, 92px) clamp(18px, 4.8vw, 72px);
    }
    .contact h2 { color: white; }
    .contact p { color: rgba(255,255,255,.72); line-height: 1.65; }
    .contact-list {
      display: grid;
      gap: 12px;
    }
    .contact-card {
      background: rgba(255,255,255,0.055);
      border: 1px solid rgba(255,255,255,0.18);
      display: grid;
      gap: 12px;
      padding: 16px;
    }
    .contact-card strong {
      color: white;
      font-size: 15px;
      line-height: 1.45;
      overflow-wrap: anywhere;
    }
    .contact-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .contact-actions a,
    .contact-actions button {
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.22);
      color: white;
      cursor: pointer;
      font-size: 11px;
      font-weight: 900;
      min-height: 34px;
      padding: 0 12px;
    }
    .contact-actions a:first-child {
      background: var(--accent);
      border-color: var(--accent);
    }
    .copy-status {
      color: rgba(255,255,255,0.62);
      font-size: 12px;
      min-height: 18px;
    }
    .footer {
      color: var(--muted);
      font-size: 11px;
      padding: 24px clamp(18px, 4.8vw, 72px);
      text-align: center;
    }
    @media (max-width: 940px) {
      .hero, .contact { grid-template-columns: 1fr; }
      .hero-image { min-height: 360px; order: -1; }
      .quick-facts, .services-grid, .gallery { grid-template-columns: 1fr; }
      .fact, .fact:first-child { border-left: 0; border-right: 0; border-top: 1px solid var(--line); }
      .gallery figure:first-child { grid-column: auto; grid-row: auto; min-height: 260px; }
      .topbar { align-items: flex-start; flex-direction: column; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <header class="topbar">
      <a class="brand" href="#inicio">${escapeHtml(intake.siteName)}</a>
      <div class="top-actions">
        <span class="pill">Información pública</span>
        ${primaryCard?.href ? `<a class="button" href="${escapeAttr(primaryCard.href)}" target="_blank" rel="noopener">${escapeHtml(intake.primaryAction)}</a>` : ''}
      </div>
    </header>

    <section class="hero" id="inicio">
      <div class="hero-copy">
        ${intake.sector ? `<div class="eyebrow">${escapeHtml(intake.sector)}</div>` : '<div class="eyebrow">Página informativa</div>'}
        <h1>${escapeHtml(intake.siteName)}</h1>
        <p class="summary">${escapeHtml(intake.businessDescription)}</p>
        ${freePage.trustLine ? `<p class="trust">${escapeHtml(freePage.trustLine)}</p>` : ''}
        <div class="actions">
          ${primaryCard?.href ? `<a class="button" href="${escapeAttr(primaryCard.href)}" target="_blank" rel="noopener">${escapeHtml(intake.primaryAction)} →</a>` : ''}
          ${addressCard?.href ? `<a class="button secondary" href="${escapeAttr(addressCard.href)}" target="_blank" rel="noopener">Ver ubicación</a>` : '<a class="button secondary" href="#contacto">Ver contacto</a>'}
        </div>
      </div>
      <div class="hero-image">${primaryImage ? `<img alt="${escapeAttr(intake.siteName)}" src="${escapeAttr(primaryImage)}" />` : ''}</div>
    </section>

    ${quickFacts.length > 0 ? `<section class="quick-facts" aria-label="Datos publicados">
      ${quickFacts.map((fact) => `<article class="fact"><span>${escapeHtml(fact.label)}</span><strong>${escapeHtml(fact.value)}</strong>${fact.href ? `<a href="${escapeAttr(fact.href)}" target="_blank" rel="noopener">Abrir</a>` : ''}</article>`).join('\n      ')}
    </section>` : ''}

    ${freePage.services.length > 0 ? `<section class="section">
      <div class="eyebrow">${escapeHtml(copy.servicesEyebrow)}</div>
      <h2>${escapeHtml(copy.servicesTitle)}</h2>
      <p>${escapeHtml(copy.servicesIntro)}</p>
      <div class="services-grid">
        ${freePage.services.map((service, index) => `<article class="service-card"><span>${String(index + 1).padStart(2, '0')}</span><strong>${escapeHtml(service)}</strong></article>`).join('\n        ')}
      </div>
    </section>` : ''}

    ${gallery.length > 0 ? `<section class="section">
      <div class="eyebrow">${escapeHtml(copy.galleryEyebrow)}</div>
      <h2>${escapeHtml(copy.galleryTitle)}</h2>
      <div class="gallery">
        ${gallery.map((image, index) => `<figure><img alt="${escapeAttr(`${intake.siteName} imagen ${index + 1}`)}" src="${escapeAttr(image.url)}" /></figure>`).join('\n        ')}
      </div>
    </section>` : ''}

    <section class="contact" id="contacto">
      <div>
        <div class="eyebrow">Contacto</div>
        <h2>${escapeHtml(copy.contactTitle)}</h2>
        <p>${escapeHtml(copy.contactIntro)}</p>
        <p class="copy-status" role="status" aria-live="polite"></p>
      </div>
      <div class="contact-list">
        ${contactCards.map(renderContactCard).join('\n        ')}
      </div>
    </section>

    <footer class="footer">
      Página informativa publicada con LMWares.
    </footer>
  </main>
  <script type="application/json" id="lmwares-free-site-manifest">${safeJsonForScript(manifest)}</script>
  <script>
    document.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-copy]');
      if (!button) return;
      const value = button.getAttribute('data-copy') || '';
      const status = document.querySelector('.copy-status');
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(value);
        } else {
          const input = document.createElement('textarea');
          input.value = value;
          input.setAttribute('readonly', '');
          input.style.position = 'fixed';
          input.style.left = '-9999px';
          document.body.appendChild(input);
          input.select();
          document.execCommand('copy');
          input.remove();
        }
        if (status) status.textContent = 'Copiado al portapapeles.';
      } catch {
        if (status) status.textContent = 'No se pudo copiar automáticamente. Selecciona el texto manualmente.';
      }
    });
  </script>
</body>
</html>`;
}

function renderContactCard(card) {
  return `<article class="contact-card">
          <span>${escapeHtml(card.label)}</span>
          <strong>${escapeHtml(card.value)}</strong>
          <div class="contact-actions">
            ${card.href ? `<a href="${escapeAttr(card.href)}" target="_blank" rel="noopener">${escapeHtml(card.actionLabel)}</a>` : ''}
            <button data-copy="${escapeAttr(card.value)}" type="button">Copiar</button>
          </div>
        </article>`;
}

function normalizeFreePage(value) {
  const input = isPlainObject(value) ? value : {};
  return {
    services: Array.isArray(input.services)
      ? input.services.map((item) => String(item ?? '').trim()).filter(Boolean).slice(0, 8)
      : [],
    hours: stringOrEmpty(input.hours),
    serviceArea: stringOrEmpty(input.serviceArea),
    trustLine: stringOrEmpty(input.trustLine),
    colorPreference: stringOrEmpty(input.colorPreference),
  };
}

function marketingCopyFor({ intake, freePage }) {
  const category = classifyBusiness({ intake, freePage });
  const siteName = intake.siteName;

  if (category === 'health') {
    return {
      servicesEyebrow: 'Atención disponible',
      servicesTitle: 'Consulta y seguimiento claro.',
      servicesIntro: 'Agenda atención, resuelve dudas iniciales y confirma disponibilidad por el canal que prefieras.',
      galleryEyebrow: 'Espacio de atención',
      galleryTitle: 'Una referencia visual antes de tu consulta.',
      contactTitle: `Agenda con ${siteName}.`,
      contactIntro: 'Solicita disponibilidad, envía una duda inicial o guarda los datos para coordinar tu próxima consulta.',
    };
  }

  if (category === 'industrial') {
    return {
      servicesEyebrow: 'Soluciones disponibles',
      servicesTitle: 'Encuentra lo que necesitas resolver.',
      servicesIntro: 'Consulta disponibilidad, pide orientación práctica o solicita apoyo para elegir materiales y herramientas.',
      galleryEyebrow: 'Espacio y producto',
      galleryTitle: 'Conoce la ferretería antes de visitar.',
      contactTitle: `Cotiza o consulta con ${siteName}.`,
      contactIntro: 'Comparte qué material, herramienta o refacción necesitas y te ayudamos a confirmar disponibilidad, precio o ubicación.',
    };
  }

  if (category === 'food') {
    return {
      servicesEyebrow: 'Oferta disponible',
      servicesTitle: 'Elige y confirma antes de llegar.',
      servicesIntro: 'Revisa lo esencial, pregunta por disponibilidad y contacta directamente para ordenar o reservar.',
      galleryEyebrow: 'Ambiente y producto',
      galleryTitle: 'Una probada visual del lugar.',
      contactTitle: `Contacta a ${siteName}.`,
      contactIntro: 'Pregunta por horarios, disponibilidad o pedidos especiales desde el canal que prefieras.',
    };
  }

  if (category === 'estate') {
    return {
      servicesEyebrow: 'Oportunidades',
      servicesTitle: 'Información clara para decidir.',
      servicesIntro: 'Explora ubicaciones, características y opciones de contacto para pedir información concreta.',
      galleryEyebrow: 'Vista del proyecto',
      galleryTitle: 'Conoce el espacio antes de solicitar detalles.',
      contactTitle: `Solicita información de ${siteName}.`,
      contactIntro: 'Recibe detalles, agenda una llamada o pide seguimiento sobre las opciones que te interesan.',
    };
  }

  return {
    servicesEyebrow: 'Oferta principal',
    servicesTitle: 'Lo que puedes solicitar.',
    servicesIntro: 'Una vista rápida de servicios, productos o capacidades disponibles para pedir información directa.',
    galleryEyebrow: 'Vista del negocio',
    galleryTitle: 'Conoce mejor la propuesta antes de contactar.',
    contactTitle: `Comunícate con ${siteName}.`,
    contactIntro: 'Cuéntanos qué necesitas y te orientamos con el siguiente paso por el canal que prefieras.',
  };
}

function resolveTheme({ intake, freePage }) {
  const category = classifyBusiness({ intake, freePage });
  const preferred = normalizeSearchText(freePage.colorPreference);

  if (preferred) {
    if (/azul.*rojo|rojo.*azul|fuego|fire|profundo/.test(preferred)) return withThemeSource(THEMES.deepFire, 'colorPreference');
    if (/clinico|clinica|medico|blanco|salud/.test(preferred)) return withThemeSource(THEMES.clinical, 'colorPreference');
    if (/verde|natural|organico|organica|eco/.test(preferred)) return withThemeSource(THEMES.estate, 'colorPreference');
    if (/rosa|lila|violeta|belleza|wellness/.test(preferred)) return withThemeSource(THEMES.wellness, 'colorPreference');
    if (/negro|oscuro|carbon|industrial|naranja|calido|calida/.test(preferred)) return withThemeSource(THEMES.industrial, 'colorPreference');
    if (/azul|formal|corporativo|profesional/.test(preferred)) return withThemeSource(THEMES.professional, 'colorPreference');
  }

  const themeByCategory = {
    health: THEMES.clinical,
    industrial: THEMES.industrial,
    wellness: THEMES.wellness,
    food: THEMES.culinary,
    estate: THEMES.estate,
    professional: THEMES.professional,
    default: THEMES.deepFire,
  };

  return withThemeSource(themeByCategory[category] ?? THEMES.deepFire, 'inferred');
}

function classifyBusiness({ intake, freePage }) {
  const text = normalizeSearchText([
    intake.sector,
    intake.style,
    intake.audience,
    intake.businessDescription,
    freePage.colorPreference,
    ...(Array.isArray(freePage.services) ? freePage.services : []),
  ].join(' '));

  if (/salud|medic|doctor|doctora|clinica|paciente|consulta|terapia|dent|psicolog|nutricion|fisioterapia/.test(text)) return 'health';
  if (/ferreter|herramient|constru|obra|plomer|electric|material|refaccion|tornillo|almacen|industrial/.test(text)) return 'industrial';
  if (/belleza|spa|estetica|wellness|fitness|yoga|salon|cosmet/.test(text)) return 'wellness';
  if (/restaurante|cafe|cafeteria|comida|panader|bar|cocina|menu|bebida/.test(text)) return 'food';
  if (/inmobili|arquitect|bienes raices|desarrollo|residencial|propiedad|departamento|vivienda/.test(text)) return 'estate';
  if (/tecnolog|software|consultor|legal|financ|contab|despacho|laboratorio|ingenier/.test(text)) return 'professional';
  return 'default';
}

const THEMES = {
  deepFire: {
    name: 'deep-fire',
    ink: '#081324',
    muted: '#667083',
    paper: '#f6f0e7',
    paper2: '#fffaf2',
    navy: '#05162c',
    navy2: '#092445',
    line: 'rgba(8, 19, 36, 0.14)',
    accent: '#f04a2b',
    accent2: '#ff7a45',
    accentRgb: '240, 74, 43',
    blue: '#1677ff',
  },
  industrial: {
    name: 'industrial',
    ink: '#0b1420',
    muted: '#68727f',
    paper: '#f3efe7',
    paper2: '#fffaf0',
    navy: '#061626',
    navy2: '#112b41',
    line: 'rgba(11, 20, 32, 0.15)',
    accent: '#e95b24',
    accent2: '#ff9a3d',
    accentRgb: '233, 91, 36',
    blue: '#1f7ae0',
  },
  clinical: {
    name: 'clinical',
    ink: '#082033',
    muted: '#607284',
    paper: '#f7fbff',
    paper2: '#ffffff',
    navy: '#062039',
    navy2: '#0b3858',
    line: 'rgba(8, 32, 51, 0.13)',
    accent: '#0e9f9a',
    accent2: '#39c3d0',
    accentRgb: '14, 159, 154',
    blue: '#2878d9',
  },
  wellness: {
    name: 'wellness',
    ink: '#23111d',
    muted: '#7d6472',
    paper: '#fff6f7',
    paper2: '#fffefe',
    navy: '#351729',
    navy2: '#4d2036',
    line: 'rgba(35, 17, 29, 0.13)',
    accent: '#d85b7b',
    accent2: '#f39ab0',
    accentRgb: '216, 91, 123',
    blue: '#9b6cff',
  },
  culinary: {
    name: 'culinary',
    ink: '#28140c',
    muted: '#806b60',
    paper: '#fff4e8',
    paper2: '#fffaf3',
    navy: '#32170c',
    navy2: '#552817',
    line: 'rgba(40, 20, 12, 0.14)',
    accent: '#c94f25',
    accent2: '#ef9b55',
    accentRgb: '201, 79, 37',
    blue: '#a05a2c',
  },
  estate: {
    name: 'estate',
    ink: '#102016',
    muted: '#647468',
    paper: '#f5efe4',
    paper2: '#fffaf0',
    navy: '#102719',
    navy2: '#1d3a29',
    line: 'rgba(16, 32, 22, 0.14)',
    accent: '#a86f2d',
    accent2: '#d9a35a',
    accentRgb: '168, 111, 45',
    blue: '#2f7058',
  },
  professional: {
    name: 'professional',
    ink: '#071529',
    muted: '#66758e',
    paper: '#f4f7fb',
    paper2: '#ffffff',
    navy: '#06162c',
    navy2: '#0b284d',
    line: 'rgba(7, 21, 41, 0.13)',
    accent: '#2a7dff',
    accent2: '#58b7ff',
    accentRgb: '42, 125, 255',
    blue: '#2a7dff',
  },
};

function withThemeSource(theme, source) {
  return { ...theme, source };
}

function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function toContactCard(contact) {
  const label = contact.label || labelFor(contact.platform);
  const href = hrefForContact(contact);
  return {
    platform: contact.platform,
    label,
    value: String(contact.value ?? ''),
    href,
    actionLabel: href ? actionLabelFor(contact.platform) : 'Copiar',
  };
}

function pickPrimaryContact(cards) {
  return (
    cards.find((card) => card.platform === 'whatsapp' && card.href) ||
    cards.find((card) => card.platform === 'phone' && card.href) ||
    cards.find((card) => card.platform === 'email' && card.href) ||
    cards.find((card) => card.href) ||
    null
  );
}

function hrefForContact(contact) {
  const value = String(contact.value ?? '').trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;

  switch (contact.platform) {
    case 'whatsapp': {
      const digits = value.replace(/\D/g, '');
      return digits ? `https://wa.me/${digits}` : null;
    }
    case 'phone': {
      const phone = value.replace(/[^\d+]/g, '');
      return phone ? `tel:${phone}` : null;
    }
    case 'email':
      return value.includes('@') ? `mailto:${value}` : null;
    case 'address':
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(value)}`;
    case 'website':
      return `https://${value.replace(/^\/+/, '')}`;
    case 'instagram':
      return socialUrl('https://www.instagram.com/', value);
    case 'facebook':
      return socialUrl('https://www.facebook.com/', value);
    case 'x':
      return socialUrl('https://x.com/', value);
    case 'telegram':
      return socialUrl('https://t.me/', value);
    case 'tiktok':
      return socialUrl('https://www.tiktok.com/@', value);
    default:
      return null;
  }
}

function socialUrl(base, value) {
  const handle = String(value ?? '')
    .trim()
    .replace(/^@/, '')
    .replace(/^\/+/, '');
  return handle ? `${base}${encodeURIComponent(handle)}` : null;
}

function actionLabelFor(platform) {
  const labels = {
    instagram: 'Abrir perfil',
    facebook: 'Abrir perfil',
    x: 'Abrir perfil',
    whatsapp: 'Enviar mensaje',
    phone: 'Llamar',
    email: 'Enviar correo',
    address: 'Ver mapa',
    website: 'Abrir sitio',
    telegram: 'Abrir chat',
    tiktok: 'Abrir perfil',
    other: 'Abrir',
  };
  return labels[platform] ?? 'Abrir';
}

function labelFor(platform) {
  const labels = {
    instagram: 'Instagram',
    facebook: 'Facebook',
    x: 'X',
    whatsapp: 'WhatsApp',
    phone: 'Teléfono',
    email: 'Email',
    address: 'Dirección',
    website: 'Sitio web',
    telegram: 'Telegram',
    tiktok: 'TikTok',
    other: 'Contacto',
  };
  return labels[platform] ?? 'Contacto';
}

function stringOrEmpty(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function shorten(value, max) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function safeJsonForScript(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
