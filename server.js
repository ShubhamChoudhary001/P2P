require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const compression = require('compression');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const admin = require('firebase-admin');

// Initialize Firebase only if service account is available
let db = null;
let feedbackCollection = null;

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    
    db = admin.firestore();
    feedbackCollection = db.collection('feedbacks');
    console.log('✅ Firebase initialized successfully');
  } catch (error) {
    console.warn('⚠️ Failed to initialize Firebase:', error.message);
    console.log('📝 Feedback functionality will be disabled');
  }
} else {
  console.log('📝 FIREBASE_SERVICE_ACCOUNT not found, feedback functionality disabled');
}

const app = express();
const server = http.createServer(app);

// Enable compression for better performance
app.use(compression());

// Enhanced CORS configuration
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:3000", "https://sharep2p.netlify.app", "https://*.netlify.app"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204
  },
  transports: ['websocket', 'polling'], // Prioritize WebSocket
  allowEIO3: true,
  pingTimeout: 60000, // 60 seconds
  pingInterval: 25000, // 25 seconds
  maxHttpBufferSize: 1e6, // 1MB max message size
  allowUpgrades: true
});

// Additional Express CORS middleware for extra security
app.use((req, res, next) => {
  const allowedOrigins = ["http://localhost:3000", "https://sharep2p.netlify.app", "https://*.netlify.app"];
  const origin = req.headers.origin;
  
  if (allowedOrigins.includes(origin) || origin?.includes('netlify.app')) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Parse JSON bodies for feedback endpoint
app.use(express.json({ limit: '1mb' }));

// Parse cookies for session management
app.use(cookieParser());

// Session management for admin authentication
const sessions = new Map();

// Middleware to check if user is authenticated
function requireAuth(req, res, next) {
  const sessionId = req.cookies?.sessionId;
  if (!sessionId || !sessions.has(sessionId)) {
    return res.redirect('/admin/login');
  }
  next();
}

// Feedback endpoint
app.post('/api/feedback', async (req, res) => {
  try {
    const { name, email, type, message } = req.body;
    
    // Validate required fields
    if (!type || !message) {
      return res.status(400).json({ 
        success: false, 
        error: 'Feedback type and message are required' 
      });
    }
    
    // Validate message length
    if (message.length > 1000) {
      return res.status(400).json({ 
        success: false, 
        error: 'Message is too long (max 1000 characters)' 
      });
    }
    
    const feedback = {
      name: name || 'Anonymous',
      email: email || 'No email provided',
      type,
      message,
      timestamp: new Date().toISOString(),
      userAgent: req.headers['user-agent'],
      ip: req.ip || req.connection.remoteAddress
    };
    
    // Only save to Firebase if it's available
    if (feedbackCollection) {
      await feedbackCollection.add(feedback);
    }
    
    // Log feedback to console
    console.log('📝 New Feedback Received:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📧 From: ${feedback.name} (${feedback.email})`);
    console.log(`🏷️  Type: ${feedback.type}`);
    console.log(`💬 Message: ${feedback.message}`);
    console.log(`⏰ Time: ${feedback.timestamp}`);
    console.log(`🌐 IP: ${feedback.ip}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // In a real application, you would:
    // 1. Send email notification to your email
    // 2. Store in database
    // 3. Send to a service like Zapier or webhook
    
    res.json({ 
      success: true, 
      message: 'Feedback submitted successfully'
    });
    
  } catch (error) {
    console.error('❌ Feedback submission error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// Admin login page
app.get('/admin/login', (req, res) => {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ShareP2P - Admin Login</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #0f0f23 0%, #1a1a2e 25%, #16213e 50%, #0f3460 75%, #533483 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    
    .login-container {
      background: rgba(255, 255, 255, 0.08);
      backdrop-filter: blur(20px);
      border-radius: 24px;
      padding: 48px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 25px 50px rgba(0, 0, 0, 0.25);
      max-width: 400px;
      width: 100%;
    }
    
    .header {
      text-align: center;
      margin-bottom: 32px;
    }
    
    .header h1 {
      font-size: 2rem;
      font-weight: 800;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 8px;
    }
    
    .header p {
      color: rgba(255, 255, 255, 0.7);
      font-size: 0.95rem;
    }
    
    .form-group {
      margin-bottom: 20px;
      position: relative;
    }
    
    .form-group label {
      display: block;
      color: rgba(255, 255, 255, 0.9);
      font-weight: 600;
      margin-bottom: 8px;
      font-size: 0.9rem;
    }
    
    .form-group input {
      width: 100%;
      padding: 16px 20px;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 12px;
      color: rgba(255, 255, 255, 0.9);
      font-size: 1rem;
      font-family: inherit;
      backdrop-filter: blur(10px);
      transition: all 0.3s ease;
    }
    
    .form-group input:focus {
      outline: none;
      border-color: rgba(102, 126, 234, 0.6);
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
      background: rgba(255, 255, 255, 0.12);
    }
    
    .form-group input::placeholder {
      color: rgba(255, 255, 255, 0.4);
    }
    
    .show-password-btn {
      position: absolute;
      right: 18px;
      top: 44px;
      background: none;
      border: none;
      cursor: pointer;
      color: #aaa;
      font-size: 1.2rem;
      padding: 0 4px;
      z-index: 2;
      height: 32px;
      display: flex;
      align-items: center;
    }
    .show-password-btn:active {
      color: #667eea;
    }
    
    .login-btn {
      width: 100%;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      padding: 16px 32px;
      font-size: 1rem;
      font-weight: 600;
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.3s ease;
      margin-top: 8px;
    }
    
    .login-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 25px rgba(102, 126, 234, 0.3);
    }
    
    .login-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }
    
    .error-message {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #fca5a5;
      padding: 12px 16px;
      border-radius: 12px;
      margin-bottom: 20px;
      font-size: 0.9rem;
      display: none;
    }
    
    .back-link {
      text-align: center;
      margin-top: 24px;
    }
    
    .back-link a {
      color: rgba(255, 255, 255, 0.6);
      text-decoration: none;
      font-size: 0.9rem;
      transition: color 0.3s ease;
    }
    
    .back-link a:hover {
      color: rgba(255, 255, 255, 0.9);
    }
    
    @media (max-width: 480px) {
      .login-container {
        padding: 32px 24px;
      }
      
      .header h1 {
        font-size: 1.8rem;
      }
    }
  </style>
</head>
<body>
  <div class="login-container">
    <div class="header">
      <h1>🔐 Admin Login</h1>
      <p>ShareP2P Dashboard Access</p>
    </div>
    
    <div class="error-message" id="errorMessage"></div>
    
    <form id="loginForm">
      <div class="form-group">
        <label for="username">Username</label>
        <input type="text" id="username" name="username" placeholder="Enter username" required>
      </div>
      
      <div class="form-group" style="position:relative;">
        <label for="password">Password</label>
        <input type="password" id="password" name="password" placeholder="Enter password" required autocomplete="current-password">
        <button type="button" class="show-password-btn" id="togglePassword" tabindex="-1" aria-label="Show password" title="Show/Hide Password">
          <span id="eyeIcon">👁️</span>
        </button>
      </div>
      
      <button type="submit" class="login-btn" id="loginBtn">
        🔑 Login
      </button>
    </form>
    
    <div class="back-link">
      <a href="/">← Back to Main App</a>
    </div>
  </div>

  <script>
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const username = document.getElementById('username').value;
      const password = document.getElementById('password').value;
      const loginBtn = document.getElementById('loginBtn');
      const errorMessage = document.getElementById('errorMessage');
      
      loginBtn.disabled = true;
      loginBtn.innerHTML = '⏳ Logging in...';
      errorMessage.style.display = 'none';
      
      try {
        const response = await fetch('/admin/auth', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ username, password })
        });
        
        const result = await response.json();
        
        if (result.success) {
          window.location.href = '/admin/feedback';
        } else {
          errorMessage.textContent = result.error || 'Login failed';
          errorMessage.style.display = 'block';
        }
        
      } catch (error) {
        errorMessage.textContent = 'Network error. Please try again.';
        errorMessage.style.display = 'block';
      } finally {
        loginBtn.disabled = false;
        loginBtn.innerHTML = '🔑 Login';
      }
    });

    // Show/hide password toggle
    const passwordInput = document.getElementById('password');
    const togglePassword = document.getElementById('togglePassword');
    const eyeIcon = document.getElementById('eyeIcon');
    let visible = false;
    togglePassword.addEventListener('click', function() {
      visible = !visible;
      passwordInput.type = visible ? 'text' : 'password';
      eyeIcon.textContent = visible ? '🙈' : '👁️';
      togglePassword.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
    });
  </script>
</body>
</html>
  `;
  
  res.send(html);
});

// Admin authentication endpoint
app.post('/admin/auth', (req, res) => {
  const { username, password } = req.body;
  
  const expectedUsername = process.env.ADMIN_USERNAME || 'admin';
  const expectedPassword = process.env.ADMIN_PASSWORD || 'admin';
  
  // Debug logging (remove in production)
  console.log('🔐 Auth attempt:', { 
    provided: { username, password: password ? '***' : 'empty' },
    expected: { username: expectedUsername, password: expectedPassword ? '***' : 'empty' },
    envLoaded: !!process.env.ADMIN_PASSWORD
  });
  
  if (username === expectedUsername && password === expectedPassword) {
    // Generate session ID
    const sessionId = Math.random().toString(36).substring(2) + Date.now().toString(36);
    sessions.set(sessionId, { username, timestamp: Date.now() });
    
    // Set cookie
    res.cookie('sessionId', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });
    
    console.log('✅ Login successful for:', username);
    res.json({ success: true });
  } else {
    console.log('❌ Login failed for:', username);
    res.status(401).json({ 
      success: false, 
      error: 'Invalid username or password' 
    });
  }
});

// Admin logout endpoint
app.get('/admin/logout', (req, res) => {
  const sessionId = req.cookies?.sessionId;
  if (sessionId) {
    sessions.delete(sessionId);
  }
  
  res.clearCookie('sessionId');
  res.redirect('/admin/login');
});

// API endpoint to get all feedbacks (protected)
app.get('/api/feedback', requireAuth, async (req, res) => {
  try {
    const snapshot = await feedbackCollection.orderBy('timestamp', 'desc').get();
    const feedbacks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json({ success: true, feedbacks, count: feedbacks.length });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to load feedbacks' });
  }
});

// API endpoint to delete a single feedback by ID (protected)
app.delete('/api/feedback/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ success: false, error: 'Feedback ID required' });
    if (!feedbackCollection) return res.status(503).json({ success: false, error: 'Feedback database unavailable' });
    await feedbackCollection.doc(id).delete();
    res.json({ success: true, message: 'Feedback deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete feedback' });
  }
});

// API endpoint to delete all feedbacks (protected)
app.delete('/api/feedback', requireAuth, async (req, res) => {
  try {
    if (!feedbackCollection) return res.status(503).json({ success: false, error: 'Feedback database unavailable' });
    const snapshot = await feedbackCollection.get();
    const batch = db.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    res.json({ success: true, message: 'All feedbacks deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete all feedbacks' });
  }
});

// Feedback dashboard endpoint (protected)
app.get('/admin/feedback', requireAuth, async (req, res) => {
  try {
    let feedbacks = [];
    
    // Fetch feedbacks from Firestore only if available
    if (feedbackCollection) {
      const snapshot = await feedbackCollection.orderBy('timestamp', 'desc').get();
      feedbacks = snapshot.docs.map(doc => doc.data());
    } else {
      console.log('⚠️ Firebase not available, showing empty feedback dashboard');
    }

    // Now use feedbacks in your HTML rendering
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>ShareP2P - Feedback Dashboard</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #0f0f23 0%, #1a1a2e 25%, #16213e 50%, #0f3460 75%, #533483 100%);
            min-height: 100vh;
            padding: 20px;
            color: white;
          }
          
          .container {
            max-width: 1200px;
            margin: 0 auto;
            background: rgba(255, 255, 255, 0.08);
            backdrop-filter: blur(20px);
            border-radius: 24px;
            padding: 32px;
            border: 1px solid rgba(255, 255, 255, 0.1);
          }
          
          .header {
            text-align: center;
            margin-bottom: 32px;
          }
          
          .header h1 {
            font-size: 2.5rem;
            font-weight: 800;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 8px;
          }
          
          .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 32px;
          }
          
          .stat-card {
            background: rgba(255, 255, 255, 0.1);
            padding: 20px;
            border-radius: 16px;
            text-align: center;
            border: 1px solid rgba(255, 255, 255, 0.1);
          }
          
          .stat-number {
            font-size: 2rem;
            font-weight: 700;
            color: #86efac;
          }
          
          .stat-label {
            font-size: 0.9rem;
            color: rgba(255, 255, 255, 0.7);
            margin-top: 4px;
          }
          
          .feedback-list {
            display: flex;
            flex-direction: column;
            gap: 16px;
          }
          
          .feedback-item {
            background: rgba(255, 255, 255, 0.05);
            border-radius: 16px;
            padding: 24px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            transition: all 0.3s ease;
          }
          
          .feedback-item:hover {
            background: rgba(255, 255, 255, 0.08);
            transform: translateY(-2px);
          }
          
          .feedback-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 12px;
            flex-wrap: wrap;
            gap: 12px;
          }
          
          .feedback-meta {
            display: flex;
            flex-direction: column;
            gap: 4px;
          }
          
          .feedback-name {
            font-weight: 600;
            color: #86efac;
          }
          
          .feedback-email {
            font-size: 0.9rem;
            color: rgba(255, 255, 255, 0.6);
          }
          
          .feedback-type {
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.8rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          
          .feedback-type.suggestion { background: rgba(59, 130, 246, 0.2); color: #93c5fd; }
          .feedback-type.bug { background: rgba(239, 68, 68, 0.2); color: #fca5a5; }
          .feedback-type.feature { background: rgba(16, 185, 129, 0.2); color: #6ee7b7; }
          .feedback-type.general { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }
          
          .feedback-time {
            font-size: 0.8rem;
            color: rgba(255, 255, 255, 0.5);
          }
          
          .feedback-message {
            color: rgba(255, 255, 255, 0.9);
            line-height: 1.6;
            margin-top: 12px;
          }
          
          .feedback-ip {
            font-size: 0.8rem;
            color: rgba(255, 255, 255, 0.4);
            margin-top: 8px;
          }
          
          .empty-state {
            text-align: center;
            padding: 60px 20px;
            color: rgba(255, 255, 255, 0.6);
          }
          
          .empty-state h3 {
            font-size: 1.5rem;
            margin-bottom: 12px;
          }
          
          .refresh-btn {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            margin-bottom: 20px;
          }
          
          .refresh-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(102, 126, 234, 0.3);
          }
          
          @media (max-width: 768px) {
            .container { padding: 20px; }
            .header h1 { font-size: 2rem; }
            .feedback-header { flex-direction: column; align-items: flex-start; }
            .stats { grid-template-columns: 1fr; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📝 Feedback Dashboard</h1>
            <p>ShareP2P User Feedback Management</p>
          </div>
          <div style="display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; justify-content: center;">
            <button class="refresh-btn" onclick="location.reload()">🔄 Refresh</button>
            <a href="/admin/logout" style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; border: none; padding: 12px 24px; border-radius: 12px; font-weight: 600; cursor: pointer; transition: all 0.3s ease; text-decoration: none; display: inline-flex; align-items: center; gap: 8px;">
              🚪 Logout
            </a>
          </div>
          <div class="stats">
            <div class="stat-card">
              <div class="stat-number">${feedbacks.length}</div>
              <div class="stat-label">Total Feedback</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">${feedbacks.filter(f => f.type === 'suggestion').length}</div>
              <div class="stat-label">Suggestions</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">${feedbacks.filter(f => f.type === 'bug').length}</div>
              <div class="stat-label">Bug Reports</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">${feedbacks.filter(f => f.type === 'feature').length}</div>
              <div class="stat-label">Feature Requests</div>
            </div>
          </div>
          <div class="feedback-list">
            ${feedbacks.map(feedback => `              <div class="feedback-item">
                <div class="feedback-header">
                  <div class="feedback-meta">
                    <div class="feedback-name">${feedback.name}</div>
                    <div class="feedback-email">${feedback.email}</div>
                  </div>
                  <div class="feedback-type ${feedback.type}">${feedback.type}</div>
                </div>
                <div class="feedback-time">${new Date(feedback.timestamp).toLocaleString()}</div>
                <div class="feedback-message">${feedback.message}</div>
                <div class="feedback-ip">IP: ${feedback.ip}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </body>
      </html>
    `;
    res.send(html);
  } catch (error) {
    console.error('❌ Error fetching feedback:', error);
    res.status(500).send('Internal Server Error');
  }
});
// Store connected devices and their connections
const devices = new Map(); // deviceId -> socket
const deviceConnections = new Map(); // deviceId -> connectedDeviceId

// Load feedback on startup
// Remove local file storage for feedbacks

// Memory management - clean up old connections periodically
setInterval(() => {
  const now = Date.now();
  for (const [deviceId, socket] of devices.entries()) {
    if (!socket.connected) {
      devices.delete(deviceId);
      if (deviceConnections.has(deviceId)) {
        const connectedDeviceId = deviceConnections.get(deviceId);
        deviceConnections.delete(deviceId);
        deviceConnections.delete(connectedDeviceId);
      }
    }
  }
}, 30000); // Clean up every 30 seconds

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    cors: 'enabled',
    origins: ["http://localhost:3000", "https://sharep2p.netlify.app"],
    connections: devices.size,
    memory: process.memoryUsage(),
    envLoaded: {
      adminUsername: !!process.env.ADMIN_USERNAME,
      adminPassword: !!process.env.ADMIN_PASSWORD,
      nodeEnv: process.env.NODE_ENV
    }
  });
});

io.on('connection', socket => {
  console.log('🔗 client connected:', socket.id);

  // Register device
  socket.on('register', deviceId => {
    devices.set(deviceId, socket);
    socket.deviceId = deviceId;
    console.log(`📱 Device registered: ${deviceId}`);
    
    // Send updated device list to all clients
    broadcastDeviceList();
  });

  // Get device list
  socket.on('getDevices', () => {
    const deviceList = Array.from(devices.keys()).map(id => ({
      id,
      connected: deviceConnections.has(id)
    }));
    socket.emit('deviceList', deviceList);
  });

  // Connect to specific device
  socket.on('connectToDevice', targetDeviceId => {
    const targetSocket = devices.get(targetDeviceId);
    
    if (!targetSocket) {
      socket.emit('error', 'Device not found');
      return;
    }

    if (targetSocket.id === socket.id) {
      socket.emit('error', 'Cannot connect to yourself');
      return;
    }

    // Store connection
    deviceConnections.set(socket.deviceId, targetDeviceId);
    deviceConnections.set(targetDeviceId, socket.deviceId);

    // Notify both devices
    socket.emit('peerConnected', targetDeviceId);
    targetSocket.emit('peerConnected', socket.deviceId);

    console.log(`🔗 ${socket.deviceId} connected to ${targetDeviceId}`);
  });

  // Handle WebRTC signaling
  socket.on('signal', ({ to, data }) => {
    const targetSocket = devices.get(to);
    if (targetSocket) {
      targetSocket.emit('signal', { from: socket.deviceId, data });
    }
  });

  // Disconnect from peer
  socket.on('disconnectPeer', () => {
    if (socket.deviceId && deviceConnections.has(socket.deviceId)) {
      const connectedDeviceId = deviceConnections.get(socket.deviceId);
      const connectedSocket = devices.get(connectedDeviceId);
      
      if (connectedSocket) {
        connectedSocket.emit('peerDisconnected');
      }
      
      deviceConnections.delete(socket.deviceId);
      deviceConnections.delete(connectedDeviceId);
      
      socket.emit('peerDisconnected');
      console.log(`❌ ${socket.deviceId} disconnected from ${connectedDeviceId}`);
    }
  });

  // Handle client disconnect
  socket.on('disconnect', () => {
    console.log('❌ client disconnected:', socket.id);
    
    if (socket.deviceId) {
      // Remove from devices
      devices.delete(socket.deviceId);
      
      // Handle peer disconnection
      if (deviceConnections.has(socket.deviceId)) {
        const connectedDeviceId = deviceConnections.get(socket.deviceId);
        const connectedSocket = devices.get(connectedDeviceId);
        
        if (connectedSocket) {
          connectedSocket.emit('peerDisconnected');
        }
        
        deviceConnections.delete(socket.deviceId);
        deviceConnections.delete(connectedDeviceId);
      }
      
      // Broadcast updated device list
      broadcastDeviceList();
    }
  });
});

function broadcastDeviceList() {
  const deviceList = Array.from(devices.keys()).map(id => ({
    id,
    connected: deviceConnections.has(id)
  }));
  
  io.emit('deviceList', deviceList);
}

// Serve static frontend (must be after all API routes)
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`
🚀 Server running at http://localhost:${PORT}
📱 Device management enabled
🔗 WebRTC signaling ready
`));

