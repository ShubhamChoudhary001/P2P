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
    // Reliable STUN servers for cloud deployment
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
  
  // File Transfer Settings - Optimized for Maximum Speed
  CHUNK_SIZE: 256 * 1024, // 256KB chunks (increased for maximum throughput)
  MAX_BUFFERED_AMOUNT: 8 * 1024 * 1024, // 8MB buffer limit (increased for maximum flow)
  MAX_SIGNALING_DATA_SIZE: 10000, // 10KB max signaling data
  
  // Performance Settings - Optimized for Maximum Speed
  QUEUE_PROCESSING_DELAY: 0, // 0ms delay for maximum speed
  BUFFER_CHECK_INTERVAL: 5, // 5ms buffer check interval (ultra responsive)
  PROGRESS_UPDATE_INTERVAL: 50, // 50ms for very frequent progress updates
  
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
    cancelBtn: 'cancelBtn',
    // Feedback elements
    feedbackForm: 'feedbackForm',
    feedbackName: 'feedbackName',
    feedbackEmail: 'feedbackEmail',
    feedbackType: 'feedbackType',
    feedbackMessage: 'feedbackMessage',
    feedbackSubmit: 'feedbackSubmit',
    feedbackSuccess: 'feedbackSuccess',
    feedbackError: 'feedbackError',
    errorMessage: 'errorMessage',
    charCount: 'charCount'
  }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
} 