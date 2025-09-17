const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Mock authentication endpoint
app.post('/api/widget/auth', (req, res) => {
  console.log('Auth request received:', req.body);

  // Return mock authentication response
  res.json({
    bearer_token: 'mock_bearer_token_' + Date.now(),
    session_id: 'mock_session_' + Date.now(),
    custodian: {
      id: req.body.partner_id || 'demo',
      name: 'Demo Custodian',
      status: 'active'
    },
    settings: {
      enabled: true,
      features: ['search', 'rollover']
    }
  });
});

// Mock create account endpoint
app.post('/api/widget/create-account', (req, res) => {
  console.log('Create account request:', req.body);

  res.json({
    user: {
      id: 'user_' + Date.now(),
      email: req.body.email,
      created_at: new Date().toISOString()
    },
    is_new_user: true
  });
});

// Start server
const PORT = 3002;
app.listen(PORT, () => {
  console.log(`Mock backend running on http://localhost:${PORT}`);
  console.log('Endpoints:');
  console.log('  POST http://localhost:3002/api/widget/auth');
  console.log('  POST http://localhost:3002/api/widget/create-account');
});