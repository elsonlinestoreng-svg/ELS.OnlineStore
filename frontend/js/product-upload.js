// Product creation UI logic
const uploadStatus = document.getElementById('upload-status');
const createButton = document.getElementById('create-product');
const result = document.getElementById('result');
let uploadedUrls = [];
let editProductId = null;

function getApiBase() {
  return (window.API_BASE || 'http://localhost:8001/api').replace(/\/+$/, '');
}

function setResult(message, error = false) {
  if (!result) return;
  result.textContent = message;
  result.className = error ? 'mt-3 text-sm text-red-600' : 'mt-3 text-sm text-emerald-700';
}

function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

async function loadProductForEdit() {
  const productId = getQueryParam('product_id');
  if (!productId) return;
  const token = localStorage.getItem('els_token');
  if (!token) return;

  try {
    const res = await fetch(getApiBase() + '/products/' + productId, {
      headers: { Authorization: 'Bearer ' + token }
    });
    if (!res.ok) {
      return;
    }
    const product = await res.json();
    if (!product || product.error) return;

    editProductId = productId;
    document.getElementById('product-name').value = product.name || '';
    document.getElementById('product-price').value = product.price || '';
    document.getElementById('product-category').value = product.category || '';
    document.getElementById('product-desc').value = product.description || '';
    uploadedUrls = Array.isArray(product.images) ? product.images.slice() : [];
    window.selectedImages = uploadedUrls.slice();
    if (typeof renderImageGallery === 'function') renderImageGallery();
    uploadStatus.textContent = uploadedUrls.length ? `${uploadedUrls.length} existing image(s)` : 'No images selected yet';
    if (createButton) createButton.textContent = 'Update Product';
  } catch (err) {
    console.error('Load product for edit failed', err);
  }
}

async function prepareImagesForUpload() {
  const sourceImages = uploadedUrls.length ? uploadedUrls.slice() : (Array.isArray(window.selectedImages) ? window.selectedImages.slice() : []);
  if (!sourceImages.length) return [];

  const results = [];
  for (let i = 0; i < sourceImages.length; i++) {
    const src = sourceImages[i];
    if (typeof src === 'string' && src.startsWith('data:')) {
      try {
        const url = await uploadImageToCloud(src, Date.now().toString() + '-' + i);
        if (url) results.push(url);
      } catch (err) {
        console.error('Cloud upload failed for image', err);
      }
    } else if (typeof src === 'string' && /^https?:\/\//.test(src)) {
      results.push(src);
    }
  }

  uploadedUrls = results;
  return results;
}

async function saveProduct() {
  const name = (document.getElementById('product-name')?.value || '').trim();
  const price = Number(document.getElementById('product-price')?.value || 0);
  const category = (document.getElementById('product-category')?.value || '').trim();
  const desc = (document.getElementById('product-desc')?.value || '').trim();

  if (!name || !price) {
    setResult('Name and price required', true);
    return;
  }

  const images = await prepareImagesForUpload();
  if (!images.length) {
    setResult('Please upload at least one image', true);
    return;
  }

  const body = {
    name,
    price,
    category,
    description: desc,
    images,
    primary_image: images[0],
    image_data: images[0],
    public: true
  };

  const token = localStorage.getItem('els_token') || '';
  if (!token) {
    setResult('Please login or complete seller registration first.', true);
    return;
  }

  try {
    const url = getApiBase() + '/products' + (editProductId ? '/' + editProductId : '');
    const method = editProductId ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token
      },
      body: JSON.stringify(body)
    });
    const json = await res.json();
    if (!res.ok) {
      setResult(json && (json.error || json.message) ? (json.error || json.message) : 'Failed to save product', true);
      return;
    }

    setResult(editProductId ? 'Product updated successfully' : 'Product created successfully');
    if (!editProductId) {
      document.getElementById('product-form').reset();
      uploadStatus.textContent = '';
      uploadedUrls = [];
    }
  } catch (err) {
    console.error(err);
    setResult('Server error during product save', true);
  }
}

document.getElementById('create-product')?.addEventListener('click', async (e) => {
  e.preventDefault();
  await saveProduct();
});

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

loadProductForEdit();
