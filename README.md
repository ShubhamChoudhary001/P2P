# ShareP2P

A modern, dark-themed peer-to-peer file sharing app using WebRTC and Socket.IO.

## Features
- Secure P2P file transfer (LAN or with STUN/TURN)
- Animated intro splash screen with logo
- Modern glassmorphism UI
- Device and connection status
- Responsive design for desktop, tablet, and mobile
- Social links (LinkedIn, Instagram) with SVG icons

## Project Structure
```
public/
  index.html
  css/
    styles.css
  js/
    ...
  src/
    logo.png
    linkedin.svg
    instagram.svg
```

### Referencing Images and SVGs
- All images and SVGs are stored in `public/src/`.
- **In your HTML, reference them as:**
  ```html
  <img src="/src/logo.png" alt="Logo">
  <img src="/src/linkedin.svg" alt="LinkedIn">
  <img src="/src/instagram.svg" alt="Instagram">
  ```
- **Do NOT use `/public/src/...` in your URLs.**
- The `public` folder is the web root; `/src/` is the correct path in the browser.

## Social Links Section
- Located below the "Made by SHU-RY" section in the main page.
- Uses SVG icons for LinkedIn and Instagram.
- Update the URLs in `index.html` to your own profiles.

## Animated Intro Splash
- On page load, an animated overlay with your logo and app name appears, then fades out to reveal the app.
- The logo and intro text are responsive and visually prominent on all devices.

## Running Locally
1. Clone the repo
2. Run `npm install` (if using Node.js backend)
3. Run `npm start` or your preferred static server
4. Open [http://localhost:3000](http://localhost:3000) (or your configured port)

---

**For any image or SVG, just place it in `public/src/` and reference it as `/src/filename` in your HTML!** 