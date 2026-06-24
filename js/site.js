const nestedPage = window.location.pathname.includes('/panorama/');
const rootPrefix = nestedPage ? '../' : '';
const dataFiles = ['residential', 'commercial', 'government', 'interiors', 'panorama', 'knowledge', 'documents'];
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
  const request = fetch(`${rootPrefix}data/${name}.json`)
    .then((response) => {
      if (!response.ok) throw new Error(`Unable to load ${name}.json`);
      return response.json();
    })
    .then((items) => Array.isArray(items) ? items : []);
  dataCache.set(name, request);
  return request;
}

function projectCard(item, index) {
  const body = `${imageMarkup(item)}<div class="card-copy"><p>${escapeHTML(item.category || item.style)}</p><h3>${escapeHTML(item.title)}</h3><small lang="en" dir="ltr">${escapeHTML(item.subtitle)}</small><span>${String(index + 1).padStart(2, '0')}</span></div>`;
  return item.url ? `<a class="project-card" href="${escapeHTML(pathFor(item.url))}">${body}</a>` : `<article class="project-card">${body}</article>`;
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
    interiors: 'تصميم داخلي', panorama: 'بانوراما 360', knowledge: 'مركز المعرفة', documents: 'مكتبة الوثائق'
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
