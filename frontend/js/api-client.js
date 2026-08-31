/**
 * Centralized API client for all REST endpoints
 * Handles authentication, error handling, and request formatting
 * Foundation for all Phase 3 & 4 features
 */

class APIClient {
  constructor(baseUrl = null) {
    this.baseUrl = baseUrl || window.API_BASE || 'http://localhost:8001/api';
    this.token = localStorage.getItem('els_token');
    this.defaultHeaders = {
      'Content-Type': 'application/json',
    };
  }

  /**
   * Update token when user logs in
   */
  setToken(token) {
    this.token = token;
    if (token) {
      localStorage.setItem('els_token', token);
    }
  }

  /**
   * Get stored token
   */
  getToken() {
    return this.token || localStorage.getItem('els_token');
  }

  /**
   * Clear token on logout
   */
  clearToken() {
    this.token = null;
    localStorage.removeItem('els_token');
  }

  /**
   * Build headers with authentication
   */
  getHeaders(customHeaders = {}) {
    const headers = { ...this.defaultHeaders, ...customHeaders };
    const token = this.getToken();
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
  }

  /**
   * Core fetch method with auth & error handling
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = this.getHeaders(options.headers);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      const data = await response.json();

      // Handle 401 - token expired, redirect to login
      if (response.status === 401) {
        this.clearToken();
        if (typeof goTo === 'function') {
          goTo('login');
        }
        throw new Error('Authentication expired. Please login again.');
      }

      if (!response.ok) {
        const error = new Error(data.message || `API Error: ${response.status}`);
        error.status = response.status;
        error.data = data;
        throw error;
      }

      return data;
    } catch (error) {
      console.error(`API Error [${endpoint}]:`, error);
      throw error;
    }
  }

  /**
   * GET request
   */
  async get(endpoint, params = {}) {
    const query = new URLSearchParams(params).toString();
    const url = query ? `${endpoint}?${query}` : endpoint;
    return this.request(url, { method: 'GET' });
  }

  /**
   * POST request
   */
  async post(endpoint, data = {}) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * PUT request
   */
  async put(endpoint, data = {}) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  /**
   * PATCH request
   */
  async patch(endpoint, data = {}) {
    return this.request(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  /**
   * DELETE request
   */
  async delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }

  /**
   * File upload
   */
  async uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);
    
    const url = `${this.baseUrl}/upload`;
    const token = this.getToken();
    const headers = {};
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!response.ok) {
        throw new Error('File upload failed');
      }

      return response.json();
    } catch (error) {
      console.error('Upload Error:', error);
      throw error;
    }
  }

  /**
   * Batch request - useful for loading multiple resources
   */
  async batch(requests) {
    return Promise.all(
      requests.map(req => this[req.method.toLowerCase()](req.endpoint, req.data))
    );
  }
}

// Create global instance
window.api = new APIClient();

// Export for module systems if needed
if (typeof module !== 'undefined' && module.exports) {
  module.exports = APIClient;
}
