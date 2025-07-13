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
    
    // Connection state to prevent multiple simultaneous connection attempts
    this.connectionAttemptInProgress = false;
    
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
      resetConnection: () => this.resetConnection(),
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
      console.log('🔗 Peer connected event received:', peerId);
      this.peerId = peerId;
      this.isConnected = true;
      this.uiManager.updateConnectionStatus(`Connected to ${peerId}`, 'connected');
      this.updateUI();
      
      // If we're not the sender, prepare to receive files
      if (!this.currentFiles) {
        console.log('📥 No files selected, starting as receiver');
        this.startFileTransfer(false);
      } else {
        console.log('📤 Files selected, will start as sender when ready');
      }
    };
    
    this.socketManager.onPeerDisconnected = () => {
      this.peerId = null;
      this.isConnected = false;
      this.uiManager.updateConnectionStatus('Peer disconnected', 'disconnected');
      this.updateUI();
    };
    
    this.socketManager.onSignal = (from, data) => {
      console.log('📡 Signal received from:', from, 'type:', data.type || 'candidate');
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
      console.log('🔗 Data channel opened, isSender:', isSender);
      
      // Reset connection attempt flag since connection is successful
      this.connectionAttemptInProgress = false;
      
      if (isSender && this.currentFiles && this.currentFiles.length > 0) {
        console.log('📤 Starting file transfer as sender (onDataChannelOpen)');
        this.sendFiles(this.currentFiles);
      }
      
      // Test the connection after a short delay
      setTimeout(() => {
        console.log('🔗 Testing data channel connection...');
        try {
          this.webrtcManager.dc.send('{"type":"connection_test","message":"Connection test from ' + this.deviceId + '"}');
          console.log('🔗 Connection test message sent');
        } catch (error) {
          console.error('❌ Error sending connection test:', error);
        }
      }, 1000);
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
      
      // Reset connection attempt flag on connection state changes
      if (state === 'connected' || state === 'failed' || state === 'disconnected') {
        this.connectionAttemptInProgress = false;
      }
      
      // Hide progress bar on connection failure or disconnection
      if (state === 'failed' || state === 'disconnected') {
        this.uiManager.hideProgress();
      }
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
  /**
   * Reset file transfer state for new transfer
   */
  resetFileTransferState() {
    // Clear any existing intervals/timeouts
    if (this.fileTransferState.completionCheckInterval) {
      clearInterval(this.fileTransferState.completionCheckInterval);
    }
    if (this.fileTransferState.eofTimeout) {
      clearTimeout(this.fileTransferState.eofTimeout);
    }
    
    this.fileTransferState = {
      isTransferring: false,
      isFinalizing: false,
      currentFileIndex: 0,
      totalFiles: 0,
      receivedSize: 0,
      fileSize: 0,
      fileName: '',
      buffer: [],
      lastTime: 0,
      lastBytes: 0,
      speedMbps: 0,
      eofReceived: false,
      eofTimeout: null,
      completionCheckInterval: null,
      lastChunkTime: 0
    };
    
    // Also reset connection attempt flag
    this.connectionAttemptInProgress = false;
    
    console.log('🔄 File transfer state reset');
  }

  startFileTransfer(isSender) {
    console.log(`🚀 Starting file transfer as ${isSender ? 'sender' : 'receiver'}`);
    console.log('🚀 Current state:', {
      deviceId: this.deviceId,
      peerId: this.peerId,
      isConnected: this.isConnected,
      hasFiles: !!this.currentFiles
    });
    
    // Prevent multiple simultaneous file transfer attempts
    if (this.fileTransferState.isTransferring) {
      console.log('⚠️ File transfer already in progress, skipping new attempt');
      return;
    }
    
    // Prevent multiple simultaneous connection attempts
    if (this.connectionAttemptInProgress) {
      console.log('⚠️ Connection attempt already in progress, skipping new attempt');
      return;
    }
    
    this.connectionAttemptInProgress = true;
    
    // Check if we're already in a connection state
    if (this.webrtcManager.connectionState === 'connecting' || this.webrtcManager.connectionState === 'connected') {
      console.log('⚠️ Connection already in progress or connected, attempting force reset...');
      
      // Force reset if stuck in connecting state for too long
      if (this.webrtcManager.connectionState === 'connecting') {
        console.log('🔄 Force resetting stuck connection state...');
        this.webrtcManager.forceResetConnectionState();
      } else {
        // Check if the data channel is actually ready for file transfer
        const dataChannelReady = this.webrtcManager.dc && this.webrtcManager.dc.readyState === 'open';
        console.log('⚠️ Connection is connected, checking data channel readiness:', {
          hasDataChannel: !!this.webrtcManager.dc,
          dataChannelState: this.webrtcManager.dc?.readyState || 'none',
          dataChannelReady: dataChannelReady
        });
        
        if (dataChannelReady) {
          console.log('✅ Data channel is ready, proceeding with file transfer');
          // Continue with file transfer setup
        } else {
          console.log('🔄 Data channel not ready, forcing connection reset');
          this.webrtcManager.forceResetConnectionState();
        }
      }
    }
    
    // Reset file transfer state for new transfer
    this.resetFileTransferState();
    
    // Force reset the WebRTC connection to ensure stable state
    this.webrtcManager.close();
    
    // Wait a bit to ensure complete cleanup
    setTimeout(() => {
      console.log('🔄 Initializing peer connection as', isSender ? 'sender' : 'receiver');
      this.webrtcManager.initializePeerConnection(isSender);

      // Determine who creates the offer based on device ID (lower ID creates offer)
      // Use localeCompare for proper string comparison to avoid deadlocks
      const shouldCreateOffer = this.deviceId.localeCompare(this.peerId) < 0;
      console.log('🔍 Device ID comparison:', {
        deviceId: this.deviceId, 
        peerId: this.peerId, 
        shouldCreateOffer,
        comparison: this.deviceId.localeCompare(this.peerId)
      });

      if (shouldCreateOffer) {
        setTimeout(async () => {
          console.log('🔄 About to call createOffer...');
          console.log('🔄 WebRTC state before offer:', {
            hasPC: !!this.webrtcManager.pc,
            signalingState: this.webrtcManager.pc?.signalingState,
            connectionState: this.webrtcManager.pc?.connectionState,
            hasDataChannel: !!this.webrtcManager.dc
          });
          
          try {
            const offer = await this.webrtcManager.createOffer();
            console.log('🔄 createOffer returned:', offer);
            if (offer !== undefined && offer !== null) {
              console.log('✅ Sending valid offer to peer');
              this.socketManager.sendSignal(this.peerId, offer);
              // File transfer will start automatically when data channel opens
            } else {
              console.error('startFileTransfer: Tried to send undefined offer', { peerId: this.peerId, offer });
              this.uiManager.showError('Failed to create a valid offer for signaling.');
            }
          } catch (error) {
            console.error('❌ Error creating offer:', error);
            this.uiManager.showError('Failed to create connection');
            // Reset connection state on error
            this.webrtcManager.forceResetConnectionState();
            // Reset connection attempt flag
            this.connectionAttemptInProgress = false;
          }
        }, 500); // Increased delay to 500ms to allow connection to stabilize
      } else {
        console.log('📥 Waiting for peer to create offer...');
        
        // Add a fallback timeout to prevent deadlock
        // If no offer is received within 3 seconds, force create an offer
        setTimeout(async () => {
          if (this.webrtcManager.connectionState === 'connecting' && !this.webrtcManager.pc?.currentRemoteDescription) {
            console.log('⚠️ No offer received within timeout, forcing offer creation to prevent deadlock');
            try {
              const offer = await this.webrtcManager.createOffer();
              if (offer) {
                console.log('✅ Sending forced offer to peer');
                this.socketManager.sendSignal(this.peerId, offer);
              }
            } catch (error) {
              console.error('❌ Error creating forced offer:', error);
              this.webrtcManager.forceResetConnectionState();
              // Reset connection attempt flag
              this.connectionAttemptInProgress = false;
            }
          }
        }, 3000); // 3 second timeout
      }
    }, 100); // 100ms delay to ensure cleanup
    
    // Add a safety timeout to reset connection attempt flag
    setTimeout(() => {
      if (this.connectionAttemptInProgress) {
        console.log('⚠️ Connection attempt flag stuck, resetting...');
        this.connectionAttemptInProgress = false;
      }
    }, 20000); // 20 second safety timeout
  }

  /**
   * Send multiple files
   * @param {FileList} files - Files to send
   */
  async sendFiles(files) {
    if (!files || files.length === 0) return;
    
    // Prevent multiple transfers
    if (this.fileTransferState.isTransferring) {
      console.log('⚠️ File transfer already in progress, skipping');
      return;
    }
    
    this.fileTransferState.isTransferring = true;
    
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
      } finally {
        this.fileTransferState.isTransferring = false;
        this.uiManager.hideProgress(); // Ensure progress is hidden
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
    const startTime = Date.now();
    const maxTransferTime = 300000; // 5 minutes max transfer time
    let lastActivityTime = Date.now();
    
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
        // Check for timeout
        if (Date.now() - startTime > maxTransferTime) {
          throw new Error('File transfer timeout - taking too long');
        }
        
        // Check for inactivity (no progress for 30 seconds)
        if (Date.now() - lastActivityTime > 30000) {
          console.warn('⚠️ No transfer activity for 30 seconds, checking buffer state...');
          console.log('📊 Current buffer state:', {
            bufferedAmount: this.webrtcManager.dc?.bufferedAmount || 0,
            maxBuffer: this.config.MAX_BUFFERED_AMOUNT,
            progress: Math.round((offset / file.size) * 100) + '%',
            remaining: file.size - offset,
            dataChannelState: this.webrtcManager.dc?.readyState || 'unknown'
          });
          
          // Check if data channel is still open
          if (this.webrtcManager.dc?.readyState !== 'open') {
            throw new Error(`Data channel is not open (state: ${this.webrtcManager.dc?.readyState})`);
          }
        }
        
        // Log progress every 10% to help debug
        const currentProgress = Math.round((offset / file.size) * 100);
        if (currentProgress % 10 === 0 && currentProgress > 0) {
          console.log(`📊 Transfer progress: ${currentProgress}% (${offset}/${file.size} bytes)`);
        }
        
        const chunk = file.slice(offset, offset + this.config.CHUNK_SIZE);
        
        try {
          const arrayBuffer = await this.readFileAsArrayBuffer(chunk);
          
          // Check buffer state before sending
          if (this.webrtcManager.dc && this.webrtcManager.dc.bufferedAmount > this.config.MAX_BUFFERED_AMOUNT * 0.7) {
            console.log('⏳ Buffer getting full, waiting...', this.webrtcManager.dc.bufferedAmount, 'max:', this.config.MAX_BUFFERED_AMOUNT);
            // Wait for buffer to clear with timeout
            const startWait = Date.now();
            let waitCount = 0;
            while (this.webrtcManager.dc.bufferedAmount > this.config.MAX_BUFFERED_AMOUNT * 0.5 && (Date.now() - startWait) < 3000) {
              await new Promise(resolve => setTimeout(resolve, 50));
              waitCount++;
              if (waitCount % 20 === 0) { // Log every second
                console.log('⏳ Still waiting for buffer to clear...', this.webrtcManager.dc.bufferedAmount);
              }
            }
            if (this.webrtcManager.dc.bufferedAmount > this.config.MAX_BUFFERED_AMOUNT * 0.5) {
              console.warn('⚠️ Buffer still full after timeout, continuing anyway');
            } else {
              console.log('✅ Buffer cleared, continuing transfer');
            }
          }
          
          await this.webrtcManager.sendData(arrayBuffer);
          offset += arrayBuffer.byteLength;
          lastActivityTime = Date.now();
          
          // Log buffer state periodically
          if (offset % (this.config.CHUNK_SIZE * 5) === 0) {
            console.log('📊 Buffer state:', {
              bufferedAmount: this.webrtcManager.dc?.bufferedAmount || 0,
              maxBuffer: this.config.MAX_BUFFERED_AMOUNT,
              progress: Math.round((offset / file.size) * 100) + '%',
              remaining: file.size - offset
            });
          }
          
          // Log final chunks more frequently
          if (offset >= file.size * 0.95) {
            console.log('📤 Final chunks - Sent:', offset, 'Total:', file.size, 'Remaining:', file.size - offset, 'Buffer:', this.webrtcManager.dc?.bufferedAmount || 0);
          }
          
          // More frequent delays to prevent overwhelming the buffer
          if (offset % (this.config.CHUNK_SIZE * 4) === 0) {
            await new Promise(resolve => setTimeout(resolve, 10));
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
    
    // Verify all data was sent
    if (offset !== file.size) {
      console.error('❌ File transfer incomplete!', {
        offset: offset,
        fileSize: file.size,
        missing: file.size - offset
      });
      throw new Error(`File transfer incomplete: ${offset}/${file.size} bytes sent`);
    }
    
    console.log('✅ All chunks sent successfully. Final verification:', {
      offset: offset,
      fileSize: file.size,
      bufferedAmount: this.webrtcManager.dc?.bufferedAmount || 0,
      queueLength: this.webrtcManager.sendQueue?.length || 0
    });
    
    // Wait for any remaining buffered data to be sent
    if (this.webrtcManager.dc && this.webrtcManager.dc.bufferedAmount > 0) {
      console.log('⏳ Waiting for buffer to flush before sending EOF...', this.webrtcManager.dc.bufferedAmount);
      const flushStartTime = Date.now();
      const maxFlushTime = 10000; // 10 seconds max
      
      try {
        await Promise.race([
          this.webrtcManager.forceFlushBuffer(),
          new Promise(resolve => setTimeout(resolve, maxFlushTime))
        ]);
        
        if (this.webrtcManager.dc.bufferedAmount > 0) {
          console.warn('⚠️ Buffer still not empty after timeout, proceeding with EOF');
        } else {
          console.log('✅ Buffer flushed, ready to send EOF');
        }
      } catch (error) {
        console.warn('⚠️ Error during buffer flush:', error);
      }
    }
    
    // Wait for send queue to be empty
    if (this.webrtcManager.sendQueue && this.webrtcManager.sendQueue.length > 0) {
      console.log('⏳ Waiting for send queue to empty before sending EOF...', this.webrtcManager.sendQueue.length, 'items remaining');
      const queueStartTime = Date.now();
      const maxQueueTime = 5000; // 5 seconds max
      
      try {
        await Promise.race([
          this.webrtcManager.waitForQueueEmpty(),
          new Promise(resolve => setTimeout(resolve, maxQueueTime))
        ]);
        
        if (this.webrtcManager.sendQueue.length > 0) {
          console.warn('⚠️ Send queue still not empty after timeout, proceeding with EOF');
        } else {
          console.log('✅ Send queue empty, ready to send EOF');
        }
      } catch (error) {
        console.warn('⚠️ Error waiting for queue to empty:', error);
      }
    }
    
    // Send EOF message to indicate file completion
    try {
      console.log('📤 About to send EOF message. Final stats:', {
        offset: offset,
        fileSize: file.size,
        remaining: file.size - offset,
        bufferedAmount: this.webrtcManager.dc?.bufferedAmount || 0,
        queueLength: this.webrtcManager.sendQueue?.length || 0
      });
      
      // Small delay to ensure all previous data is processed
      await new Promise(resolve => setTimeout(resolve, 100));
      
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
    
    // Handle test message
    if (typeof e.data === 'string' && e.data.includes('"type":"test"')) {
      console.log('📥 Test message received:', e.data);
      // Send a pong response
      try {
        const response = '{"type":"pong","message":"Test response received"}';
        this.webrtcManager.dc.send(response);
        console.log('📤 Pong response sent');
      } catch (error) {
        console.error('❌ Error sending pong response:', error);
      }
      return;
    }
    
    // Handle pong message
    if (typeof e.data === 'string' && e.data.includes('"type":"pong"')) {
      console.log('📥 Pong message received:', e.data);
      return;
    }
    
    // Handle immediate test message
    if (typeof e.data === 'string' && e.data.includes('"type":"immediate_test"')) {
      console.log('📥 Immediate test message received:', e.data);
      // Send a response
      try {
        const response = '{"type":"immediate_test_response","message":"Immediate test response from ' + this.deviceId + '"}';
        this.webrtcManager.dc.send(response);
        console.log('📤 Immediate test response sent');
      } catch (error) {
        console.error('❌ Error sending immediate test response:', error);
      }
      return;
    }
    
    // Handle immediate test response
    if (typeof e.data === 'string' && e.data.includes('"type":"immediate_test_response"')) {
      console.log('📥 Immediate test response received:', e.data);
      return;
    }
    
    // Handle connection test message
    if (typeof e.data === 'string' && e.data.includes('"type":"connection_test"')) {
      console.log('📥 Connection test message received:', e.data);
      // Send a response
      try {
        const response = '{"type":"connection_test_response","message":"Connection test response from ' + this.deviceId + '"}';
        this.webrtcManager.dc.send(response);
        console.log('📤 Connection test response sent');
      } catch (error) {
        console.error('❌ Error sending connection test response:', error);
      }
      return;
    }
    
    // Handle connection test response
    if (typeof e.data === 'string' && e.data.includes('"type":"connection_test_response"')) {
      console.log('📥 Connection test response received:', e.data);
      return;
    }
    
    // Handle binary test data
    if (e.data instanceof ArrayBuffer && e.data.byteLength === 1024) {
      console.log('📥 Binary test data received:', e.data.byteLength, 'bytes');
      // Verify the data pattern
      const view = new Uint8Array(e.data);
      let isSenderPattern = true;
      let isReceiverPattern = true;
      for (let i = 0; i < 1024; i++) {
        if (view[i] !== (i % 256)) isSenderPattern = false;
        if (view[i] !== ((i + 128) % 256)) isReceiverPattern = false;
      }
      if (isSenderPattern) {
        console.log('📥 Sender binary test pattern confirmed');
      } else if (isReceiverPattern) {
        console.log('📥 Receiver binary test pattern confirmed');
      } else {
        console.log('📥 Unknown binary test pattern');
      }
      return;
    }
    
    // Handle EOF message
    if (typeof e.data === 'string') {
      // Check for EOF message in multiple formats
      let isEOF = false;
      try {
        if (e.data === '{"type":"EOF"}') {
          isEOF = true;
        } else if (e.data.startsWith('{') && e.data.includes('"type":"EOF"')) {
          const parsed = JSON.parse(e.data);
          if (parsed.type === 'EOF') {
            isEOF = true;
          }
        }
      } catch (error) {
        // Not a JSON EOF message, continue checking
      }
      
      if (isEOF) {
        console.log('📥 EOF message received');
        this.fileTransferState.eofReceived = true;
        
        // Clear the EOF timeout
        if (this.fileTransferState.eofTimeout) {
          clearTimeout(this.fileTransferState.eofTimeout);
          this.fileTransferState.eofTimeout = null;
        }
        
        // Finalize file when EOF is received, regardless of exact size match
        // This handles cases where the transfer was interrupted but we have partial data
        console.log('📥 Finalizing file with EOF. Received:', this.fileTransferState.receivedSize, 'Expected:', this.fileTransferState.fileSize);
        
        // Force finalization if file is very close to complete, even if already finalizing
        const progress = (this.fileTransferState.receivedSize / this.fileTransferState.fileSize) * 100;
        if (progress >= 99 && this.fileTransferState.isFinalizing) {
          console.log('📥 File is 99%+ complete, forcing finalization despite isFinalizing flag');
          this.fileTransferState.isFinalizing = false;
        }
        
        this.finalizeReceivedFile();
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
        // Prevent duplicate file processing
        if (this.fileTransferState.isTransferring && this.fileTransferState.fileName === meta.name) {
          console.log('⚠️ Duplicate file metadata received, skipping:', meta.name);
          return;
        }
        
        this.fileTransferState.fileName = meta.name;
        this.fileTransferState.fileSize = meta.size;
        this.fileTransferState.receivedSize = 0;
        this.fileTransferState.buffer = [];
        this.fileTransferState.currentFileIndex++;
        this.fileTransferState.lastTime = performance.now();
        this.fileTransferState.lastBytes = 0;
        this.fileTransferState.speedMbps = 0;
        this.fileTransferState.eofReceived = false;
        this.fileTransferState.isFinalizing = false;
        
        // Set up periodic completion check
        this.fileTransferState.completionCheckInterval = setInterval(() => {
          const receivedSize = this.fileTransferState.receivedSize;
          const expectedSize = this.fileTransferState.fileSize;
          const progress = (receivedSize / expectedSize) * 100;
          
          // Only finalize if we have received the complete file AND haven't received new data recently
          const timeSinceLastChunk = this.fileTransferState.lastChunkTime ? 
            performance.now() - this.fileTransferState.lastChunkTime : 
            performance.now() - this.fileTransferState.lastTime;
          const isStillReceiving = timeSinceLastChunk < 5000; // Consider still receiving if last chunk was < 5s ago
          
          // Only finalize if file is 100% complete and no new data for 10 seconds
          if (receivedSize >= expectedSize && timeSinceLastChunk > 10000 && !this.fileTransferState.eofReceived && !this.fileTransferState.isFinalizing && !isStillReceiving) {
            console.log('📥 Periodic check: File is 100% complete and no new data for 10s, finalizing file');
            this.finalizeReceivedFile();
          } else if (receivedSize < expectedSize && timeSinceLastChunk > 15000) {
            // If file is incomplete and no new data for 15 seconds, log warning
            console.log('⚠️ Periodic check: File incomplete and no new data for 15s. Progress:', progress.toFixed(1) + '%');
          }
        }, 5000); // Check every 5 seconds
        
        // Set a timeout to finalize the file if EOF doesn't arrive
        this.fileTransferState.eofTimeout = setTimeout(() => {
          const receivedSize = this.fileTransferState.receivedSize;
          const expectedSize = this.fileTransferState.fileSize;
          const progress = (receivedSize / expectedSize) * 100;
          
          if (!this.fileTransferState.eofReceived) {
            console.log('⏰ EOF timeout reached. Received:', receivedSize, 'Expected:', expectedSize, 'Progress:', progress.toFixed(1) + '%');
            
            // Only finalize if we have received the complete file
            if (receivedSize >= expectedSize) {
              console.log('⏰ File is complete, finalizing despite missing EOF');
              this.finalizeReceivedFile();
            } else {
              console.log('⏰ File incomplete, waiting for more data...');
              // Set another timeout for a longer period
              this.fileTransferState.eofTimeout = setTimeout(() => {
                console.log('⏰ Second EOF timeout reached');
                if (this.fileTransferState.receivedSize >= this.fileTransferState.fileSize) {
                  console.log('⏰ File now complete, finalizing');
                  this.finalizeReceivedFile();
                } else {
                  console.log('⏰ File still incomplete, continuing to wait...');
                  this.fileTransferState.isFinalizing = false;
                }
              }, 15000); // 15 more seconds
            }
          }
        }, 15000); // 15 second timeout for EOF
        
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
      
      // Ensure buffer is initialized
      if (!this.fileTransferState.buffer) {
        console.log('⚠️ Buffer was null, reinitializing...');
        this.fileTransferState.buffer = [];
      }
      
      this.fileTransferState.buffer.push(e.data);
      this.fileTransferState.receivedSize += e.data.byteLength;
      
      // Update last chunk time to prevent premature finalization
      this.fileTransferState.lastChunkTime = performance.now();
      
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
      
      // Only finalize when we have received the exact file size
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
      // Check if we're in the middle of an operation
      if (this.webrtcManager.isCreatingOffer || this.webrtcManager.isHandlingOffer || this.webrtcManager.isHandlingAnswer) {
        console.log('⚠️ WebRTC operation in progress, skipping signal:', data.type || 'candidate');
        return;
      }
      
      // Check if WebRTC connection is in valid state
      if (!this.webrtcManager.isValidState()) {
        console.log('⚠️ WebRTC connection not in valid state, reinitializing...');
        this.webrtcManager.initializePeerConnection(true);
      }
      
      if (data.type === 'offer') {
        console.log('📥 Received offer, handling...');
        const answer = await this.webrtcManager.handleOffer(data);
        if (answer) {
          console.log('📤 Sending answer...');
          this.socketManager.sendSignal(this.peerId, answer);
        }
      } else if (data.type === 'answer') {
        console.log('📥 Received answer, handling...');
        await this.webrtcManager.handleAnswer(data);
      } else if (data.candidate) {
        console.log('📥 Received ICE candidate, adding...');
        await this.webrtcManager.addIceCandidate(data);
      }
    } catch (error) {
      console.error('Error handling signal:', error);
      
      // Try to recover from connection failure
      if (error.message.includes('SDP does not match') || 
          error.message.includes('InvalidModificationError') ||
          error.message.includes('order of m-lines') ||
          error.message.includes('Called in wrong state')) {
        console.log('🔄 Attempting to recover from SDP error...');
        try {
          // Force a complete reset
          this.webrtcManager.close();
          await new Promise(resolve => setTimeout(resolve, 500)); // Wait for cleanup
          this.webrtcManager.initializePeerConnection(true);
          this.uiManager.showInfo('Connection recovered, please try again');
        } catch (recoveryError) {
          console.error('Recovery failed:', recoveryError);
          this.uiManager.showError('Connection failed and recovery unsuccessful');
        }
      } else if (error.message.includes('Already handling')) {
        console.log('⚠️ Duplicate signal handling, ignoring');
        // Don't show error for duplicate handling
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
    this.uiManager.hideProgress(); // Hide progress bar on disconnect
    this.updateUI();
  }

  /**
   * Reset connection state
   */
  resetConnection() {
    console.log('🔄 Manual connection reset requested');
    
    // Force reset the WebRTC connection state
    this.webrtcManager.forceResetConnectionState();
    
    // Close and reinitialize the connection
    this.webrtcManager.close();
    
    // Hide progress bar on reset
    this.uiManager.hideProgress();
    
    // Show success message
    this.uiManager.showSuccess('Connection reset successfully. You can now try connecting again.');
    
    // Update UI
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
    // Prevent multiple finalizations of the same file
    if (this.fileTransferState.isFinalizing) {
      console.log('⚠️ File finalization already in progress, skipping duplicate');
      return;
    }
    
    // Check if file is already finalized (in receivedFiles)
    const existingFile = this.receivedFiles.find(file => 
      file.name === this.fileTransferState.fileName || 
      file.name.includes(this.fileTransferState.fileName.replace(/\.[^/.]+$/, ""))
    );
    
    if (existingFile) {
      console.log('⚠️ File already finalized, skipping duplicate finalization');
      return;
    }
    
    this.fileTransferState.isFinalizing = true;
    
    // Set a timeout to reset isFinalizing flag if finalization takes too long
    setTimeout(() => {
      if (this.fileTransferState.isFinalizing) {
        console.log('⚠️ Finalization taking too long, resetting flag');
        this.fileTransferState.isFinalizing = false;
      }
    }, 5000); // 5 second timeout
    
    // Clear the EOF timeout
    if (this.fileTransferState.eofTimeout) {
      clearTimeout(this.fileTransferState.eofTimeout);
      this.fileTransferState.eofTimeout = null;
    }
    
    // Clear the completion check interval
    if (this.fileTransferState.completionCheckInterval) {
      clearInterval(this.fileTransferState.completionCheckInterval);
      this.fileTransferState.completionCheckInterval = null;
    }
    
    const actualSize = this.fileTransferState.receivedSize;
    const expectedSize = this.fileTransferState.fileSize;
    const progress = (actualSize / expectedSize) * 100;
    
    console.log('📥 Finalizing file:', this.fileTransferState.fileName);
    console.log('📥 Size comparison - Received:', actualSize, 'Expected:', expectedSize, 'Progress:', progress.toFixed(1) + '%');
    
    // Only finalize if we have received the complete file
    if (actualSize < expectedSize) {
      console.log('❌ File incomplete, not finalizing. Waiting for more data...');
      console.log('❌ Missing bytes:', expectedSize - actualSize);
      
      // Reset finalization state to allow retry
      this.fileTransferState.isFinalizing = false;
      
      // Set a new timeout to wait for more data
      this.fileTransferState.eofTimeout = setTimeout(() => {
        console.log('⏰ Still waiting for complete file data...');
        console.log('⏰ Current progress:', (this.fileTransferState.receivedSize / this.fileTransferState.fileSize * 100).toFixed(1) + '%');
        
        // Only finalize if we have at least 99.9% of the file
        if (this.fileTransferState.receivedSize >= this.fileTransferState.fileSize * 0.999) {
          console.log('⏰ File is 99.9%+ complete, finalizing despite missing data');
          this.finalizeReceivedFile();
        } else {
          console.log('⏰ File still incomplete, continuing to wait...');
          this.fileTransferState.isFinalizing = false;
        }
      }, 10000); // Wait 10 more seconds for missing data
      
      return;
    }
    
    // Ensure buffer exists before creating blob
    if (!this.fileTransferState.buffer || this.fileTransferState.buffer.length === 0) {
      console.warn('⚠️ Buffer was empty or null during finalization');
      this.fileTransferState.buffer = [];
    }
    
    const blob = new Blob(this.fileTransferState.buffer);
    this.fileTransferState.buffer = []; // Reinitialize for next file instead of null
    const url = URL.createObjectURL(blob);
    
    const receivedFile = {
      name: this.fileTransferState.fileName,
      size: actualSize,
      originalSize: expectedSize,
      isComplete: true,
      url: url,
      timestamp: new Date().toISOString(),
      id: Date.now() + Math.random().toString(36).substr(2, 9)
    };
    
    this.receivedFiles.push(receivedFile);
    this.uiManager.updateReceivedFiles(this.receivedFiles);
    this.uiManager.hideProgress();
    
    this.uiManager.showSuccess(`File received successfully: ${this.fileTransferState.fileName}`);
    
    // Reset finalization state
    this.fileTransferState.eofReceived = false;
    this.fileTransferState.isFinalizing = false;
    
    console.log('✅ File finalization completed successfully - Complete file received');
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