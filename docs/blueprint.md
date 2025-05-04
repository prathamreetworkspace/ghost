# **App Name**: GhostLine

## Core Features:

- Online Presence: Landing page lists all online users and active channels in real-time.
- Chat Interface: Simple scrollback window with auto-scroll to newest message. Text input box with 
“send” on Enter. Local “user joined” / “user left” notifications.
- P2P Connection: WebRTC DataChannels for direct browser-to-browser messaging only. Signaling over 
Socket.IO (or any WebSocket server) to exchange SDP offers/answers and ICE candidates. 
Automatic teardown of peer connections on disconnect.

## Style Guidelines:

- Neutral gray `#F3F4F6` for backgrounds.
- Dark gray `#1F2937` for text and headers.
- Teal `#14B8A6` for buttons, links, and interactive highlights.
- Responsive grid or flex layout to ensure mobile-friendliness.
- Simple outline-style SVG icons for user actions (join, leave, send) and status indicators (online/offline).