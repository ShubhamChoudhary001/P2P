/**
 * Socket Manager
 * Handles all Socket.IO communication with the signaling server
 */

class SocketManager {
  constructor(serverUrl, config) {
    this.serverUrl = serverUrl;
    this.config = config;
    this.socket = null;
    this.deviceId = null;
    this.isConnected = false;
    
    // Event callbacks
    this.onConnect = null;
    this.onDisconnect = null;
    this.onDeviceList = null;
    this.onPeerConnected = null;
    this.onPeerDisconnected = null;
    this.onSignal = null;
    this.onError = null;
  }

  /**
   * Initialize Socket.IO connection
   */
  initialize() {
    this.socket = io(this.serverUrl);
    this.setupEventHandlers();
  }

  /**
   * Setup Socket.IO event handlers
   */
  setupEventHandlers() {
    this.socket.on('connect', () => {
      console.log('✅ Connected to signaling server');
      this.isConnected = true;
      if (this.onConnect) {
        this.onConnect();
      }
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from signaling server');
      this.isConnected = false;
      if (this.onDisconnect) {
        this.onDisconnect();
      }
    });

    this.socket.on('deviceList', (devices) => {
      console.log('📱 Received device list:', devices);
      console.log('🔍 Current device ID:', this.deviceId);
      if (this.onDeviceList) {
        this.onDeviceList(devices);
      }
    });

    this.socket.on('peerConnected', (peerId) => {
      console.log('Peer connected:', peerId);
      if (this.onPeerConnected) {
        this.onPeerConnected(peerId);
      }
    });

    this.socket.on('peerDisconnected', () => {
      console.log('Peer disconnected');
      if (this.onPeerDisconnected) {
        this.onPeerDisconnected();
      }
    });

    this.socket.on('signal', ({ from, data }) => {
      console.log('Received signal from:', from);
      if (this.onSignal) {
        this.onSignal(from, data);
      }
    });

    this.socket.on('error', (error) => {
      console.error('Socket error:', error);
      if (this.onError) {
        this.onError(error);
      }
    });
  }

  /**
   * Register device with the server
   * @param {string} deviceId - Device identifier
   */
  registerDevice(deviceId) {
    if (!this.isConnected) {
      console.error('Cannot register device: Socket not connected');
      throw new Error('Socket not connected');
    }
    
    if (!Utils.validateDeviceId(deviceId)) {
      console.error('Cannot register device: Invalid device ID', deviceId);
      throw new Error('Invalid device ID');
    }
    
    this.deviceId = deviceId;
    this.socket.emit('register', deviceId);
    console.log('✅ Device registered with server:', deviceId);
    
    // Request device list immediately after registration
    setTimeout(() => {
      this.getDevices();
    }, 500);
  }

  /**
   * Request device list from server
   */
  getDevices() {
    if (!this.isConnected) {
      console.error('Cannot get devices: Socket not connected');
      throw new Error('Socket not connected');
    }
    
    console.log('🔍 Requesting device list...');
    this.socket.emit('getDevices');
  }

  /**
   * Connect to a specific device
   * @param {string} targetDeviceId - Target device ID
   */
  connectToDevice(targetDeviceId) {
    if (!this.isConnected) {
      throw new Error('Socket not connected');
    }
    
    if (!Utils.validateDeviceId(targetDeviceId)) {
      throw new Error('Invalid target device ID');
    }
    
    if (targetDeviceId === this.deviceId) {
      throw new Error('Cannot connect to yourself');
    }
    
    this.socket.emit('connectToDevice', targetDeviceId);
    console.log('Attempting to connect to device:', targetDeviceId);
  }

  /**
   * Send WebRTC signaling data
   * @param {string} to - Target device ID
   * @param {any} data - Signaling data
   */
  sendSignal(to, data) {
    if (!this.isConnected) {
      throw new Error('Socket not connected');
    }
    
    if (!Utils.validateDeviceId(to)) {
      throw new Error('Invalid target device ID');
    }
    
    // Check data size
    const dataSize = JSON.stringify(data).length;
    if (dataSize > this.config.MAX_SIGNALING_DATA_SIZE) {
      throw new Error('Signaling data too large');
    }
    
    this.socket.emit('signal', { to, data });
  }

  /**
   * Disconnect from peer
   */
  disconnectPeer() {
    if (!this.isConnected) {
      return;
    }
    
    this.socket.emit('disconnectPeer');
  }

  /**
   * Start polling for device list
   */
  startPolling() {
    this.pollInterval = setInterval(() => {
      if (this.isConnected) {
        this.getDevices();
      }
    }, this.config.POLL_INTERVAL);
  }

  /**
   * Stop polling for device list
   */
  stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  /**
   * Disconnect from server
   */
  disconnect() {
    this.stopPolling();
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnected = false;
    this.deviceId = null;
  }

  /**
   * Get connection status
   * @returns {boolean} Connection status
   */
  getConnectionStatus() {
    return this.isConnected;
  }

  /**
   * Get device ID
   * @returns {string} Device ID
   */
  getDeviceId() {
    return this.deviceId;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SocketManager;
} 