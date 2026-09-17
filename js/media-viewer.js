(function () {
  if (window.ArchMediaViewer) return;

  const core = window.ArchMediaCore || {};
  const viewerTypes = new Set(['image', 'gallery', 'video', 'pdf', 'heyzine', 'panorama', 'pano2vr']);
  const state = {
    isOpen: false,
    type: '',
    title: '',
    target: '',
    gallery: [],
    index: 0,
    viewerStyle: 'standard'
  };

  let elements = null;
  let pdfjsPromise = null;
  let pageFlipPromise = null;
  let pdfResizeTimer = null;
  const pdfState = {
    mode: 'standard',
    token: 0,
    loadingTask: null,
    document: null,
    renderTask: null,
    pageNumber: 1,
    totalPages: 0,
    scale: 1,
    fitWidth: true,
    canvas: null,
    flipbook: null,
    flipbookImages: new Map(),
    flipbookImageWidths: new Map(),
    flipbookPending: new Map(),
    flipbookPageWidth: 720,
    flipbookPageHeight: 980,
    flipbookPageAspectRatio: 1.414,
    pageFlipClass: null,
    flipbookLayoutSignature: '',
    flipbookRelayouting: false
  };

  function escapeHTML(value = '') {
    if (core.escapeHTML) return core.escapeHTML(value);
    return String(value).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[character]));
  }

  function resolvePath(path = '') {
    const value = String(path || '').trim();
    if (!value) return '';
    if (/^(https?:|mailto:|tel:|#|data:|blob:)/i.test(value)) return value;
    return core.pathFor ? core.pathFor(value) : value;
  }

  function isExternalUrl(url = '') {
    if (core.isExternalUrl) return core.isExternalUrl(url);
    return /^https?:\/\//i.test(String(url || '').trim());
  }

  function normalizeType(type = '') {
    if (core.normalizeMediaType) return core.normalizeMediaType(type);
    const normalized = String(type || '').trim().toLowerCase();
    return viewerTypes.has(normalized) ? normalized : '';
  }

  function isVideoFile(url = '') {
    return /\.(mp4|webm|mov)(?:[?#].*)?$/i.test(String(url || '').trim());
  }

  function getVideoMimeType(url = '') {
    const value = String(url || '').split('?')[0].split('#')[0].toLowerCase();
    if (value.endsWith('.webm')) return 'video/webm';
    if (value.endsWith('.mov')) return 'video/quicktime';
    return 'video/mp4';
  }

  function getEmbeddableVideoUrl(url = '') {
    const value = String(url || '').trim();
    if (!isExternalUrl(value)) return '';

    try {
      const parsed = new URL(value);
      const hostname = parsed.hostname.replace(/^www\./i, '').toLowerCase();

      if (hostname === 'youtu.be') {
        const id = parsed.pathname.split('/').filter(Boolean)[0];
        return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` : '';
      }

      if (hostname === 'youtube.com' || hostname === 'm.youtube.com' || hostname === 'youtube-nocookie.com') {
        const watchId = parsed.searchParams.get('v');
        const parts = parsed.pathname.split('/').filter(Boolean);
        const embedIndex = parts.indexOf('embed');
        const shortsIndex = parts.indexOf('shorts');
        const id = watchId || (embedIndex >= 0 ? parts[embedIndex + 1] : '') || (shortsIndex >= 0 ? parts[shortsIndex + 1] : '');
        return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` : '';
      }

      if (hostname === 'vimeo.com' || hostname === 'player.vimeo.com') {
        const parts = parsed.pathname.split('/').filter(Boolean);
        const id = parts.find(part => /^\d+$/.test(part));
        return id ? `https://player.vimeo.com/video/${encodeURIComponent(id)}` : '';
      }
    } catch (error) {
      return '';
    }

    return '';
  }

  function parseGallery(value = '') {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch (error) {
      return [];
    }
  }

  function absoluteUrl(path = '') {
    return new URL(resolvePath(path), window.location.href).href;
  }

  function getPdfjsAssetPath(path = '') {
    return absoluteUrl(`assets/pdfjs/${path}`);
  }

  function getPageFlipAssetPath(path = '') {
    return absoluteUrl(`assets/pageflip/${path}`);
  }

  function isUnsafePdfPath(path = '') {
    const value = String(path || '').trim();
    return /^(?:[a-z]:[\\/]|file:)/i.test(value)
      || /(^|[\\/])\.\.([\\/]|$)/.test(value)
      || /(?:^|[\\/])_imports(?:[\\/]|$)/i.test(value)
      || /(?:^|[\\/])_publish_inbox(?:[\\/]|$)/i.test(value);
  }

  function isSafePdfTarget(path = '') {
    const value = String(path || '').trim();
    if (!value || isUnsafePdfPath(value)) return false;
    if (/^(?:mailto:|tel:|#|data:|blob:)/i.test(value)) return false;
    return /\.pdf(?:[?#].*)?$/i.test(value);
  }

  function isPdfCancelError(error) {
    return error && (
      error.name === 'RenderingCancelledException'
      || error.name === 'AbortException'
      || /cancel/i.test(String(error.message || ''))
    );
  }

  function loadPdfjs() {
    if (!pdfjsPromise) {
      pdfjsPromise = import(getPdfjsAssetPath('build/pdf.min.mjs')).then((pdfjsLib) => {
        pdfjsLib.GlobalWorkerOptions.workerSrc = getPdfjsAssetPath('build/pdf.worker.min.mjs');
        return pdfjsLib;
      });
    }
    return pdfjsPromise;
  }

  function loadPageFlip() {
    if (window.St && window.St.PageFlip) return Promise.resolve(window.St.PageFlip);
    if (!pageFlipPromise) {
      pageFlipPromise = new Promise((resolve, reject) => {
        const existing = document.getElementById('arch-pageflip-js');
        if (existing) {
          existing.addEventListener('load', () => resolve(window.St && window.St.PageFlip), { once: true });
          existing.addEventListener('error', reject, { once: true });
          return;
        }

        const script = document.createElement('script');
        script.id = 'arch-pageflip-js';
        script.src = getPageFlipAssetPath('page-flip.browser.js');
        script.defer = true;
        script.addEventListener('load', () => {
          if (window.St && window.St.PageFlip) resolve(window.St.PageFlip);
          else reject(new Error('PageFlip library did not expose St.PageFlip'));
        }, { once: true });
        script.addEventListener('error', reject, { once: true });
        document.body.appendChild(script);
      });
    }
    return pageFlipPromise;
  }

  function normalizeViewerStyle(style = '') {
    const normalized = String(style || '').trim().toLowerCase();
    return normalized === 'flipbook' ? 'flipbook' : 'standard';
  }

  function viewerStyleFromLocation() {
    const params = new URLSearchParams(window.location.search);
    return normalizeViewerStyle(params.get('viewerStyle') || params.get('pdfViewer') || params.get('pdfMode') || (params.get('flipbook') === '1' ? 'flipbook' : ''));
  }

  function ensureViewer() {
    if (elements) return elements;

    const viewer = document.createElement('section');
    viewer.className = 'arch-media-viewer';
    viewer.hidden = true;
    viewer.setAttribute('role', 'dialog');
    viewer.setAttribute('aria-modal', 'true');
    viewer.setAttribute('aria-label', 'عارض الوسائط');
    viewer.innerHTML = `
      <div class="arch-media-viewer__dialog" role="document">
        <header class="arch-media-viewer__header">
          <h2 class="arch-media-viewer__title"></h2>
          <button class="arch-media-viewer__close" type="button" aria-label="إغلاق">×</button>
        </header>
        <div class="arch-media-viewer__media"></div>
        <footer class="arch-media-viewer__footer">
          <div class="arch-media-viewer__actions">
            <a class="arch-media-viewer__button arch-media-viewer__open" href="#" target="_blank" rel="noopener">فتح في تبويب جديد</a>
            <button class="arch-media-viewer__button arch-media-viewer__fullscreen" type="button">ملء الشاشة</button>
          </div>
          <div class="arch-media-viewer__pdf-controls" hidden>
            <button class="arch-media-viewer__button arch-media-viewer__pdf-prev" type="button">الصفحة السابقة</button>
            <span class="arch-media-viewer__pdf-page" aria-live="polite">0 / 0</span>
            <button class="arch-media-viewer__button arch-media-viewer__pdf-next" type="button">الصفحة التالية</button>
            <button class="arch-media-viewer__button arch-media-viewer__pdf-zoom-out" type="button">تصغير</button>
            <span class="arch-media-viewer__pdf-zoom" aria-live="polite">100%</span>
            <button class="arch-media-viewer__button arch-media-viewer__pdf-zoom-in" type="button">تكبير</button>
            <button class="arch-media-viewer__button arch-media-viewer__pdf-fit" type="button">Fit Width</button>
          </div>
          <span class="arch-media-viewer__counter" aria-live="polite"></span>
        </footer>
      </div>
      <button class="arch-media-viewer__nav arch-media-viewer__nav--prev" type="button" aria-label="الصورة السابقة">‹</button>
      <button class="arch-media-viewer__nav arch-media-viewer__nav--next" type="button" aria-label="الصورة التالية">›</button>
    `;
    document.body.appendChild(viewer);

    elements = {
      viewer,
      dialog: viewer.querySelector('.arch-media-viewer__dialog'),
      media: viewer.querySelector('.arch-media-viewer__media'),
      title: viewer.querySelector('.arch-media-viewer__title'),
      close: viewer.querySelector('.arch-media-viewer__close'),
      prev: viewer.querySelector('.arch-media-viewer__nav--prev'),
      next: viewer.querySelector('.arch-media-viewer__nav--next'),
      counter: viewer.querySelector('.arch-media-viewer__counter'),
      open: viewer.querySelector('.arch-media-viewer__open'),
      fullscreen: viewer.querySelector('.arch-media-viewer__fullscreen'),
      pdfControls: viewer.querySelector('.arch-media-viewer__pdf-controls'),
      pdfPrev: viewer.querySelector('.arch-media-viewer__pdf-prev'),
      pdfNext: viewer.querySelector('.arch-media-viewer__pdf-next'),
      pdfZoomOut: viewer.querySelector('.arch-media-viewer__pdf-zoom-out'),
      pdfZoomIn: viewer.querySelector('.arch-media-viewer__pdf-zoom-in'),
      pdfFit: viewer.querySelector('.arch-media-viewer__pdf-fit'),
      pdfPage: viewer.querySelector('.arch-media-viewer__pdf-page'),
      pdfZoom: viewer.querySelector('.arch-media-viewer__pdf-zoom')
    };

    elements.close.addEventListener('click', close);
    elements.prev.addEventListener('click', previous);
    elements.next.addEventListener('click', next);
    elements.fullscreen.addEventListener('click', requestFullscreen);
    elements.pdfPrev.addEventListener('click', previousPdfPage);
    elements.pdfNext.addEventListener('click', nextPdfPage);
    elements.pdfZoomOut.addEventListener('click', () => zoomPdf(-0.15));
    elements.pdfZoomIn.addEventListener('click', () => zoomPdf(0.15));
    elements.pdfFit.addEventListener('click', fitPdfWidth);
    elements.viewer.addEventListener('click', (event) => {
      if (event.target === elements.viewer) close();
    });

    return elements;
  }

  function setCommonUi({ title, target, showOpen = true, showFullscreen = false }) {
    const ui = ensureViewer();
    ui.title.textContent = title || 'عرض المحتوى';
    ui.open.href = target || '#';
    ui.open.hidden = !showOpen || !target;
    ui.fullscreen.hidden = !showFullscreen;
  }

  function setGalleryUi() {
    const ui = ensureViewer();
    const hasMany = state.gallery.length > 1;
    ui.prev.hidden = !hasMany;
    ui.next.hidden = !hasMany;
    ui.counter.hidden = !hasMany;
    ui.counter.textContent = hasMany ? `${state.index + 1} / ${state.gallery.length}` : '';
  }

  function disposeFlipbookInstance() {
    if (!pdfState.flipbook) return;
    try {
      if (typeof pdfState.flipbook.clear === 'function') {
        pdfState.flipbook.clear();
      } else if (typeof pdfState.flipbook.destroy === 'function') {
        pdfState.flipbook.destroy();
      }
    } catch (error) {}
    pdfState.flipbook = null;
  }

  function resetPdfState() {
    pdfState.token += 1;

    window.clearTimeout(pdfResizeTimer);
    disposeFlipbookInstance();

    if (pdfState.renderTask && typeof pdfState.renderTask.cancel === 'function') {
      try { pdfState.renderTask.cancel(); } catch (error) {}
    }

    if (pdfState.loadingTask && typeof pdfState.loadingTask.destroy === 'function') {
      try { pdfState.loadingTask.destroy(); } catch (error) {}
    }

    if (pdfState.document && typeof pdfState.document.destroy === 'function') {
      try { pdfState.document.destroy(); } catch (error) {}
    }

    pdfState.mode = 'standard';
    pdfState.loadingTask = null;
    pdfState.document = null;
    pdfState.renderTask = null;
    pdfState.pageNumber = 1;
    pdfState.totalPages = 0;
    pdfState.scale = 1;
    pdfState.fitWidth = true;
    pdfState.canvas = null;
    pdfState.flipbook = null;
    pdfState.flipbookImages.clear();
    pdfState.flipbookImageWidths.clear();
    pdfState.flipbookPending.clear();
    pdfState.flipbookPageWidth = 720;
    pdfState.flipbookPageHeight = 980;
    pdfState.flipbookPageAspectRatio = 1.414;
    pdfState.pageFlipClass = null;
    pdfState.flipbookLayoutSignature = '';
    pdfState.flipbookRelayouting = false;
  }

  function updatePdfControls() {
    const ui = ensureViewer();
    const hasDocument = Boolean(pdfState.document);
    ui.pdfControls.hidden = false;
    ui.pdfPage.textContent = hasDocument ? `${pdfState.pageNumber} / ${pdfState.totalPages}` : '0 / 0';
    ui.pdfZoom.textContent = `${Math.round(pdfState.scale * 100)}%`;
    ui.pdfPrev.disabled = !hasDocument || pdfState.pageNumber <= 1;
    ui.pdfNext.disabled = !hasDocument || pdfState.pageNumber >= pdfState.totalPages;
    const isFlipbook = pdfState.mode === 'flipbook';
    ui.pdfZoomOut.hidden = isFlipbook;
    ui.pdfZoom.hidden = isFlipbook;
    ui.pdfZoomIn.hidden = isFlipbook;
    ui.pdfFit.hidden = isFlipbook;
    ui.pdfZoomOut.disabled = !hasDocument || pdfState.scale <= 0.45;
    ui.pdfZoomIn.disabled = !hasDocument || pdfState.scale >= 3;
    ui.pdfFit.disabled = !hasDocument;
  }

  function showPdfMessage(message, isError = false) {
    const ui = ensureViewer();
    ui.media.innerHTML = `<div class="arch-media-viewer__pdf-status${isError ? ' is-error' : ''}">${escapeHTML(message)}</div>`;
  }

  function clearMedia() {
    const ui = ensureViewer();
    resetPdfState();
    ui.media.innerHTML = '';
    ui.prev.hidden = true;
    ui.next.hidden = true;
    ui.counter.hidden = true;
    ui.pdfControls.hidden = true;
    ui.fullscreen.hidden = true;
    ui.open.hidden = true;
    ui.open.removeAttribute('href');
  }

  function renderGallery() {
    const ui = ensureViewer();
    const target = state.gallery[state.index] || state.target;
    const resolved = resolvePath(target);
    setCommonUi({ title: state.title, target: resolved, showOpen: true, showFullscreen: false });
    ui.media.innerHTML = `<img src="${escapeHTML(resolved)}" alt="${escapeHTML(state.title || 'صورة')}" loading="eager">`;
    setGalleryUi();
  }

  function renderVideo() {
    const ui = ensureViewer();
    const resolved = resolvePath(state.target);
    const embedUrl = getEmbeddableVideoUrl(resolved);
    setCommonUi({ title: state.title, target: resolved, showOpen: true, showFullscreen: Boolean(embedUrl) });
    ui.prev.hidden = true;
    ui.next.hidden = true;
    ui.counter.hidden = true;

    if (embedUrl) {
      ui.media.innerHTML = `<iframe src="${escapeHTML(embedUrl)}" title="${escapeHTML(state.title || 'فيديو')}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;
      return;
    }

    if (isVideoFile(resolved)) {
      ui.media.innerHTML = `<video controls preload="metadata" autoplay><source src="${escapeHTML(resolved)}" type="${escapeHTML(getVideoMimeType(resolved))}">المتصفح الخاص بك لا يدعم تشغيل الفيديو.</video>`;
      return;
    }

    ui.media.innerHTML = `<p class="arch-media-viewer__message">لا يمكن تشغيل هذا الفيديو داخل العارض. استخدم زر فتح في تبويب جديد.</p>`;
  }

  function renderFrame(label = 'عرض المحتوى') {
    const ui = ensureViewer();
    const resolved = resolvePath(state.target);
    setCommonUi({ title: state.title, target: resolved, showOpen: true, showFullscreen: true });
    ui.prev.hidden = true;
    ui.next.hidden = true;
    ui.counter.hidden = true;
    ui.media.innerHTML = `<iframe src="${escapeHTML(resolved)}" title="${escapeHTML(state.title || label)}" loading="lazy" allowfullscreen></iframe>`;
  }

  async function renderPdfPage({ fitWidth = pdfState.fitWidth } = {}) {
    const ui = ensureViewer();
    const canvas = pdfState.canvas || ui.media.querySelector('canvas');
    const scroller = ui.media.querySelector('.arch-media-viewer__pdf-scroller') || ui.media;
    const documentRef = pdfState.document;
    const token = pdfState.token;

    if (!canvas || !documentRef || token !== pdfState.token) return;

    if (pdfState.renderTask && typeof pdfState.renderTask.cancel === 'function') {
      try { pdfState.renderTask.cancel(); } catch (error) {}
    }

    try {
      const page = await documentRef.getPage(pdfState.pageNumber);
      if (!state.isOpen || state.type !== 'pdf' || token !== pdfState.token) return;

      const baseViewport = page.getViewport({ scale: 1 });
      if (fitWidth) {
        const availableWidth = Math.max(260, scroller.clientWidth - 32);
        pdfState.scale = Math.max(0.45, Math.min(3, availableWidth / baseViewport.width));
        pdfState.fitWidth = true;
      }

      const viewport = page.getViewport({ scale: pdfState.scale });
      const ratio = window.devicePixelRatio || 1;
      const context = canvas.getContext('2d', { alpha: false });

      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.fillStyle = '#fff';
      context.fillRect(0, 0, viewport.width, viewport.height);

      updatePdfControls();
      pdfState.renderTask = page.render({ canvasContext: context, viewport });
      await pdfState.renderTask.promise;
      if (token === pdfState.token) pdfState.renderTask = null;
    } catch (error) {
      if (isPdfCancelError(error)) return;
      if (state.isOpen && state.type === 'pdf' && token === pdfState.token) {
        showPdfMessage('تعذر رسم صفحة PDF داخل العارض.', true);
      }
    }
  }

  async function renderPdf() {
    if (state.viewerStyle === 'flipbook') {
      renderPdfFlipbook();
      return;
    }

    const ui = ensureViewer();
    const target = String(state.target || '').trim();
    const token = pdfState.token + 1;
    resetPdfState();
    pdfState.token = token;
    pdfState.mode = 'standard';
    setCommonUi({ title: state.title, target: '', showOpen: false, showFullscreen: true });
    ui.prev.hidden = true;
    ui.next.hidden = true;
    ui.counter.hidden = true;
    ui.pdfControls.hidden = false;
    ui.media.innerHTML = `
      <div class="arch-media-viewer__pdf-shell">
        <div class="arch-media-viewer__pdf-scroller">
          <canvas class="arch-media-viewer__pdf-canvas" aria-label="${escapeHTML(state.title || 'ملف PDF')}"></canvas>
        </div>
        <div class="arch-media-viewer__pdf-status">جاري تحميل ملف PDF...</div>
      </div>`;
    pdfState.canvas = ui.media.querySelector('canvas');
    updatePdfControls();

    if (!isSafePdfTarget(target)) {
      showPdfMessage('خطأ: مسار PDF غير آمن أو غير مدعوم. استخدم مسارًا نسبيًا داخل الموقع فقط.', true);
      return;
    }

    try {
      const pdfjsLib = await loadPdfjs();
      if (!state.isOpen || state.type !== 'pdf' || token !== pdfState.token) return;

      pdfState.loadingTask = pdfjsLib.getDocument({
        url: absoluteUrl(target),
        cMapUrl: getPdfjsAssetPath('cmaps/'),
        cMapPacked: true,
        standardFontDataUrl: getPdfjsAssetPath('standard_fonts/'),
        wasmUrl: getPdfjsAssetPath('wasm/'),
        iccUrl: getPdfjsAssetPath('iccs/'),
        useSystemFonts: true
      });

      pdfState.document = await pdfState.loadingTask.promise;
      if (!state.isOpen || state.type !== 'pdf' || token !== pdfState.token) return;

      pdfState.pageNumber = 1;
      pdfState.totalPages = pdfState.document.numPages || 1;
      pdfState.scale = 1;
      pdfState.fitWidth = true;
      const status = ui.media.querySelector('.arch-media-viewer__pdf-status');
      if (status) status.hidden = true;
      updatePdfControls();
      await renderPdfPage({ fitWidth: true });
    } catch (error) {
      if (isPdfCancelError(error)) return;
      if (state.isOpen && state.type === 'pdf' && token === pdfState.token) {
        showPdfMessage('تعذر تحميل ملف PDF داخل العارض. تأكد أن الملف موجود داخل مجلد الموقع وبمسار نسبي صحيح.', true);
      }
    }
  }

  function updateFlipbookPageImage(pageNumber, src) {
    const ui = ensureViewer();
    ui.media.querySelectorAll(`[data-flipbook-page="${pageNumber}"]`).forEach((pageElement) => {
      const image = pageElement.querySelector('img');
      const loader = pageElement.querySelector('.arch-media-viewer__flipbook-page-loader');
      if (image) {
        image.src = src;
        image.hidden = false;
      }
      if (loader) loader.hidden = true;
    });
  }

  function getInnerSize(element) {
    if (!element) return { width: 320, height: 420 };
    const styles = window.getComputedStyle(element);
    const horizontalPadding = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
    const verticalPadding = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
    return {
      width: Math.max(240, Math.floor(element.clientWidth - horizontalPadding)),
      height: Math.max(260, Math.floor(element.clientHeight - verticalPadding))
    };
  }

  function calculateFlipbookLayout() {
    const ui = ensureViewer();
    const shell = ui.media.querySelector('.arch-media-viewer__flipbook-shell') || ui.media;
    const available = getInnerSize(shell);
    const pageAspectRatio = Math.max(0.2, Number(pdfState.flipbookPageAspectRatio) || 1.414);
    const narrow = window.matchMedia('(max-width: 720px)').matches || available.width < 760;
    let pagesPerSpread = narrow ? 1 : 2;

    let pageWidth = Math.floor(Math.min(
      available.width / pagesPerSpread,
      available.height / pageAspectRatio
    ));
    let pageHeight = Math.floor(pageWidth * pageAspectRatio);

    if (!narrow && pageWidth < 320 && available.width < 980) {
      pagesPerSpread = 1;
      pageWidth = Math.floor(Math.min(available.width, available.height / pageAspectRatio));
      pageHeight = Math.floor(pageWidth * pageAspectRatio);
    }

    if (pageHeight > available.height) {
      pageHeight = available.height;
      pageWidth = Math.floor(pageHeight / pageAspectRatio);
    }
    if (pageWidth * pagesPerSpread > available.width) {
      pageWidth = Math.floor(available.width / pagesPerSpread);
      pageHeight = Math.floor(pageWidth * pageAspectRatio);
    }

    pageWidth = Math.max(160, pageWidth);
    pageHeight = Math.max(160, pageHeight);

    return {
      availableWidth: available.width,
      availableHeight: available.height,
      pagesPerSpread,
      pageWidth,
      pageHeight,
      bookWidth: pageWidth * pagesPerSpread,
      bookHeight: pageHeight,
      signature: `${available.width}x${available.height}:${pagesPerSpread}:${pageWidth}x${pageHeight}`
    };
  }

  function flipbookPageMarkup(pageNumber) {
    const src = pdfState.flipbookImages.get(pageNumber) || '';
    return `
      <div class="arch-media-viewer__flipbook-page" data-flipbook-page="${pageNumber}">
        <img alt="${escapeHTML(`${state.title || 'PDF'} - ${pageNumber}`)}" ${src ? `src="${escapeHTML(src)}"` : 'hidden'}>
        <span class="arch-media-viewer__flipbook-page-loader" ${src ? 'hidden' : ''}>صفحة ${pageNumber}</span>
      </div>`;
  }

  function rebuildFlipbook(PageFlip, pageIndex = 0, { force = false } = {}) {
    if (!PageFlip || !pdfState.document || pdfState.mode !== 'flipbook') return false;
    const ui = ensureViewer();
    const shell = ui.media.querySelector('.arch-media-viewer__flipbook-shell');
    if (!shell) return false;

    const layout = calculateFlipbookLayout();
    if (!force && pdfState.flipbook && pdfState.flipbookLayoutSignature === layout.signature) {
      if (typeof pdfState.flipbook.update === 'function') {
        try { pdfState.flipbook.update(); } catch (error) {}
      }
      return false;
    }

    const currentIndex = Math.max(0, Math.min(
      Number.isFinite(Number(pageIndex)) ? Number(pageIndex) : Math.max(0, pdfState.pageNumber - 1),
      Math.max(0, pdfState.totalPages - 1)
    ));

    disposeFlipbookInstance();

    const oldBook = shell.querySelector('.arch-media-viewer__flipbook-book');
    if (oldBook) oldBook.remove();

    const book = document.createElement('div');
    book.className = 'arch-media-viewer__flipbook-book';
    book.dir = 'ltr';
    book.style.width = `${layout.bookWidth}px`;
    book.style.height = `${layout.bookHeight}px`;
    book.style.maxWidth = '100%';
    book.innerHTML = Array.from({ length: pdfState.totalPages }, (_, index) => flipbookPageMarkup(index + 1)).join('');
    shell.appendChild(book);

    pdfState.flipbookPageWidth = layout.pageWidth;
    pdfState.flipbookPageHeight = layout.pageHeight;
    pdfState.flipbookLayoutSignature = layout.signature;
    pdfState.scale = Math.max(0.1, Math.min(3, layout.pageWidth / 720));

    pdfState.flipbook = new PageFlip(book, {
      width: layout.pageWidth,
      height: layout.pageHeight,
      size: 'fixed',
      drawShadow: true,
      flippingTime: 750,
      usePortrait: true,
      startPage: currentIndex,
      autoSize: false,
      maxShadowOpacity: 0.45,
      showCover: false,
      mobileScrollSupport: true,
      swipeDistance: 28,
      useMouseEvents: true
    });

    pdfState.flipbook.on('init', syncFlipbookControls);
    pdfState.flipbook.on('flip', syncFlipbookControls);
    pdfState.flipbook.on('changeOrientation', syncFlipbookControls);
    pdfState.flipbook.loadFromHTML(book.querySelectorAll('.arch-media-viewer__flipbook-page'));

    if (currentIndex > 0 && typeof pdfState.flipbook.turnToPage === 'function') {
      window.setTimeout(() => {
        if (pdfState.flipbook && pdfState.mode === 'flipbook') {
          try { pdfState.flipbook.turnToPage(currentIndex); } catch (error) {}
          syncFlipbookControls();
        }
      }, 80);
    }

    pdfState.pageNumber = currentIndex + 1;
    updatePdfControls();
    renderNearbyFlipbookPages();
    return true;
  }

  function relayoutFlipbook({ force = false } = {}) {
    if (!state.isOpen || state.type !== 'pdf' || pdfState.mode !== 'flipbook' || !pdfState.document) return;
    if (pdfState.flipbookRelayouting) return;
    pdfState.flipbookRelayouting = true;

    Promise.resolve(pdfState.pageFlipClass || loadPageFlip())
      .then((PageFlip) => {
        if (!state.isOpen || state.type !== 'pdf' || pdfState.mode !== 'flipbook') return;
        pdfState.pageFlipClass = PageFlip;
        const currentIndex = pdfState.flipbook && typeof pdfState.flipbook.getCurrentPageIndex === 'function'
          ? pdfState.flipbook.getCurrentPageIndex()
          : Math.max(0, pdfState.pageNumber - 1);
        rebuildFlipbook(PageFlip, currentIndex, { force });
      })
      .catch(() => {})
      .finally(() => {
        pdfState.flipbookRelayouting = false;
      });
  }

  async function renderFlipbookPageImage(pageNumber, token = pdfState.token) {
    if (!pdfState.document || pageNumber < 1 || pageNumber > pdfState.totalPages) return '';
    const desiredImageWidth = Math.max(420, Math.min(1800, pdfState.flipbookPageWidth * 1.35));
    const cachedWidth = Number(pdfState.flipbookImageWidths.get(pageNumber) || 0);
    if (pdfState.flipbookImages.has(pageNumber) && cachedWidth >= desiredImageWidth * 0.9) {
      return pdfState.flipbookImages.get(pageNumber);
    }
    if (pdfState.flipbookPending.has(pageNumber)) return pdfState.flipbookPending.get(pageNumber);

    const renderPromise = (async () => {
      const page = await pdfState.document.getPage(pageNumber);
      if (!state.isOpen || state.type !== 'pdf' || pdfState.mode !== 'flipbook' || token !== pdfState.token) return '';

      const baseViewport = page.getViewport({ scale: 1 });
      const viewportScale = Math.max(0.6, Math.min(2.4, desiredImageWidth / baseViewport.width));
      const viewport = page.getViewport({ scale: viewportScale });
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d', { alpha: false });

      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.fillStyle = '#fff';
      context.fillRect(0, 0, viewport.width, viewport.height);

      await page.render({ canvasContext: context, viewport }).promise;
      if (!state.isOpen || state.type !== 'pdf' || pdfState.mode !== 'flipbook' || token !== pdfState.token) return '';

      const src = canvas.toDataURL('image/jpeg', 0.88);
      pdfState.flipbookImages.set(pageNumber, src);
      pdfState.flipbookImageWidths.set(pageNumber, desiredImageWidth);
      updateFlipbookPageImage(pageNumber, src);
      return src;
    })().catch((error) => {
      if (!isPdfCancelError(error)) {
        const ui = ensureViewer();
        const loader = ui.media.querySelector(`[data-flipbook-page="${pageNumber}"] .arch-media-viewer__flipbook-page-loader`);
        if (loader) loader.textContent = 'تعذر تحميل الصفحة';
      }
      return '';
    }).finally(() => {
      pdfState.flipbookPending.delete(pageNumber);
    });

    pdfState.flipbookPending.set(pageNumber, renderPromise);
    return renderPromise;
  }

  function renderNearbyFlipbookPages() {
    if (!pdfState.document || pdfState.mode !== 'flipbook') return;
    const start = pdfState.pageNumber;
    const wanted = new Set([start - 2, start - 1, start, start + 1, start + 2, start + 3]);
    wanted.forEach((pageNumber) => {
      if (pageNumber >= 1 && pageNumber <= pdfState.totalPages) {
        renderFlipbookPageImage(pageNumber);
      }
    });
  }

  function syncFlipbookControls() {
    if (pdfState.flipbook && typeof pdfState.flipbook.getCurrentPageIndex === 'function') {
      pdfState.pageNumber = Math.min(pdfState.totalPages, Math.max(1, pdfState.flipbook.getCurrentPageIndex() + 1));
    }
    updatePdfControls();
    renderNearbyFlipbookPages();
  }

  async function renderPdfFlipbook() {
    const ui = ensureViewer();
    const target = String(state.target || '').trim();
    const token = pdfState.token + 1;
    resetPdfState();
    pdfState.token = token;
    pdfState.mode = 'flipbook';
    setCommonUi({ title: state.title, target: '', showOpen: false, showFullscreen: true });
    ui.prev.hidden = true;
    ui.next.hidden = true;
    ui.counter.hidden = true;
    ui.pdfControls.hidden = false;
    ui.media.innerHTML = `
      <div class="arch-media-viewer__flipbook-shell">
        <div class="arch-media-viewer__flipbook-status">جاري تجهيز الكتاب التفاعلي...</div>
        <div class="arch-media-viewer__flipbook-book" dir="ltr"></div>
      </div>`;
    updatePdfControls();

    if (!isSafePdfTarget(target)) {
      showPdfMessage('خطأ: مسار PDF غير آمن أو غير مدعوم. استخدم مسارًا نسبيًا داخل الموقع فقط.', true);
      return;
    }

    try {
      const [pdfjsLib, PageFlip] = await Promise.all([loadPdfjs(), loadPageFlip()]);
      if (!state.isOpen || state.type !== 'pdf' || pdfState.mode !== 'flipbook' || token !== pdfState.token) return;

      pdfState.loadingTask = pdfjsLib.getDocument({
        url: absoluteUrl(target),
        cMapUrl: getPdfjsAssetPath('cmaps/'),
        cMapPacked: true,
        standardFontDataUrl: getPdfjsAssetPath('standard_fonts/'),
        wasmUrl: getPdfjsAssetPath('wasm/'),
        iccUrl: getPdfjsAssetPath('iccs/'),
        useSystemFonts: true
      });

      pdfState.document = await pdfState.loadingTask.promise;
      if (!state.isOpen || state.type !== 'pdf' || pdfState.mode !== 'flipbook' || token !== pdfState.token) return;

      pdfState.totalPages = pdfState.document.numPages || 1;
      pdfState.pageNumber = 1;

      const firstPage = await pdfState.document.getPage(1);
      const firstViewport = firstPage.getViewport({ scale: 1 });
      pdfState.flipbookPageAspectRatio = Math.max(0.2, firstViewport.height / firstViewport.width);
      pdfState.pageFlipClass = PageFlip;
      rebuildFlipbook(PageFlip, 0, { force: true });

      const status = ui.media.querySelector('.arch-media-viewer__flipbook-status');
      await renderFlipbookPageImage(1, token);
      if (status && token === pdfState.token) {
        status.textContent = 'يمكنك السحب أو استخدام أزرار الصفحات.';
        window.setTimeout(() => {
          if (status && token === pdfState.token) status.hidden = true;
        }, 1600);
      }
    } catch (error) {
      if (isPdfCancelError(error)) return;
      if (state.isOpen && state.type === 'pdf' && token === pdfState.token) {
        showPdfMessage('تعذر تجهيز Flipbook المحلي. تأكد أن ملفات PDF.js وPageFlip موجودة داخل المشروع.', true);
      }
    }
  }

  function previousPdfPage() {
    if (pdfState.mode === 'flipbook') {
      if (!pdfState.flipbook || pdfState.pageNumber <= 1) return;
      pdfState.flipbook.flipPrev('top');
      window.setTimeout(syncFlipbookControls, 820);
      return;
    }
    if (!pdfState.document || pdfState.pageNumber <= 1) return;
    pdfState.pageNumber -= 1;
    renderPdfPage({ fitWidth: pdfState.fitWidth });
  }

  function nextPdfPage() {
    if (pdfState.mode === 'flipbook') {
      if (!pdfState.flipbook || pdfState.pageNumber >= pdfState.totalPages) return;
      pdfState.flipbook.flipNext('top');
      window.setTimeout(syncFlipbookControls, 820);
      return;
    }
    if (!pdfState.document || pdfState.pageNumber >= pdfState.totalPages) return;
    pdfState.pageNumber += 1;
    renderPdfPage({ fitWidth: pdfState.fitWidth });
  }

  function zoomPdf(delta = 0) {
    if (!pdfState.document) return;
    pdfState.fitWidth = false;
    pdfState.scale = Math.max(0.45, Math.min(3, pdfState.scale + delta));
    renderPdfPage({ fitWidth: false });
  }

  function fitPdfWidth() {
    if (!pdfState.document) return;
    pdfState.fitWidth = true;
    renderPdfPage({ fitWidth: true });
  }

  function resizePdfViewer({ force = false } = {}) {
    if (!state.isOpen || state.type !== 'pdf' || !pdfState.document) return;
    if (pdfState.mode === 'flipbook') {
      relayoutFlipbook({ force });
      return;
    }
    if (pdfState.fitWidth) {
      renderPdfPage({ fitWidth: true });
    }
  }

  function schedulePdfViewerResize(delay = 160, { force = false } = {}) {
    window.clearTimeout(pdfResizeTimer);
    pdfResizeTimer = window.setTimeout(() => resizePdfViewer({ force }), delay);
  }

  function renderCurrent() {
    clearMedia();

    if (state.type === 'gallery' || state.type === 'image') {
      renderGallery();
      return;
    }

    if (state.type === 'video') {
      renderVideo();
      return;
    }

    if (state.type === 'pdf') {
      renderPdf();
      return;
    }

    if (state.type === 'heyzine') {
      renderFrame('Heyzine');
      return;
    }

    if (state.type === 'panorama' || state.type === 'pano2vr') {
      renderFrame(state.type === 'pano2vr' ? 'Pano2VR' : 'بانوراما 360');
      return;
    }
  }

  function open(options = {}) {
    const type = normalizeType(options.type);
    const target = options.target || '';
    if (!viewerTypes.has(type) || !target) {
      if (target && isExternalUrl(target)) window.open(target, '_blank', 'noopener');
      return;
    }

    state.isOpen = true;
    state.type = type;
    state.title = options.title || '';
    state.target = target;
    state.viewerStyle = type === 'pdf'
      ? normalizeViewerStyle(options.viewerStyle || viewerStyleFromLocation())
      : 'standard';
    state.gallery = Array.isArray(options.gallery) && options.gallery.length
      ? options.gallery
      : (type === 'gallery' || type === 'image' ? [target] : []);
    state.index = Math.max(0, Math.min(Number(options.index) || 0, Math.max(state.gallery.length - 1, 0)));

    const ui = ensureViewer();
    ui.viewer.hidden = false;
    document.body.classList.add('arch-media-viewer-open');
    renderCurrent();
    ui.close.focus({ preventScroll: true });
  }

  function exitViewerFullscreenIfNeeded() {
    const ui = ensureViewer();
    const fullscreenElement = document.fullscreenElement || document.webkitFullscreenElement;
    if (!fullscreenElement || !ui.viewer.contains(fullscreenElement)) return;

    try {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    } catch (error) {}
  }

  function close() {
    if (!state.isOpen) return;
    exitViewerFullscreenIfNeeded();
    state.isOpen = false;
    clearMedia();
    ensureViewer().viewer.hidden = true;
    document.body.classList.remove('arch-media-viewer-open');
  }

  function previous() {
    if (!state.gallery.length) return;
    state.index = (state.index - 1 + state.gallery.length) % state.gallery.length;
    renderGallery();
  }

  function next() {
    if (!state.gallery.length) return;
    state.index = (state.index + 1) % state.gallery.length;
    renderGallery();
  }

  function requestFullscreen() {
    const ui = ensureViewer();
    const target = state.type === 'pdf' ? ui.viewer : ui.media;
    if (target.requestFullscreen) {
      target.requestFullscreen()
        .then(() => schedulePdfViewerResize(180, { force: true }))
        .catch(() => {});
    }
  }

  function openFromTrigger(trigger) {
    const type = normalizeType(trigger.dataset.mediaType);
    const target = trigger.dataset.mediaTarget || trigger.getAttribute('href') || '';

    if (type === 'external') {
      if (target) window.open(resolvePath(target), '_blank', 'noopener');
      return;
    }

    open({
      type,
      target,
      title: trigger.dataset.mediaTitle || trigger.textContent.trim(),
      viewerStyle: trigger.dataset.mediaViewerStyle || viewerStyleFromLocation(),
      gallery: parseGallery(trigger.dataset.mediaGallery),
      index: Number(trigger.dataset.mediaIndex) || 0
    });
  }

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-media-viewer="true"]');
    if (!trigger) return;
    event.preventDefault();
    openFromTrigger(trigger);
  });

  document.addEventListener('keydown', (event) => {
    if (!state.isOpen) return;
    if (event.key === 'Escape') close();
    if ((state.type === 'gallery' || state.type === 'image') && event.key === 'ArrowLeft') next();
    if ((state.type === 'gallery' || state.type === 'image') && event.key === 'ArrowRight') previous();
    if (state.type === 'pdf' && event.key === 'ArrowLeft') nextPdfPage();
    if (state.type === 'pdf' && event.key === 'ArrowRight') previousPdfPage();
  });

  window.addEventListener('resize', () => {
    if (!state.isOpen || state.type !== 'pdf' || !pdfState.document) return;
    schedulePdfViewerResize(160);
  });

  document.addEventListener('fullscreenchange', () => {
    if (!state.isOpen || state.type !== 'pdf' || !pdfState.document) return;
    schedulePdfViewerResize(180, { force: true });
  });

  document.addEventListener('webkitfullscreenchange', () => {
    if (!state.isOpen || state.type !== 'pdf' || !pdfState.document) return;
    schedulePdfViewerResize(180, { force: true });
  });

  window.ArchMediaViewer = {
    open,
    close
  };
})();
