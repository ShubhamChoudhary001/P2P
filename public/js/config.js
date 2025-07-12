/**
 * Application Configuration
 * Contains all settings, constants, and configuration values
 */

const CONFIG = {
  // Server Configuration
  SERVER_URL: (() => {
    // Check if we're in development (localhost) or production
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'http://localhost:3000'; // Local development
    } else {
      return 'https://shareshort.onrender.com'; // Production - replace with your actual Render URL
    }
  })(),
  
  // WebRTC Configuration
  ICE_SERVERS: [
    // STUN servers for NAT traversal (free)
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    
    // Optional: Add TURN servers for relay when direct connection fails
    // You'll need to set up your own TURN server or use a service
    // Example TURN server (replace with your own):
    // {
    //   urls: 'turn:your-turn-server.com:3478',
    //   username: 'username',
    //   credential: 'password'
    // }
  ],
  
  // File Transfer Settings - Optimized for Speed
  CHUNK_SIZE: 64 * 1024, // 64KB chunks (increased for better throughput)
  MAX_BUFFERED_AMOUNT: 2 * 1024 * 1024, // 2MB buffer limit (increased for better flow)
  MAX_SIGNALING_DATA_SIZE: 10000, // 10KB max signaling data
  
  // Performance Settings
  QUEUE_PROCESSING_DELAY: 1, // 1ms delay between queue processing (reduced from 5ms)
  BUFFER_CHECK_INTERVAL: 25, // 25ms buffer check interval (reduced from 50ms)
  PROGRESS_UPDATE_INTERVAL: 200, // 200ms for speed calculation (reduced from 500ms)
  
  // UI Settings
  DEVICE_ID_LENGTH: 6,
  DEVICE_ID_MAX_LENGTH: 20,
  POLL_INTERVAL: 5000, // 5 seconds
  
  // Animation Settings
  NOTIFICATION_DURATION: 5000, // 5 seconds
  
  // Element IDs
  ELEMENTS: {
    connectionStatus: 'connectionStatus',
    statusText: 'statusText',
    deviceId: 'deviceId',
    connectedDevices: 'connectedDevices',
    fileInput: 'fileInput',
    fileInputLabel: 'fileInputLabel',
    selectedFile: 'selectedFile',
    sendBtn: 'sendBtn',
    recvBtn: 'recvBtn',
    disconnectBtn: 'disconnectBtn',
    progressSection: 'progressSection',
    progressText: 'progressText',
    progressPercent: 'progressPercent',
    progressFill: 'progressFill',
    downloadSection: 'downloadSection',
    downloadLink: 'downloadLink',
    connectionModal: 'connectionModal',
    deviceIdInput: 'deviceIdInput',
    connectBtn: 'connectBtn',
    cancelBtn: 'cancelBtn'
  }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
} 