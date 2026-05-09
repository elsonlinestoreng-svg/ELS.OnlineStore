const API_BASE = 'http://localhost:8001/api';

window.dataSdk = {

  async create(product) {
  try {
    const res = await fetch(`${API_BASE}/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(product)
    });

    const data = await res.json();

    return {
      isOk: true, 
      item: data,
      id: data._id
    };

  } catch (err) {
    console.error('create failed', err);

    return {
      isOk: false
    };
  }
},

  async getAll() {
    try {
      const res = await fetch(`${API_BASE}/products`);
      return await res.json();

    } catch (err) {
      console.error('getAll failed', err);
      return [];
    }
  },

  async delete(product) {
    try {
      const id = product._id || product.__backendId;

      await fetch(`${API_BASE}/products/${id}`, {
        method: 'DELETE'
      });

      allProducts = allProducts.filter(p =>
        (p._id || p.__backendId) !== id
      );

      renderShop();
      renderHomeProducts();
      renderMyProducts();

      return {
        isOk: true
      };

    } catch (err) {
      console.error('delete failed', err);

      return {
        isOk: false
      };
    }
  }

};