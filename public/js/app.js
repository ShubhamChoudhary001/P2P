/**
 * Main Application Class
 * Orchestrates all components and manages the overall application state
 */

class P2PFileSharing {
  constructor() {
    // Initialize configuration
    this.config = CONFIG;
    
    // Initialize managers
    this.uiManager = new UIManager(this.config);
    this.socketManager = new SocketManager(this.config.SERVER_URL, this.config);
    this.webrtcManager = new WebRTCManager(this.config);
    
    // Application state
    this.deviceId = null;
    this.peerId = null;
    this.isConnected = false;
    this.currentFiles = null;
    this.receivedFiles = [];
    
    // File transfer state
    this.fileTransferState = {
      isTransferring: false,
      currentFileIndex: 0,
      totalFiles: 0,
      receivedSize: 0,
      fileSize: 0,
      fileName: '',
      buffer: [],
      lastTime: 0,
      lastBytes: 0,
      speedMbps: 0,
      eofReceived: false // <-- add this flag
    };
    
    // File history for received files
    this.receivedFiles = [];
    
    // Initialize application
    this.initialize();
  }

  /**
   * Initialize the application
   */
  initialize() {
    // Check browser support
    const support = Utils.checkBrowserSupport();
    if (!support.webrtc) {
      this.uiManager.showError('WebRTC is not supported in this browser');
      return;
    }
    
    if (!support.fileApi) {
      this.uiManager.showError('File API is not supported in this browser');
      return;
    }
    
    // Setup event handlers
    this.setupEventHandlers();
    
    // Setup socket manager callbacks
    this.setupSocketCallbacks();
    
    // Setup WebRTC manager callbacks
    this.setupWebRTCCallbacks();
    
    // Initialize socket connection
    this.socketManager.initialize();
    
    // Generate device ID
    this.generateDeviceId();
    
    // Start polling for devices
    this.socketManager.startPolling();
  }

  /**
   * Setup event handlers for UI interactions
   */
  setupEventHandlers() {
    const handlers = {
      handleFileSelect: (e) => this.handleFileSelect(e),
      handleDragOver: (e) => this.uiManager.handleDragOver(e),
      handleDragLeave: () => this.uiManager.handleDragLeave(),
      handleDrop: (e) => this.handleDrop(e),
      handleSendFile: () => this.handleSendFile(),
      showConnectionModal: () => this.uiManager.showConnectionModal(),
      disconnect: () => this.disconnect(),
      connectToDevice: () => this.connectToDevice(),
      hideConnectionModal: () => this.uiManager.hideConnectionModal()
    };
    
    this.uiManager.setupEventListeners(handlers);
  }

  /**
   * Setup socket manager callbacks
   */
  setupSocketCallbacks() {
    this.socketManager.onConnect = () => {
      this.uiManager.updateConnectionStatus('Connected to server', 'connected');
      
      // Register device with server when socket connects
      if (this.deviceId) {
        this.socketManager.registerDevice(this.deviceId);
      }
    };
    
    this.socketManager.onDisconnect = () => {
      this.uiManager.updateConnectionStatus('Disconnected from server', 'disconnected');
      this.isConnected = false;
      this.updateUI();
    };
    
    this.socketManager.onDeviceList = (devices) => {
      this.uiManager.updateDeviceList(devices, this.deviceId);
    };
    
    this.socketManager.onPeerConnected = (peerId) => {
      this.peerId = peerId;
      this.isConnected = true;
      this.uiManager.updateConnectionStatus(`Connected to ${peerId}`, 'connected');
      this.updateUI();
      
      // If we're not the sender, prepare to receive files
      if (!this.currentFiles) {
        this.startFileTransfer(false);
      }
    };
    
    this.socketManager.onPeerDisconnected = () => {
      this.peerId = null;
      this.isConnected = false;
      this.uiManager.updateConnectionStatus('Peer disconnected', 'disconnected');
      this.updateUI();
    };
    
    this.socketManager.onSignal = (from, data) => {
      this.handleSignal(from, data);
    };
    
    this.socketManager.onError = (error) => {
      this.uiManager.showError(error);
    };
  }

  /**
   * Setup WebRTC manager callbacks
   */
  setupWebRTCCallbacks() {
    this.webrtcManager.onDataChannelOpen = (isSender) => {
      this.uiManager.showSuccess('Connection established!');
      console.log('🔗 Data channel opened, isSender:', isSender);
      if (isSender && this.currentFiles && this.currentFiles.length > 0) {
        console.log('📤 Starting file transfer as sender (onDataChannelOpen)');
        this.sendFiles(this.currentFiles);
      }
    };
    this.webrtcManager.onDataChannelMessage = (e) => {
      this.handleDataChannelMessage(e);
    };
    this.webrtcManager.onIceCandidate = (candidate) => {
      console.log('🧊 Sending ICE candidate to peer');
      this.socketManager.sendSignal(this.peerId, candidate);
    };
    this.webrtcManager.onConnectionStateChange = (state) => {
      console.log('🔗 WebRTC connection state:', state);
    };
    this.webrtcManager.onIceConnectionStateChange = (state) => {
      console.log('🧊 ICE connection state:', state);
      if (state === 'connected' || state === 'completed') {
        this.detectConnectionType();
      }
    };
  }

  /**
   * Generate device ID and register with server
   */
  generateDeviceId() {
    this.deviceId = Utils.generateDeviceId(this.config.DEVICE_ID_LENGTH);
    this.uiManager.updateDeviceId(this.deviceId);
    
    // Register with server when connected
    if (this.socketManager.getConnectionStatus()) {
      this.socketManager.registerDevice(this.deviceId);
    }
  }

  /**
   * Handle file selection
   * @param {Event} e - File input change event
   */
  handleFileSelect(e) {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      this.currentFiles = files;
      this.uiManager.updateFileSelection(files);
      this.updateUI();
    }
  }

  /**
   * Handle file drop
   * @param {Event} e - Drop event
   */
  handleDrop(e) {
    const files = this.uiManager.handleDrop(e);
    if (files.length > 0) {
      this.currentFiles = files;
      this.uiManager.updateFileSelection(files);
      this.updateUI();
    }
  }

  /**
   * Handle send file button click
   */
  handleSendFile() {
    if (!this.currentFiles || this.currentFiles.length === 0) {
      this.uiManager.showError('Please select file(s) first!');
      return;
    }
    
    if (!this.isConnected) {
      this.uiManager.showError('Please connect to a device first!');
      return;
    }
    
    this.startFileTransfer(true);
  }

  /**
   * Start file transfer process
   * @param {boolean} isSender - Whether this peer is the sender
   */
  startFileTransfer(isSender) {
    console.log(`Starting file transfer as ${isSender ? 'sender' : 'receiver'}`);
    
    // Force reset the WebRTC connection to ensure stable state
    this.webrtcManager.close();
    this.webrtcManager.initializePeerConnection(isSender);

    if (isSender) {
      setTimeout(() => {
        console.log('🔄 About to call createOffer...');
        this.webrtcManager.createOffer()
          .then(offer => {
            console.log('🔄 createOffer returned:', offer);
            if (offer !== undefined && offer !== null) {
              console.log('✅ Sending valid offer to peer');
              this.socketManager.sendSignal(this.peerId, offer);
            } else {
              console.error('startFileTransfer: Tried to send undefined offer', { peerId: this.peerId, offer });
              this.uiManager.showError('Failed to create a valid offer for signaling.');
            }
          })
          .catch(error => {
            console.error('❌ Error creating offer:', error);
            this.uiManager.showError('Failed to create connection');
          });
      }, 150); // 150ms delay to allow connection to stabilize
    }
  }

  /**
   * Send multiple files
   * @param {FileList} files - Files to send
   */
  async sendFiles(files) {
    if (!files || files.length === 0) return;
    
    try {
      console.log('📤 Starting to send', files.length, 'files');
      
      // Send initial meta for total files
      await this.webrtcManager.sendData(JSON.stringify({ 
        multiFileMeta: true, 
        total: files.length 
      }));
      console.log('📤 Sent multi-file metadata');
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        console.log(`📤 Sending file ${i + 1}/${files.length}:`, file.name);
        await this.sendFile(file, i + 1, files.length);
      }
      
      console.log('✅ All files sent successfully!');
      this.uiManager.showSuccess('All files sent successfully!');
      this.uiManager.hideProgress();
      
    } catch (error) {
      console.error('❌ Error sending files:', error);
      this.uiManager.showError(`Failed to send files: ${error.message}`);
      this.uiManager.hideProgress();
    }
  }

  /**
   * Send a single file
   * @param {File} file - File to send
   * @param {number} fileIndex - Current file index
   * @param {number} totalFiles - Total number of files
   */
  async sendFile(file, fileIndex, totalFiles) {
    let offset = 0;
    let lastTime = performance.now();
    let lastBytes = 0;
    
    // Show initial progress immediately
    this.uiManager.showProgress(
      `Sending (${fileIndex}/${totalFiles}): ${file.name}`, 
      0, 
      0
    );
    
    // Send file metadata first
    try {
      await this.webrtcManager.sendData(JSON.stringify({ 
        name: file.name, 
        size: file.size 
      }));
      console.log('📤 Sent file metadata:', file.name, file.size);
    } catch (error) {
      console.error('❌ Failed to send file metadata:', error);
      throw error;
    }
    
          // Send file chunks
      while (offset < file.size) {
        const chunk = file.slice(offset, offset + this.config.CHUNK_SIZE);
        
        try {
          const arrayBuffer = await this.readFileAsArrayBuffer(chunk);
          
          // Check buffer state before sending
          if (this.webrtcManager.dc && this.webrtcManager.dc.bufferedAmount > this.config.MAX_BUFFERED_AMOUNT * 0.8) {
            console.log('⏳ Buffer getting full, waiting...', this.webrtcManager.dc.bufferedAmount, 'max:', this.config.MAX_BUFFERED_AMOUNT);
            // Wait for buffer to clear with timeout
            const startWait = Date.now();
            while (this.webrtcManager.dc.bufferedAmount > this.config.MAX_BUFFERED_AMOUNT * 0.6 && (Date.now() - startWait) < 5000) {
              await new Promise(resolve => setTimeout(resolve, 100));
            }
            if (this.webrtcManager.dc.bufferedAmount > this.config.MAX_BUFFERED_AMOUNT * 0.6) {
              console.warn('⚠️ Buffer still full after timeout, continuing anyway');
            }
          }
          
          await this.webrtcManager.sendData(arrayBuffer);
          offset += arrayBuffer.byteLength;
          
          // Log buffer state periodically
          if (offset % (this.config.CHUNK_SIZE * 10) === 0) {
            console.log('📊 Buffer state:', {
              bufferedAmount: this.webrtcManager.dc?.bufferedAmount || 0,
              maxBuffer: this.config.MAX_BUFFERED_AMOUNT,
              progress: Math.round((offset / file.size) * 100) + '%'
            });
          }
          
          // More frequent delays to prevent overwhelming the buffer
          if (offset % (this.config.CHUNK_SIZE * 2) === 0) {
            await new Promise(resolve => setTimeout(resolve, 20));
          }
        
        // Calculate progress and speed
        const progress = (offset / file.size) * 100;
        const now = performance.now();
        const elapsed = (now - lastTime) / 1000;
        
        // Update progress more frequently (every 0.2 seconds)
        if (elapsed >= 0.2) {
          const speedMbps = (offset - lastBytes) / 1024 / 1024 / elapsed;
          this.uiManager.showProgress(
            `Sending (${fileIndex}/${totalFiles}): ${file.name}`, 
            progress, 
            speedMbps
          );
          lastTime = now;
          lastBytes = offset;
        }
      } catch (error) {
        console.error('❌ Error sending chunk:', error);
        throw error;
      }
    }
    
    // Send EOF message to indicate file completion
    try {
      await this.webrtcManager.sendData(JSON.stringify({ type: 'EOF' }));
      console.log('📤 Sent EOF message for file:', file.name);
    } catch (error) {
      console.error('❌ Failed to send EOF message:', error);
      throw error;
    }
    
    console.log('✅ File sent completely:', file.name);
  }

  /**
   * Read file chunk as ArrayBuffer
   * @param {Blob} chunk - File chunk to read
   * @returns {Promise<ArrayBuffer>} ArrayBuffer of the chunk
   */
  readFileAsArrayBuffer(chunk) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(e.error);
      reader.readAsArrayBuffer(chunk);
    });
  }

  /**
   * Handle data channel messages
   * @param {MessageEvent} e - Message event
   */
  handleDataChannelMessage(e) {
    console.log('📥 Received message, type:', typeof e.data, 'size:', typeof e.data === 'string' ? e.data.length : e.data.byteLength);
    // Handle EOF message
    if (typeof e.data === 'string') {
      if (e.data === '{"type":"EOF"}' || (e.data.startsWith('{') && e.data.includes('"type":"EOF"'))) {
        console.log('📥 EOF message received');
        this.fileTransferState.eofReceived = true;
        
        // Clear the EOF timeout
        if (this.fileTransferState.eofTimeout) {
          clearTimeout(this.fileTransferState.eofTimeout);
          this.fileTransferState.eofTimeout = null;
        }
        
        // Only finalize if receivedSize matches fileSize
        if (this.fileTransferState.receivedSize === this.fileTransferState.fileSize) {
          this.finalizeReceivedFile();
        }
        return;
      }
      try {
        const meta = JSON.parse(e.data);
        console.log('📥 Received metadata:', meta);
        
        if (meta.multiFileMeta) {
          // Initial meta for total files
          this.fileTransferState.totalFiles = meta.total;
          this.fileTransferState.currentFileIndex = 0;
          console.log('📥 Multi-file transfer started, total files:', meta.total);
          return;
        }
        
        // File metadata
        this.fileTransferState.fileName = meta.name;
        this.fileTransferState.fileSize = meta.size;
        this.fileTransferState.receivedSize = 0;
        this.fileTransferState.buffer = [];
        this.fileTransferState.currentFileIndex++;
        this.fileTransferState.lastTime = performance.now();
        this.fileTransferState.lastBytes = 0;
        this.fileTransferState.speedMbps = 0;
        this.fileTransferState.eofReceived = false;
        
        // Set a timeout to finalize the file if EOF doesn't arrive
        this.fileTransferState.eofTimeout = setTimeout(() => {
          if (this.fileTransferState.receivedSize === this.fileTransferState.fileSize && !this.fileTransferState.eofReceived) {
            console.log('⏰ EOF timeout reached, finalizing file without EOF');
            this.finalizeReceivedFile();
          }
        }, 10000); // 10 second timeout
        
        console.log('📥 Starting to receive file:', meta.name, 'size:', meta.size);
        this.uiManager.showProgress(
          `Receiving (${this.fileTransferState.currentFileIndex}/${this.fileTransferState.totalFiles}): ${this.fileTransferState.fileName}`, 
          0
        );
        
      } catch (error) {
        console.error('❌ Error parsing metadata:', error);
      }
      
    } else {
      // Binary data
      console.log('📥 Received file chunk, size:', e.data.byteLength, 'total received:', this.fileTransferState.receivedSize + e.data.byteLength, 'expected:', this.fileTransferState.fileSize);
      this.fileTransferState.buffer.push(e.data);
      this.fileTransferState.receivedSize += e.data.byteLength;
      
      const progress = (this.fileTransferState.receivedSize / this.fileTransferState.fileSize) * 100;
      
      // Calculate speed
      const now = performance.now();
      const elapsed = (now - this.fileTransferState.lastTime) / 1000;
      
      if (elapsed >= 0.2) { // Update more frequently
        this.fileTransferState.speedMbps = (this.fileTransferState.receivedSize - this.fileTransferState.lastBytes) / 1024 / 1024 / elapsed;
        this.fileTransferState.lastTime = now;
        this.fileTransferState.lastBytes = this.fileTransferState.receivedSize;
      }
      
      this.uiManager.showProgress(
        `Receiving (${this.fileTransferState.currentFileIndex}/${this.fileTransferState.totalFiles}): ${this.fileTransferState.fileName}`, 
        progress, 
        this.fileTransferState.speedMbps
      );
      
      if (this.fileTransferState.receivedSize === this.fileTransferState.fileSize) {
        console.log('📥 File size reached, waiting for EOF. Received:', this.fileTransferState.receivedSize, 'Expected:', this.fileTransferState.fileSize, 'EOF received:', this.fileTransferState.eofReceived);
        if (this.fileTransferState.eofReceived) {
          this.finalizeReceivedFile();
        }
      }
    }
  }

  /**
   * Handle WebRTC signaling
   * @param {string} from - Source device ID
   * @param {any} data - Signaling data
   */
  async handleSignal(from, data) {
    if (!this.peerId) this.peerId = from;
    
    try {
      // Check if WebRTC connection is in valid state
      if (!this.webrtcManager.isValidState()) {
        console.log('⚠️ WebRTC connection not in valid state, reinitializing...');
        this.webrtcManager.initializePeerConnection(true);
        this.webrtcManager.setupDataChannel(true);
      }
      
      if (data.type === 'offer') {
        const answer = await this.webrtcManager.handleOffer(data);
        this.socketManager.sendSignal(this.peerId, answer);
      } else if (data.type === 'answer') {
        await this.webrtcManager.handleAnswer(data);
      } else if (data.candidate) {
        await this.webrtcManager.addIceCandidate(data);
      }
    } catch (error) {
      console.error('Error handling signal:', error);
      
      // Try to recover from connection failure
      if (error.message.includes('SDP does not match') || error.message.includes('InvalidModificationError')) {
        console.log('🔄 Attempting to recover from critical error...');
        try {
          await this.webrtcManager.completeRecreation();
          this.uiManager.showInfo('Connection recovered, please try again');
        } catch (recoveryError) {
          console.error('Recovery failed:', recoveryError);
          this.uiManager.showError('Connection failed and recovery unsuccessful');
        }
      } else {
        this.uiManager.showError('Connection failed: ' + error.message);
      }
    }
  }

  /**
   * Connect to device by ID
   * @param {string} deviceId - Target device ID
   */
  async connectToDeviceById(deviceId) {
    try {
      // Always ensure completely fresh connection
      if (this.isConnected || this.webrtcManager.pc) {
        console.log('🔄 Ensuring completely fresh connection...');
        await this.webrtcManager.completeRecreation();
        this.isConnected = false;
        this.peerId = null;
      }
      
      this.socketManager.connectToDevice(deviceId);
      this.uiManager.updateConnectionStatus('Connecting...', 'connecting');
    } catch (error) {
      this.uiManager.showError(error.message);
    }
  }

  /**
   * Connect to device from modal
   */
  async connectToDevice() {
    const targetDeviceId = this.uiManager.getDeviceIdInput();
    
    if (!targetDeviceId) {
      this.uiManager.showError('Please enter a device ID');
      return;
    }
    
    if (targetDeviceId === this.deviceId) {
      this.uiManager.showError('Cannot connect to yourself');
      return;
    }
    
    await this.connectToDeviceById(targetDeviceId);
    this.uiManager.hideConnectionModal();
  }

  /**
   * Disconnect from peer
   */
  disconnect() {
    this.webrtcManager.close();
    this.socketManager.disconnectPeer();
    this.peerId = null;
    this.isConnected = false;
    this.uiManager.updateConnectionStatus('Disconnected', 'disconnected');
    this.updateUI();
  }

  /**
   * Detect connection type
   */
  async detectConnectionType() {
    const connectionInfo = await Utils.getConnectionType(this.webrtcManager.pc);
    const statusText = connectionInfo.isLocal ? 
      `Connected to ${this.peerId} (Local Network)` : 
      `Connected to ${this.peerId} (${connectionInfo.type})`;
    
    this.uiManager.updateConnectionStatus(statusText, 'connected');
    console.log(`Connection type: ${connectionInfo.type}, Local network: ${connectionInfo.isLocal}`);
  }

  /**
   * Clear all received files
   */
  clearReceivedFiles() {
    // Revoke all object URLs to free memory
    this.receivedFiles.forEach(file => {
      URL.revokeObjectURL(file.url);
    });
    
    this.receivedFiles = [];
    this.uiManager.updateReceivedFiles(this.receivedFiles);
    this.uiManager.showSuccess('All received files cleared');
  }

  /**
   * Remove a specific received file
   * @param {string} fileId - ID of the file to remove
   */
  removeReceivedFile(fileId) {
    const fileIndex = this.receivedFiles.findIndex(file => file.id === fileId);
    
    if (fileIndex !== -1) {
      const file = this.receivedFiles[fileIndex];
      URL.revokeObjectURL(file.url); // Free memory
      this.receivedFiles.splice(fileIndex, 1);
      this.uiManager.updateReceivedFiles(this.receivedFiles);
      this.uiManager.showSuccess(`Removed: ${file.name}`);
    }
  }

  /**
   * Update UI state
   */
  updateUI() {
    this.uiManager.updateUI(this.isConnected, this.currentFiles);
  }

  finalizeReceivedFile() {
    // Clear the EOF timeout
    if (this.fileTransferState.eofTimeout) {
      clearTimeout(this.fileTransferState.eofTimeout);
      this.fileTransferState.eofTimeout = null;
    }
    
    const blob = new Blob(this.fileTransferState.buffer);
    this.fileTransferState.buffer = null;
    const url = URL.createObjectURL(blob);
    const receivedFile = {
      name: this.fileTransferState.fileName,
      size: this.fileTransferState.fileSize,
      url: url,
      timestamp: new Date().toISOString(),
      id: Date.now() + Math.random().toString(36).substr(2, 9)
    };
    this.receivedFiles.push(receivedFile);
    this.uiManager.updateReceivedFiles(this.receivedFiles);
    this.uiManager.hideProgress();
    this.uiManager.showSuccess(`File received: ${this.fileTransferState.fileName}`);
    this.fileTransferState.eofReceived = false;
  }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.app = new P2PFileSharing();
  window.app.initialize();
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = P2PFileSharing;
} 