/**
 * Feedback Manager
 * Handles feedback form submission and UI interactions
 */

class FeedbackManager {
  constructor() {
    this.form = document.getElementById('feedbackForm');
    this.messageTextarea = document.getElementById('feedbackMessage');
    this.charCount = document.getElementById('charCount');
    this.submitBtn = document.getElementById('feedbackSubmit');
    this.successDiv = document.getElementById('feedbackSuccess');
    this.errorDiv = document.getElementById('feedbackError');
    this.errorMessage = document.getElementById('errorMessage');
    
    this.init();
  }
  
  init() {
    if (!this.form) return;
    
    // Character counter for message textarea
    this.messageTextarea.addEventListener('input', () => {
      this.updateCharCount();
    });
    
    // Form submission
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleSubmit();
    });
    
    // Initialize character count
    this.updateCharCount();
  }
  
  updateCharCount() {
    const currentLength = this.messageTextarea.value.length;
    const maxLength = 1000;
    
    this.charCount.textContent = currentLength;
    
    // Change color based on length
    if (currentLength > maxLength * 0.9) {
      this.charCount.style.color = '#fca5a5'; // Red when approaching limit
    } else if (currentLength > maxLength * 0.7) {
      this.charCount.style.color = '#fbbf24'; // Yellow when getting close
    } else {
      this.charCount.style.color = 'rgba(255, 255, 255, 0.5)'; // Default
    }
  }
  
  async handleSubmit() {
    // Get form data
    const formData = new FormData(this.form);
    const feedbackData = {
      name: formData.get('name').trim(),
      email: formData.get('email').trim(),
      type: formData.get('type'),
      message: formData.get('message').trim()
    };
    
    // Validate required fields
    if (!feedbackData.type || !feedbackData.message) {
      this.showError('Please fill in all required fields.');
      return;
    }
    
    // Validate message length
    if (feedbackData.message.length > 1000) {
      this.showError('Message is too long (maximum 1000 characters).');
      return;
    }
    
    // Show loading state
    this.setLoadingState(true);
    
    // Set API base URL depending on environment
    const API_BASE_URL = (window.location.hostname.includes('netlify.app') || window.location.hostname !== 'localhost')
      ? 'https://shareshort.onrender.com' // <-- Replace with your Render backend URL
      : '';

    try {
      const response = await fetch(`${API_BASE_URL}/api/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(feedbackData)
      });
      
      const result = await response.json();
      
      if (result.success) {
        this.showSuccess();
        this.resetForm();
      } else {
        this.showError(result.error || 'Failed to submit feedback. Please try again.');
      }
      
    } catch (error) {
      console.error('Feedback submission error:', error);
      this.showError('Network error. Please check your connection and try again.');
    } finally {
      this.setLoadingState(false);
    }
  }
  
  setLoadingState(isLoading) {
    this.submitBtn.disabled = isLoading;
    this.submitBtn.innerHTML = isLoading 
      ? '<span class="icon">⏳</span>Sending...' 
      : '<span class="icon">📤</span>Send Feedback';
  }
  
  showSuccess() {
    this.hideAllMessages();
    this.successDiv.classList.remove('hidden');
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
      this.successDiv.classList.add('hidden');
    }, 5000);
  }
  
  showError(message) {
    this.hideAllMessages();
    this.errorMessage.textContent = message;
    this.errorDiv.classList.remove('hidden');
    
    // Auto-hide after 8 seconds
    setTimeout(() => {
      this.errorDiv.classList.add('hidden');
    }, 8000);
  }
  
  hideAllMessages() {
    this.successDiv.classList.add('hidden');
    this.errorDiv.classList.add('hidden');
  }
  
  resetForm() {
    this.form.reset();
    this.updateCharCount();
  }
}

// Initialize feedback manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new FeedbackManager();
}); 