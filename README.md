# ShareP2P - Modular P2P File Sharing Application

A secure, peer-to-peer file sharing application built with WebRTC and Socket.IO, featuring a modular architecture for better maintainability and scalability.

## 🚀 Features

- **Direct P2P Transfer**: Files transfer directly between devices without server involvement
- **Multi-file Support**: Send multiple files in a single session
- **Cross-Network Support**: Works across different WiFi networks using STUN servers
- **Real-time Progress**: Live transfer progress with speed indicators
- **Drag & Drop**: Intuitive file selection interface
- **Device Discovery**: Automatic device listing and connection
- **Modular Architecture**: Well-organized, maintainable codebase

## 📁 Project Structure

```
p2p/
├── public/
│   ├── index.html          # Main HTML file
│   └── js/
│       ├── config.js       # Application configuration
│       ├── utils.js        # Utility functions
│       ├── webrtc-manager.js # WebRTC connection management
│       ├── socket-manager.js # Socket.IO communication
│       ├── ui-manager.js   # User interface management
│       └── app.js          # Main application orchestrator
├── server.js               # Express.js signaling server
├── package.json            # Node.js dependencies
└── README.md              # This file
```

## 🏗️ Architecture Overview

### Modular Design

The application is built using a modular architecture with clear separation of concerns:

#### 1. **Configuration (`config.js`)**
- Centralized configuration management
- WebRTC ICE servers configuration
- File transfer settings
- UI element mappings

#### 2. **Utilities (`utils.js`)**
- Common helper functions
- File size formatting
- Device ID generation and validation
- Notification system
- Browser compatibility checks

#### 3. **WebRTC Manager (`webrtc-manager.js`)**
- WebRTC peer connection management
- Data channel handling
- File transfer logic
- Connection state monitoring

#### 4. **Socket Manager (`socket-manager.js`)**
- Socket.IO communication
- Device registration and discovery
- Signaling data transmission
- Connection state management

#### 5. **UI Manager (`ui-manager.js`)**
- DOM element management
- Event listener setup
- UI state updates
- Progress tracking
- Modal management

#### 6. **Main Application (`app.js`)**
- Application orchestration
- Manager coordination
- State management
- Event handling

## 🛠️ Installation & Setup

### Prerequisites
- Node.js (v16 or higher)
- Modern web browser with WebRTC support

### Backend Setup
```bash
# Clone the repository
git clone <repository-url>
cd p2p

# Install dependencies
npm install

# Start the server
npm start
```

The server will run on `http://localhost:3000` by default.

### Frontend Setup
The frontend is served automatically by the Express server. Simply open `http://localhost:3000` in your browser.

## 🔧 Configuration

### Environment Variables
Create a `.env` file in the root directory:

```bash
# Server Configuration
PORT=3000
NODE_ENV=production

# CORS Configuration
CORS_ORIGIN=https://your-frontend-domain.com

# Security Settings
MAX_CONNECTIONS_PER_IP=5
MAX_REQUESTS_PER_MINUTE=100
DEVICE_ID_MAX_LENGTH=20
```

### WebRTC Configuration
Edit `public/js/config.js` to modify WebRTC settings:

```javascript
const CONFIG = {
  // Server URL
  SERVER_URL: 'https://your-server.com',
  
  // ICE servers for NAT traversal
  ICE_SERVERS: [
    { urls: 'stun:stun.l.google.com:19302' },
    // Add TURN servers for better connectivity
  ],
  
  // File transfer settings
  CHUNK_SIZE: 256 * 1024, // 256KB chunks
  MAX_BUFFERED_AMOUNT: 8 * 1024 * 1024, // 8MB buffer
};
```

## 📖 Usage Guide

### For End Users

1. **Getting Started**
   - Open the application in a modern browser
   - Note your unique device ID
   - Share your device ID with the recipient

2. **Sending Files**
   - Click "Choose a file to share" or drag & drop files
   - Click "Receive File" on the recipient's device
   - Enter the sender's device ID
   - Click "Send File" to start transfer

3. **Receiving Files**
   - Click "Receive File"
   - Enter the sender's device ID
   - Wait for connection establishment
   - Files will appear as download links

### For Developers

#### Adding New Features
1. **Configuration**: Add settings to `config.js`
2. **Utilities**: Add helper functions to `utils.js`
3. **Managers**: Extend existing managers or create new ones
4. **Integration**: Update `app.js` to use new functionality

#### Customizing UI
- Modify CSS in `public/index.html`
- Update UI logic in `ui-manager.js`
- Add new elements to `config.js` ELEMENTS object

#### Extending WebRTC
- Add new methods to `webrtc-manager.js`
- Implement custom data channel protocols
- Add connection quality monitoring

## 🔒 Security Features

- **Rate Limiting**: Prevents abuse and DoS attacks
- **Input Validation**: Sanitizes all user inputs
- **Connection Limits**: Restricts connections per IP
- **Data Size Limits**: Prevents large data attacks
- **CORS Protection**: Restricts cross-origin requests

## 🌐 Network Support

### Local Network
- **Speed**: Fastest (direct connection)
- **Reliability**: High
- **Requirements**: Same WiFi/LAN network

### Cross-Network
- **Speed**: Moderate (internet routing)
- **Reliability**: Good (depends on NAT type)
- **Requirements**: STUN servers for NAT traversal

### TURN Relay (Optional)
- **Speed**: Slowest (server relay)
- **Reliability**: Highest
- **Requirements**: TURN server configuration

## 🧪 Testing

### Local Testing
```bash
# Start server
npm start

# Open multiple browser tabs
# Test file transfer between tabs
```

### Cross-Network Testing
1. Deploy server to cloud platform
2. Test between different networks
3. Verify STUN server functionality

## 🚀 Deployment

### Backend Deployment
- **Render**: Easy deployment with automatic HTTPS
- **Heroku**: Cloud platform deployment
- **Vercel**: Serverless deployment
- **AWS/GCP**: Cloud infrastructure deployment

### Frontend Deployment
- **Netlify**: Static site hosting
- **Vercel**: Frontend deployment
- **GitHub Pages**: Free hosting
- **AWS S3**: Scalable hosting

## 📝 API Reference

### Socket.IO Events

#### Client to Server
- `register(deviceId)`: Register device with server
- `getDevices()`: Request device list
- `connectToDevice(targetDeviceId)`: Connect to specific device
- `signal({ to, data })`: Send WebRTC signaling data
- `disconnectPeer()`: Disconnect from peer

#### Server to Client
- `deviceList(devices)`: Receive updated device list
- `peerConnected(peerId)`: Peer connection established
- `peerDisconnected()`: Peer disconnected
- `signal({ from, data })`: Receive WebRTC signaling data
- `error(message)`: Error notification

### WebRTC API

#### RTCPeerConnection
- `createOffer()`: Create connection offer
- `createAnswer()`: Create connection answer
- `setLocalDescription(description)`: Set local description
- `setRemoteDescription(description)`: Set remote description
- `addIceCandidate(candidate)`: Add ICE candidate

#### RTCDataChannel
- `send(data)`: Send data through channel
- `onmessage`: Handle incoming messages
- `onopen`: Channel opened
- `onclose`: Channel closed

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the ISC License.

## 🆘 Troubleshooting

### Common Issues

1. **Connection Fails**
   - Check firewall settings
   - Verify device IDs
   - Ensure both devices are online

2. **Slow Transfer Speeds**
   - Check network connection type
   - Verify local network connection
   - Consider TURN server for relay

3. **Files Not Received**
   - Check browser compatibility
   - Verify WebRTC support
   - Check console for errors

4. **Cross-Network Issues**
   - Verify STUN server availability
   - Check NAT type restrictions
   - Consider TURN server setup

### Browser Support
- Chrome 56+
- Firefox 52+
- Safari 11+
- Edge 79+

## 📞 Support

For issues and questions:
- contact me on my Linkdin or Github
- Check the troubleshooting section
- Review browser console for errors
- Verify network connectivity
- Test with different browsers

---

**Built with ❤️ using WebRTC and Socket.IO** 