/**
 * Utility Functions
 * Common helper functions used throughout the application
 */

class Utils {
  /**
   * Format file size in human-readable format
   * @param {number} bytes - File size in bytes
   * @returns {string} Formatted file size
   */
  static formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Generate a random device ID
   * @param {number} length - Length of the device ID
   * @returns {string} Random device ID
   */
  static generateDeviceId(length = 6) {
    // Use timestamp + random to ensure uniqueness
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 2 + Math.max(3, length - timestamp.length));
    return (timestamp + random).substring(0, length).toUpperCase();
  }

  /**
   * Validate device ID format
   * @param {string} deviceId - Device ID to validate
   * @returns {boolean} True if valid
   */
  static validateDeviceId(deviceId) {
    if (!deviceId || typeof deviceId !== 'string') return false;
    if (deviceId.length < 3 || deviceId.length > 20) return false;
    return /^[a-zA-Z0-9]+$/.test(deviceId);
  }

  /**
   * Create and show a notification
   * @param {string|object} message - Notification message or options object
   * @param {string} [type] - Notification type (success, error, info)
   * @param {number} [duration] - Duration in milliseconds
   * @param {string} [actionText] - Text for the action button
   * @param {function} [onAction] - Callback for the action button
   */
  static showNotification(message, type = 'info', duration = 5000, actionText, onAction) {
    // Support options object for flexibility
    let msg = message;
    let opts = {};
    if (typeof message === 'object' && message !== null) {
      opts = message;
      msg = opts.message;
      type = opts.type || type;
      duration = opts.duration || duration;
      actionText = opts.actionText || actionText;
      onAction = opts.onAction || onAction;
    }
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 15px 20px;
      border-radius: 8px;
      color: white;
      font-weight: 600;
      z-index: 10000;
      animation: slideIn 0.3s ease;
      max-width: 300px;
      display: flex;
      align-items: center;
      gap: 10px;
    `;
    // Set background color based on type
    switch (type) {
      case 'error':
        notification.style.background = '#e53e3e';
        break;
      case 'success':
        notification.style.background = '#38a169';
        break;
      default:
        notification.style.background = '#3182ce';
    }
    // Message span
    const msgSpan = document.createElement('span');
    msgSpan.textContent = msg;
    notification.appendChild(msgSpan);
    // Action button
    if (actionText && typeof onAction === 'function') {
      const actionBtn = document.createElement('button');
      actionBtn.textContent = actionText;
      actionBtn.style.cssText = `
        margin-left: 10px;
        background: rgba(255,255,255,0.15);
        color: white;
        border: none;
        border-radius: 5px;
        padding: 6px 14px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.2s;
      `;
      actionBtn.onmouseover = () => { actionBtn.style.background = 'rgba(255,255,255,0.25)'; };
      actionBtn.onmouseout = () => { actionBtn.style.background = 'rgba(255,255,255,0.15)'; };
      actionBtn.onclick = () => {
        if (typeof onAction === 'function') onAction();
        if (notification.parentNode) notification.parentNode.removeChild(notification);
      };
      notification.appendChild(actionBtn);
    }
    document.body.appendChild(notification);
    // Remove after specified duration (unless action button is present)
    if (!actionText) {
      setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
          if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
          }
        }, 300);
      }, duration);
    }
    console.log(`${type.toUpperCase()}: ${msg}`);
  }

  /**
   * Debounce function to limit function calls
   * @param {Function} func - Function to debounce
   * @param {number} wait - Wait time in milliseconds
   * @returns {Function} Debounced function
   */
  static debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  /**
   * Throttle function to limit function calls
   * @param {Function} func - Function to throttle
   * @param {number} limit - Time limit in milliseconds
   * @returns {Function} Throttled function
   */
  static throttle(func, limit) {
    let inThrottle;
    return function() {
      const args = arguments;
      const context = this;
      if (!inThrottle) {
        func.apply(context, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }

  /**
   * Check if browser supports required features
   * @returns {Object} Support status for various features
   */
  static checkBrowserSupport() {
    return {
      webrtc: typeof RTCPeerConnection !== 'undefined',
      fileApi: typeof File !== 'undefined' && typeof FileReader !== 'undefined',
      dragDrop: 'draggable' in document.createElement('div'),
      webSocket: typeof WebSocket !== 'undefined',
      crypto: typeof crypto !== 'undefined' && crypto.subtle
    };
  }

  /**
   * Get connection type from WebRTC stats
   * @param {RTCPeerConnection} pc - WebRTC peer connection
   * @returns {Promise<Object>} Connection type information
   */
  static async getConnectionType(pc) {
    if (!pc) return { type: 'Unknown', isLocal: false };
    
    try {
      const stats = await pc.getStats();
      let isLocalNetwork = true;
      let connectionType = 'Unknown';
      
      stats.forEach(report => {
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          const localCandidate = stats.get(report.localCandidateId);
          const remoteCandidate = stats.get(report.remoteCandidateId);
          
          if (localCandidate && remoteCandidate) {
            // Check if both candidates are local network addresses
            const isLocalLocal = localCandidate.candidateType === 'host' || 
                               localCandidate.address?.startsWith('192.168.') ||
                               localCandidate.address?.startsWith('10.') ||
                               localCandidate.address?.startsWith('172.');
                               
            const isLocalRemote = remoteCandidate.candidateType === 'host' || 
                                remoteCandidate.address?.startsWith('192.168.') ||
                                remoteCandidate.address?.startsWith('10.') ||
                                remoteCandidate.address?.startsWith('172.');
            
            if (!isLocalLocal || !isLocalRemote) {
              isLocalNetwork = false;
            }
            
            if (localCandidate.candidateType === 'relay' || remoteCandidate.candidateType === 'relay') {
              connectionType = 'TURN Relay';
            } else if (localCandidate.candidateType === 'srflx' || remoteCandidate.candidateType === 'srflx') {
              connectionType = 'STUN (Internet)';
            } else if (localCandidate.candidateType === 'host' && remoteCandidate.candidateType === 'host') {
              connectionType = 'Local Network';
            }
          }
        }
      });
      
      return { type: connectionType, isLocal: isLocalNetwork };
    } catch (error) {
      console.error('Error getting connection type:', error);
      return { type: 'Unknown', isLocal: false };
    }
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Utils;
} 