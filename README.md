# GhostLine - P2P Chat

This is a Next.js application demonstrating a real-time peer-to-peer (P2P) chat system using WebRTC and Socket.IO for signaling.

## Getting Started

1.  **Install Dependencies:**
    ```bash
    npm install
    # or
    yarn install
    # or
    pnpm install
    ```

2.  **Signaling Server:**
    **Crucially, this application requires a separate Socket.IO signaling server.** This server is *not* included in this repository and needs to be run independently. Its purpose is to help peers find each other and exchange connection information (SDP, ICE candidates) to establish a direct WebRTC link.
    *   You can find examples of basic Socket.IO signaling servers online.
    *   **Ensure the server is running *before* starting this Next.js application.**
    *   **Verify CORS Configuration:** The signaling server *must* be configured to allow connections from the origin where this Next.js app is running (e.g., `http://localhost:9002` during development). If CORS is not set up correctly on the signaling server, you will likely encounter connection errors like `xhr poll error`.
        *Example CORS setup for a Node.js/Socket.IO server:*
        ```javascript
        // In your signaling server code:
        const { Server } = require("socket.io");
        const http = require('http'); // Or your preferred HTTP server

        const server = http.createServer(); // Your HTTP server instance
        const io = new Server(server, {
          cors: {
            origin: "http://localhost:9002", // Allow your Next.js app's origin
            methods: ["GET", "POST"]
          }
        });

        // ... rest of your signaling logic ...

        const PORT = process.env.PORT || 3001; // Example port
        server.listen(PORT, () => console.log(`Signaling server listening on port ${PORT}`));
        ```

3.  **Environment Variables:**
    Configure the signaling server URL via an environment variable. Create a `.env.local` file in the root directory:
    ```.env.local
    # Make sure this URL matches exactly where your signaling server is running
    # including the correct protocol (http/https) and port.
    NEXT_PUBLIC_SIGNALING_SERVER_URL=http://localhost:3001
    ```
    If this variable is not set, the app defaults to `http://localhost:3001`.

4.  **Run the Development Server:**
    ```bash
    npm run dev
    # or
    yarn dev
    # or
    pnpm dev
    ```
    This will typically start the Next.js app on `http://localhost:9002`.

5.  **Run the Signaling Server:**
    Start your *separate* signaling server in a different terminal window. Ensure it's running on the URL and port specified in your `.env.local` or the default.

6.  **Open the App:**
    Open `http://localhost:9002` (or your specified port) in multiple browser tabs or on different devices on the same network to test the P2P chat. If you see connection errors, double-check steps 2, 3 and 5.

## How it Works

-   **Next.js:** Provides the React framework, routing, and server-side capabilities.
-   **React:** Used for building the user interface components (`src/components` and `src/app/page.tsx`).
-   **TypeScript:** Enhances code quality and maintainability.
-   **Tailwind CSS & ShadCN UI:** Used for styling and pre-built UI components.
-   **WebRTC:** Enables direct peer-to-peer communication between browsers for sending messages without a central message server (after initial connection).
-   **Socket.IO:** Used as the signaling mechanism. Peers connect to the Socket.IO server to discover each other and exchange the necessary information (SDP offers/answers, ICE candidates) to establish a direct WebRTC connection. The signaling server *does not* relay chat messages itself.
-   **Lucide Icons:** Provides icons used throughout the UI.

## Key Files

-   `src/app/page.tsx`: The main page component containing the chat UI logic and integration with the WebRTC library.
-   `src/lib/webrtc.ts`: Contains the core WebRTC connection logic, including signaling via Socket.IO, peer connection management, and data channel handling. Relies on the `NEXT_PUBLIC_SIGNALING_SERVER_URL` environment variable.
-   `src/components/chat-interface.tsx`: The component responsible for displaying messages and the message input field.
-   `src/app/globals.css`: Global styles and Tailwind CSS/ShadCN theme configuration.
-   `tailwind.config.ts`: Tailwind CSS configuration.

## Troubleshooting

-   **Connection Errors (`xhr poll error`, `timeout`, etc.):**
    1.  **Is the signaling server running?** Verify its terminal output.
    2.  **Is the `NEXT_PUBLIC_SIGNALING_SERVER_URL` in `.env.local` correct?** (Protocol, host, port).
    3.  **Did you configure CORS correctly on the signaling server** to allow `http://localhost:9002` (or your app's origin)? See step 2 above. This is the most common cause of `xhr poll error`.
    4.  Check browser developer console for more detailed error messages.
    5.  Check for firewall or network issues blocking the connection.
-   **Users don't see each other / Messages not sending:**
    1.  Verify the signaling server is correctly relaying 'offer', 'answer', and 'ice-candidate' events between peers. Add logging to your signaling server.
    2.  Check the browser console on *both* peers for WebRTC errors (e.g., `Failed to set remote description`, ICE connection failures).
    3.  Ensure STUN servers are configured (default uses Google's). For more complex networks (some corporate firewalls, symmetric NATs), a TURN server might be required, which needs separate setup and configuration in `src/lib/webrtc.ts`.
