const https = require('https');

function paystackRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.paystack.co',
      path: path,
      method: method,
      headers: {
        Authorization: 'Bearer ' + process.env.PAYSTACK_SECRET_KEY,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function verifyTransaction(reference) {
  return paystackRequest('GET', '/transaction/verify/' + encodeURIComponent(reference));
}

async function initializeTransaction(params) {
  return paystackRequest('POST', '/transaction/initialize', params);
}

module.exports = { verifyTransaction, initializeTransaction };
