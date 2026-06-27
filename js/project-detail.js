(function () {
  // Helper to escape HTML to prevent XSS
  function escapeHTML(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Simple ASCII slug generator for matching in JS
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

  // Helper to resolve relative path prefix
  function pathFor(url) {
    if (!url) return '';
    return url;
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
      const item = data.find(p => {
        const itemSlug = p.id || p.slug || asciiSlug(p.title);
        if (id && itemSlug === id) return true;
        if (title && p.title.trim().toLowerCase() === title.trim().toLowerCase()) return true;
        return false;
      });

      if (!item) {
        showError('المشروع المطلوب غير موجود.');
        return;
      }

      // Check publish status
      const status = (item.status || '').toLowerCase().trim();
      if ((status === 'draft' || status === 'hidden') && !isPreviewMode) {
        showDraftWarning();
        return;
      }

      // Render the project details page
      renderProject(item);
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

  function renderProject(item) {
    // Generate page title dynamically
    document.title = `${item.title} | المركز المعماري الاستشاري`;

    // Hero Section markup
    const heroBg = item.image ? `style="background-image: url('${escapeHTML(item.image)}');"` : '';
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
    if (item.gallery && Array.isArray(item.gallery) && item.gallery.length > 0) {
      const items = item.gallery.map(img => `
        <div class="gallery-item" onclick="window.open('${escapeHTML(img)}', '_blank')">
          <img src="${escapeHTML(img)}" alt="صورة إضافية للمشروع" loading="lazy">
        </div>
      `).join('');
      galleryHtml = `
        <h3 class="detail-section-title">معرض الصور</h3>
        <div class="gallery-grid">${items}</div>
      `;
    }

    // Video Section
    let videoHtml = '';
    if (item.video) {
      videoHtml = `
        <h3 class="detail-section-title">فيديو المشروع</h3>
        <div class="video-container">
          <video controls preload="metadata">
            <source src="${escapeHTML(item.video)}" type="video/mp4">
            المتصفح الخاص بك لا يدعم تشغيل الفيديو.
          </video>
        </div>
      `;
    }

    // Actions Buttons (PDF / Panorama / Back)
    let actionButtons = '';
    if (item.pdf) {
      actionButtons += `
        <a href="${escapeHTML(item.pdf)}" target="_blank" rel="noopener" class="btn-detail-action">
          تحميل ملف PDF للمشروع
        </a>
      `;
    }
    if (item.panorama) {
      actionButtons += `
        <a href="panorama.html?id=${escapeHTML(item.id || item.slug || '')}" class="btn-detail-action btn-detail-secondary">
          عرض بانوراما 360°
        </a>
      `;
    }
    
    // Always show Back button
    actionButtons += `
      <a href="${escapeHTML(backUrl)}" class="btn-detail-action btn-detail-secondary">
        العودة إلى القسم
      </a>
    `;

    const actionsHtml = `
      <div class="action-buttons-container">
        ${actionButtons}
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
        ${galleryHtml}
        ${videoHtml}
        ${actionsHtml}
      </div>
    `;
  }
})();
