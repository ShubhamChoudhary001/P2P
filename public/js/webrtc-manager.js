/**
 * WebRTC Manager
 * Handles all WebRTC peer connections and data channels
 */

class WebRTCManager {
  constructor(config) {
    this.config = config;
    this.pc = null;
    this.dc = null;
    this.peerId = null;
    this.onDataChannelOpen = null;
    this.onDataChannelMessage = null;
    this.onConnectionStateChange = null;
    this.onIceConnectionStateChange = null;
    
    // Queue for sending data
    this.sendQueue = [];
    this.isSending = false;
    this.isCreatingOffer = false;
  }

  /**
   * Create optimized ICE configuration for local network
   * @returns {Object} ICE configuration
   */
  createOptimizedIceConfig() {
    const isLocalNetwork = this.detectLocalNetwork();
    
    if (isLocalNetwork) {
      console.log('🏠 Using local network optimized ICE configuration');
      return {
        iceServers: [
          // Minimal STUN for local network
          { urls: 'stun:stun.l.google.com:19302' },
          // Force local network candidates
          { urls: 'stun:0.0.0.0:3478' }
        ],
        iceCandidatePoolSize: 10,
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require',
        iceTransportPolicy: 'all', // Allow all for local network
        iceConnectionReceivingTimeout: 3000, // Faster timeout
        iceBackupCandidatePairPct: 0.5
      };
    } else {
      console.log('🌍 Using standard ICE configuration');
      return {
        iceServers: this.config.ICE_SERVERS,
        iceCandidatePoolSize: 20,
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require',
        iceTransportPolicy: 'all',
        iceConnectionReceivingTimeout: 5000,
        iceBackupCandidatePairPct: 0.7,
        sdpSemantics: 'unified-plan'
      };
    }
  }

  /**
   * Initialize WebRTC peer connection
   * @param {boolean} isSender - Whether this peer is the sender
   */
  initializePeerConnection(isSender) {
    console.log(`Initializing WebRTC as ${isSender ? 'sender' : 'receiver'}`);
    
    // Store the sender state
    this.isSender = isSender;
    
    // Detect if we're on local network
    const isLocalNetwork = this.detectLocalNetwork();
    console.log('🌐 Local network detected:', isLocalNetwork);
    
    // Get optimized ICE configuration
    const iceConfig = this.createOptimizedIceConfig();
    
    // Optimized RTCPeerConnection configuration for maximum speed
    this.pc = new RTCPeerConnection(iceConfig);
    
    // Filter ICE candidates for local network optimization
    this.pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        // Filter candidates for local network priority
        if (isLocalNetwork && this.isLocalCandidate(candidate)) {
          console.log('🏠 Local candidate found:', candidate.address);
        }
        console.log('Sending ICE candidate');
        if (this.onIceCandidate) {
          this.onIceCandidate(candidate);
        }
      }
    };
    
    if (isSender) {
      // Optimized data channel configuration for maximum speed
      this.dc = this.pc.createDataChannel('file', {
        ordered: true, // Ensure ordered delivery
        maxRetransmits: 1, // Minimal retransmissions for speed
        priority: 'high', // High priority for file transfer
        // Optimizations for high-speed transfers
        negotiated: false, // Let WebRTC handle negotiation
        id: 0 // Use first available ID
      });
      this.setupDataChannel(true);
    } else {
      this.pc.ondatachannel = (e) => {
        console.log('🔗 ondatachannel event fired on receiver');
        this.dc = e.channel;
        this.setupDataChannel(false);
      };
    }

    // Set up event handlers
    this.pc.onconnectionstatechange = () => {
      console.log('Connection state:', this.pc.connectionState);
      if (this.onConnectionStateChange) {
        this.onConnectionStateChange(this.pc.connectionState);
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', this.pc.iceConnectionState);
      if (this.onIceConnectionStateChange) {
        this.onIceConnectionStateChange(this.pc.iceConnectionState);
      }
    };

    this.pc.onsignalingstatechange = () => {
      console.log('Signaling state changed:', this.pc.signalingState);
    };
  }

  /**
   * Setup data channel event handlers
   * @param {boolean} isSender - Whether this peer is the sender
   */
  setupDataChannel(isSender) {
    console.log('🔧 setupDataChannel called, isSender:', isSender);
    if (!this.dc) {
      console.error('Cannot setup data channel: data channel is null');
      return;
    }
    
    this.dc.binaryType = 'arraybuffer';
    
    // Optimize data channel for speed
    if (this.dc.setBufferedAmountLowThreshold) {
      this.dc.setBufferedAmountLowThreshold(this.config.MAX_BUFFERED_AMOUNT * 0.3);
    }
    
    this.dc.onopen = () => {
      console.log('Data channel open');
      
      // Start performance monitoring
      this.startPerformanceMonitoring();
      
      // Get connection diagnostics
      setTimeout(() => {
        this.getDetailedStats().then(stats => {
          if (!stats.error) {
            console.log('🚀 Connection established with:', {
              type: stats.selectedCandidate ? 'Direct Connection' : 'Relay Connection',
              localNetwork: stats.isLocalNetwork ? 'Yes' : 'No',
              candidates: stats.candidates.length
            });
          }
        });
      }, 1000);
      
      if (this.onDataChannelOpen) {
        this.onDataChannelOpen(isSender);
      }
    };

    this.dc.onmessage = (e) => {
      if (this.onDataChannelMessage) {
        this.onDataChannelMessage(e);
      }
    };

    this.dc.onerror = (error) => {
      console.error('Data channel error:', error);
    };

    this.dc.onclose = () => {
      console.log('Data channel closed');
      this.stopPerformanceMonitoring();
    };
    
    // Optimized buffer management
    this.dc.onbufferedamountlow = () => {
      // Trigger queue processing when buffer is low
      if (this.sendQueue.length > 0 && !this.isSending) {
        this.processQueue();
      }
    };
  }

  /**
   * Create and send offer
   * @returns {Promise<RTCSessionDescription>} The created offer
   */
  async createOffer() {
    if (this.isCreatingOffer) {
      console.log('Offer creation already in progress, skipping.');
      return;
    }
    this.isCreatingOffer = true;
    try {
      console.log('🔄 Starting offer creation...');
      console.log('🔍 Current state:', {
        hasPC: !!this.pc,
        signalingState: this.pc?.signalingState,
        connectionState: this.pc?.connectionState,
        iceConnectionState: this.pc?.iceConnectionState
      });
      
      // Check if we need a fresh connection
      if (!this.pc) {
        console.log('🔄 No peer connection, creating new one...');
        this.initializePeerConnection(this.isSender);
      } else if (this.pc.signalingState !== 'stable') {
        console.log('🔄 Signaling state not stable, resetting connection...');
        await this.resetConnection();
      }
      
      // Only create offer if signalingState is stable
      if (this.pc.signalingState === 'stable') {
        console.log('✅ Signaling state is stable, creating offer...');
        const offer = await this.pc.createOffer();
        console.log('✅ Offer created successfully:', offer);
        await this.pc.setLocalDescription(offer);
        console.log('✅ Local description set successfully');
        console.log('Created offer');
        return offer;
      } else {
        console.warn('❌ Signaling state not stable, skipping offer creation. State:', this.pc.signalingState);
        return undefined;
      }
    } catch (error) {
      console.error('❌ Error creating offer:', error);
      // Only recreate if it's a critical state error
      if (error.message.includes('SDP does not match') || error.message.includes('InvalidModificationError')) {
        console.log('🔄 Critical error detected, recreating connection...');
        await this.forceReset();
        
        // Retry once with fresh connection
        try {
          console.log('🔄 Retrying offer creation after reset...');
          if (this.pc.signalingState === 'stable') {
            const offer = await this.pc.createOffer();
            await this.pc.setLocalDescription(offer);
            console.log('✅ Created offer after reset');
            return offer;
          } else {
            console.warn('❌ Signaling state not stable after reset, skipping offer creation. State:', this.pc.signalingState);
            return undefined;
          }
        } catch (retryError) {
          console.error('❌ Error creating offer after reset:', retryError);
          throw retryError;
        }
      }
      throw error;
    } finally {
      this.isCreatingOffer = false;
    }
  }

  /**
   * Handle incoming offer
   * @param {RTCSessionDescription} offer - The received offer
   * @returns {Promise<RTCSessionDescription>} The created answer
   */
  async handleOffer(offer) {
    try {
      // Check if we need a fresh connection
      if (!this.pc) {
        console.log('🔄 No peer connection, creating new one...');
        this.initializePeerConnection(this.isSender);
      } else if (this.pc.signalingState !== 'stable') {
        console.log('🔄 Signaling state not stable, resetting connection...');
        await this.resetConnection();
      }
      
      await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      console.log('Created answer');
      return answer;
    } catch (error) {
      console.error('Error handling offer:', error);
      
      // Only recreate if it's a critical state error
      if (error.message.includes('SDP does not match') || error.message.includes('InvalidModificationError')) {
        console.log('🔄 Critical error detected, recreating connection...');
        await this.forceReset();
        
        // Retry once with fresh connection
        try {
          await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await this.pc.createAnswer();
          await this.pc.setLocalDescription(answer);
          console.log('Created answer after reset');
          return answer;
        } catch (retryError) {
          console.error('Error handling offer after reset:', retryError);
          throw retryError;
        }
      }
      
      throw error;
    }
  }

  /**
   * Handle incoming answer
   * @param {RTCSessionDescription} answer - The received answer
   */
  async handleAnswer(answer) {
    try {
      await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (error) {
      console.error('Error handling answer:', error);
      throw error;
    }
  }

  /**
   * Add ICE candidate
   * @param {RTCIceCandidate} candidate - The ICE candidate
   */
  async addIceCandidate(candidate) {
    try {
      if (!this.pc) {
        console.error('Peer connection not initialized');
        return;
      }
      
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error('Error adding ICE candidate:', error);
      throw error;
    }
  }

  /**
   * Check if the peer connection is in a valid state
   * @returns {boolean} True if connection is valid
   */
  isValidState() {
    return this.pc && 
           this.pc.signalingState !== 'closed' && 
           this.pc.connectionState !== 'failed';
  }

  /**
   * Ensure we have a fresh connection
   */
  async ensureFreshConnection() {
    if (!this.pc || this.pc.signalingState !== 'stable') {
      console.log('🔄 Creating fresh connection...');
      await this.completeRecreation();
    }
  }

  /**
   * Complete recreation of the peer connection
   */
  async completeRecreation() {
    console.log('🔄 Complete connection recreation...');
    
    // Store callbacks and sender state
    const callbacks = {
      onIceCandidate: this.onIceCandidate,
      onConnectionStateChange: this.onConnectionStateChange,
      onIceConnectionStateChange: this.onIceConnectionStateChange,
      onDataChannelOpen: this.onDataChannelOpen,
      onDataChannelMessage: this.onDataChannelMessage
    };
    const isSender = this.isSender;
    
    // Completely close and nullify everything
    if (this.dc) {
      this.dc.close();
      this.dc = null;
    }
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    
    // Clear all queues and state
    this.sendQueue = [];
    this.isSending = false;
    
    // Wait for complete cleanup
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Create completely new peer connection
    this.initializePeerConnection(isSender);
    
    // Only setup data channel if it was created (for sender)
    if (this.dc) {
      this.setupDataChannel(isSender);
    }
    
    // Restore callbacks
    this.onIceCandidate = callbacks.onIceCandidate;
    this.onConnectionStateChange = callbacks.onConnectionStateChange;
    this.onIceConnectionStateChange = callbacks.onIceConnectionStateChange;
    this.onDataChannelOpen = callbacks.onDataChannelOpen;
    this.onDataChannelMessage = callbacks.onDataChannelMessage;
    
    console.log('✅ Complete connection recreation finished');
  }

  /**
   * Force a clean connection reset
   */
  async forceReset() {
    console.log('🔄 Force resetting connection...');
    
    // Store callbacks and sender state
    const callbacks = {
      onIceCandidate: this.onIceCandidate,
      onConnectionStateChange: this.onConnectionStateChange,
      onIceConnectionStateChange: this.onIceConnectionStateChange,
      onDataChannelOpen: this.onDataChannelOpen,
      onDataChannelMessage: this.onDataChannelMessage
    };
    const isSender = this.isSender;
    
    // Close everything
    this.close();
    
    // Wait for cleanup
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Reinitialize with fresh state
    this.initializePeerConnection(isSender);
    
    // Only setup data channel if it was created (for sender)
    if (this.dc) {
      this.setupDataChannel(isSender);
    }
    
    // Restore callbacks
    this.onIceCandidate = callbacks.onIceCandidate;
    this.onConnectionStateChange = callbacks.onConnectionStateChange;
    this.onIceConnectionStateChange = callbacks.onIceConnectionStateChange;
    this.onDataChannelOpen = callbacks.onDataChannelOpen;
    this.onDataChannelMessage = callbacks.onDataChannelMessage;
    
    console.log('✅ Connection force reset complete');
  }

  /**
   * Send data through data channel with queue-based flow control
   * @param {any} data - Data to send
   * @returns {Promise} Promise that resolves when data is sent
   */
  sendData(data) {
    return new Promise((resolve, reject) => {
      if (!this.dc) {
        console.error('❌ Data channel not initialized');
        reject(new Error('Data channel not initialized'));
        return;
      }
      
      if (this.dc.readyState !== 'open') {
        console.error('❌ Data channel not ready, state:', this.dc.readyState);
        reject(new Error(`Data channel not ready (state: ${this.dc.readyState})`));
        return;
      }
      
      // Add to queue
      this.sendQueue.push({ data, resolve, reject });
      
      // Start processing if not already processing
      if (!this.isSending) {
        this.processQueue();
      }
    });
  }
  
  /**
   * Process the send queue - Optimized for Maximum Speed
   */
  async processQueue() {
    if (this.isSending || this.sendQueue.length === 0) {
      return;
    }
    
    this.isSending = true;
    
    while (this.sendQueue.length > 0) {
      const { data, resolve, reject } = this.sendQueue[0];
      
      try {
        // Optimized buffer checking - less aggressive waiting
        const maxBuffer = this.config.MAX_BUFFERED_AMOUNT;
        const currentBuffer = this.dc.bufferedAmount;
        
        if (currentBuffer > maxBuffer * 0.9) {
          console.log('⏳ Buffer full, waiting... bufferedAmount:', currentBuffer, 'max:', maxBuffer);
          
          // Wait for buffer to clear with faster checking
          await new Promise((resolveBuffer) => {
            const checkBuffer = () => {
              if (this.dc.bufferedAmount <= maxBuffer * 0.6) {
                resolveBuffer();
              } else {
                setTimeout(checkBuffer, this.config.BUFFER_CHECK_INTERVAL);
              }
            };
            checkBuffer();
          });
        }
        
        // Send the data
        this.dc.send(data);
        const dataSize = typeof data === 'string' ? data.length : data.byteLength;
        console.log('📤 Data sent successfully, size:', dataSize, 'bufferedAmount:', this.dc.bufferedAmount);
        
        // Remove from queue and resolve
        this.sendQueue.shift();
        resolve();
        
        // Minimal delay for maximum speed
        if (this.config.QUEUE_PROCESSING_DELAY > 0) {
          await new Promise(resolve => setTimeout(resolve, this.config.QUEUE_PROCESSING_DELAY));
        }
        
      } catch (error) {
        console.error('❌ Error sending data:', error);
        
        if (error.message.includes('send queue is full')) {
          console.log('🔄 Send queue full, waiting...');
          await new Promise(resolve => setTimeout(resolve, 50)); // Reduced wait time
          continue; // Try again
        } else {
          // Remove from queue and reject
          this.sendQueue.shift();
          reject(error);
          break;
        }
      }
    }
    
    this.isSending = false;
  }

  /**
   * Send file through data channel - Optimized for Maximum Speed
   * @param {File} file - File to send
   * @param {Function} onProgress - Progress callback
   */
  sendFile(file, onProgress) {
    return new Promise((resolve, reject) => {
      if (!this.dc || this.dc.readyState !== 'open') {
        reject(new Error('Data channel not ready'));
        return;
      }

      const reader = new FileReader();
      let offset = 0;
      const chunkSize = this.config.CHUNK_SIZE;
      const maxBufferedAmount = this.config.MAX_BUFFERED_AMOUNT;
      let lastProgressUpdate = 0;
      let isPaused = false;

      // Send file metadata first
      const metadata = JSON.stringify({ 
        name: file.name, 
        size: file.size,
        type: file.type || 'application/octet-stream'
      });
      this.dc.send(metadata);

      const sendChunk = () => {
        if (offset >= file.size) {
          // All chunks sent, now send EOF message
          this.dc.send(JSON.stringify({ type: 'EOF' }));
          // Wait for buffer to flush before resolving
          const waitForBufferFlush = () => {
            if (this.dc.bufferedAmount > 0) {
              setTimeout(waitForBufferFlush, 50);
            } else {
              resolve();
            }
          };
          waitForBufferFlush();
          return;
        }

        // Check if we should pause due to buffer
        if (this.dc.bufferedAmount > maxBufferedAmount * 0.8) {
          isPaused = true;
          // Use bufferedamountlow event for resuming
          this.dc.onbufferedamountlow = () => {
            this.dc.onbufferedamountlow = null;
            isPaused = false;
            sendChunk();
          };
          return;
        }

        const chunk = file.slice(offset, offset + chunkSize);
        reader.onload = (e) => {
          try {
            this.dc.send(e.target.result);
            offset += e.target.result.byteLength;
            // Progress updates
            if (onProgress && Date.now() - lastProgressUpdate > this.config.PROGRESS_UPDATE_INTERVAL) {
              const progress = (offset / file.size) * 100;
              onProgress(progress, offset, file.size);
              lastProgressUpdate = Date.now();
            }
            // Continue sending immediately if not paused
            if (!isPaused && offset < file.size) {
              sendChunk();
            }
          } catch (error) {
            console.error('Error sending chunk:', error);
            reject(error);
          }
        };
        reader.onerror = (error) => {
          console.error('FileReader error:', error);
          reject(error);
        };
        reader.readAsArrayBuffer(chunk);
      };
      // Start sending
      sendChunk();
    });
  }

  /**
   * Perform a speed test to measure actual transfer speed
   * @param {number} testSize - Size of test data in bytes (default: 1MB)
   * @returns {Promise<Object>} Speed test results
   */
  async performSpeedTest(testSize = 1024 * 1024) {
    if (!this.dc || this.dc.readyState !== 'open') {
      throw new Error('Data channel not ready');
    }

    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const chunkSize = 64 * 1024; // 64KB chunks for testing
      let bytesSent = 0;
      let chunksSent = 0;

      const sendTestChunk = () => {
        if (bytesSent >= testSize) {
          const endTime = Date.now();
          const duration = (endTime - startTime) / 1000; // seconds
          const speedMbps = (bytesSent * 8) / (duration * 1024 * 1024); // Mbps
          
          console.log('📊 Speed Test Results:', {
            bytesSent,
            duration: `${duration.toFixed(2)}s`,
            speed: `${speedMbps.toFixed(2)} Mbps`,
            chunksSent
          });
          
          resolve({
            bytesSent,
            duration,
            speedMbps,
            chunksSent
          });
          return;
        }

        const remainingBytes = testSize - bytesSent;
        const currentChunkSize = Math.min(chunkSize, remainingBytes);
        
        // Create test data
        const testData = new ArrayBuffer(currentChunkSize);
        
        try {
          this.dc.send(testData);
          bytesSent += currentChunkSize;
          chunksSent++;
          
          // Continue immediately for maximum speed
          setTimeout(sendTestChunk, 0);
        } catch (error) {
          reject(error);
        }
      };

      // Start the test
      sendTestChunk();
    });
  }

  /**
   * Get connection speed recommendations
   * @returns {Object} Speed recommendations
   */
  getSpeedRecommendations() {
    const isLocalNetwork = this.detectLocalNetwork();
    
    if (isLocalNetwork) {
      return {
        expectedSpeed: '30-100 Mbps',
        recommendations: [
          'Use direct local network connection',
          'Check firewall settings',
          'Ensure both devices are on same WiFi',
          'Try disabling VPN if active',
          'Check router QoS settings'
        ]
      };
    } else {
      return {
        expectedSpeed: '5-20 Mbps',
        recommendations: [
          'Connection is going through internet',
          'Speed limited by internet connection',
          'Consider using local network for faster transfers'
        ]
      };
    }
  }

  /**
   * Reset the peer connection to stable state
   */
  async resetConnection() {
    try {
      if (this.pc) {
        // Rollback any pending local description
        if (this.pc.signalingState === 'have-local-offer') {
          await this.pc.setLocalDescription({ type: 'rollback' });
        }
        
        // Rollback any pending remote description
        if (this.pc.signalingState === 'have-remote-offer') {
          await this.pc.setRemoteDescription({ type: 'rollback' });
        }
        
        console.log('✅ Connection reset to stable state');
      }
    } catch (error) {
      console.error('Error resetting connection:', error);
      // If rollback fails, recreate the connection
      await this.recreateConnection();
    }
  }

  /**
   * Recreate the peer connection
   */
  async recreateConnection() {
    console.log('🔄 Recreating peer connection...');
    
    // Store current state and callbacks
    const wasSender = this.isSender;
    const callbacks = {
      onIceCandidate: this.onIceCandidate,
      onConnectionStateChange: this.onConnectionStateChange,
      onIceConnectionStateChange: this.onIceConnectionStateChange,
      onDataChannelOpen: this.onDataChannelOpen,
      onDataChannelMessage: this.onDataChannelMessage
    };
    
    // Close existing connection
    this.close();
    
    // Wait a bit to ensure cleanup
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Reinitialize
    this.initializePeerConnection(wasSender);
    this.setupDataChannel(wasSender);
    
    // Restore callbacks
    this.onIceCandidate = callbacks.onIceCandidate;
    this.onConnectionStateChange = callbacks.onConnectionStateChange;
    this.onIceConnectionStateChange = callbacks.onIceConnectionStateChange;
    this.onDataChannelOpen = callbacks.onDataChannelOpen;
    this.onDataChannelMessage = callbacks.onDataChannelMessage;
    
    console.log('✅ Peer connection recreated');
  }

  /**
   * Close the peer connection
   */
  close() {
    if (this.dc) {
      this.dc.close();
      this.dc = null;
    }
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    
    // Clear send queue
    this.sendQueue = [];
    this.isSending = false;
  }

  /**
   * Completely reset the WebRTC manager
   */
  async fullReset() {
    console.log('🔄 Full WebRTC manager reset...');
    
    // Store original callbacks
    const callbacks = {
      onIceCandidate: this.onIceCandidate,
      onConnectionStateChange: this.onConnectionStateChange,
      onIceConnectionStateChange: this.onIceConnectionStateChange,
      onDataChannelOpen: this.onDataChannelOpen,
      onDataChannelMessage: this.onDataChannelMessage
    };
    
    // Close everything
    this.close();
    
    // Wait for complete cleanup
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Reset all state
    this.isSender = false;
    this.sendQueue = [];
    this.isSending = false;
    
    // Restore callbacks
    this.onIceCandidate = callbacks.onIceCandidate;
    this.onConnectionStateChange = callbacks.onConnectionStateChange;
    this.onIceConnectionStateChange = callbacks.onIceConnectionStateChange;
    this.onDataChannelOpen = callbacks.onDataChannelOpen;
    this.onDataChannelMessage = callbacks.onDataChannelMessage;
    
    console.log('✅ Full WebRTC manager reset complete');
  }

  /**
   * Get connection statistics
   * @returns {Promise<Object>} Connection statistics
   */
  async getStats() {
    if (!this.pc) return null;
    
    try {
      const stats = await this.pc.getStats();
      return stats;
    } catch (error) {
      console.error('Error getting stats:', error);
      return null;
    }
  }
  
  /**
   * Get detailed connection statistics
   * @returns {Promise<Object>} Connection stats
   */
  async getDetailedStats() {
    if (!this.pc) {
      return { error: 'No peer connection' };
    }

    try {
      const stats = await this.pc.getStats();
      const connectionInfo = {
        connectionState: this.pc.connectionState,
        iceConnectionState: this.pc.iceConnectionState,
        signalingState: this.pc.signalingState,
        candidates: [],
        selectedCandidate: null,
        isLocalNetwork: this.detectLocalNetwork()
      };

      stats.forEach(report => {
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          connectionInfo.selectedCandidate = {
            local: report.localCandidateId,
            remote: report.remoteCandidateId,
            state: report.state
          };
        }
        if (report.type === 'local-candidate' || report.type === 'remote-candidate') {
          connectionInfo.candidates.push({
            type: report.type,
            address: report.address,
            port: report.port,
            protocol: report.protocol,
            candidateType: report.candidateType
          });
        }
      });

      console.log('🔍 Connection Diagnostics:', connectionInfo);
      return connectionInfo;
    } catch (error) {
      console.error('Error getting stats:', error);
      return { error: error.message };
    }
  }

  /**
   * Monitor connection performance
   */
  startPerformanceMonitoring() {
    if (!this.dc) return;
    
    let lastBytesReceived = 0;
    let lastTime = Date.now();
    
    const monitor = setInterval(() => {
      if (this.dc.readyState !== 'open') {
        clearInterval(monitor);
        return;
      }
      
      // Get current stats
      this.getDetailedStats().then(stats => {
        if (stats.error) return;
        
        // Calculate transfer speed if we have data
        const currentTime = Date.now();
        const timeDiff = (currentTime - lastTime) / 1000; // seconds
        
        if (timeDiff > 0) {
          // Note: WebRTC doesn't expose bytes transferred directly
          // This is a simplified monitoring approach
          console.log('📊 Connection Performance:', {
            connectionType: stats.selectedCandidate ? 'Direct' : 'Relay',
            localNetwork: stats.isLocalNetwork,
            connectionState: stats.connectionState,
            iceState: stats.iceConnectionState
          });
        }
        
        lastTime = currentTime;
      });
    }, 2000); // Check every 2 seconds
    
    this.performanceMonitor = monitor;
  }

  /**
   * Stop performance monitoring
   */
  stopPerformanceMonitoring() {
    if (this.performanceMonitor) {
      clearInterval(this.performanceMonitor);
      this.performanceMonitor = null;
    }
  }

  /**
   * Detect if we're on a local network
   * @returns {boolean} True if on local network
   */
  detectLocalNetwork() {
    try {
      const hostname = window.location.hostname;
      const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
      
      // Check if we're accessing via local IP
      const isLocalIP = /^192\.168\.|^10\.|^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname);
      
      return isLocalhost || isLocalIP;
    } catch (error) {
      console.log('Could not detect local network:', error);
      return false;
    }
  }
  
  /**
   * Check if ICE candidate is local
   * @param {RTCIceCandidate} candidate - ICE candidate
   * @returns {boolean} True if local candidate
   */
  isLocalCandidate(candidate) {
    if (!candidate.address) return false;
    
    // Check for local network IPs
    const localPatterns = [
      /^192\.168\./,
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^127\./,
      /^localhost$/
    ];
    
    return localPatterns.some(pattern => pattern.test(candidate.address));
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WebRTCManager;
} 