function handleImageUpload(event) {
  const files = Array.from(event?.target?.files || []);
  if (selectedImages.length + files.length > 6) {
  showToast('Maximum 6 images allowed');
  return;
}
  if (!files.length) return;
  files.forEach(f => processProductImageFile(f));
}

function processProductImageFile(file) {
  const maxFileSize = 8 * 1024 * 1024;
  if (!file.type.startsWith('image/')) {
    showToast('Please upload an image file (JPG, PNG, WebP).');
    return;
  }
  if (file.size > maxFileSize) {
    showToast('Image too large. Max size is 8MB.');
    return;
  }

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const dataUrl = e.target.result;
      const optimize = document.getElementById('optimize-image')?.checked ?? true;
      let finalDataUrl = dataUrl;
      let compressedSize = null;
      if (optimize) {
        const compressed = await compressImageDataUrl(dataUrl, { maxDim: 1200, targetBytes: 700 * 1024 });
        finalDataUrl = compressed;
        compressedSize = dataURLtoBlob(compressed).size;
      }

      selectedImages.push(finalDataUrl);
      renderImageGallery();
      const infoEl = document.getElementById('image-info');
      const originalBytes = dataURLtoBlob(dataUrl).size;
      const dims = await getImageDimensions(dataUrl);
      if (infoEl) infoEl.textContent = `${selectedImages.length} image(s) • ${dims.w}×${dims.h} • ${formatBytes(originalBytes)}${compressedSize ? ' → ' + formatBytes(compressedSize) : ''}`;
      showToast('Image added');
    } catch (err) {
      console.error('Image processing failed', err);
      showToast('Failed to process image');
    }
  };
  reader.readAsDataURL(file);
}

function renderImageGallery() {
  const gallery = document.getElementById('image-gallery');
  const section = document.getElementById('image-preview-section');
  if (!gallery || !section) return;
  gallery.innerHTML = '';
  if (!selectedImages.length) { section.classList.add('hidden'); return; }
  section.classList.remove('hidden');
  selectedImages.forEach((src, i) => {
    const wrap = document.createElement('div'); wrap.className = 'relative';
    const img = document.createElement('img'); img.src = src; img.className = 'w-full h-28 object-cover rounded-lg';
    wrap.appendChild(img);

    const controls = document.createElement('div'); controls.className = 'absolute top-1 right-1 flex gap-1';
    const btnPrimary = document.createElement('button'); btnPrimary.title = 'Set as primary'; btnPrimary.className = 'bg-white/70 p-1 rounded'; btnPrimary.innerHTML = i===primaryImageIndex ? '★' : '☆';
    btnPrimary.onclick = () => { primaryImageIndex = i; renderImageGallery(); };
    const btnLeft = document.createElement('button'); btnLeft.title = 'Move left'; btnLeft.className = 'bg-white/70 p-1 rounded'; btnLeft.innerHTML = '◀'; btnLeft.onclick = () => { moveImageLeft(i); };
    const btnRight = document.createElement('button'); btnRight.title = 'Move right'; btnRight.className = 'bg-white/70 p-1 rounded'; btnRight.innerHTML = '▶'; btnRight.onclick = () => { moveImageRight(i); };
    const btnRemove = document.createElement('button'); btnRemove.title = 'Remove'; btnRemove.className = 'bg-white/70 p-1 rounded text-red-500'; btnRemove.innerHTML = '✕'; btnRemove.onclick = () => { removeImageAt(i); };
    controls.appendChild(btnPrimary); controls.appendChild(btnLeft); controls.appendChild(btnRight); controls.appendChild(btnRemove);
    wrap.appendChild(controls);
    gallery.appendChild(wrap);
  });
}

function moveImageLeft(i) {
  if (i<=0) return; [selectedImages[i-1], selectedImages[i]] = [selectedImages[i], selectedImages[i-1]];
  if (primaryImageIndex===i) primaryImageIndex = i-1; else if (primaryImageIndex===i-1) primaryImageIndex = i;
  renderImageGallery();
}

function moveImageRight(i) {
  if (i>=selectedImages.length-1) return; [selectedImages[i+1], selectedImages[i]] = [selectedImages[i], selectedImages[i+1]];
  if (primaryImageIndex===i) primaryImageIndex = i+1; else if (primaryImageIndex===i+1) primaryImageIndex = i;
  renderImageGallery();
}

function removeImageAt(i) {
  selectedImages.splice(i,1);
  if (primaryImageIndex >= selectedImages.length) primaryImageIndex = Math.max(0, selectedImages.length-1);
  renderImageGallery();
}

function clearAllImages() { selectedImages = []; primaryImageIndex = 0; renderImageGallery(); }

function getImageDimensions(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.width, h: img.height });
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B','KB','MB','GB'];
  let i = 0; let v = bytes;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return v.toFixed(v < 10 && i > 0 ? 1 : 0) + ' ' + units[i];
}

function compressImageDataUrl(dataUrl, opts = {}) {
  const maxDim = opts.maxDim || 1200;
  const targetBytes = opts.targetBytes || 700 * 1024;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        let w = img.width, h = img.height;
        if (w > maxDim || h > maxDim) {
          const ratio = Math.max(w / maxDim, h / maxDim);
          w = Math.round(w / ratio);
          h = Math.round(h / ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        let quality = 0.92;
        function attempt() {
          const out = canvas.toDataURL('image/jpeg', quality);
          const bytes = dataURLtoBlob(out).size;
          if (bytes <= targetBytes || quality <= 0.5) return resolve(out);
          quality -= 0.08;
          attempt();
        }
        attempt();
      } catch (err) { reject(err); }
    };
    img.onerror = (err) => reject(err);
    img.src = dataUrl;
  });
}

function removeImage() { clearAllImages(); }

(function initProductImageArea(){
  const area = document.getElementById('image-upload-area');
  const input = document.getElementById('prod-image');
  if (!area || !input) return;

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

  input.addEventListener('change', handleImageUpload);
})();

function dataURLtoBlob(dataURL) {
  const parts = dataURL.split(',');
  const meta = parts[0].match(/:(.*?);/);
  const mime = meta ? meta[1] : 'image/png';
  const bstr = atob(parts[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) u8arr[n] = bstr.charCodeAt(n);
  return new Blob([u8arr], { type: mime });
}

async function uploadImageToCloud(dataUrl, uid) {
  if (typeof window.cloudImageUploadHandler === 'function') {
    return await window.cloudImageUploadHandler(dataUrl);
  }
  const uploadUrl = window.cloudImageUploadUrl || window.CLOUD_IMAGE_UPLOAD_URL;
  if (uploadUrl) {
    return await new Promise((resolve, reject) => {
      try {
        const blob = dataURLtoBlob(dataUrl);
        const form = new FormData();
        form.append('file', blob, 'upload.png');
        const uidLocal = uid || String(Math.random().toString(36).slice(2,9));
        if (window.__uploadProgressHandler) window.__uploadProgressHandler(uidLocal, { status: 'started', loaded: 0, total: blob.size });
        const xhr = new XMLHttpRequest();
        window.activeUploads.push(xhr);
        xhr.open('POST', uploadUrl, true);
        xhr.withCredentials = false;
        xhr.upload.onprogress = function(evt) {
          if (evt.lengthComputable && window.__uploadProgressHandler) {
            window.__uploadProgressHandler(uidLocal, { status: 'progress', loaded: evt.loaded, total: evt.total });
          }
        };
        xhr.onload = function() {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const json = JSON.parse(xhr.responseText || '{}');
              const url = json.url || json.fileUrl || json.location || null;
              if (window.__uploadProgressHandler) window.__uploadProgressHandler(uidLocal, { status: url ? 'done' : 'failed', url });
              if (url) resolve(url); else reject(new Error('Unexpected upload response'));
            } catch (err) {
              if (window.__uploadProgressHandler) window.__uploadProgressHandler(uidLocal, { status: 'failed' });
              reject(err);
            }
          } else {
            if (window.__uploadProgressHandler) window.__uploadProgressHandler(uidLocal, { status: 'failed' });
            reject(new Error('Upload failed: ' + xhr.status));
          }
        };
        xhr.onerror = function() {
          if (window.__uploadProgressHandler) window.__uploadProgressHandler(uidLocal, { status: 'failed' });
          reject(new Error('Upload XHR error'));
        };
        xhr.send(form);
      } catch (err) {
        reject(err);
      }
    });
  }

  if (window.FIREBASE_CONFIG) {
    try {
      const url = await uploadToFirebaseStorage(dataUrl);
      return url;
    } catch (err) {
      console.error('Firebase upload failed', err);
      throw err;
    }
  }

  throw new Error('No cloud upload URL or handler configured');
}

async function loadFirebaseSdkOnce() {
  if (window.__firebaseSdkLoaded) return;
  window.__firebaseSdkLoaded = true;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js';
    s.onload = resolve; s.onerror = reject; document.head.appendChild(s);
  });
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://www.gstatic.com/firebasejs/9.23.0/firebase-storage-compat.js';
    s.onload = resolve; s.onerror = reject; document.head.appendChild(s);
  });
}

async function uploadToFirebaseStorage(dataUrl) {
  if (!window.FIREBASE_CONFIG) throw new Error('FIREBASE_CONFIG not set');
  await loadFirebaseSdkOnce();
  if (!window.firebase) throw new Error('Firebase SDK failed to load');
  if (!window.__firebaseApp) {
    window.__firebaseApp = window.firebase.initializeApp(window.FIREBASE_CONFIG);
  }
  const storage = window.firebase.storage();
  const blob = dataURLtoBlob(dataUrl);
  const filename = 'uploads/' + Date.now() + '-' + Math.random().toString(36).slice(2,8) + '.png';
  const ref = storage.ref().child(filename);
  const snap = await ref.put(blob);
  const url = await snap.ref.getDownloadURL();
  return url;
}

function triggerReplaceImage(prodId) {
  pendingReplaceProductId = prodId;
  const input = document.getElementById('product-image-replace-input');
  if (!input) return showToast('Replace input not found');
  input.value = '';
  input.click();
}

let pendingReplaceProductId = null;
async function handleProductImageReplace(ev) {
  const f = ev?.target?.files?.[0];
  if (!f) return;
  if (!pendingReplaceProductId) return showToast('No target product selected');
  try {
    const reader = new FileReader();
    reader.onload = async (e) => {
      let dataUrl = e.target.result;
      const optimize = document.getElementById('optimize-image')?.checked ?? true;
      if (optimize) {
        try { dataUrl = await compressImageDataUrl(dataUrl, { maxDim: 1200, targetBytes: 700 * 1024 }); } catch(e) { }
      }
      let finalUrl = dataUrl;
      if (window.cloudImageUploadUrl || window.CLOUD_IMAGE_UPLOAD_URL || typeof window.cloudImageUploadHandler === 'function' || window.FIREBASE_CONFIG) {
        try {
          const remote = await uploadImageToCloud(dataUrl);
          if (remote) finalUrl = remote;
        } catch (err) {
          console.warn('Upload failed, using local data URL', err);
        }
      }

      const prod = allProducts.find(p => p.__backendId === pendingReplaceProductId);
      if (!prod) { showToast('Product not found'); pendingReplaceProductId = null; return; }

      prod.image_data = finalUrl;
      prod.primary_image = finalUrl;
      if (Array.isArray(prod.images) && prod.images.length) prod.images[0] = finalUrl; else prod.images = [finalUrl];

      try {
        if (window.dataSdk && typeof window.dataSdk.update === 'function') {
          await window.dataSdk.update(prod);
        }
      } catch (e) { console.warn('dataSdk.update failed', e); }

      try { saveProductsToLocal(); } catch(e){}
      renderShop(); renderHomeProducts(); renderMyProducts();
      showToast('Product image updated');
      pendingReplaceProductId = null;
    };
    reader.readAsDataURL(f);
  } catch (err) {
    console.error(err); showToast('Failed to replace image'); pendingReplaceProductId = null;
  }
}

function replaceProductImageFromUrl(prodId) {
  const url = prompt('Paste an image URL (http/https):');
  if (!url) return;
  if (!/^https?:\/\//i.test(url)) return showToast('Invalid URL');
  if (!url.match(/\.(jpg|jpeg|png|webp)$/i)) {
    return showToast('Only JPG, PNG, WEBP images allowed');
  }
  const prod = allProducts.find(p => p.__backendId === prodId);
  if (!prod) return showToast('Product not found');
  prod.image_data = url; prod.primary_image = url; prod.images = [url];
  try { if (window.dataSdk && typeof window.dataSdk.update === 'function') window.dataSdk.update(prod); } catch(e){}
  try { saveProductsToLocal(); } catch(e){}
  renderShop(); renderHomeProducts(); renderMyProducts();
  showToast('Product image updated from URL');
}

function renderShop() {
  const search = (document.getElementById('shop-search')?.value || '').toLowerCase();
  let filtered = allProducts.filter(p => p.name && (p.public !== false || p.seller === currentUser.name));
  if (currentCategory !== 'All') filtered = filtered.filter(p => p.category === currentCategory);
  if (search) filtered = filtered.filter(p => (p.name || '').toLowerCase().includes(search) || (p.description || '').toLowerCase().includes(search));

  const grid = document.getElementById('shop-grid');
  if (!filtered.length) {
    grid.innerHTML = '<p class="col-span-full text-center text-gray-400 py-16">No products found. <button onclick="goTo(\'open-store\')" class="underline font-semibold" style="color:#e94560;">List one!</button></p>';
    return;
  }
  grid.innerHTML = filtered.map(p => `
    <div class="product-card rounded-2xl overflow-hidden" style="background:white;" data-prod-id="${p.__backendId}">
          <div class="h-48 bg-gray-200 overflow-hidden relative">${p.image_data ? `<img src="${p.image_data}" class="w-full h-full object-cover" alt="${escHtml(p.name)}" loading="lazy">` : '<div class="w-full h-full flex items-center justify-center text-6xl" style="background:linear-gradient(135deg, #f8f6f3, #eee);">📦</div>'}${p.seller === currentUser.name ? `<button onclick="triggerReplaceImage('${p.__backendId}')" class="absolute top-2 right-2 bg-white/80 text-sm px-2 py-1 rounded shadow">Upload</button>` : ''}</div>
      <div class="p-5">
        <span class="text-xs font-medium px-2 py-1 rounded-full" style="background:#f0f0f0; color:#666;">${p.category || 'Other'}</span>
        ${p.public === false ? '<span class="text-xs ml-2 px-2 py-1 rounded-full" style="background:#fee2e2;color:#9b1c1c;font-weight:600">Private</span>' : ''}
        <h4 class="font-bold mt-2 mb-1" style="color:#1a1a2e;">${escHtml(p.name)}</h4>
        <p class="text-gray-500 text-sm mb-3 line-clamp-2">${escHtml(p.description)}</p>
        <div class="flex items-center justify-between gap-2 mb-3">
          <span class="text-xl font-bold" style="color:#e94560;">$${Number(p.price).toFixed(2)}</span>
          <button onclick="addToCart('${p.__backendId}')" class="px-3 py-2 rounded-xl text-sm font-semibold text-white transition hover:opacity-90" style="background:#e94560;">Add</button>
          </div>

          ${p.seller === currentUser.name ? `<div class="mt-2 flex gap-2">
            <button onclick="triggerReplaceImage('${p.__backendId}')" class="px-3 py-2 rounded-xl text-sm font-semibold" style="background:#0f3460;color:white;">Replace Image</button>
            <button onclick="replaceProductImageFromUrl('${p.__backendId}')" class="px-3 py-2 rounded-xl text-sm font-semibold" style="background:#f0f0f0;">Use Image URL</button>
            ${p.public === false ? `<button onclick="setProductPublic('${p.__backendId}', true)" class="px-3 py-2 rounded-xl text-sm font-semibold" style="background:#16a34a;color:white;">Publish</button>` : `<button onclick="setProductPublic('${p.__backendId}', false)" class="px-3 py-2 rounded-xl text-sm font-semibold" style="background:#f97316;color:white;">Unpublish</button>`}
          </div>` : ''}
        <button onclick="openChat('${p.__backendId}')" class="w-full px-3 py-2 rounded-xl text-sm font-semibold text-white transition hover:opacity-90" style="background:#0f3460;"><i data-lucide="message-circle" class="w-3 h-3 inline mr-1"></i>Chat Seller</button>
        <p class="text-xs text-gray-400 mt-2">by ${escHtml(p.seller || 'Unknown')}</p>
      </div>
    </div>
  `).join('');
  lucide.createIcons();
  if (window.lastCreatedProductId) {
    setTimeout(() => { try { highlightAndScrollProduct(window.lastCreatedProductId); window.lastCreatedProductId = null; } catch(e){} }, 120);
  }
}

function highlightAndScrollProduct(prodId) {
  if (!prodId) return;
  const el = document.querySelector(`[data-prod-id="${prodId}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('new-highlight');
  setTimeout(() => el.classList.remove('new-highlight'), 4200);
}

function filterShopCategory(cat) {
  currentCategory = cat;
  document.querySelectorAll('.cat-btn').forEach(b => {
    const isActive = b.textContent.trim() === cat;
    b.style.background = isActive ? '#e94560' : 'white';
    b.style.color = isActive ? 'white' : '#1a1a2e';
  });
  renderShop();
  goTo('shop');
}

function renderHomeProducts() {
  const container = document.getElementById('home-products');
  const prods = allProducts.filter(p => p.name).slice(-4).reverse();
  if (!prods.length) {
    container.innerHTML = '<div class="col-span-full text-center py-12"><p class="text-gray-400 text-lg">📦 No products yet.</p><p class="text-gray-500 text-sm mt-2">Be the first to <button onclick="goTo(\'open-store\')" class="underline font-semibold" style="color:#e94560;">open a store</button> and list something!</p></div>';
    return;
  }
  container.innerHTML = prods.map(p => `
    <div class="product-card rounded-2xl overflow-hidden cursor-pointer" onclick="goTo('shop')" style="background:white;">
      <div class="h-32 bg-gray-200 overflow-hidden flex items-center justify-center relative">${p.image_data ? `<img src="${p.image_data}" class="w-full h-full object-cover" alt="${escHtml(p.name)}" loading="lazy">` : '<span class="text-5xl">📦</span>'}${p.seller === currentUser.name ? `<button onclick="event.stopPropagation(); triggerReplaceImage('${p.__backendId}')" class="absolute top-2 right-2 bg-white/80 text-xs px-2 py-1 rounded">Upload</button>` : ''}</div>
      <div class="p-4">
        <h4 class="font-bold text-sm mb-1" style="color:#1a1a2e;">${escHtml(p.name)}</h4>
        <span class="font-bold" style="color:#e94560;">$${Number(p.price).toFixed(2)}</span>
      </div>
    </div>
  `).join('');
}

function renderMyProducts() {
  const container = document.getElementById('my-products');
  const mine = allProducts.filter(p => p.seller === currentUser.name && p.name);
  if (!mine.length) {
    container.innerHTML = '<p class="text-gray-400 text-center py-8">You haven\'t listed any products yet.</p>';
    return;
  }
  container.innerHTML = mine.map(p => `
    <div class="flex items-center gap-4 rounded-xl p-4" style="background:#f8f6f3;">
      <div class="w-16 h-16 rounded-lg bg-gray-200 flex-shrink-0 overflow-hidden flex items-center justify-center">${p.image_data ? `<img src="${p.image_data}" class="w-full h-full object-cover" alt="${escHtml(p.name)}" loading="lazy">` : '<span class="text-2xl">📦</span>'}</div>
      <div class="flex-1 min-w-0">
        <h4 class="font-bold text-sm" style="color:#1a1a2e;">${escHtml(p.name)}</h4>
        <p class="text-xs text-gray-500">${p.category} · $${Number(p.price).toFixed(2)}</p>
      </div>
      <div class="flex flex-col gap-2">
        <button onclick="deleteProduct('${p.__backendId}', this)" class="text-red-400 hover:text-red-600 p-2 transition flex-shrink-0"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
        <button onclick="triggerReplaceImage('${p.__backendId}')" class="text-gray-600 hover:text-gray-800 p-2 transition flex-shrink-0" title="Replace image"><i data-lucide="image" class="w-4 h-4"></i></button>
      </div>
    </div>
  `).join('');
  lucide.createIcons();
}

async function handleAddProduct(e) {
  e.preventDefault();
  if (allProducts.length >= 999) {
    document.getElementById('store-limit-msg').classList.remove('hidden');
    return;
  }
  const btn = document.getElementById('add-product-btn');
  btn.disabled = true;
  document.getElementById('add-prod-text').classList.add('hidden');
  document.getElementById('add-prod-loading').classList.remove('hidden');
  if (!validateOpenStoreForm()) {
    showToast('Please complete all required fields');
    btn.disabled = false;
    document.getElementById('add-prod-text').classList.remove('hidden');
    document.getElementById('add-prod-loading').classList.add('hidden');
    return;
  }
  if (!selectedImages.length) {
    showToast('Please add at least one product image');
    btn.disabled = false;
    document.getElementById('add-prod-text').classList.remove('hidden');
    document.getElementById('add-prod-loading').classList.add('hidden');
    return;
  }
  const forcePublish = (e && e.submitter && e.submitter.dataset && e.submitter.dataset.publish === 'true');
  const productPayload = {
    name: document.getElementById('prod-name').value,
    price: parseFloat(document.getElementById('prod-price').value) || 0,
    category: document.getElementById('prod-category').value,
    description: document.getElementById('prod-desc').value,
    seller: currentUser.name,
    images: Array.isArray(selectedImages) ? selectedImages.slice() : [],
    primary_image: selectedImages[primaryImageIndex] || (selectedImages[0] || ''),
    image_data: selectedImages[primaryImageIndex] || (selectedImages[0] || ''),
    public: forcePublish ? true : (document.getElementById('prod-public') ? Boolean(document.getElementById('prod-public').checked) : true),
    created_at: new Date().toISOString()
  };

  if (selectedImages.length && (window.cloudImageUploadUrl || window.CLOUD_IMAGE_UPLOAD_URL || typeof window.cloudImageUploadHandler === 'function' || window.FIREBASE_CONFIG)) {
    try {
      const uploaded = [];
      showUploadModal(selectedImages.length);
      const progressMap = {};
      window.__uploadProgressHandler = (uid, info) => {
        const row = document.getElementById('upload-row-' + uid);
        if (!row && info.status === 'started') {
          const r = document.createElement('div'); r.id = 'upload-row-' + uid; r.className = 'flex items-center gap-3';
          r.innerHTML = `<div class="w-12 h-12 bg-gray-100 rounded overflow-hidden"><img src="" class="w-full h-full object-cover"/></div><div class="flex-1"><div class="text-sm upload-name">Uploading...</div><div class="w-full bg-gray-100 rounded h-2 mt-1"><div class="upload-bar bg-e94560 h-2 rounded" style="width:0%"></div></div></div><div class="upload-status text-xs text-gray-500">Starting</div>`;
          document.getElementById('upload-list').appendChild(r);
          progressMap[uid] = r;
        }
        const el = progressMap[uid] || document.getElementById('upload-row-' + uid);
        if (!el) return;
        if (info.status === 'started') {
          el.querySelector('.upload-name').textContent = 'Uploading...';
          el.querySelector('img').src = '';
          el.querySelector('.upload-bar').style.width = '4%';
          el.querySelector('.upload-status').textContent = 'Uploading';
        } else if (info.status === 'progress') {
          const pct = info.total ? Math.round((info.loaded / info.total) * 100) : 0;
          el.querySelector('.upload-bar').style.width = pct + '%';
          el.querySelector('.upload-status').textContent = pct + '%';
        } else if (info.status === 'done') {
          el.querySelector('.upload-bar').style.width = '100%';
          el.querySelector('.upload-status').textContent = 'Done';
          if (info.url) el.querySelector('img').src = info.url;
        } else if (info.status === 'failed') {
          el.querySelector('.upload-status').textContent = 'Failed';
          el.querySelector('.upload-bar').style.background = '#ef4444';
        }
      };

      for (let i = 0; i < selectedImages.length; i++) {
        try {
          const uid = String(Math.random().toString(36).slice(2,9));
          window.__uploadProgressHandler(uid, {status:'started', loaded:0, total: dataURLtoBlob(selectedImages[i]).size});
          const remoteUrl = await uploadImageToCloud(selectedImages[i], uid);
          if (!remoteUrl) {
            window.__uploadProgressHandler(uid, {status:'failed'});
            uploaded.push(selectedImages[i]);
          } else {
            window.__uploadProgressHandler(uid, {status:'done', url: remoteUrl});
            uploaded.push(remoteUrl || selectedImages[i]);
          }
        } catch (err) {
          console.warn('image upload failed for index', i, err);
          window.__uploadProgressHandler && window.__uploadProgressHandler('', {status:'failed'});
          showToast('Image upload failed');
          hideUploadModal();
          btn.disabled = false;

          document.getElementById('add-prod-text').classList.remove('hidden');
          document.getElementById('add-prod-loading').classList.add('hidden');

          return;
        }
      }
      hideUploadModal();
      if (uploaded.length) {
        productPayload.images = uploaded;
        productPayload.primary_image = uploaded[primaryImageIndex] || uploaded[0];
        productPayload.image_data = productPayload.primary_image;
      }
    } catch (err) {
      console.error('Cloud upload failed', err);
      showToast('Image upload failed — listing will use local images.');
      hideUploadModal();
    }
  }

  let createdOk = false;
  let sdkResult = null;
  try {
    if (window.dataSdk && typeof window.dataSdk.create === 'function') {
      const result = await window.dataSdk.create(productPayload);
      sdkResult = result;
      createdOk = !!(result && result.isOk);
      if (createdOk && result && result.item) {
        const toPush = Object.assign({}, result.item);
        if (!toPush.__backendId && result.id) toPush.__backendId = result.id;
        allProducts.push(toPush);
        renderShop(); renderHomeProducts(); renderMyProducts();
        try { saveProductsToLocal(); } catch(e){}
        window.lastCreatedProductId = toPush.__backendId || result.id || null;
      } else if (createdOk && result && result.id) {
        const toPush = Object.assign({}, productPayload, { __backendId: result.id });
        allProducts.push(toPush);
        renderShop(); renderHomeProducts(); renderMyProducts();
        try { saveProductsToLocal(); } catch(e){}
        window.lastCreatedProductId = toPush.__backendId || result.id || null;
      }
    }
  } catch (err) {
    console.error('dataSdk.create error', err);
    createdOk = false;
  }

  if (!createdOk) {
    const localProd = Object.assign({}, productPayload, { __backendId: 'local-' + Date.now() + '-' + Math.random().toString(36).slice(2,8) });
    allProducts.push(localProd);
    window.lastCreatedProductId = localProd.__backendId;
    renderShop(); renderHomeProducts(); renderMyProducts();
    try { saveProductsToLocal(); } catch (e) {}
    createdOk = true;
  }

  btn.disabled = false;
  document.getElementById('add-prod-text').classList.remove('hidden');
  document.getElementById('add-prod-loading').classList.add('hidden');

  if (createdOk) {
    document.getElementById('add-product-form').reset();
    removeImage();
    document.getElementById('prod-image').value = '';
    showToast('🎉 Product listed successfully!');
    try { saveProductsToLocal(); } catch (e) {}
  } else {
    showToast('Failed to list product. Try again.');
  }

  if (createdOk) {
    try {
      const cat = (sdkResult && sdkResult.item && sdkResult.item.category) || productPayload.category;
      if (cat) filterShopCategory(cat);
      else goTo('shop');
    } catch (e) { goTo('shop'); }
  }
}

async function deleteProduct(id, btnEl) {
  const prod = allProducts.find(p => p.__backendId === id);
  if (!prod) return;
  if (prod.__backendId && String(prod.__backendId).startsWith('local-')) {
    allProducts = allProducts.filter(p => p.__backendId !== id);
    renderShop(); renderHomeProducts(); renderMyProducts();
    try { saveProductsToLocal(); } catch (e) {}
    showToast('✓ Product removed');
    return;
  }
  if (btnEl) btnEl.disabled = true;
  try {
    const result = await window.dataSdk.delete(prod);
    if (result.isOk) {
      showToast('✓ Product removed');
      try { saveProductsToLocal(); } catch (e) {}
    } else {
      showToast('Failed to remove product');
      if (btnEl) btnEl.disabled = false;
    }
  } catch (err) {
    console.error('deleteProduct error', err);
    showToast('Failed to remove product');
    if (btnEl) btnEl.disabled = false;
  }
}

async function loadProductsFromBackend() {
  try {
    if (!window.dataSdk || typeof window.dataSdk.getAll !== 'function') {
  console.warn('dataSdk.getAll unavailable');
  return;
}

const products = await window.dataSdk.getAll();

    allProducts = products.map(p => ({
      ...p,
      __backendId: p._id
    }));

    renderShop();
    renderHomeProducts();
    renderMyProducts();

    console.log('Products loaded:', allProducts.length);

  } catch (err) {
    console.error('Failed to load products', err);
  }
}

if (window.dataSdk && typeof window.dataSdk.getAll === 'function') {
  loadProductsFromBackend();
} else {
  console.warn('dataSdk not available, using local products only');

  // Load from localStorage instead
  try {
    loadProductsFromLocal();
  } catch (e) {
    console.error('Local product loading failed', e);
  }
}