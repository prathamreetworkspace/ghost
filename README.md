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
    *   You can find examples of basic Socket.IO signaling servers online. Search for "socket.io webrtc signaling server example".
    *   **Ensure the server is running *before* starting this Next.js application.**
    *   **Verify CORS Configuration:** The signaling server *must* be configured to allow connections from the origin where this Next.js app is running (e.g., `http://localhost:9002` during development). **If CORS is not set up correctly on the signaling server, you will encounter connection errors like `xhr poll error`. This is the most common cause.**
        *Example CORS setup for a Node.js/Socket.IO server:*
        ```javascript
        // In your signaling server code:
        const { Server } = require("socket.io");
        const http = require('http'); // Or your preferred HTTP server

        const server = http.createServer(); // Your HTTP server instance
        const io = new Server(server, {
          cors: {
            // IMPORTANT: Update this origin to match exactly where your Next.js app is running!
            // Use the specific port (e.g., 9002). Avoid using wildcards (*) for security
            // unless absolutely necessary and you understand the implications.
            origin: "http://localhost:9002", // Allow your Next.js app's origin
            methods: ["GET", "POST"] // Methods needed by Socket.IO
          }
        });

        // ... rest of your signaling logic (handling 'join', 'offer', 'answer', 'ice-candidate')...
        // Add logging here to confirm events are received and emitted!
        io.on('connection', (socket) => {
          console.log(`Socket ${socket.id} connected`);

          socket.on('join', (data) => {
            console.log(`Socket ${socket.id} joined with data:`, data);
            // Add user to room/list, emit 'online-users' back
          });

          socket.on('offer', (data) => {
            console.log(`Offer received from ${socket.id} for ${data.targetId}`);
            // Forward offer to targetId
            socket.to(data.targetId).emit('offer', { ...data, senderId: socket.id }); // Include senderId
          });

          // ... handle 'answer', 'ice-candidate', 'disconnect' similarly ...

          socket.on('disconnect', (reason) => {
            console.log(`Socket ${socket.id} disconnected. Reason: ${reason}`);
            // Remove user, emit updated 'online-users'
          });
        });


        const PORT = process.env.PORT || 3001; // Example port for the signaling server
        server.listen(PORT, () => console.log(`Signaling server listening on port ${PORT}`));
        ```

3.  **Environment Variables:**
    Configure the signaling server URL via an environment variable. Create a `.env.local` file in the root directory:
    ```.env.local
    # Make sure this URL matches EXACTLY where your signaling server is running
    # including the correct protocol (http/https) and port.
    # This MUST match the address the signaling server is listening on (e.g., PORT 3001 in the example above).
    NEXT_PUBLIC_SIGNALING_SERVER_URL=http://localhost:3001
    ```
    If this variable is not set, the app defaults to `http://localhost:3001`. **Verify this value carefully.**

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
    Start your *separate* signaling server in a **different terminal window**. Ensure it's running on the URL and port specified in your `.env.local` (or the default `http://localhost:3001`). **Check its console output for confirmation and any errors.** It should log messages like "Signaling server listening on port 3001".

6.  **Open the App:**
    Open `http://localhost:9002` (or your specified port) in multiple browser tabs or on different devices on the same network to test the P2P chat. If you see connection errors, **double-check steps 2, 3 and 5 meticulously.**

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

-   **Connection Errors (`xhr poll error`, `timeout`, `Connection refused`, `ERR_CONNECTION_REFUSED`, `transport close`, etc.):**
    1.  **Is the signaling server actually running?** Check the terminal window where you started it. Does it explicitly say it's listening on the expected port (e.g., 3001)? Are there any startup errors logged?
    2.  **Is the `NEXT_PUBLIC_SIGNALING_SERVER_URL` in `.env.local` correct?** Ensure the protocol (`http`), hostname (`localhost`), and port (`3001` or your chosen port) **exactly** match the running signaling server's address. A typo here is common. Restart the Next.js app (`npm run dev`) after changing `.env.local`.
    3.  **Did you configure CORS correctly on the signaling server?** This is the **most common cause** of `xhr poll error`. The server *must* explicitly allow the origin of your Next.js app (`http://localhost:9002` by default). Refer to the CORS setup example in Step 2. Double-check the allowed origin in your signaling server code. Restart the signaling server after changes.
    4.  **Check Browser Developer Console:** Open the developer tools in your browser (usually F12).
        *   **Console Tab:** Look for detailed error messages related to Socket.IO, WebRTC, or network requests. Errors like `WebSocket connection to 'ws://...' failed` point to direct connection issues.
        *   **Network Tab:** Filter for requests to your signaling server URL (e.g., `localhost:3001`). Are the requests failing (e.g., status 404, 500, CORS error)? Check the response headers for CORS issues (`Access-Control-Allow-Origin`).
    5.  **Check Signaling Server Logs:** Add extensive `console.log` statements inside your signaling server's event handlers (`connection`, `join`, `offer`, `answer`, `ice-candidate`, `disconnect`). Are connections being established? Are messages being received and forwarded correctly? This is essential for debugging signaling flow.
    6.  **Firewall/Network Issues:** Ensure no firewall on your system or network is blocking the connection to the signaling server port (e.g., 3001).
    7.  **Try a Different Browser:** Sometimes browser extensions or specific browser settings can interfere.
-   **Users don't see each other / Messages not sending:**
    1.  **Verify Signaling Flow:** Use the signaling server logs (Step 5 above) to confirm that 'join', 'offer', 'answer', and 'ice-candidate' events are being correctly relayed between the peers. If a user joins, does the server log it and emit `online-users`? When an offer is sent, does the server log receiving it and forwarding it to the correct target?
    2.  **Check Browser Console (Both Peers):** Look for WebRTC-specific errors in the console tab on *both* browsers involved in the chat. Errors like `Failed to set remote description`, `ICE connection failed`, or data channel errors indicate problems establishing the direct P2P link.
    3.  **STUN/TURN Servers:** The default configuration uses Google's public STUN server. This works for many networks, but complex NATs (like symmetric NATs found in some corporate or mobile networks) may require a TURN server for relaying traffic. Setting up and configuring a TURN server (e.g., Coturn) is beyond the scope of this basic example but necessary for robust connectivity in all network conditions. If peers are on very different/restrictive networks, this might be the issue.
    4.  **Data Channel State:** Check `window.ghostline_debug.getDataChannels()` in the browser console. Are the data channels reaching the `open` state? If they stay `connecting` or close unexpectedly, it points to a P2P connection issue.
    5.  **Message Broadcasting Logic:** Ensure the `broadcastMessage` function in `webrtc.ts` is correctly iterating through open data channels and sending the message. Add logging within that function.
-   **Dependencies:** Ensure all dependencies are installed correctly (`npm install`). Sometimes deleting `node_modules` and `package-lock.json` (or `yarn.lock`) and running `npm install` again can fix issues.
