// Test authentication endpoint
const fetch = require('node-fetch');

async function testAuth() {
  try {
    console.log('🧪 Testing authentication...');
    
    const response = await fetch('http://localhost:3000/admin/auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: 'admin',
        password: 'Shubham-7828'
      })
    });
    
    const result = await response.json();
    console.log('📊 Response:', result);
    console.log('✅ Status:', response.status);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testAuth(); 