/**
 * Product Catalog - Search, filtering, and pagination
 * Phase 3.5 Implementation
 * Integrates with /api/products endpoint for advanced filtering
 */

class ProductCatalog {
  constructor() {
    this.filters = {
      q: '',           // search keyword
      category: '',    // category filter
      min_price: 0,    // minimum price
      max_price: 1000000, // maximum price
      sort: 'newest',  // sort order
      page: 1,         // pagination
      limit: 20,       // items per page
    };
    this.products = [];
    this.totalCount = 0;
    this.isLoading = false;
  }

  /**
   * Initialize catalog with event listeners
   */
  async init() {
    this.setupFilterListeners();
    await this.loadProducts();
    console.log('✓ Product catalog initialized');
  }

  /**
   * Setup event listeners for all filters
   */
  setupFilterListeners() {
    // Search input
    const searchInput = document.getElementById('product-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.filters.q = e.target.value;
        this.filters.page = 1;
        this.loadProducts();
      });
    }

    // Category filter
    const categorySelect = document.getElementById('product-category-filter');
    if (categorySelect) {
      categorySelect.addEventListener('change', (e) => {
        this.filters.category = e.target.value;
        this.filters.page = 1;
        this.loadProducts();
      });
    }

    // Min price filter
    const minPriceInput = document.getElementById('product-min-price');
    if (minPriceInput) {
      minPriceInput.addEventListener('change', (e) => {
        this.filters.min_price = parseInt(e.target.value) || 0;
        this.filters.page = 1;
        this.loadProducts();
      });
    }

    // Max price filter
    const maxPriceInput = document.getElementById('product-max-price');
    if (maxPriceInput) {
      maxPriceInput.addEventListener('change', (e) => {
        this.filters.max_price = parseInt(e.target.value) || 1000000;
        this.filters.page = 1;
        this.loadProducts();
      });
    }

    // Sort selector
    const sortSelect = document.getElementById('product-sort-select');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        this.filters.sort = e.target.value;
        this.filters.page = 1;
        this.loadProducts();
      });
    }

    // Pagination buttons
    const prevBtn = document.getElementById('product-prev-page');
    const nextBtn = document.getElementById('product-next-page');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => this.prevPage());
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', () => this.nextPage());
    }
  }

  /**
   * Load products with current filters from API
   */
  async loadProducts() {
    if (this.isLoading) return;

    try {
      this.isLoading = true;
      
      // Show loading state
      const container = document.getElementById('shop-grid');
      if (container) {
        container.innerHTML = '<div class="col-span-full text-center py-16"><div class="inline-block"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-current"></div></div></div>';
      }

      // Try to load from API
      try {
        const response = await window.api.get('/products', this.filters);
        this.products = response.data || [];
        this.totalCount = response.meta?.totalCount || this.products.length;
      } catch (apiError) {
        // If API not available, fall back to client-side filtering
        console.log('API not available, using client-side filtering');
        this.filterClientSide();
      }

      this.renderProducts();
      this.updatePaginationInfo();
    } catch (error) {
      console.error('Failed to load products:', error);
      showToast('Failed to load products');
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Client-side filtering fallback (when API not available)
   */
  filterClientSide() {
    let filtered = allProducts.filter(p => p.name && (p.public !== false || p.seller === currentUser?.name));

    // Category filter
    if (this.filters.category) {
      filtered = filtered.filter(p => p.category === this.filters.category);
    }

    // Price range filter
    filtered = filtered.filter(p => {
      const price = Number(p.price) || 0;
      return price >= this.filters.min_price && price <= this.filters.max_price;
    });

    // Search filter
    if (this.filters.q) {
      const query = this.filters.q.toLowerCase();
      filtered = filtered.filter(p => 
        (p.name || '').toLowerCase().includes(query) || 
        (p.description || '').toLowerCase().includes(query)
      );
    }

    // Sort
    switch (this.filters.sort) {
      case 'price_asc':
        filtered.sort((a, b) => Number(a.price) - Number(b.price));
        break;
      case 'price_desc':
        filtered.sort((a, b) => Number(b.price) - Number(a.price));
        break;
      case 'rating':
        filtered.sort((a, b) => (b.average_rating || 0) - (a.average_rating || 0));
        break;
      case 'name':
        filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        break;
      case 'newest':
      default:
        filtered.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    }

    this.totalCount = filtered.length;
    
    // Apply pagination
    const start = (this.filters.page - 1) * this.filters.limit;
    this.products = filtered.slice(start, start + this.filters.limit);
  }

  /**
   * Render products grid
   */
  renderProducts() {
    const container = document.getElementById('shop-grid');
    if (!container) return;

    if (this.products.length === 0) {
      container.innerHTML = `
        <div class="col-span-full text-center py-16 text-gray-400">
          <p class="text-lg mb-4">No products found</p>
          <button onclick="goTo('open-store')" class="underline font-semibold" style="color:#e94560;">
            List a product to get started
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = this.products.map(p => {
      const avgRating = p.average_rating || 0;
      const ratingCount = p.rating_count || 0;

      return `
        <div class="product-card rounded-2xl overflow-hidden" style="background:white;" data-prod-id="${p.__backendId || p.id || p._id}">
          <div class="h-48 bg-gray-200 overflow-hidden relative">
            ${p.image_data || p.image ? `<img src="${p.image_data || p.image}" class="w-full h-full object-cover" alt="${escHtml(p.name)}" loading="lazy">` : '<div class="w-full h-full flex items-center justify-center text-6xl" style="background:linear-gradient(135deg, #f8f6f3, #eee);">📦</div>'}
            ${p.discount ? `<div class="absolute top-2 right-2 bg-red-600 text-white px-2 py-1 rounded text-xs font-bold">-${p.discount}%</div>` : ''}
            ${p.seller === currentUser?.name ? '<button onclick="triggerReplaceImage(\'' + (p.__backendId || p.id || p._id) + '\')" class="absolute top-2 right-2 bg-white/80 text-sm px-2 py-1 rounded shadow">Upload</button>' : ''}
          </div>
          <div class="p-5">
            <span class="text-xs font-medium px-2 py-1 rounded-full" style="background:#f0f0f0; color:#666;">${p.category || 'Other'}</span>
            ${p.public === false ? '<span class="text-xs ml-2 px-2 py-1 rounded-full" style="background:#fee2e2;color:#9b1c1c;font-weight:600">Private</span>' : ''}
            
            <h4 class="font-bold mt-2 mb-1" style="color:#1a1a2e;">${escHtml(p.name)}</h4>
            <p class="text-gray-500 text-sm mb-2 line-clamp-2">${escHtml(p.description)}</p>
            
            <!-- Star Rating -->
            ${ratingCount > 0 ? `
              <div class="flex items-center gap-1 mb-2">
                <div class="flex text-amber-400 text-xs">
                  ${[...Array(5)].map((_, i) => `<span class="${i < Math.round(avgRating) ? 'text-amber-400' : 'text-gray-300'}">★</span>`).join('')}
                </div>
                <span class="text-xs text-slate-600">${avgRating.toFixed(1)}</span>
                <span class="text-xs text-slate-500">(${ratingCount})</span>
              </div>
            ` : '<p class="text-xs text-slate-500 mb-2">No reviews yet</p>'}
            
            <div class="flex items-center justify-between gap-2 mb-3">
              <span class="text-xl font-bold" style="color:#e94560;">₦${Number(p.price).toLocaleString()}</span>
              <button onclick="addToCart('${p.__backendId || p.id || p._id}')" class="px-3 py-2 rounded-xl text-sm font-semibold text-white transition hover:opacity-90" style="background:#e94560;">Add</button>
            </div>
            
            ${p.seller === currentUser?.name ? `
              <div class="mt-2 flex gap-2 flex-wrap">
                <button onclick="triggerReplaceImage('${p.__backendId || p.id || p._id}')" class="px-3 py-2 rounded-xl text-sm font-semibold" style="background:#0f3460;color:white;">Edit</button>
                ${p.public === false ? `<button onclick="setProductPublic('${p.__backendId || p.id || p._id}', true)" class="px-3 py-2 rounded-xl text-sm font-semibold" style="background:#16a34a;color:white;">Publish</button>` : `<button onclick="setProductPublic('${p.__backendId || p.id || p._id}', false)" class="px-3 py-2 rounded-xl text-sm font-semibold" style="background:#f97316;color:white;">Unpublish</button>`}
              </div>
            ` : ''}
            
            <button onclick="openChat('${p.__backendId || p.id || p._id}')" class="w-full px-3 py-2 rounded-xl text-sm font-semibold text-white transition hover:opacity-90 mt-2" style="background:#0f3460;"><i data-lucide="message-circle" class="w-3 h-3 inline mr-1"></i>Chat Seller</button>
            <p class="text-xs text-gray-400 mt-2">by ${escHtml(p.seller || 'Unknown')}</p>
          </div>
        </div>
      `;
    }).join('');

    lucide.createIcons();
  }

  /**
   * Update pagination info
   */
  updatePaginationInfo() {
    const totalPages = Math.ceil(this.totalCount / this.filters.limit);
    const pageInfo = document.getElementById('product-page-info');
    const prevBtn = document.getElementById('product-prev-page');
    const nextBtn = document.getElementById('product-next-page');

    if (pageInfo) {
      pageInfo.textContent = `Page ${this.filters.page} of ${totalPages} (${this.totalCount} total)`;
    }

    // Enable/disable pagination buttons
    if (prevBtn) {
      prevBtn.disabled = this.filters.page <= 1;
    }
    if (nextBtn) {
      nextBtn.disabled = this.filters.page >= totalPages;
    }
  }

  /**
   * Next page
   */
  async nextPage() {
    const totalPages = Math.ceil(this.totalCount / this.filters.limit);
    if (this.filters.page < totalPages) {
      this.filters.page++;
      await this.loadProducts();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  /**
   * Previous page
   */
  async prevPage() {
    if (this.filters.page > 1) {
      this.filters.page--;
      await this.loadProducts();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  /**
   * Reset filters to defaults
   */
  resetFilters() {
    this.filters = {
      q: '',
      category: '',
      min_price: 0,
      max_price: 1000000,
      sort: 'newest',
      page: 1,
      limit: 20,
    };
    
    // Reset UI
    if (document.getElementById('product-search')) {
      document.getElementById('product-search').value = '';
    }
    if (document.getElementById('product-category-filter')) {
      document.getElementById('product-category-filter').value = '';
    }
    if (document.getElementById('product-min-price')) {
      document.getElementById('product-min-price').value = '0';
    }
    if (document.getElementById('product-max-price')) {
      document.getElementById('product-max-price').value = '1000000';
    }
    if (document.getElementById('product-sort-select')) {
      document.getElementById('product-sort-select').value = 'newest';
    }

    this.loadProducts();
  }
}

// Initialize global instance
window.productCatalog = new ProductCatalog();

// Auto-initialize when shop page is loaded
document.addEventListener('pagechange', (e) => {
  if (e.detail === 'shop' && window.productCatalog) {
    window.productCatalog.init();
  }
});
