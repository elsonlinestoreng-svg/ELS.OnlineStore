// ===== IMAGE UPLOAD (Open Store) =====
function handleImageUpload(event) {
  const files = Array.from(event?.target?.files || []);
  if (!files.length) return;
  files.forEach(f => processProductImageFile(f));
}

function processProductImageFile(file) {
  const maxFileSize = 5 * 1024 * 1024; // absolute max allowed: 5MB
  if (!file.type.startsWith('image/')) {
    showToast('Please upload an image file (JPG, PNG, WebP).');
    return;
  }
  if (file.size > maxFileSize) {
    showToast('Image too large. Max size is 5MB. Try compressing or resize your photo.');
    return;
  }
  // limit number of selected images to keep UI manageable
  const maxImages = 8;
  if (selectedImages.length >= maxImages) {
    showToast('You can upload up to ' + maxImages + ' images per product.');
    return;
  }
sss
  const reader = new FileReader();
  reader.onload = async (e) => {ss
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
      // update gallery
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
    const btnPrimary = document.createElement('button'); btnPrimary.title = 'Set as primary'; btnPrimary.className = 'bg-white/70 p-1 rounded btn-anim'; btnPrimary.innerHTML = i===primaryImageIndex ? '★' : '☆';
    btnPrimary.onclick = () => { primaryImageIndex = i; renderImageGallery(); };
    const btnLeft = document.createElement('button'); btnLeft.title = 'Move left'; btnLeft.className = 'bg-white/70 p-1 rounded btn-anim'; btnLeft.innerHTML = '◀'; btnLeft.onclick = () => { moveImageLeft(i); };
    const btnRight = document.createElement('button'); btnRight.title = 'Move right'; btnRight.className = 'bg-white/70 p-1 rounded btn-anim'; btnRight.innerHTML = '▶'; btnRight.onclick = () => { moveImageRight(i); };
    const btnRemove = document.createElement('button'); btnRemove.title = 'Remove'; btnRemove.className = 'bg-white/70 p-1 rounded text-red-500 btn-anim'; btnRemove.innerHTML = '✕'; btnRemove.onclick = () => { removeImageAt(i); };
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

        // try progressive quality reduction
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

// Setup drag & drop and click-to-upload handlers
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

// ===== CLOUD UPLOAD HELPERS =====
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
  // If user provided a custom handler function, use it
  if (typeof window.cloudImageUploadHandler === 'function') {
    return await window.cloudImageUploadHandler(dataUrl);
  }
  const uploadUrl = window.cloudImageUploadUrl || window.CLOUD_IMAGE_UPLOAD_URL;
  if (uploadUrl) {
    // Use XHR to allow upload progress events
    return await new Promise((resolve, reject) => {
      try {
        const blob = dataURLtoBlob(dataUrl);
        const form = new FormData();
        form.append('file', blob, 'upload.png');

        const uidLocal = uid || String(Math.random().toString(36).slice(2,9));
        if (window.__uploadProgressHandler) window.__uploadProgressHandler(uidLocal, { status: 'started', loaded: 0, total: blob.size });

        const xhr = new XMLHttpRequest();
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

  // If Firebase config is provided, try uploading to Firebase Storage
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

// ========== Firebase Storage support (optional) ==========
async function loadFirebaseSdkOnce() {
  if (window.__firebaseSdkLoaded) return;
  window.__firebaseSdkLoaded = true;
  // load compat SDKs for Storage to simplify usage
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
  if (!window.firebase) throw new Error('Firebase SDK failed to load');s
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