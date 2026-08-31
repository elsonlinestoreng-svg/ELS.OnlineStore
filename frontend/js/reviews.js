/**
 * Reviews Service - Product reviews and star ratings
 * Phase 3.6 Implementation
 */

class ReviewsService {
  constructor() {
    this.productReviews = {};
    this.userReviews = [];
    this.stats = {};
  }

  /**
   * Load reviews for a product
   */
  async loadProductReviews(productId, page = 1, limit = 10) {
    if (!productId) return { reviews: [], stats: {} };

    try {
      const response = await window.api.get(`/reviews/product/${productId}`, { page, limit });
      this.productReviews[productId] = response.data || [];
      this.stats[productId] = response.meta?.stats || {};
      
      return {
        reviews: this.productReviews[productId],
        stats: this.stats[productId],
      };
    } catch (error) {
      console.error('Failed to load product reviews:', error);
      return { reviews: [], stats: {} };
    }
  }

  /**
   * Load user's own reviews
   */
  async loadMyReviews() {
    try {
      const response = await window.api.get('/reviews/mine');
      this.userReviews = response.data || [];
      return this.userReviews;
    } catch (error) {
      console.error('Failed to load my reviews:', error);
      return [];
    }
  }

  /**
   * Submit a review
   */
  async submitReview(productId, rating, comment) {
    if (!productId || !rating || !comment.trim()) {
      showToast('Please provide a rating and comment');
      return null;
    }

    try {
      const response = await window.api.post('/reviews', {
        productId,
        rating: parseInt(rating),
        comment: comment.trim(),
      });

      showToast('Review submitted successfully!');
      
      // Reload product reviews
      await this.loadProductReviews(productId);
      
      return response.data;
    } catch (error) {
      console.error('Failed to submit review:', error);
      showToast('Failed to submit review');
      return null;
    }
  }

  /**
   * Render review form HTML
   */
  renderReviewForm(productId) {
    return `
      <div class="bg-slate-50 p-4 rounded-lg">
        <h3 class="font-semibold mb-4">Write a Review</h3>
        <form onsubmit="reviewsService.handleReviewSubmit(event, '${productId}')">
          <!-- Star Rating Input -->
          <div class="mb-4">
            <label class="block text-sm font-medium mb-2">Rating (1-5 stars)</label>
            <div id="star-rating-${productId}" class="flex gap-1 text-3xl cursor-pointer">
              ${[1, 2, 3, 4, 5].map(i => `
                <span data-rating="${i}" onclick="reviewsService.setRating('${productId}', ${i})" class="text-gray-300 hover:text-amber-400 transition">★</span>
              `).join('')}
            </div>
            <input id="rating-input-${productId}" type="hidden" name="rating" required>
            <p class="text-xs text-slate-600 mt-1"><span id="rating-value-${productId}">0</span>/5 stars</p>
          </div>

          <!-- Comment -->
          <div class="mb-4">
            <label class="block text-sm font-medium mb-2">Your Comment</label>
            <textarea id="comment-${productId}" name="comment" placeholder="Tell others what you think about this product..." class="w-full border border-slate-300 rounded-lg px-3 py-2 h-24 resize-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" required></textarea>
            <p class="text-xs text-slate-500 mt-1" id="char-count-${productId}">0/500 characters</p>
          </div>

          <div class="flex gap-2">
            <button type="submit" class="flex-1 bg-emerald-600 text-white py-2 rounded-lg font-semibold hover:bg-emerald-700 transition">Submit Review</button>
            <button type="button" onclick="this.closest('.bg-slate-50').remove()" class="flex-1 bg-slate-200 text-slate-900 py-2 rounded-lg font-semibold hover:bg-slate-300 transition">Cancel</button>
          </div>
        </form>
      </div>
    `;
  }

  /**
   * Set star rating
   */
  setRating(productId, rating) {
    const input = document.getElementById(`rating-input-${productId}`);
    const valueDisplay = document.getElementById(`rating-value-${productId}`);
    
    if (input) input.value = rating;
    if (valueDisplay) valueDisplay.textContent = rating;

    const stars = document.querySelectorAll(`#star-rating-${productId} span`);
    stars.forEach((star, i) => {
      if (i < rating) {
        star.classList.add('text-amber-400');
        star.classList.remove('text-gray-300');
      } else {
        star.classList.remove('text-amber-400');
        star.classList.add('text-gray-300');
      }
    });
  }

  /**
   * Handle review submission
   */
  async handleReviewSubmit(event, productId) {
    event.preventDefault();
    const form = event.target;
    const rating = form.rating.value;
    const comment = form.comment.value;
    
    await this.submitReview(productId, rating, comment);
  }

  /**
   * Render reviews list HTML
   */
  renderReviewsList(reviews) {
    if (!reviews || reviews.length === 0) {
      return '<div class="py-8 text-center text-slate-400">No reviews yet. Be the first to review!</div>';
    }

    return reviews.map(review => `
      <div class="border-b pb-4 mb-4 last:border-b-0">
        <div class="flex items-start justify-between mb-2">
          <div>
            <div class="flex items-center gap-2 mb-1">
              <p class="font-semibold text-sm text-slate-900">${escHtml(review.buyerName || 'Anonymous')}</p>
              ${review.verified ? '<span class="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">✓ Verified Buyer</span>' : ''}
            </div>
            <div class="flex items-center gap-2">
              <div class="flex text-amber-400 text-sm">
                ${[...Array(5)].map((_, i) => `
                  <span class="${i < review.rating ? 'text-amber-400' : 'text-gray-300'}">★</span>
                `).join('')}
              </div>
              <span class="text-xs text-slate-600 font-medium">${review.rating}.0</span>
            </div>
          </div>
          <p class="text-xs text-slate-500">${reviewsService.getTimeAgo(review.createdAt)}</p>
        </div>
        <p class="text-sm text-slate-700 mb-2">${escHtml(review.comment)}</p>
        ${review.reply ? `
          <div class="bg-slate-50 p-2 rounded text-xs mt-2">
            <p class="font-semibold text-slate-900 mb-1">Seller Reply:</p>
            <p class="text-slate-700">${escHtml(review.reply)}</p>
          </div>
        ` : ''}
      </div>
    `).join('');
  }

  /**
   * Render rating summary/stats HTML
   */
  renderRatingSummary(stats) {
    if (!stats) return '';

    const avgRating = stats.averageRating || 0;
    const totalReviews = stats.totalReviews || 0;
    const percentages = {
      5: stats.fiveStarCount ? Math.round((stats.fiveStarCount / totalReviews) * 100) : 0,
      4: stats.fourStarCount ? Math.round((stats.fourStarCount / totalReviews) * 100) : 0,
      3: stats.threeStarCount ? Math.round((stats.threeStarCount / totalReviews) * 100) : 0,
      2: stats.twoStarCount ? Math.round((stats.twoStarCount / totalReviews) * 100) : 0,
      1: stats.oneStarCount ? Math.round((stats.oneStarCount / totalReviews) * 100) : 0,
    };

    return `
      <div class="bg-slate-50 p-6 rounded-lg">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <!-- Average Rating -->
          <div class="flex flex-col items-center justify-center">
            <p class="text-4xl font-bold text-slate-900">${avgRating.toFixed(1)}</p>
            <div class="flex text-amber-400 text-lg mt-1">
              ${[...Array(5)].map((_, i) => `
                <span class="${i < Math.round(avgRating) ? 'text-amber-400' : 'text-gray-300'}">★</span>
              `).join('')}
            </div>
            <p class="text-sm text-slate-600 mt-2">${totalReviews} ${totalReviews === 1 ? 'review' : 'reviews'}</p>
          </div>

          <!-- Rating Breakdown -->
          <div class="md:col-span-2">
            ${[5, 4, 3, 2, 1].map(rating => `
              <div class="flex items-center gap-2 mb-3 last:mb-0">
                <span class="text-xs font-medium text-slate-600 w-8">${rating}★</span>
                <div class="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div class="bg-amber-400 h-2 rounded-full transition-all" style="width: ${percentages[rating] || 0}%"></div>
                </div>
                <span class="text-xs text-slate-600 w-12 text-right">${percentages[rating]}%</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render star rating component for product cards
   */
  renderProductCardRating(product) {
    const avgRating = product.average_rating || 0;
    const ratingCount = product.rating_count || 0;

    if (ratingCount === 0) {
      return '<p class="text-xs text-slate-500">No reviews yet</p>';
    }

    return `
      <div class="flex items-center gap-1 mt-1">
        <div class="flex text-amber-400 text-xs">
          ${[...Array(5)].map((_, i) => `
            <span class="${i < Math.round(avgRating) ? 'text-amber-400' : 'text-gray-300'}">★</span>
          `).join('')}
        </div>
        <span class="text-xs text-slate-600">${avgRating.toFixed(1)}</span>
        <span class="text-xs text-slate-500">(${ratingCount})</span>
      </div>
    `;
  }

  /**
   * Get relative time ("2m ago")
   */
  getTimeAgo(dateString) {
    const date = new Date(dateString);
    const seconds = Math.floor((new Date() - date) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    
    return date.toLocaleDateString();
  }
}

// Initialize global instance
window.reviewsService = new ReviewsService();

// Character counter for review form
document.addEventListener('input', (e) => {
  if (e.target.name === 'comment') {
    const productId = e.target.id.replace('comment-', '');
    const charCount = e.target.value.length;
    const counter = document.getElementById(`char-count-${productId}`);
    if (counter) {
      counter.textContent = `${charCount}/500 characters`;
    }
    // Prevent exceeding 500 characters
    if (charCount > 500) {
      e.target.value = e.target.value.substring(0, 500);
    }
  }
});
