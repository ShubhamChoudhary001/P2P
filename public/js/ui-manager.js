/**
 * UI Manager
 * Handles all user interface interactions and updates
 */

class UIManager {
  constructor(config) {
    this.config = config;
    this.elements = {};
    this.initializeElements();
  }

  /**
   * Initialize DOM element references
   */
  initializeElements() {
    Object.keys(this.config.ELEMENTS).forEach(key => {
      const elementId = this.config.ELEMENTS[key];
      this.elements[key] = document.getElementById(elementId);
      
      if (!this.elements[key]) {
        console.warn(`Element with ID '${elementId}' not found`);
      }
    });
  }

  /**
   * Setup event listeners for UI interactions
   * @param {Object} handlers - Event handler functions
   */
  setupEventListeners(handlers) {
    // File input handling
    if (this.elements.fileInput) {
      this.elements.fileInput.addEventListener('change', handlers.handleFileSelect);
    }
    
    // Drag and drop
    if (this.elements.fileInputLabel) {
      this.elements.fileInputLabel.addEventListener('dragover', handlers.handleDragOver);
      this.elements.fileInputLabel.addEventListener('dragleave', handlers.handleDragLeave);
      this.elements.fileInputLabel.addEventListener('drop', handlers.handleDrop);
    }
    
    // Button events
    if (this.elements.sendBtn) {
      this.elements.sendBtn.addEventListener('click', handlers.handleSendFile);
    }
    
    if (this.elements.recvBtn) {
      this.elements.recvBtn.addEventListener('click', handlers.showConnectionModal);
    }
    
    if (this.elements.disconnectBtn) {
      this.elements.disconnectBtn.addEventListener('click', handlers.disconnect);
    }
    
    if (this.elements.resetBtn) {
      this.elements.resetBtn.addEventListener('click', handlers.resetConnection);
    }
    
    // Modal events
    if (this.elements.connectBtn) {
      this.elements.connectBtn.addEventListener('click', handlers.connectToDevice);
    }
    
    if (this.elements.cancelBtn) {
      this.elements.cancelBtn.addEventListener('click', handlers.hideConnectionModal);
    }
    
    if (this.elements.deviceIdInput) {
      this.elements.deviceIdInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handlers.connectToDevice();
      });
    }
  }

  /**
   * Update connection status display
   * @param {string} message - Status message
   * @param {string} type - Status type (connected, disconnected, connecting)
   */
  updateConnectionStatus(message, type) {
    if (this.elements.statusText) {
      this.elements.statusText.textContent = message;
    }
    
    if (this.elements.connectionStatus) {
      this.elements.connectionStatus.className = `connection-status status-${type}`;
    }
  }

  /**
   * Update device ID display
   * @param {string} deviceId - Device ID to display
   */
  updateDeviceId(deviceId) {
    if (this.elements.deviceId) {
      this.elements.deviceId.textContent = deviceId;
    }
  }

  /**
   * Update device list display
   * @param {Array} devices - Array of device objects
   * @param {string} currentDeviceId - Current device ID
   */
  updateDeviceList(devices, currentDeviceId) {
    if (!this.elements.connectedDevices) return;
    
    if (devices.length === 0) {
      this.elements.connectedDevices.innerHTML = '<p>No devices available</p>';
      return;
    }

    this.elements.connectedDevices.innerHTML = devices.map(device => `
      <div class="device-item ${device.connected ? 'connected' : ''}">
        <div>
          <div class="device-name">${device.id}</div>
          <div class="device-status ${device.connected ? 'online' : 'offline'}">
            ${device.connected ? 'Online' : 'Offline'}
          </div>
        </div>
        ${device.id !== currentDeviceId ? `
          <button class="btn btn-receive" onclick="app.connectToDeviceById('${device.id}')">
            Connect
          </button>
        ` : ''}
      </div>
    `).join('');
  }

  /**
   * Update file selection display
   * @param {FileList} files - Selected files
   */
  updateFileSelection(files) {
    if (!files || files.length === 0) {
      if (this.elements.selectedFile) {
        this.elements.selectedFile.innerHTML = '';
        this.elements.selectedFile.style.display = 'none';
      }
      if (this.elements.fileInputLabel) {
        this.elements.fileInputLabel.innerHTML = '📁 Select file(s) to send';
      }
      // Hide clear button if present
      const clearBtn = document.getElementById('clearSentFilesBtn');
      if (clearBtn) clearBtn.style.display = 'none';
      return;
    }
    if (this.elements.selectedFile) {
      this.elements.selectedFile.innerHTML = Array.from(files).map(file => `
        <div><strong>${file.name}</strong> <span class="file-size">${Utils.formatFileSize(file.size)}</span></div>
      `).join('') +
      `<button id="clearSentFilesBtn" class="btn-clear-files" style="margin-top:10px;"><span class="icon">🗑️</span>Clear Sent Files</button>`;
      this.elements.selectedFile.style.display = 'block';
      // Add event listener for clear button
      setTimeout(() => {
        const clearBtn = document.getElementById('clearSentFilesBtn');
        if (clearBtn) {
          clearBtn.onclick = () => {
            if (window.app && typeof window.app.clearSentFiles === 'function') {
              window.app.clearSentFiles();
            }
          };
        }
      }, 0);
    }
    if (this.elements.fileInputLabel) {
      this.elements.fileInputLabel.innerHTML = `📁 ${files.length} file(s) selected`;
    }
  }

  /**
   * Clear the sent files display
   */
  clearSentFilesDisplay() {
    if (this.elements.selectedFile) {
      this.elements.selectedFile.innerHTML = '';
      this.elements.selectedFile.style.display = 'none';
    }
    if (this.elements.fileInputLabel) {
      this.elements.fileInputLabel.innerHTML = '📁 Select file(s) to send';
    }
    // Hide clear button if present
    const clearBtn = document.getElementById('clearSentFilesBtn');
    if (clearBtn) clearBtn.style.display = 'none';
  }

  /**
   * Update UI state based on connection and file selection
   * @param {boolean} isConnected - Connection status
   * @param {FileList} files - Selected files
   */
  updateUI(isConnected, files) {
    if (this.elements.sendBtn) {
      this.elements.sendBtn.disabled = !files || files.length === 0 || !isConnected;
    }
    
    if (this.elements.disconnectBtn) {
      this.elements.disconnectBtn.classList.toggle('hidden', !isConnected);
    }
    
    if (this.elements.resetBtn) {
      this.elements.resetBtn.classList.toggle('hidden', !isConnected);
    }
    
    if (this.elements.recvBtn) {
      this.elements.recvBtn.disabled = isConnected;
    }
  }

  /**
   * Show progress bar
   * @param {string} message - Progress message
   * @param {number} percent - Progress percentage
   * @param {number} speedMbps - Transfer speed in MB/s
   */
  showProgress(message, percent, speedMbps = 0) {
    if (this.elements.progressSection) {
      // Show progress section with animation
      this.elements.progressSection.style.display = 'block';
      // Use setTimeout to ensure display: block is applied before adding the class
      setTimeout(() => {
        this.elements.progressSection.classList.add('show');
      }, 10);
    }
    
    if (this.elements.progressText) {
      this.elements.progressText.textContent = message;
    }
    
    if (this.elements.progressPercent) {
      let speedText = speedMbps ? ` (${speedMbps.toFixed(2)} MB/s)` : '';
      this.elements.progressPercent.textContent = `${Math.round(percent)}%${speedText}`;
    }
    
    if (this.elements.progressFill) {
      this.elements.progressFill.style.width = `${percent}%`;
    }
  }

  /**
   * Hide progress bar
   */
  hideProgress() {
    if (this.elements.progressSection) {
      // Remove show class to trigger fade out animation
      this.elements.progressSection.classList.remove('show');
      
      // Hide the element after animation completes
      setTimeout(() => {
        if (this.elements.progressSection) {
          this.elements.progressSection.style.display = 'none';
        }
      }, 300); // Match the CSS transition duration
    }
  }

  /**
   * Show connection modal
   */
  showConnectionModal() {
    if (this.elements.connectionModal) {
      this.elements.connectionModal.style.display = 'block';
    }
    
    if (this.elements.deviceIdInput) {
      this.elements.deviceIdInput.focus();
    }
  }

  /**
   * Hide connection modal
   */
  hideConnectionModal() {
    if (this.elements.connectionModal) {
      this.elements.connectionModal.style.display = 'none';
    }
    
    if (this.elements.deviceIdInput) {
      this.elements.deviceIdInput.value = '';
    }
  }

  /**
   * Get device ID from input
   * @returns {string} Device ID from input field
   */
  getDeviceIdInput() {
    return this.elements.deviceIdInput ? 
      this.elements.deviceIdInput.value.trim().toUpperCase() : '';
  }

  /**
   * Update received files section with all files
   * @param {Array} files - Array of received file objects
   */
  updateReceivedFiles(files) {
    if (!this.elements.downloadSection) return;
    
    if (files.length === 0) {
      this.elements.downloadSection.style.display = 'none';
      return;
    }
    
    // Create header
    let html = `
      <div class="received-files-header">
        <h3>📥 Received Files (${files.length})</h3>
        <button class="btn-clear-files" onclick="app.clearReceivedFiles()">
          <span class="icon">🗑️</span>Clear All
        </button>
      </div>
      <div class="received-files-container">
    `;
    
    // Add each file
    files.forEach((file, index) => {
      const fileDate = new Date(file.timestamp).toLocaleString();
      html += `
        <div class="received-file-item" data-file-id="${file.id}">
          <div class="file-info">
            <div class="file-name">${file.name}</div>
            <div class="file-details">
              <span class="file-size">${Utils.formatFileSize(file.size)}</span>
              <span class="file-date">${fileDate}</span>
            </div>
          </div>
          <div class="file-actions">
            <a href="${file.url}" download="${file.name}" class="btn-download-file">
              <span class="icon">⬇️</span>Download
            </a>
            <button class="btn-remove-file" onclick="app.removeReceivedFile('${file.id}')">
              <span class="icon">❌</span>
            </button>
          </div>
        </div>
      `;
    });
    
    // Close the scrollable container
    html += `</div>`;
    
    this.elements.downloadSection.innerHTML = html;
    this.elements.downloadSection.style.display = 'block';
  }

  /**
   * Add download link for received file (legacy method)
   * @param {string} fileName - File name
   * @param {string} url - Download URL
   */
  addDownloadLink(fileName, url) {
    // This method is kept for backward compatibility
    // but the new updateReceivedFiles method should be used instead
    console.warn('addDownloadLink is deprecated, use updateReceivedFiles instead');
  }

  /**
   * Clear download section
   */
  clearDownloadSection() {
    if (this.elements.downloadSection) {
      this.elements.downloadSection.innerHTML = '';
      this.elements.downloadSection.style.display = 'none';
    }
  }

  /**
   * Handle drag over event
   * @param {Event} e - Drag event
   */
  handleDragOver(e) {
    e.preventDefault();
    if (this.elements.fileInputLabel) {
      this.elements.fileInputLabel.classList.add('dragover');
    }
  }

  /**
   * Handle drag leave event
   */
  handleDragLeave() {
    if (this.elements.fileInputLabel) {
      this.elements.fileInputLabel.classList.remove('dragover');
    }
  }

  /**
   * Handle drop event
   * @param {Event} e - Drop event
   * @returns {FileList} Dropped files
   */
  handleDrop(e) {
    e.preventDefault();
    this.handleDragLeave();
    return e.dataTransfer.files;
  }

  /**
   * Show error message
   * @param {string} message - Error message
   */
  showError(message) {
    Utils.showNotification(message, 'error');
  }

  /**
   * Show success message
   * @param {string} message - Success message
   */
  showSuccess(message) {
    Utils.showNotification(message, 'success');
  }

  /**
   * Show info message
   * @param {string} message - Info message
   */
  showInfo(message) {
    Utils.showNotification(message, 'info');
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = UIManager;
} 