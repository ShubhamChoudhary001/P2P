/**
 * WebRTC Manager
 * Handles all WebRTC peer connections and data channels
 */

class WebRTCManager {
  constructor(config) {
    this.config = config;
    this.pc = null;
    this.dc = null;
    this.isSender = false;
    this.sendQueue = [];
    this.isSending = false;
    this.iceCandidateQueue = [];
    this.remoteDescriptionSet = false;
    this.isCreatingOffer = false;
    this.isHandlingOffer = false;
    this.isHandlingAnswer = false;
    this.connectionState = 'disconnected'; // 'disconnected', 'connecting', 'connected', 'failed'
    this.performanceMonitorInterval = null;
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
        bundlePolicy: 'balanced', // Changed from max-bundle to balanced for compatibility
        rtcpMuxPolicy: 'require',
        iceTransportPolicy: 'all', // Allow all for local network
        iceConnectionReceivingTimeout: 3000, // Faster timeout
        iceBackupCandidatePairPct: 0.5
      };
    } else {
      console.log('🌍 Using standard ICE configuration');
      return {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          {
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject'
          }
        ],
        iceCandidatePoolSize: 20,
        bundlePolicy: 'balanced', // Changed from max-bundle to balanced for compatibility
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
    // Prevent multiple simultaneous initializations
    if (this.connectionState === 'connecting' || this.connectionState === 'connected') {
      console.log('⚠️ Connection already in progress or connected, skipping initialization');
      return;
    }
    
    console.log(`Initializing WebRTC as ${isSender ? 'sender' : 'receiver'}`);
    
    // Update connection state
    this.connectionState = 'connecting';
    
    // Set a timeout to reset connection state if it gets stuck
    this.connectionTimeout = setTimeout(() => {
      if (this.connectionState === 'connecting') {
        console.log('⚠️ Connection stuck in connecting state, resetting...');
        console.log('📊 Connection state details:', {
          hasPC: !!this.pc,
          pcConnectionState: this.pc?.connectionState,
          pcSignalingState: this.pc?.signalingState,
          hasDataChannel: !!this.dc,
          dcReadyState: this.dc?.readyState
        });
        this.connectionState = 'disconnected';
        // Clear the timeout reference
        this.connectionTimeout = null;
      }
    }, 15000); // 15 second timeout
    
    // Store the sender state
    this.isSender = isSender;
    
    // Detect if we're on local network
    const isLocalNetwork = this.detectLocalNetwork();
    console.log('🌐 Local network detected:', isLocalNetwork);
    
    // Get optimized ICE configuration
    const iceConfig = this.createOptimizedIceConfig();
    
    console.log('🔧 ICE Configuration:', iceConfig);
    
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
      console.log('🔧 [OFFERER] Creating data channel on sender...');
      try {
      // Optimized data channel configuration for maximum speed
      this.dc = this.pc.createDataChannel('file', {
        ordered: true, // Ensure ordered delivery
        maxRetransmits: 1, // Minimal retransmissions for speed
        priority: 'high', // High priority for file transfer
        // Optimizations for high-speed transfers
          negotiated: false // Let WebRTC handle negotiation
        });
        console.log('🔧 [OFFERER] Data channel created on sender:', {
          label: this.dc.label,
          id: this.dc.id,
          readyState: this.dc.readyState,
          protocol: this.dc.protocol,
          ordered: this.dc.ordered,
          maxRetransmits: this.dc.maxRetransmits,
          maxPacketLifeTime: this.dc.maxPacketLifeTime
        });
        console.log('🔧 [OFFERER] Data channel created on sender, setting up...');
      this.setupDataChannel(true);
      } catch (error) {
        console.error('❌ Error creating data channel:', error);
        this.connectionState = 'failed';
        throw error;
      }
    } else {
      console.log('🔧 [ANSWERER] Waiting for ondatachannel event from offerer...');
      this.pc.ondatachannel = (e) => {
        console.log('🔗 [ANSWERER] ondatachannel event fired on receiver');
        console.log('🔗 [ANSWERER] Data channel details:', {
          label: e.channel.label,
          id: e.channel.id,
          readyState: e.channel.readyState,
          protocol: e.channel.protocol,
          ordered: e.channel.ordered,
          maxRetransmits: e.channel.maxRetransmits,
          maxPacketLifeTime: e.channel.maxPacketLifeTime
        });
        console.log('🔗 [ANSWERER] Setting up data channel for receiver...');
        // Store the data channel
        this.dc = e.channel;
        // Set up the data channel immediately
        try {
        this.setupDataChannel(false);
          console.log('🔗 [ANSWERER] Data channel setup completed for receiver');
        } catch (error) {
          console.error('❌ Error setting up data channel for receiver:', error);
        }
      };
    }

    // Set up event handlers
    this.pc.onconnectionstatechange = () => {
      console.log('Connection state:', this.pc.connectionState);
      if (this.pc.connectionState === 'connected') {
        this.connectionState = 'connected';
        // Clear connection timeout on successful connection
        if (this.connectionTimeout) {
          clearTimeout(this.connectionTimeout);
          this.connectionTimeout = null;
        }
      } else if (this.pc.connectionState === 'failed' || this.pc.connectionState === 'disconnected') {
        this.connectionState = 'failed';
        // Clear connection timeout on failure
        if (this.connectionTimeout) {
          clearTimeout(this.connectionTimeout);
          this.connectionTimeout = null;
        }
        // Reset after a delay to allow for retry
        setTimeout(() => {
          if (this.connectionState === 'failed') {
            this.connectionState = 'disconnected';
          }
        }, 2000);
      }
      if (this.onConnectionStateChange) {
        this.onConnectionStateChange(this.pc.connectionState);
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', this.pc.iceConnectionState);
      if (this.pc.iceConnectionState === 'failed' || this.pc.iceConnectionState === 'disconnected') {
        // Reset connection state on ICE failure
        setTimeout(() => {
          if (this.connectionState === 'connecting') {
            console.log('⚠️ ICE connection failed, resetting connection state');
            this.connectionState = 'disconnected';
          }
        }, 1000);
      }
      if (this.onIceConnectionStateChange) {
        this.onIceConnectionStateChange(this.pc.iceConnectionState);
      }
    };

    this.pc.onsignalingstatechange = () => {
      console.log('Signaling state changed:', this.pc.signalingState);
      // Reset connection state if signaling fails
      if (this.pc.signalingState === 'closed') {
        this.connectionState = 'disconnected';
      }
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
    
    console.log('🔧 Data channel before setup:', {
      label: this.dc.label,
      id: this.dc.id,
      readyState: this.dc.readyState,
      protocol: this.dc.protocol,
      ordered: this.dc.ordered,
      maxRetransmits: this.dc.maxRetransmits,
      maxPacketLifeTime: this.dc.maxPacketLifeTime
    });
    
    // Always set up event handlers, even if data channel is already open
    // This ensures we don't miss any events
    console.log('🔧 Setting up data channel event handlers...');
    
    this.dc.binaryType = 'arraybuffer';
    
    // Optimize data channel for speed
    if (this.dc.setBufferedAmountLowThreshold) {
      this.dc.setBufferedAmountLowThreshold(this.config.MAX_BUFFERED_AMOUNT * 0.3);
    }
    
    this.dc.onopen = () => {
      console.log('🔗 Data channel open event fired!');
      console.log('🔗 Data channel state:', {
        readyState: this.dc.readyState,
        bufferedAmount: this.dc.bufferedAmount,
        label: this.dc.label,
        id: this.dc.id,
        protocol: this.dc.protocol,
        ordered: this.dc.ordered,
        maxRetransmits: this.dc.maxRetransmits,
        maxPacketLifeTime: this.dc.maxPacketLifeTime
      });
      
      // Update connection state
      this.connectionState = 'connected';
      
      // Send immediate test message to verify data channel is working
      console.log('🔗 Sending immediate test message...');
      try {
        this.dc.send('{"type":"immediate_test","message":"Data channel is working!"}');
        console.log('🔗 Immediate test message sent successfully');
      } catch (error) {
        console.error('❌ Error sending immediate test message:', error);
      }
      
      // Test the data channel with a simple message
      if (isSender) {
        console.log('🔗 Sender: Testing data channel with test message...');
        try {
          this.dc.send('{"type":"test","message":"Data channel test from sender"}');
          console.log('🔗 Sender: Test message sent successfully');
          
          // Also test binary data
          setTimeout(() => {
            try {
              const testBinary = new ArrayBuffer(1024);
              const view = new Uint8Array(testBinary);
              for (let i = 0; i < 1024; i++) {
                view[i] = i % 256;
              }
              this.dc.send(testBinary);
              console.log('🔗 Sender: Binary test data sent successfully (1024 bytes)');
            } catch (error) {
              console.error('❌ Sender: Error sending binary test data:', error);
            }
          }, 500);
        } catch (error) {
          console.error('❌ Sender: Error sending test message:', error);
        }
      } else {
        console.log('🔗 Receiver: Testing data channel with test message...');
        try {
          this.dc.send('{"type":"test","message":"Data channel test from receiver"}');
          console.log('🔗 Receiver: Test message sent successfully');
          
          // Also test binary data
          setTimeout(() => {
            try {
              const testBinary = new ArrayBuffer(1024);
              const view = new Uint8Array(testBinary);
              for (let i = 0; i < 1024; i++) {
                view[i] = (i + 128) % 256;
              }
              this.dc.send(testBinary);
              console.log('🔗 Receiver: Binary test data sent successfully (1024 bytes)');
            } catch (error) {
              console.error('❌ Receiver: Error sending binary test data:', error);
            }
          }, 500);
        } catch (error) {
          console.error('❌ Receiver: Error sending test message:', error);
        }
      }
      
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
        console.log('🔗 Calling onDataChannelOpen callback with isSender:', isSender);
        console.log('🔗 onDataChannelOpen callback details:', {
          callbackType: typeof this.onDataChannelOpen,
          isFunction: typeof this.onDataChannelOpen === 'function',
          hasCurrentFiles: !!this.onDataChannelOpen.currentFiles
        });
        this.onDataChannelOpen(isSender);
      } else {
        console.warn('⚠️ onDataChannelOpen callback is not set!');
      }
    };

    this.dc.onmessage = (e) => {
      console.log('🔗 Data channel message received:', {
        type: typeof e.data,
        size: typeof e.data === 'string' ? e.data.length : e.data.byteLength,
        readyState: this.dc.readyState,
        hasCallback: !!this.onDataChannelMessage,
        timestamp: Date.now()
      });
      
      // Debug: Log the first few characters/bytes of the data
      if (typeof e.data === 'string') {
        console.log('🔗 Message content (first 100 chars):', e.data.substring(0, 100));
      } else {
        console.log('🔗 Binary data size:', e.data.byteLength, 'bytes');
      }
      
      if (this.onDataChannelMessage) {
        console.log('🔗 Calling onDataChannelMessage callback...');
        this.onDataChannelMessage(e);
      } else {
        console.warn('⚠️ onDataChannelMessage callback is not set!');
      }
    };

    this.dc.onerror = (error) => {
      console.error('❌ Data channel error:', error);
      
      // Safely access data channel properties
      try {
        console.error('❌ Data channel error details:', {
          error: error,
          readyState: this.dc ? this.dc.readyState : 'unknown',
          label: this.dc ? this.dc.label : 'unknown',
          id: this.dc ? this.dc.id : 'unknown'
        });
      } catch (accessError) {
        console.error('❌ Data channel error details (error accessing properties):', {
          originalError: error,
          accessError: accessError.message
        });
      }
      
      this.connectionState = 'failed';
      // Notify app for user-friendly error handling
      if (this.onDataChannelError) {
        this.onDataChannelError(error, this.dc ? this.dc.readyState : 'unknown');
      }
    };

    this.dc.onclose = () => {
      console.log('🔗 Data channel closed');
      
      // Safely access data channel properties
      try {
        console.log('🔗 Data channel close details:', {
          readyState: this.dc ? this.dc.readyState : 'unknown',
          label: this.dc ? this.dc.label : 'unknown',
          id: this.dc ? this.dc.id : 'unknown',
          timestamp: Date.now()
        });
      } catch (error) {
        console.log('🔗 Data channel close details (error accessing properties):', {
          error: error.message,
          timestamp: Date.now()
        });
      }
      
      this.connectionState = 'disconnected';
      this.stopPerformanceMonitoring();
      // Notify app for user-friendly error handling
      if (this.onDataChannelClosed) {
        this.onDataChannelClosed(this.dc ? this.dc.readyState : 'unknown');
      }
    };
    
    // Optimized buffer management
    this.dc.onbufferedamountlow = () => {
      console.log('🔗 Data channel buffer low event');
      // Trigger queue processing when buffer is low
      if (this.sendQueue.length > 0 && !this.isSending) {
        this.processQueue();
      }
    };
    
    console.log('🔧 Data channel event handlers set up successfully');
    console.log('🔧 Data channel after setup:', {
      readyState: this.dc.readyState,
      binaryType: this.dc.binaryType,
      bufferedAmount: this.dc.bufferedAmount,
      hasOnMessage: !!this.dc.onmessage,
      hasOnOpen: !!this.dc.onopen,
      hasOnError: !!this.dc.onerror,
      hasOnClose: !!this.dc.onclose
    });
    
    // If data channel is already open, trigger the onopen event manually
    if (this.dc.readyState === 'open') {
      console.log('🔧 Data channel is already open, triggering onopen event manually...');
      setTimeout(() => {
        if (this.dc.onopen) {
          this.dc.onopen();
        }
      }, 100);
    }
  }

  /**
   * Create and send offer
   * @returns {Promise<RTCSessionDescription>} The created offer
   */
  async createOffer(maxRetries = 2) {
    if (this.isCreatingOffer) {
      console.log('Offer creation already in progress, skipping.');
      return undefined;
    }
    
    this.isCreatingOffer = true;
    let attempt = 0;
    let offer = undefined;
    try {
      while (attempt <= maxRetries) {
        try {
          console.log(`🔄 Starting offer creation... (attempt ${attempt + 1})`);
          if (!this.pc) {
            console.warn('❌ No RTCPeerConnection exists before offer creation.');
            return undefined;
          }
          console.log('🔍 Offer creation state:', {
            signalingState: this.pc.signalingState,
            connectionState: this.pc.connectionState,
            iceConnectionState: this.pc.iceConnectionState
          });
          // Only create offer if signalingState is stable
          if (this.pc.signalingState !== 'stable') {
            console.warn(`❌ Cannot create offer: signalingState is '${this.pc.signalingState}', must be 'stable'. Skipping offer creation.`);
            return undefined;
          }
          console.log('✅ Signaling state is stable, creating offer...');
          console.log('🔧 Data channel state before offer:', {
            hasDataChannel: !!this.dc,
            dataChannelState: this.dc?.readyState || 'none'
          });
          offer = await this.pc.createOffer();
          console.log('✅ Offer created successfully:', offer);
          await this.pc.setLocalDescription(offer);
          console.log('✅ Local description set successfully');
          console.log('Created offer');
          if (offer !== undefined && offer !== null) {
            return offer;
          } else {
            console.warn(`❌ Offer was undefined or null on attempt ${attempt + 1}`);
          }
        } catch (error) {
          console.error(`❌ Error creating offer on attempt ${attempt + 1}:`, error);
          // Handle specific SDP errors by recreating the connection
          if (error.message && (
            error.message.includes('SDP does not match') || 
            error.message.includes('InvalidModificationError') ||
            error.message.includes('BUNDLE group') ||
            error.message.includes('max-bundle') ||
            error.message.includes('order of m-lines'))
          ) {
            console.log('🔄 SDP error detected, recreating connection...');
            await this.forceReset();
          } else {
            // For other errors, just log and continue
            if (attempt === maxRetries) throw error;
          }
        }
        attempt++;
        if (attempt <= maxRetries) {
          console.log(`🔁 Retrying offer creation in 300ms (attempt ${attempt + 1})...`);
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
      // If we reach here, all attempts failed
      return undefined;
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
    // Prevent multiple simultaneous offer handling
    if (this.isHandlingOffer) {
      console.log('⚠️ Already handling an offer, skipping duplicate');
      throw new Error('Already handling an offer');
    }
    
    this.isHandlingOffer = true;
    
    try {
      console.log('📥 Handling offer, current signaling state:', this.pc?.signalingState);
      
      // Check if we need a fresh connection
      if (!this.pc) {
        console.log('🔄 No peer connection, creating new one...');
        this.initializePeerConnection(this.isSender);
      } else if (this.pc.signalingState !== 'stable') {
        console.log('🔄 Signaling state not stable, resetting connection...');
        await this.resetConnection();
      }
      
      // Ensure we're not in the middle of creating an offer ourselves
      if (this.isCreatingOffer) {
        console.log('⚠️ We are currently creating an offer, waiting...');
        // Wait a bit for our offer creation to complete
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (this.isCreatingOffer) {
          console.log('⚠️ Still creating offer, rejecting incoming offer');
          throw new Error('Cannot handle offer while creating one');
        }
      }
      
      await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
      console.log('✅ Remote description set successfully');
      this.remoteDescriptionSet = true;
      
      // Process any queued ICE candidates
      await this.processIceCandidateQueue();
      
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      console.log('Created answer');
      return answer;
    } catch (error) {
      console.error('Error handling offer:', error);
      
      // Handle specific SDP errors by recreating the connection
      if (error.message.includes('SDP does not match') || 
          error.message.includes('InvalidModificationError') ||
          error.message.includes('BUNDLE group') ||
          error.message.includes('max-bundle') ||
          error.message.includes('order of m-lines')) {
        console.log('🔄 SDP error detected, recreating connection...');
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
    } finally {
      this.isHandlingOffer = false;
    }
  }

  /**
   * Handle incoming answer
   * @param {RTCSessionDescription} answer - The received answer
   */
  async handleAnswer(answer) {
    // Prevent multiple simultaneous answer handling
    if (this.isHandlingAnswer) {
      console.log('⚠️ Already handling an answer, skipping duplicate');
      throw new Error('Already handling an answer');
    }
    
    this.isHandlingAnswer = true;
    
    try {
      // Check if we're in the right state to handle an answer
      if (!this.pc) {
        throw new Error('No peer connection to handle answer');
      }
      
      if (this.pc.signalingState !== 'have-local-offer') {
        console.log('⚠️ Wrong signaling state for answer:', this.pc.signalingState);
        throw new Error(`Cannot handle answer in state: ${this.pc.signalingState}`);
      }
      
      await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
      console.log('✅ Remote description set successfully');
      this.remoteDescriptionSet = true;
      
      // Process any queued ICE candidates
      await this.processIceCandidateQueue();
    } catch (error) {
      console.error('Error handling answer:', error);
      throw error;
    } finally {
      this.isHandlingAnswer = false;
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
      
      // If remote description hasn't been set yet, queue the candidate
      if (!this.remoteDescriptionSet) {
        console.log('⏳ Remote description not set yet, queuing ICE candidate');
        this.iceCandidateQueue.push(candidate);
        return;
      }
      
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
      console.log('✅ ICE candidate added successfully');
    } catch (error) {
      console.error('Error adding ICE candidate:', error);
      throw error;
    }
  }

  /**
   * Process queued ICE candidates
   */
  async processIceCandidateQueue() {
    if (this.iceCandidateQueue.length === 0) {
      return;
    }
    
    console.log(`🔄 Processing ${this.iceCandidateQueue.length} queued ICE candidates`);
    
    while (this.iceCandidateQueue.length > 0) {
      const candidate = this.iceCandidateQueue.shift();
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
        console.log('✅ Queued ICE candidate added successfully');
      } catch (error) {
        console.error('❌ Error adding queued ICE candidate:', error);
      }
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
    this.iceCandidateQueue = [];
    this.remoteDescriptionSet = false;
    
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
    
    // Clear ICE candidate queue and state
    this.iceCandidateQueue = [];
    this.remoteDescriptionSet = false;
    
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
   * Force reset connection state
   */
  forceResetConnectionState() {
    console.log('🔄 Force resetting connection state from:', this.connectionState);
    
    // Clear connection timeout if it exists
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
    
    this.connectionState = 'disconnected';
    this.isCreatingOffer = false;
    this.isHandlingOffer = false;
    this.isHandlingAnswer = false;
    console.log('✅ Connection state reset to disconnected');
  }
  
  /**
   * Check if connection is ready for new operations
   * @returns {boolean} True if ready
   */
  isReadyForNewConnection() {
    return this.connectionState === 'disconnected' || this.connectionState === 'failed';
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
      
      console.log('📤 Attempting to send data:', {
        type: typeof data,
        size: typeof data === 'string' ? data.length : data.byteLength,
        dataChannelState: this.dc.readyState,
        bufferedAmount: this.dc.bufferedAmount
      });
      
      // Add to queue
      this.sendQueue.push({ data, resolve, reject });
      
      // Start processing if not already processing
      if (!this.isSending) {
        this.processQueue();
      }
    });
  }
  
  /**
   * Wait for all queued data to be sent
   * @returns {Promise} Resolves when queue is empty
   */
  async waitForQueueEmpty() {
    return new Promise((resolve) => {
      const checkQueue = () => {
        if (this.sendQueue.length === 0 && !this.isSending) {
          resolve();
        } else {
          setTimeout(checkQueue, 50);
        }
      };
      checkQueue();
    });
  }
  
  /**
   * Force flush all buffered data
   * @returns {Promise} Resolves when buffer is empty or timeout reached
   */
  async forceFlushBuffer() {
    if (!this.dc) {
      console.log('⚠️ Cannot flush buffer: data channel is null');
      return;
    }
    
    return new Promise((resolve) => {
      const maxWaitTime = 10000; // 10 seconds
      const startTime = Date.now();
      
      const checkBuffer = () => {
        if (!this.dc) {
          console.log('⚠️ Data channel closed during buffer flush');
          resolve();
          return;
        }
        
        if (this.dc.bufferedAmount === 0 || (Date.now() - startTime) > maxWaitTime) {
          console.log('📤 Buffer flush complete. Final bufferedAmount:', this.dc ? this.dc.bufferedAmount : 'N/A');
          resolve();
        } else {
          setTimeout(checkBuffer, 100);
        }
      };
      
      checkBuffer();
    });
  }
  
  /**
   * Process the send queue - Optimized for Maximum Speed
   */
  async processQueue() {
    if (this.isSending || this.sendQueue.length === 0) {
      return;
    }
    
    // Check if data channel is available
    if (!this.dc) {
      console.error('❌ Cannot process queue: data channel is null');
      this.isSending = false;
      return;
    }
    
    this.isSending = true;
    
    while (this.sendQueue.length > 0) {
      const { data, resolve, reject } = this.sendQueue[0];
      
      try {
        // Check if data channel is still available and open
        if (!this.dc || this.dc.readyState !== 'open') {
          console.error('❌ Data channel not available or not open during queue processing');
          this.sendQueue.shift();
          reject(new Error('Data channel not available'));
          continue;
        }
        
        // Optimized buffer checking - less aggressive waiting
        const maxBuffer = this.config.MAX_BUFFERED_AMOUNT;
        const currentBuffer = this.dc.bufferedAmount;
        
        // Check if this is the last item in queue (likely EOF or final chunk)
        const isLastItem = this.sendQueue.length === 1;
        
        if (currentBuffer > maxBuffer * 0.9) {
          console.log('⏳ Buffer full, waiting... bufferedAmount:', currentBuffer, 'max:', maxBuffer, 'isLastItem:', isLastItem);
          
          // For final items, be more aggressive about waiting
          const targetBufferLevel = isLastItem ? maxBuffer * 0.3 : maxBuffer * 0.6;
          
          // Wait for buffer to clear with faster checking
          await new Promise((resolveBuffer) => {
            const checkBuffer = () => {
              if (!this.dc) {
                resolveBuffer(); // Data channel was closed, stop waiting
                return;
              }
              if (this.dc.bufferedAmount <= targetBufferLevel) {
                resolveBuffer();
              } else {
                setTimeout(checkBuffer, this.config.BUFFER_CHECK_INTERVAL);
              }
            };
            checkBuffer();
          });
        }
        
        // Check again if data channel is still available after waiting
        if (!this.dc || this.dc.readyState !== 'open') {
          console.error('❌ Data channel not available after buffer wait');
          this.sendQueue.shift();
          reject(new Error('Data channel not available after buffer wait'));
          continue;
        }
        
        // Send the data
        console.log('📤 About to call dc.send() with data:', {
          type: typeof data,
          size: typeof data === 'string' ? data.length : data.byteLength,
          dataChannelState: this.dc.readyState,
          bufferedAmount: this.dc.bufferedAmount
        });
        
        this.dc.send(data);
        
        const dataSize = typeof data === 'string' ? data.length : data.byteLength;
        console.log('📤 Data sent successfully, size:', dataSize, 'bufferedAmount:', this.dc.bufferedAmount, 'queueRemaining:', this.sendQueue.length - 1);
        
        // Remove from queue and resolve
        this.sendQueue.shift();
        resolve();
        
        // For final items, ensure buffer is flushed before continuing
        if (isLastItem && this.dc && this.dc.bufferedAmount > 0) {
          console.log('📤 Final item sent, waiting for buffer flush...', this.dc.bufferedAmount);
          const flushStartTime = Date.now();
          const maxFlushTime = 5000; // 5 seconds max
          
          while (this.dc && this.dc.bufferedAmount > 0 && (Date.now() - flushStartTime) < maxFlushTime) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
          
          if (this.dc && this.dc.bufferedAmount > 0) {
            console.warn('⚠️ Buffer still not empty after timeout, but continuing');
          } else {
            console.log('✅ Buffer flushed completely');
          }
        }
        
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
    console.log('🔄 Closing WebRTC connection...');
    
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
    
    // Clear ICE candidate queue and state
    this.iceCandidateQueue = [];
    this.remoteDescriptionSet = false;
    
    // Reset all operation flags
    this.isCreatingOffer = false;
    this.isHandlingOffer = false;
    this.isHandlingAnswer = false;
    
    // Clear connection timeout if it exists
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
    
    // Reset connection state
    this.connectionState = 'disconnected';
    
    // Stop performance monitoring
    this.stopPerformanceMonitoring();
    
    console.log('✅ WebRTC connection closed');
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
    this.iceCandidateQueue = [];
    this.remoteDescriptionSet = false;
    
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
    if (!this.dc) {
      console.log('⚠️ Cannot start performance monitoring: data channel is null');
      return;
    }
    
    let lastBytesReceived = 0;
    let lastTime = Date.now();
    
    const monitor = setInterval(() => {
      // Check if data channel still exists and is open
      if (!this.dc || this.dc.readyState !== 'open') {
        console.log('🔄 Performance monitoring stopped: data channel not available or not open');
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
    
    this.performanceMonitorInterval = monitor;
  }

  /**
   * Stop performance monitoring
   */
  stopPerformanceMonitoring() {
    if (this.performanceMonitorInterval) {
      clearInterval(this.performanceMonitorInterval);
      this.performanceMonitorInterval = null;
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