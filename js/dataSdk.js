window.API_BASE = 'http://localhost:8001/api';

function getToken() {
  return localStorage.getItem('els_token') || '';
}

window.dataSdk = {

  async create(product) {
    try {
      const token = getToken();
      const res = await fetch(`${window.API_BASE}/products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify(product)
      });

      const data = await res.json();

      if (!res.ok) {
        console.error('Create failed:', data);
        return { isOk: false, error: data.error || data.message };
      }

      return {
        isOk: true,
        item: data,
        id: data._id
      };
    } catch (err) {
      console.error('create failed', err);
      return { isOk: false };
    }
  },

  async getAll() {
    try {
      const res = await fetch(`${window.API_BASE}/products`);
      return await res.json();
    } catch (err) {
      console.error('getAll failed', err);
      return [];
    }
  },

  async update(id, updates) {
    try {
      const token = getToken();
      const res = await fetch(`${window.API_BASE}/products/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify(updates)
      });

      const data = await res.json();

      if (!res.ok) {
        console.error('Update failed:', data);
        return { isOk: false, error: data.error || data.message };
      }

      return { isOk: true, item: data };
    } catch (err) {
      console.error('update failed', err);
      return { isOk: false };
    }
  },

  async delete(product) {
    try {
      const token = getToken();
      const id = product._id || product.__backendId;

      const res = await fetch(`${window.API_BASE}/products/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': token ? `Bearer ${token}` : ''
        }
      });

      if (!res.ok) {
        const data = await res.json();
        console.error('Delete failed:', data);
        return { isOk: false, error: data.error || data.message };
      }

      return { isOk: true };
    } catch (err) {
      console.error('delete failed', err);
      return { isOk: false };
    }
  }

};
