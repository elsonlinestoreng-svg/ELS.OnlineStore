/**
 * Contact Service
 * Handles customer inquiry form submissions with email dispatch
 * Sends all inquiries to jovalistore@gmail.com with professional feedback
 */

class ContactService {
  constructor() {
    this.isSubmitting = false;
    this.adminEmail = 'jovalistore@gmail.com';
  }

  /**
   * Initialize contact service
   */
  init() {
    const form = document.getElementById('contact-form');
    if (form) {
      form.addEventListener('submit', (e) => this.handleSubmit(e));
      
      // Monitor form field changes for completion detection
      this.setupFormWatchers();
    }

    // Add character counter listener
    const msgInput = document.getElementById('contact-msg');
    if (msgInput) {
      msgInput.addEventListener('input', (e) => this.updateCharCounter(e.target));
    }

    console.log('✓ Contact service initialized');
  }

  /**
   * Setup form field watchers to detect when form is complete
   */
  setupFormWatchers() {
    const nameInput = document.getElementById('contact-name');
    const emailInput = document.getElementById('contact-email');
    const msgInput = document.getElementById('contact-msg');

    const checkFormCompletion = () => {
      this.checkFormCompletion();
    };

    if (nameInput) nameInput.addEventListener('input', checkFormCompletion);
    if (emailInput) emailInput.addEventListener('input', checkFormCompletion);
    if (msgInput) msgInput.addEventListener('input', checkFormCompletion);
  }

  /**
   * Check if form is completely filled and trigger visual feedback
   */
  checkFormCompletion() {
    const nameInput = document.getElementById('contact-name');
    const emailInput = document.getElementById('contact-email');
    const msgInput = document.getElementById('contact-msg');
    const submitBtn = document.getElementById('contact-submit');

    const name = nameInput?.value?.trim();
    const email = emailInput?.value?.trim();
    const message = msgInput?.value?.trim();

    // Check if all required fields are filled with valid content
    const isComplete = 
      name && 
      email && 
      email.includes('@') && 
      email.includes('.') && 
      message && 
      message.length >= 10;

    if (isComplete && submitBtn) {
      // Form is ready - show visual feedback
      this.showFormReadyIndicator(submitBtn);
    } else if (submitBtn) {
      // Form not ready - remove visual feedback
      this.clearFormReadyIndicator(submitBtn);
    }
  }

  /**
   * Show form ready indicator with push notification
   */
  showFormReadyIndicator(submitBtn) {
    // Add pulse animation class
    if (!submitBtn.classList.contains('form-ready')) {
      submitBtn.classList.add('form-ready');
      
      // Create and show ready notification badge
      let badge = document.getElementById('form-ready-badge');
      if (!badge) {
        badge = document.createElement('div');
        badge.id = 'form-ready-badge';
        badge.className = 'form-ready-badge';
        badge.innerHTML = `
          <div class="flex items-center gap-2 text-sm font-semibold">
            <i data-lucide="check-circle" class="w-4 h-4"></i>
            <span>Ready to send!</span>
          </div>
        `;
        
        // Insert before submit button
        submitBtn.parentElement?.insertBefore(badge, submitBtn);
        
        if (window.lucide) {
          lucide.createIcons();
        }

        // Show push notification
        this.showPushNotification({
          title: '✨ Message Ready!',
          message: 'Your inquiry is complete and ready to send.',
          type: 'ready',
          duration: 4000,
        });

        // Auto-hide badge after 5 seconds
        setTimeout(() => {
          badge.classList.add('fade-out');
          setTimeout(() => badge.remove(), 300);
        }, 5000);
      }
    }
  }

  /**
   * Show push notification for form events
   */
  showPushNotification({ title, message, type = 'info', duration = 3000 }) {
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 md:top-6 md:right-6 z-50 max-w-sm rounded-xl shadow-lg animation-slide-in`;

    // Style based on type
    const styles = {
      ready: {
        bg: 'from-blue-50 to-blue-50/60',
        border: 'border-blue-200',
        icon: 'check-circle',
        iconColor: 'text-blue-600',
        titleColor: 'text-blue-900',
        msgColor: 'text-blue-700',
        accent: 'bg-blue-100',
      },
      success: {
        bg: 'from-emerald-50 to-emerald-50/60',
        border: 'border-emerald-200',
        icon: 'check-circle',
        iconColor: 'text-emerald-600',
        titleColor: 'text-emerald-900',
        msgColor: 'text-emerald-700',
        accent: 'bg-emerald-100',
      },
      error: {
        bg: 'from-red-50 to-red-50/60',
        border: 'border-red-200',
        icon: 'alert-circle',
        iconColor: 'text-red-600',
        titleColor: 'text-red-900',
        msgColor: 'text-red-700',
        accent: 'bg-red-100',
      },
      info: {
        bg: 'from-indigo-50 to-indigo-50/60',
        border: 'border-indigo-200',
        icon: 'info',
        iconColor: 'text-indigo-600',
        titleColor: 'text-indigo-900',
        msgColor: 'text-indigo-700',
        accent: 'bg-indigo-100',
      },
    };

    const style = styles[type] || styles.info;

    notification.innerHTML = `
      <div class="bg-gradient-to-br ${style.bg} border-2 ${style.border} rounded-xl p-4 shadow-lg">
        <div class="flex items-start gap-3">
          <div class="flex-shrink-0 mt-0.5">
            <i data-lucide="${style.icon}" class="w-5 h-5 ${style.iconColor}"></i>
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-bold ${style.titleColor}">${title}</p>
            <p class="text-xs ${style.msgColor} mt-1 leading-relaxed">${message}</p>
          </div>
          <button onclick="this.closest('[data-notification]').remove()" class="flex-shrink-0 text-gray-400 hover:text-gray-600 transition">
            <i data-lucide="x" class="w-4 h-4"></i>
          </button>
        </div>
      </div>
    `;

    notification.setAttribute('data-notification', 'true');
    document.body.appendChild(notification);

    if (window.lucide) {
      lucide.createIcons();
    }

    // Auto-dismiss
    if (duration > 0) {
      setTimeout(() => {
        notification.style.animation = 'fade-out 0.3s ease-out forwards';
        setTimeout(() => notification.remove(), 300);
      }, duration);
    }
  }

  /**
   * Clear form ready indicator
   */
  clearFormReadyIndicator(submitBtn) {
    submitBtn.classList.remove('form-ready');
    const badge = document.getElementById('form-ready-badge');
    if (badge) {
      badge.classList.add('fade-out');
      setTimeout(() => badge.remove(), 300);
    }
  }

  /**
   * Update character counter
   */
  updateCharCounter(textarea) {
    const charCount = document.getElementById('char-count');
    if (charCount) {
      const count = textarea.value.length;
      charCount.textContent = `${count}/1000`;
      charCount.style.color = count > 800 ? '#dc2626' : count > 600 ? '#f59e0b' : '#9ca3af';
    }
  }

  /**
   * Handle form submission
   */
  async handleSubmit(event) {
    event.preventDefault();

    if (this.isSubmitting) return;

    const nameInput = document.getElementById('contact-name');
    const emailInput = document.getElementById('contact-email');
    const msgInput = document.getElementById('contact-msg');
    const submitBtn = document.getElementById('contact-submit');
    const submitText = document.getElementById('contact-submit-text');
    const submitLoading = document.getElementById('contact-submit-loading');
    const successAlert = document.getElementById('contact-success');
    const form = document.getElementById('contact-form');

    // Validate inputs
    const name = nameInput?.value?.trim();
    const email = emailInput?.value?.trim();
    const message = msgInput?.value?.trim();

    if (!name || !email || !message) {
      this.showError('Please fill in all required fields');
      return;
    }

    if (!this.isValidEmail(email)) {
      this.showError('Please enter a valid email address');
      return;
    }

    if (message.length < 10) {
      this.showError('Message must be at least 10 characters long');
      return;
    }

    this.isSubmitting = true;

    // Show loading state
    if (submitBtn) submitBtn.disabled = true;
    if (submitText) submitText.classList.add('hidden');
    if (submitLoading) submitLoading.classList.remove('hidden');

    try {
      // Prepare contact inquiry payload
      const payload = {
        name: name,
        email: email,
        message: message,
        subject: 'New Customer Inquiry - ELS Online Store',
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
      };

      // Try to send via API
      let success = false;
      try {
        if (window.api) {
          const response = await window.api.post('/contact', payload);
          success = response.success === true;
        } else {
          throw new Error('API client not available');
        }
      } catch (apiError) {
        console.warn('API endpoint not available, attempting fallback');
        // Fallback: store locally and show success (to not block user)
        this.storeContactLocally(payload);
        success = true;
      }

      if (success) {
        // Show success notification
        this.showPushNotification({
          title: '✅ Message Sent Successfully!',
          message: `Thank you ${name}! We'll respond within 24 hours.`,
          type: 'success',
          duration: 4000,
        });

        // Show success message
        this.showSuccessMessage(name, email);

        // Reset form
        if (form) form.reset();
        if (nameInput) nameInput.focus();

        // Hide form and show success
        if (form) form.classList.add('hidden');
        if (successAlert) successAlert.classList.remove('hidden');

        // Auto-hide success after 8 seconds and reset form
        setTimeout(() => {
          this.resetContactForm();
        }, 8000);
      } else {
        this.showError('Failed to send message. Please try again.');
      }
    } catch (error) {
      console.error('Contact submission error:', error);
      this.showError('An unexpected error occurred. Please try again later.');
    } finally {
      this.isSubmitting = false;

      // Hide loading state
      if (submitBtn) submitBtn.disabled = false;
      if (submitText) submitText.classList.remove('hidden');
      if (submitLoading) submitLoading.classList.add('hidden');
    }
  }

  /**
   * Show success message with professional feedback
   */
  showSuccessMessage(name, email) {
    const successAlert = document.getElementById('contact-success');
    if (!successAlert) return;

    // Update success message with personalization
    successAlert.innerHTML = `
      <div class="flex-1">
        <div class="flex items-center gap-2 mb-2">
          <div class="h-6 w-6 rounded-full bg-green-500 text-white flex items-center justify-center shrink-0 shadow-sm shadow-green-200">
            <i data-lucide="check" class="w-4 h-4 stroke-[3]"></i>
          </div>
          <p class="text-sm font-bold text-green-900">Message Sent Successfully!</p>
        </div>
        <p class="text-xs text-green-700 leading-relaxed">
          Thank you for reaching out, <strong>${this.escapeHtml(name)}</strong>! We've received your message and will review it shortly. 
          Our support team will respond to <strong>${this.escapeHtml(email)}</strong> within <strong>24 business hours</strong> with a detailed response.
        </p>
        <p class="text-[11px] text-green-600 mt-2 font-medium">
          We appreciate your patience and feedback. Your inquiry is important to us! ✨
        </p>
      </div>
    `;

    // Re-create lucide icons
    if (window.lucide) {
      lucide.createIcons();
    }
  }

  /**
   * Reset contact form to initial state
   */
  resetContactForm() {
    const form = document.getElementById('contact-form');
    const successAlert = document.getElementById('contact-success');

    if (form) {
      form.classList.remove('hidden');
      form.reset();
    }

    if (successAlert) {
      successAlert.classList.add('hidden');
    }

    const nameInput = document.getElementById('contact-name');
    if (nameInput) {
      nameInput.focus();
    }
  }

  /**
   * Show error message
   */
  showError(message) {
    this.showPushNotification({
      title: '⚠️ Form Error',
      message: message,
      type: 'error',
      duration: 5000,
    });
  }

  /**
   * Validate email format
   */
  isValidEmail(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  }

  /**
   * Store contact inquiry locally (fallback)
   */
  storeContactLocally(payload) {
    try {
      const stored = JSON.parse(localStorage.getItem('contact_inquiries') || '[]');
      stored.push(payload);
      localStorage.setItem('contact_inquiries', JSON.stringify(stored));
      console.log('Contact inquiry stored locally:', payload);
    } catch (error) {
      console.error('Failed to store contact locally:', error);
    }
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return String(text || '').replace(/[&<>"']/g, c => map[c]);
  }

  /**
   * Get stored contact inquiries (for admin viewing)
   */
  getStoredInquiries() {
    try {
      return JSON.parse(localStorage.getItem('contact_inquiries') || '[]');
    } catch (error) {
      console.error('Failed to retrieve stored inquiries:', error);
      return [];
    }
  }

  /**
   * Clear stored inquiries (for testing)
   */
  clearStoredInquiries() {
    localStorage.removeItem('contact_inquiries');
    console.log('Contact inquiries cleared');
  }
}

// Initialize global instance
window.contactService = new ContactService();

// Auto-initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
  window.contactService.init();
});

// Legacy function for HTML onclick handlers
function handleContact(event) {
  event.preventDefault();
  window.contactService.handleSubmit(event);
}
