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
  }

  /**
   * Initialize WebRTC peer connection
   * @param {boolean} isSender - Whether this peer is the sender
   */
  initializePeerConnection(isSender) {
    console.log(`Initializing WebRTC as ${isSender ? 'sender' : 'receiver'}`);
    
    // Store the sender state
    this.isSender = isSender;
    
    // Optimized RTCPeerConnection configuration for speed
    this.pc = new RTCPeerConnection({ 
      iceServers: this.config.ICE_SERVERS,
      iceCandidatePoolSize: 10, // Increase ICE candidate pool
      bundlePolicy: 'max-bundle', // Bundle all media
      rtcpMuxPolicy: 'require', // Require RTCP multiplexing
      iceTransportPolicy: 'all' // Use all ICE candidates
    });
    
    if (isSender) {
      // Optimized data channel configuration for speed
      this.dc = this.pc.createDataChannel('file', {
        ordered: true, // Ensure ordered delivery
        maxRetransmits: 3, // Allow some retransmissions for reliability
        priority: 'high' // High priority for file transfer
      });
      this.setupDataChannel(true);
    } else {
      this.pc.ondatachannel = (e) => {
        console.log('Data channel received');
        this.dc = e.channel;
        this.setupDataChannel(false);
      };
    }

    // Set up event handlers
    this.pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        console.log('Sending ICE candidate');
        if (this.onIceCandidate) {
          this.onIceCandidate(candidate);
        }
      }
    };

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
    if (!this.dc) {
      console.error('Cannot setup data channel: data channel is null');
      return;
    }
    
    this.dc.binaryType = 'arraybuffer';
    
    this.dc.onopen = () => {
      console.log('Data channel open');
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
    };
  }

  /**
   * Create and send offer
   * @returns {Promise<RTCSessionDescription>} The created offer
   */
  async createOffer() {
    try {
      // Always ensure we have a fresh connection for offers
      if (!this.pc || this.pc.signalingState !== 'stable') {
        console.log('🔄 Ensuring fresh connection for offer...');
        await this.ensureFreshConnection();
      }
      
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      console.log('Created offer');
      return offer;
    } catch (error) {
      console.error('Error creating offer:', error);
      
      // If any error occurs, completely recreate the connection
      if (error.message.includes('SDP does not match') || error.message.includes('InvalidModificationError')) {
        console.log('🔄 Critical error detected, completely recreating connection...');
        await this.completeRecreation();
        
        // Retry once with fresh connection
        try {
          const offer = await this.pc.createOffer();
          await this.pc.setLocalDescription(offer);
          console.log('Created offer after complete recreation');
          return offer;
        } catch (retryError) {
          console.error('Error creating offer after complete recreation:', retryError);
          throw retryError;
        }
      }
      
      throw error;
    }
  }

  /**
   * Handle incoming offer
   * @param {RTCSessionDescription} offer - The received offer
   * @returns {Promise<RTCSessionDescription>} The created answer
   */
  async handleOffer(offer) {
    try {
      // Always ensure we have a fresh connection for offers
      if (!this.pc || this.pc.signalingState !== 'stable') {
        console.log('🔄 Ensuring fresh connection for offer handling...');
        await this.ensureFreshConnection();
      }
      
      await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      console.log('Created answer');
      return answer;
    } catch (error) {
      console.error('Error handling offer:', error);
      
      // If any error occurs, completely recreate the connection
      if (error.message.includes('SDP does not match') || error.message.includes('InvalidModificationError')) {
        console.log('🔄 Critical error detected, completely recreating connection...');
        await this.completeRecreation();
        
        // Retry once with fresh connection
        try {
          await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await this.pc.createAnswer();
          await this.pc.setLocalDescription(answer);
          console.log('Created answer after complete recreation');
          return answer;
        } catch (retryError) {
          console.error('Error handling offer after complete recreation:', retryError);
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
   * Process the send queue
   */
  async processQueue() {
    if (this.isSending || this.sendQueue.length === 0) {
      return;
    }
    
    this.isSending = true;
    
    while (this.sendQueue.length > 0) {
      const { data, resolve, reject } = this.sendQueue[0];
      
      try {
        // Check buffer state
        const maxBuffer = this.config.MAX_BUFFERED_AMOUNT;
        const currentBuffer = this.dc.bufferedAmount;
        
        if (currentBuffer > maxBuffer * 0.8) {
          console.log('⏳ Buffer getting full, waiting... bufferedAmount:', currentBuffer, 'max:', maxBuffer);
          
          // Wait for buffer to clear with optimized interval
          await new Promise((resolveBuffer) => {
            const checkBuffer = () => {
              if (this.dc.bufferedAmount <= maxBuffer * 0.5) {
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
        
        // Optimized delay between sends
        await new Promise(resolve => setTimeout(resolve, this.config.QUEUE_PROCESSING_DELAY));
        
      } catch (error) {
        console.error('❌ Error sending data:', error);
        
        if (error.message.includes('send queue is full')) {
          console.log('🔄 Send queue full, waiting...');
          await new Promise(resolve => setTimeout(resolve, 100));
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
   * Send file through data channel - Optimized for Speed
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

      const sendChunk = () => {
        if (offset >= file.size) {
          resolve();
          return;
        }

        // Optimized buffer checking
        if (this.dc.bufferedAmount > maxBufferedAmount * 0.9) {
          this.dc.onbufferedamountlow = () => {
            this.dc.onbufferedamountlow = null;
            sendChunk();
          };
          return;
        }

        const chunk = file.slice(offset, offset + chunkSize);
        reader.onload = (e) => {
          this.dc.send(e.target.result);
          offset += e.target.result.byteLength;
          
          // Optimized progress updates (less frequent for better performance)
          if (onProgress && Date.now() - lastProgressUpdate > this.config.PROGRESS_UPDATE_INTERVAL) {
            const progress = (offset / file.size) * 100;
            onProgress(progress, offset, file.size);
            lastProgressUpdate = Date.now();
          }
          
          // Use requestAnimationFrame for better performance
          if (offset < file.size) {
            requestAnimationFrame(sendChunk);
          } else {
            resolve();
          }
        };
        reader.readAsArrayBuffer(chunk);
      };

      // Send file metadata first
      this.dc.send(JSON.stringify({ name: file.name, size: file.size }));
      sendChunk();
    });
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
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WebRTCManager;
} 