(function () {
  const mediaCore = window.ArchMediaCore || {};

  // Helper to escape HTML to prevent XSS
  function escapeHTML(str) {
    if (mediaCore.escapeHTML) return mediaCore.escapeHTML(str);
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Simple ASCII slug generator for matching in JS
  function asciiSlug(text) {
    if (mediaCore.asciiSlug) return mediaCore.asciiSlug(text);
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

  // Helper to resolve relative path prefix
  function pathFor(url) {
    if (mediaCore.pathFor) return mediaCore.pathFor(url);
    if (!url) return '';
    return url;
  }

  function normalizeMediaType(type = '') {
    if (mediaCore.normalizeMediaType) return mediaCore.normalizeMediaType(type);
    const allowed = ['image', 'gallery', 'video', 'pdf', 'heyzine', 'panorama', 'pano2vr', 'external'];
    const normalized = String(type || '').trim().toLowerCase();
    return allowed.includes(normalized) ? normalized : '';
  }

  function detectMediaType(item = {}) {
    if (mediaCore.detectMediaType) return mediaCore.detectMediaType(item, section);
    return normalizeMediaType(item.type) || 'image';
  }

  function getThumbnail(item = {}) {
    if (mediaCore.getThumbnail) return mediaCore.getThumbnail(item);
    return item.thumbnail || item.image || 'assets/profile.jpg';
  }

  function isExternalUrl(url = '') {
    if (mediaCore.isExternalUrl) return mediaCore.isExternalUrl(url);
    return /^https?:\/\//i.test(String(url || '').trim());
  }

  function isPdfUrl(url = '') {
    return /\.pdf(?:[?#].*)?$/i.test(String(url || '').trim());
  }

  function isVideoFileUrl(url = '') {
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

  function sameTarget(a = '', b = '') {
    return String(a || '').trim() && String(a || '').trim() === String(b || '').trim();
  }

  function normalizeAssetTarget(target = '') {
    if (mediaCore.normalizeAssetTarget) return mediaCore.normalizeAssetTarget(target);
    return String(target || '')
      .trim()
      .replace(/\\/g, '/')
      .replace(/^[./]+/, '')
      .split('?')[0]
      .split('#')[0]
      .toLowerCase();
  }

  function mediaViewerAttributes(item = {}, type = '', overrides = {}) {
    if (mediaCore.mediaViewerAttributes) return mediaCore.mediaViewerAttributes(item, type, section, overrides);
    return '';
  }

  function getContentIdentity(item = {}, index = 0) {
    if (mediaCore.getContentIdentity) return mediaCore.getContentIdentity(item, section, index);
    const fallback = item.id || item.slug || asciiSlug(item.title || '');
    return {
      key: fallback || `legacy:${section}:${index}`,
      source: section,
      stable: Boolean(item.id || item.slug),
      detailId: fallback || ''
    };
  }

  function normalizeContentItem(item = {}, index = 0) {
    if (mediaCore.normalizeContentItem) return mediaCore.normalizeContentItem(item, section, index);
    return {
      ...item,
      _section: section,
      section,
      _source_index: index,
      _identity: getContentIdentity(item, index),
      thumbnail: item.thumbnail || item.image || 'assets/profile.jpg',
      image: item.image || item.thumbnail || 'assets/profile.jpg',
      gallery: Array.isArray(item.gallery) ? item.gallery : [],
      tags: Array.isArray(item.tags) ? item.tags : [],
      status: item.status || 'published'
    };
  }

  function extractAssetsFromItem(item = {}, index = 0) {
    if (mediaCore.extractAssetsFromItem) return mediaCore.extractAssetsFromItem(item, section, index);
    return [];
  }

  function isMediaDebugEnabled() {
    return mediaCore.isMediaDebugEnabled ? mediaCore.isMediaDebugEnabled() : false;
  }

  function debugProjectDetail(item, availableAssets) {
    if (!isMediaDebugEnabled()) return;
    const payload = {
      identity: item._identity || getContentIdentity(item, item._source_index || 0),
      availableAssets
    };
    window.ArchProjectDetailDebug = payload;
    console.debug('[ArchMediaCore] Project detail runtime media', payload);
  }

  function getProjectMediaOptions(availableAssets = []) {
    const assets = Array.isArray(availableAssets) ? availableAssets : [];
    const actionableAssets = assets.filter((asset) => {
      const type = normalizeMediaType(asset.type);
      const role = String(asset.role || '').trim().toLowerCase();
      return type && type !== 'image' && role !== 'cover' && String(asset.target || '').trim();
    });

    const options = [];
    const galleryAssets = actionableAssets
      .filter((asset) => normalizeMediaType(asset.type) === 'gallery')
      .filter((asset) => String(asset.target || '').trim());

    if (galleryAssets.length > 0) {
      options.push({
        type: 'gallery',
        label: `Gallery · ${galleryAssets.length}`,
        title: 'معرض الصور',
        target: galleryAssets[0].target,
        gallery: galleryAssets.map((asset) => asset.target).filter(Boolean),
        count: galleryAssets.length,
        order: Math.min(...galleryAssets.map((asset) => Number(asset.order) || 0))
      });
    }

    const labels = {
      pdf: 'PDF Book',
      video: 'Video',
      panorama: 'Panorama 360',
      pano2vr: 'Pano2VR',
      heyzine: 'Heyzine',
      external: 'External Link'
    };

    ['pdf', 'video', 'panorama', 'pano2vr', 'heyzine', 'external'].forEach((type) => {
      const seenTargets = new Set();
      actionableAssets
        .filter((asset) => normalizeMediaType(asset.type) === type)
        .forEach((asset) => {
          const targetKey = normalizeAssetTarget(asset.target) || String(asset.target || '').trim().toLowerCase();
          if (!targetKey || seenTargets.has(targetKey)) return;
          seenTargets.add(targetKey);
          options.push({
            type,
            label: labels[type] || type,
            title: asset.title || labels[type] || type,
            target: asset.target,
            viewer_style: asset.viewer_style || asset.viewerStyle || '',
            order: Number(asset.order) || 0
          });
        });
    });

    return options.sort((a, b) => {
      const priority = { gallery: 10, pdf: 20, video: 30, panorama: 40, pano2vr: 45, heyzine: 50, external: 60 };
      return (priority[a.type] || 100) - (priority[b.type] || 100) || (a.order || 0) - (b.order || 0);
    });
  }

  function getMediaOptionHref(option = {}) {
    const target = String(option.target || '').trim();
    if (!target) return '#';
    return isExternalUrl(target) ? target : pathFor(target);
  }

  function getMediaOptionAttributes(item = {}, option = {}) {
    const type = normalizeMediaType(option.type);
    if (!type || type === 'external') return '';

    const overrides = {
      target: option.target,
      viewer_style: option.viewer_style
    };

    if (type === 'gallery') {
      overrides.gallery = option.gallery || [];
      overrides.index = 0;
    }

    return mediaViewerAttributes(item, type, overrides);
  }

  function renderAvailableMedia(item = {}, mediaOptions = []) {
    if (!mediaOptions.length) return '';

    const buttons = mediaOptions.map((option) => {
      const attributes = getMediaOptionAttributes(item, option);
      const buttonClass = option.type === 'external' || option.type === 'pano2vr'
        ? 'btn-detail-action btn-detail-secondary'
        : 'btn-detail-action';
      const titleAttribute = option.title ? ` title="${escapeHTML(option.title)}"` : '';

      return `
        <a href="${escapeHTML(getMediaOptionHref(option))}" target="_blank" rel="noopener" class="${buttonClass}"${titleAttribute} ${attributes}>
          ${escapeHTML(option.label)}
        </a>
      `;
    }).join('');

    return `
      <section class="project-available-media" aria-labelledby="available-media-title">
        <h3 class="detail-section-title" id="available-media-title">
          محتوى المشروع
          <span lang="en" dir="ltr" style="font-size: 0.55em; font-weight: 500; color: #8f7b4b; margin-inline-start: 8px;">Available Media</span>
        </h3>
        <div class="action-buttons-container">
          ${buttons}
        </div>
      </section>
    `;
  }

  // Get query parameters
  const params = new URLSearchParams(window.location.search);
  const section = params.get('section');
  const id = params.get('id');
  const title = params.get('title');
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const isPreviewMode = params.get('preview') === '1' && isLocalhost;

  const mainContainer = document.getElementById('project-detail-content');

  if (!section || (!id && !title)) {
    showError('حدث خطأ في تحديد المشروع المطلوب. يرجى العودة للصفحة الرئيسية.');
    return;
  }

  // Define section page mappings for Back buttons
  const sectionPages = {
    commercial: 'architecture.html#commercial',
    residential: 'architecture.html#residential',
    government: 'architecture.html#government',
    interiors: 'interior-design.html',
    panorama: 'panorama.html'
  };

  const backUrl = sectionPages[section] || 'index.html';

  // Load JSON data
  const jsonPath = `data/${section}.json`;

  fetch(jsonPath)
    .then(response => {
      if (!response.ok) {
        throw new Error('فشل تحميل بيانات القسم.');
      }
      return response.json();
    })
    .then(data => {
      // Find the project item
      let itemIndex = -1;
      const item = data.find((p, index) => {
        const identity = getContentIdentity(p, index);
        const legacySlug = p.id || p.slug || asciiSlug(p.title);
        const candidates = [
          identity.detailId,
          identity.key,
          p.id,
          p.slug,
          legacySlug
        ].filter(Boolean).map((value) => String(value));

        if (id && candidates.includes(id)) {
          itemIndex = index;
          return true;
        }
        if (title && String(p.title || '').trim().toLowerCase() === title.trim().toLowerCase()) {
          itemIndex = index;
          return true;
        }
        return false;
      });

      if (!item) {
        showError('المشروع المطلوب غير موجود.');
        return;
      }
      const normalizedItem = normalizeContentItem(item, itemIndex);
      const availableAssets = extractAssetsFromItem(normalizedItem, itemIndex);
      normalizedItem.availableAssets = availableAssets;

      // Check publish status
      const status = (normalizedItem.status || '').toLowerCase().trim();
      if ((status === 'draft' || status === 'hidden') && !isPreviewMode) {
        showDraftWarning();
        return;
      }

      // Render the project details page
      debugProjectDetail(normalizedItem, availableAssets);
      renderProject(normalizedItem, availableAssets);
    })
    .catch(err => {
      console.error(err);
      showError('حدث خطأ أثناء تحميل تفاصيل المشروع. يرجى المحاولة لاحقاً.');
    });

  function showError(msg) {
    mainContainer.innerHTML = `
      <div class="shell" style="padding: 100px 20px; text-align: center;">
        <h2 style="font-size: 24px; margin-bottom: 20px; color: #d9534f;">${escapeHTML(msg)}</h2>
        <a href="${escapeHTML(backUrl)}" class="btn-detail-action btn-detail-secondary" style="margin-top: 20px;">العودة للقسم</a>
      </div>
    `;
  }

  function showDraftWarning() {
    mainContainer.innerHTML = `
      <div class="shell draft-warning-container">
        <h2>هذا المشروع غير منشور حالياً</h2>
        <p>المشروع الذي تحاول استعراضه لا يزال في حالة مسودة وغير متاح للعامة.</p>
        <a href="${escapeHTML(backUrl)}" class="btn-detail-action btn-detail-secondary">العودة للقسم</a>
      </div>
    `;
  }

  function renderProject(item, availableAssets = []) {
    const logicalAssets = Array.isArray(availableAssets) ? availableAssets : [];
    const mediaOptions = getProjectMediaOptions(logicalAssets);

    // Generate page title dynamically
    document.title = `${item.title} | المركز المعماري الاستشاري`;

    // Hero Section markup
    const heroImage = getThumbnail(item);
    const heroBg = heroImage ? `style="background-image: url('${escapeHTML(pathFor(heroImage))}');"` : '';
    const heroHtml = `
      <section class="project-detail-hero" ${heroBg}>
        <div class="shell">
          <p>${escapeHTML(item.category || section.toUpperCase())}</p>
          <h1>${escapeHTML(item.title)}</h1>
        </div>
      </section>
    `;

    // Metadata Grid
    const metaHtml = `
      <div class="project-metadata-grid">
        <div class="metadata-item">
          <h4>القسم</h4>
          <p>${escapeHTML(item.category || section.toUpperCase())}</p>
        </div>
        <div class="metadata-item">
          <h4>النمط المعماري</h4>
          <p>${escapeHTML(item.style || 'معاصر')}</p>
        </div>
        <div class="metadata-item">
          <h4>الموقع</h4>
          <p>${escapeHTML(item.location || 'البصرة - العراق')}</p>
        </div>
        <div class="metadata-item">
          <h4>عام الإنجاز</h4>
          <p>${escapeHTML(item.year || '2026')}</p>
        </div>
      </div>
    `;

    // Description
    const descHtml = `
      <div class="project-description">
        ${escapeHTML(item.description || 'لا يوجد وصف متاح للمشروع حالياً.')}
      </div>
    `;

    // Gallery Grid
    let galleryHtml = '';
    const galleryAssets = logicalAssets.filter((asset) => normalizeMediaType(asset.type) === 'gallery' && asset.target);
    if (galleryAssets.length > 0) {
      const items = galleryAssets.map((asset) => {
        const img = asset.target;
        return `
        <div class="gallery-item" aria-label="صورة إضافية للمشروع">
          <img src="${escapeHTML(pathFor(img))}" alt="صورة إضافية للمشروع" loading="lazy">
        </div>
      `;
      }).join('');
      galleryHtml = `
        <h3 class="detail-section-title">معرض الصور</h3>
        <div class="gallery-grid">${items}</div>
      `;
    }

    const availableMediaHtml = renderAvailableMedia(item, mediaOptions);

    const actionsHtml = `
      <div class="action-buttons-container">
        <a href="${escapeHTML(backUrl)}" class="btn-detail-action btn-detail-secondary">
          العودة إلى القسم
        </a>
      </div>
    `;

    let previewBannerHtml = '';
    if (isPreviewMode) {
      previewBannerHtml = `
        <div class="local-preview-banner" style="background-color: #d9534f; color: #fff; padding: 10px; text-align: center; font-weight: bold; font-size: 14px; position: sticky; top: 0; z-index: 1000; direction: rtl;">
          ⚠️ معاينة محلية - هذا المشروع غير منشور للعامة (مسودة)
        </div>
      `;
    }

    // Combine everything inside main layout
    mainContainer.innerHTML = `
      ${previewBannerHtml}
      ${heroHtml}
      <div class="shell" style="padding-top: 0; padding-bottom: 80px;">
        ${metaHtml}
        ${descHtml}
        ${availableMediaHtml}
        ${galleryHtml}
        ${actionsHtml}
      </div>
    `;

    mainContainer.dataset.availableAssets = String(logicalAssets.length);
    mainContainer.dataset.availableMediaOptions = String(mediaOptions.length);
  }
})();
