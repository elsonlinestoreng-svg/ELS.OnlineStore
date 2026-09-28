// ===== IMAGE UPLOAD (Open Store) =====
window.selectedImages = window.selectedImages || [];
window.primaryImageIndex = window.primaryImageIndex || 0;

// Setup drag & drop and click-to-upload handlers.
// Deferred to DOMContentLoaded so it binds against the single canonical
// implementation in products.js, regardless of script tag order.
(function initProductImageArea(){
  function bind() {
    const area = document.getElementById('image-upload-area');
    const input = document.getElementById('prod-image');
    if (!area || !input) return;
    if (area.__elsImageAreaBound) return;
    area.__elsImageAreaBound = true;

    area.addEventListener('click', () => input.click());

    area.addEventListener('dragenter', (e) => { e.preventDefault(); area.classList.add('drag-over'); });
    area.addEventListener('dragover', (e) => { e.preventDefault(); area.classList.add('drag-over'); });
    area.addEventListener('dragleave', (e) => { e.preventDefault(); area.classList.remove('drag-over'); });
    area.addEventListener('drop', (e) => {
      e.preventDefault();
      area.classList.remove('drag-over');
      const files = Array.from(e.dataTransfer?.files || []);
      files.forEach(f => processProductImageFile(f));
    });

    input.addEventListener('change', (e) => {
      if (typeof handleImageUpload === 'function') handleImageUpload(e);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind, { once: true });
  } else {
    bind();
  }
})();

// ===== CLOUD UPLOAD HELPERS =====

// ========== Firebase Storage support (optional) ==========
