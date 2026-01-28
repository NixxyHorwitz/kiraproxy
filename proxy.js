const express = require('express');
const axios = require('axios');

const app = express();

// Middleware untuk parse body dalam berbagai format
app.use(express.json());
app.use(express.urlencoded({extended: true}));
app.use(express.raw({type: '*/*', limit: '10mb'}));

// CORS headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.all('/proxy', async (req, res) => {
  try {
    const targetUrl = req.query.url;

    if (!targetUrl) {
      return res.status(400).json({
        error: 'Parameter URL tidak ditemukan',
        usage: '/api/proxy?url=https://example.com',
      });
    }

    // Validasi URL
    let url;
    try {
      url = new URL(targetUrl);
    } catch (e) {
      return res.status(400).json({
        error: 'URL tidak valid',
        provided: targetUrl,
      });
    }

    // Siapkan headers - forward semua headers kecuali host
    const headers = {};
    Object.keys(req.headers).forEach(key => {
      // Skip headers yang tidak boleh di-forward
      if (!['host', 'connection', 'content-length'].includes(key.toLowerCase())) {
        headers[key] = req.headers[key];
      }
    });

    // Siapkan config untuk axios
    const config = {
      method: req.method,
      url: targetUrl,
      headers: headers,
      maxRedirects: 5,
      validateStatus: () => true, // Accept semua status code
    };

    // Tambahkan body jika ada (untuk POST, PUT, PATCH)
    if (['POST', 'PUT', 'PATCH'].includes(req.method.toUpperCase())) {
      config.data = req.body;
    }

    // Tambahkan query params jika ada (selain url)
    const queryParams = {...req.query};
    delete queryParams.url;
    if (Object.keys(queryParams).length > 0) {
      config.params = queryParams;
    }

    // Kirim request ke target URL
    const response = await axios(config);

    // Forward response headers
    Object.keys(response.headers).forEach(key => {
      // Skip headers yang bermasalah
      if (!['connection', 'transfer-encoding'].includes(key.toLowerCase())) {
        res.setHeader(key, response.headers[key]);
      }
    });

    // Set status code dan kirim response
    res.status(response.status).send(response.data);
  } catch (error) {
    console.error('Proxy error:', error.message);

    if (error.response) {
      // Error dari target server
      return res.status(error.response.status).json({
        error: 'Error dari target server',
        status: error.response.status,
        data: error.response.data,
      });
    } else if (error.request) {
      // Request dibuat tapi tidak ada response
      return res.status(503).json({
        error: 'Tidak dapat menghubungi target server',
        message: error.message,
      });
    } else {
      // Error lainnya
      return res.status(500).json({
        error: 'Internal proxy error',
        message: error.message,
      });
    }
  }
});

// Root endpoint untuk info
app.get('/', (req, res) => {
  res.json({
    message: 'Proxy API Server',
    usage: '/api/proxy?url=https://example.com',
    methods: 'GET, POST, PUT, DELETE, PATCH',
    note: 'Semua headers, body, dan query params akan di-forward',
  });
});

// Untuk local development
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Proxy server running on port ${PORT}`);
  });
}

module.exports = app;
