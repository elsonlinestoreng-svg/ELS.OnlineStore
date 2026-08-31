 let currentTotal = 0;

    function selectPaymentMethod(btn) {
      document.querySelectorAll('.payment-method-btn').forEach(b => b.classList.remove('border-emerald-500', 'bg-emerald-50'));
      btn.classList.add('border-emerald-500', 'bg-emerald-50');

<<<<<<< HEAD:js/cloudupload.js
      const method = btn.getAttribute('data-method');
      document.getElementById('card-payment-form').classList.toggle('hidden', method !== 'card');
      document.getElementById('bank-transfer-info').classList.toggle('hidden', method !== 'bank');
=======
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
<<<<<<< HEAD:frontend/js/cloudupload.js

=======
>>>>>>> zohan-work:js/cloudupload.js
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
>>>>>>> zohan-work:frontend/js/cloudupload.js
    }

    function payWithPaystack() {
      if (currentTotal <= 0) return alert("No amount to pay!");

      const handler = PaystackPop.setup({
        key: 'pk_test_xxxxxxxxxxxxxxxxxxxxxxxx', // ← Replace with your actual Paystack Public Key
        email: "customer@example.com",
        amount: Math.round(currentTotal * 100),
        currency: "NGN",
        ref: 'ELS-' + Math.floor(Math.random() * 1000000000),
        callback: function(response) {
          alert('✅ Payment Successful! Reference: ' + response.reference);
          goTo('orders');
        },
        onClose: function() {
          alert('Payment cancelled');
        }
      });
      handler.openIframe();
    }

    function loadPaymentPage() {
      const cartTotalEl = document.getElementById('cart-total');
      currentTotal = cartTotalEl ? parseFloat(cartTotalEl.textContent.replace(/[^0-9.]/g, '')) || 15000 : 15000;
      document.getElementById('summary-total').textContent = '₦' + currentTotal.toLocaleString();
      document.getElementById('bank-amount').textContent = currentTotal.toLocaleString();
    }

    window.goTo = function(page) {
      document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
      const target = document.getElementById('page-' + page);
      if (target) {
        target.classList.remove('hidden');
        if (page === 'payment') loadPaymentPage();
      }
    };

<<<<<<< HEAD:js/cloudupload.js
    document.addEventListener('DOMContentLoaded', () => {
      lucide.createIcons();
    });
=======
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
>>>>>>> zohan-work:frontend/js/cloudupload.js
