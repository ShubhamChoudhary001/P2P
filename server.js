const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:3000", "https://sharep2p.netlify.app"],
    methods: ["GET", "POST"]
  }
});

// Store connected devices and their connections
const devices = new Map(); // deviceId -> socket
const deviceConnections = new Map(); // deviceId -> connectedDeviceId

// Serve static frontend
app.use(express.static(path.join(__dirname, 'public')));

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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`
🚀 Server running at http://localhost:${PORT}
📱 Device management enabled
🔗 WebRTC signaling ready
`));