const nestedPage = window.location.pathname.includes('/panorama/');
const rootPrefix = nestedPage ? '../' : '';
const dataFiles = ['residential', 'commercial', 'government', 'interiors', 'panorama', 'knowledge', 'documents', 'videos'];
const dataCache = new Map();

const escapeHTML = (value = '') => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
}[character]));

const pathFor = (path = '') => {
  if (!path || /^(https?:|mailto:|tel:|#)/.test(path)) return path;
  return `${rootPrefix}${path}`;
};

const imageMarkup = (item, className = '') => {
  const source = item.image ? pathFor(item.image) : pathFor('assets/profile.jpg');
  const fallback = pathFor('assets/logo.png');
  return `<img class="${className}" src="${escapeHTML(source)}" alt="${escapeHTML(item.title || 'صورة مؤقتة')}" loading="lazy" data-fallback="${escapeHTML(fallback)}">`;
};

const linkMarkup = (href, label, className = '', options = '') => href
  ? `<a class="${className}" href="${escapeHTML(pathFor(href))}" ${options}>${label}</a>`
  : `<span class="${className} is-disabled" aria-disabled="true">${label}</span>`;

async function loadData(name) {
  if (dataCache.has(name)) return dataCache.get(name);
  const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const request = fetch(`${rootPrefix}data/${name}.json`)
    .then((response) => {
      if (!response.ok) throw new Error(`Unable to load ${name}.json`);
      return response.json();
    })
    .then((items) => {
      if (!Array.isArray(items)) return [];
      items.forEach(item => {
        item._section = name;
      });
      // On localhost: show all items (including drafts) so you can review before publishing
      // On GitHub Pages: only show published items
      const visibleItems = isLocalhost
        ? items
        : items.filter(item => !item.status || item.status === "published");
      return visibleItems;
    });
  dataCache.set(name, request);
  return request;
}

function asciiSlug(text) {
  if (!text) return '';
  return text
    .toString()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

function projectCard(item, index) {
  const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const isDraft = item.status && item.status !== 'published';

  // Draft badge shown only on localhost
  const draftBadge = (isLocalhost && isDraft)
    ? `<span style="position:absolute;top:8px;right:8px;background:#c0392b;color:#fff;font-size:10px;padding:3px 8px;border-radius:4px;font-weight:bold;z-index:10;letter-spacing:0.5px;">مسودة</span>`
    : '';

  let actions = '';
  if (item.video) {
    actions += `<a class="card-action-link" href="${escapeHTML(pathFor(item.video))}" target="_blank" rel="noopener">عرض الفيديو</a>`;
  }
  if (item.pdf) {
    actions += `<a class="card-action-link" href="${escapeHTML(pathFor(item.pdf))}" target="_blank" rel="noopener">ملف PDF</a>`;
  }
  if (item.gallery && Array.isArray(item.gallery) && item.gallery.length > 0) {
    actions += `<a class="card-action-link" href="${escapeHTML(pathFor(item.gallery[0]))}" target="_blank" rel="noopener">معرض الصور</a>`;
  }
  if (actions) {
    actions = `<div class="card-actions-mini">${actions}</div>`;
  }

  let cardUrl = item.url;
  const projectSections = ['commercial', 'residential', 'government', 'interiors', 'panorama'];
  if (item._section && projectSections.includes(item._section)) {
    const slug = item.slug || item.id || asciiSlug(item.title);
    // Draft items on localhost get the preview=1 parameter
    const previewParam = (isLocalhost && isDraft) ? '&preview=1' : '';
    if (slug) {
      cardUrl = `project-detail.html?section=${item._section}&id=${slug}${previewParam}`;
    } else {
      cardUrl = `project-detail.html?section=${item._section}&title=${encodeURIComponent(item.title)}${previewParam}`;
    }
  }
  const cardUrlPath = cardUrl ? escapeHTML(pathFor(cardUrl)) : '';

  if (!actions) {
    const body = `${draftBadge}${imageMarkup(item)}<div class="card-copy"><p>${escapeHTML(item.category || item.style)}</p><h3>${escapeHTML(item.title)}</h3><small lang="en" dir="ltr">${escapeHTML(item.subtitle)}</small><span>${String(index + 1).padStart(2, '0')}</span></div>`;
    const wrapper = cardUrl ? `<a class="project-card" href="${cardUrlPath}">${body}</a>` : `<article class="project-card">${body}</article>`;
    // Need position:relative on the wrapper for the badge
    return wrapper.replace('class="project-card"', 'class="project-card" style="position:relative;"');
  }

  const imagePart = cardUrl ? `<a class="project-card-image-link" href="${cardUrlPath}">${imageMarkup(item)}</a>` : imageMarkup(item);
  const titlePart = cardUrl ? `<a class="project-card-title-link" href="${cardUrlPath}">${escapeHTML(item.title)}</a>` : escapeHTML(item.title);

  const body = `${draftBadge}${imagePart}<div class="card-copy"><p>${escapeHTML(item.category || item.style)}</p><h3>${titlePart}</h3><small lang="en" dir="ltr">${escapeHTML(item.subtitle)}</small><span>${String(index + 1).padStart(2, '0')}</span>${actions}</div>`;

  return `<article class="project-card" style="position:relative;">${body}</article>`;
}


function panoramaCard(item) {
  const categoryIds = { Villas: 'villas', Bedrooms: 'bedrooms', Bathrooms: 'bathrooms', 'Cinema Rooms': 'cinema' };
  const id = categoryIds[item.category] || '';
  return `<article ${id ? `id="${id}"` : ''} class="tour-card">
    ${imageMarkup(item)}
    <div><p class="eyebrow">${escapeHTML(item.category)}</p><h2>${escapeHTML(item.title)}</h2><span lang="en" dir="ltr">${escapeHTML(item.subtitle)}</span>
    ${linkMarkup(item.panorama || item.url, 'فتح الجولة 360 ↗', 'button button-dark', 'target="_blank" rel="noopener"')}</div>
  </article>`;
}

function knowledgeCard(item) {
  return `<article class="knowledge-card">${imageMarkup(item)}<div>
    <span class="card-type">${escapeHTML(item.style || item.category)}</span>
    <h3>${escapeHTML(item.title)}</h3><p>${escapeHTML(item.description)}</p>
    <small lang="en" dir="ltr">${escapeHTML(item.subtitle)}</small>
    <div class="card-actions">
      ${linkMarkup(item.image, 'معاينة الصور', '', 'target="_blank" rel="noopener"')}
      ${linkMarkup(item.pdf, 'تحميل PDF', 'download', 'target="_blank" rel="noopener"')}
    </div></div></article>`;
}

function documentCard(item, index) {
  return `<article class="library-card">
    <div class="library-cover">${imageMarkup(item)}<span>${String(index + 1).padStart(2, '0')}</span></div>
    <div class="library-copy"><p class="eyebrow">${escapeHTML(item.style)}</p><h2>${escapeHTML(item.title)}</h2>
    <span lang="en" dir="ltr">${escapeHTML(item.subtitle)}</span><p>${escapeHTML(item.description)}</p>
    <div class="library-actions">
      ${linkMarkup(item.url || item.pdf, 'معاينة', '', 'target="_blank" rel="noopener"')}
      ${linkMarkup(item.pdf, 'تحميل', 'download', 'download')}
    </div></div></article>`;
}

async function renderContainer(container) {
  const type = container.dataset.render;
  const sourceNames = (container.dataset.sources || container.dataset.source || '').split(',').filter(Boolean);
  try {
    const collections = await Promise.all(sourceNames.map(loadData));
    let items = collections.flat();
    if (container.dataset.category) items = items.filter((item) => item.category === container.dataset.category);
    if (container.dataset.limit) items = items.slice(0, Number(container.dataset.limit));
    const renderer = type === 'panorama' ? panoramaCard : type === 'knowledge' ? knowledgeCard : type === 'documents' ? documentCard : projectCard;
    container.innerHTML = items.length
      ? items.map(renderer).join('')
      : '<p class="data-message">لا توجد عناصر منشورة في هذا القسم حالياً.</p>';
  } catch (error) {
    container.innerHTML = '<p class="data-message">تعذر تحميل المحتوى. يرجى تحديث الصفحة أو المحاولة لاحقاً.</p>';
    console.error(error);
  }
}

function installNavigation() {
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.site-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!open));
      nav.classList.toggle('is-open', !open);
    });
    nav.addEventListener('click', (event) => {
      if (!event.target.closest('a')) return;
      toggle.setAttribute('aria-expanded', 'false');
      nav.classList.remove('is-open');
    });
  }

  if (nav && !nav.querySelector('a[href$="knowledge-center.html"]')) {
    const link = document.createElement('a');
    link.href = `${rootPrefix}knowledge-center.html`;
    link.innerHTML = 'مركز المعرفة <span class="nav-en">Knowledge Center</span>';
    nav.insertBefore(link, nav.querySelector('a[href$="engineering-documents.html"]'));
  }
  if (nav && !nav.querySelector('a[href$="document-library.html"]')) {
    const link = document.createElement('a');
    link.href = `${rootPrefix}document-library.html`;
    link.innerHTML = 'مكتبة الوثائق <span class="nav-en">Document Library</span>';
    nav.insertBefore(link, nav.querySelector('a[href$="engineering-documents.html"]'));
  }
  document.querySelectorAll('.submenu-toggle').forEach((button) => {
    button.addEventListener('click', () => {
      const group = button.closest('.nav-group');
      const open = group.classList.toggle('open');
      button.setAttribute('aria-expanded', String(open));
    });
  });
}

function searchableText(item) {
  return [item.title, item.subtitle, item.category, item.style, item.location, item.description, ...(item.tags || [])]
    .filter(Boolean).join(' ').toLocaleLowerCase();
}

function searchResult(item, source) {
  const primary = item.url || item.panorama || item.pdf;
  const sourceLabels = {
    residential: 'مشروع سكني', commercial: 'مشروع تجاري', government: 'مشروع حكومي',
    interiors: 'تصميم داخلي', panorama: 'بانوراما 360', knowledge: 'مركز المعرفة',
    documents: 'مكتبة الوثائق', videos: 'فيديو'
  };
  return `<article class="search-result">${imageMarkup(item)}<div><span>${sourceLabels[source]}</span>
    <h3>${escapeHTML(item.title)}</h3><small lang="en" dir="ltr">${escapeHTML(item.subtitle)}</small>
    <p>${escapeHTML(item.description)}</p>${linkMarkup(primary, 'فتح العنصر ←', 'text-link', primary?.endsWith('.pdf') ? 'target="_blank" rel="noopener"' : '')}</div></article>`;
}

function installSearch() {
  const header = document.querySelector('.header-inner');
  if (!header) return;
  const button = document.createElement('button');
  button.className = 'search-toggle';
  button.type = 'button';
  button.setAttribute('aria-label', 'فتح البحث');
  button.textContent = '⌕';
  header.insertBefore(button, document.querySelector('.menu-toggle'));

  const panel = document.createElement('section');
  panel.className = 'search-panel';
  panel.hidden = true;
  panel.innerHTML = `<div class="search-shell"><button class="search-close" type="button" aria-label="إغلاق البحث">×</button>
    <p class="eyebrow">البحث في جميع محتويات المكتب</p><label for="global-search">ابحث عن مشروع أو دراسة أو وثيقة</label>
    <input id="global-search" type="search" placeholder="cinema, lighting, villa, BOQ, Revit..." autocomplete="off">
    <p class="search-hint">يبحث في العنوان، الفئة، الأسلوب، الموقع، الوصف، والكلمات المفتاحية.</p>
    <div class="search-results" aria-live="polite"></div></div>`;
  document.body.appendChild(panel);

  const input = panel.querySelector('input');
  const results = panel.querySelector('.search-results');
  const close = () => { panel.hidden = true; document.body.classList.remove('search-open'); };
  button.addEventListener('click', () => { panel.hidden = false; document.body.classList.add('search-open'); setTimeout(() => input.focus(), 0); });
  panel.querySelector('.search-close').addEventListener('click', close);
  panel.addEventListener('click', (event) => { if (event.target === panel) close(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });

  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const query = input.value.trim().toLocaleLowerCase();
      if (!query) { results.innerHTML = '<p class="data-message">ابدأ بكتابة كلمة للبحث.</p>'; return; }
      results.innerHTML = '<p class="data-message">جاري البحث...</p>';
      const settled = await Promise.all(dataFiles.map(async (source) => ({ source, items: await loadData(source).catch(() => []) })));
      const matches = settled.flatMap(({ source, items }) => items.filter((item) => searchableText(item).includes(query)).map((item) => ({ item, source })));
      results.innerHTML = matches.length
        ? matches.map(({ item, source }) => searchResult(item, source)).join('')
        : `<p class="data-message">لا توجد نتائج مطابقة لكلمة “${escapeHTML(input.value)}”.</p>`;
    }, 180);
  });
}

function installUtilities() {
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
  document.addEventListener('error', (event) => {
    if (event.target instanceof HTMLImageElement && event.target.dataset.fallback && !event.target.dataset.fallbackUsed) {
      event.target.dataset.fallbackUsed = 'true';
      event.target.src = event.target.dataset.fallback;
    }
  }, true);
  if (!document.querySelector('.whatsapp-float')) {
    const whatsapp = document.createElement('a');
    whatsapp.className = 'whatsapp-float';
    whatsapp.href = 'https://wa.me/9647801028055';
    whatsapp.target = '_blank';
    whatsapp.rel = 'noopener';
    whatsapp.setAttribute('aria-label', 'التواصل عبر واتساب');
    whatsapp.innerHTML = '<span class="whatsapp-icon" aria-hidden="true">WA</span><span class="whatsapp-label">تواصل عبر واتساب</span>';
    document.body.appendChild(whatsapp);
  }
  const contactForm = document.querySelector('[data-contact-form]');
  if (contactForm) contactForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(contactForm);
    const subject = encodeURIComponent(`Project inquiry from ${data.get('name') || 'website visitor'}`);
    const body = encodeURIComponent(`Name: ${data.get('name') || ''}\nPhone: ${data.get('phone') || ''}\n\n${data.get('message') || ''}`);
    window.location.href = `mailto:hassan6900@gmail.com?subject=${subject}&body=${body}`;
  });
}

function installFooterContacts() {
  document.querySelectorAll('.site-footer .shell').forEach((footer) => {
    if (footer.querySelector('.footer-contacts')) return;
    const contacts = document.createElement('nav');
    contacts.className = 'footer-contacts';
    contacts.setAttribute('aria-label', 'بيانات اتصال المكتب');
    contacts.innerHTML = `
      <a href="https://wa.me/9647801028055" target="_blank" rel="noopener" dir="ltr">+964 780 102 8055</a>
      <a href="mailto:hassan6900@gmail.com" dir="ltr">hassan6900@gmail.com</a>
      <a href="https://maps.app.goo.gl/ReywzMyjcvAn9D5c6" target="_blank" rel="noopener" lang="en" dir="ltr">Basra, Iraq</a>`;
    footer.appendChild(contacts);
  });
}

installNavigation();
installSearch();
installUtilities();
installFooterContacts();
document.querySelectorAll('[data-render]').forEach(renderContainer);

const styleSheet = document.createElement("style");
styleSheet.textContent = `
  .card-actions-mini {
    display: flex;
    gap: 8px;
    margin-top: 12px;
    flex-wrap: wrap;
  }
  .card-action-link {
    display: inline-block;
    padding: 4px 8px;
    font-size: 11px;
    font-weight: 600;
    color: var(--gold, #8f7b4b);
    border: 1px solid var(--gold, #8f7b4b);
    border-radius: 4px;
    text-decoration: none;
    background: transparent;
    transition: all 0.2s ease;
  }
  .card-action-link:hover {
    background: var(--gold, #8f7b4b);
    color: #fff !important;
  }
  .project-card h3 a {
    color: inherit;
    text-decoration: none;
  }
  .project-card h3 a:hover {
    color: var(--gold, #8f7b4b);
  }
  .project-card-image-link {
    display: block;
    width: 100%;
  }
`;
document.head.appendChild(styleSheet);
