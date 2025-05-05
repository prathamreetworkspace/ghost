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
    If this variable is not set, the app defaults to `http://localhost:3001`. **Verify this value carefully.** The URL used will be logged in the browser console when the app starts.

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

**Common Connection Errors & Solutions:**

If you encounter errors like `Failed to connect to signaling server`, `xhr poll error`, `websocket error`, `timeout`, `Connection refused`, `ERR_CONNECTION_REFUSED`, `transport close`, etc., follow these steps carefully:

1.  **Is the Signaling Server RUNNING?**
    *   **Check the terminal:** Go to the terminal window where you started your *separate* signaling server.
    *   **Is it listening?** Does it explicitly log a message like `Signaling server listening on port 3001`?
    *   **Any startup errors?** Check for errors logged when the signaling server started. Fix them first.

2.  **Is the Signaling Server URL CORRECT?**
    *   **Check `.env.local`:** Open the `.env.local` file in your Next.js project root.
    *   **Verify `NEXT_PUBLIC_SIGNALING_SERVER_URL`:** Ensure the protocol (`http`), hostname (`localhost`), and port (`3001` or your chosen port) **exactly** match the address your signaling server is listening on. Typos are very common.
    *   **Check Browser Console:** The Next.js app logs the URL it's trying to use when it starts (`Using signaling server URL: ...`). Does this match your running server?
    *   **Restart Next.js:** If you changed `.env.local`, you **must** restart the Next.js development server (`npm run dev`) for the changes to take effect.

3.  **Is Signaling Server CORS Configured CORRECTLY? (Most Common Issue!)**
    *   **What is CORS?** Cross-Origin Resource Sharing. Your signaling server (e.g., running on `localhost:3001`) needs to explicitly tell browsers it's okay to accept connections from your Next.js app (running on `localhost:9002`).
    *   **Check Signaling Server Code:** Look at your signaling server's `new Server(httpServer, { cors: { ... } })` configuration.
    *   **Verify `origin`:** The `origin` value in the CORS config *must* exactly match the origin of your Next.js app, including the port (`http://localhost:9002`). Using `"*"` is insecure and might still cause issues depending on browser settings; be specific. See the example in Step 2 of "Getting Started".
    *   **Restart Signaling Server:** After changing CORS settings, **restart your signaling server**.

4.  **Check Browser Developer Console (Network Tab):**
    *   Open Developer Tools (F12) in your browser.
    *   Go to the **Network** tab.
    *   Filter for requests to your signaling server URL (e.g., `localhost:3001`). Look for WebSocket (WS) connections or HTTP requests (if using polling fallback).
    *   Look for **failed requests** (status 4xx, 5xx, or `(failed)`).
    *   **Click on a failed request.** Check the **Headers** tab. Look for `Access-Control-Allow-Origin`. If it's missing or doesn't match `http://localhost:9002`, it's a CORS problem (Step 3). If the status is 404 (Not Found), the URL might be wrong (Step 2). If it's 500 (Server Error), check the signaling server logs (Step 5). If it says `ERR_CONNECTION_REFUSED`, the server isn't running or is blocked (Step 1 or 6).

5.  **Check Signaling Server LOGS:**
    *   **Add `console.log` statements:** Add logging inside *all* your signaling server's event handlers (`connection`, `join`, `offer`, `answer`, `ice-candidate`, `disconnect`). *This is the most important step for debugging server-side issues.*
    *   **Observe Output:** When you try to connect from the Next.js app, what does the signaling server log?
        *   Does it log `Socket ... connected`? If not, the connection isn't even reaching the server (check URL, firewall, CORS).
        *   Does it log receiving the `join` event?
        *   When errors occur, are there any specific error messages logged *on the server side*? This is crucial for debugging server issues like crashes or internal logic errors.

6.  **Firewall/Network Issues:**
    *   Ensure no firewall on your computer or network is blocking incoming connections to the signaling server port (e.g., 3001).
    *   Ensure both the Next.js app and the signaling server are accessible on your network if running on different machines.

7.  **Try a Different Browser/Incognito Mode:**
    *   Sometimes browser extensions or settings interfere. Test in an incognito window or a different browser.

**Other Issues:**

-   **Users don't see each other / Messages not sending:**
    1.  **Verify Signaling Flow (Server Logs):** Use your detailed signaling server logs (Step 5 above) to confirm that `join`, `offer`, `answer`, and `ice-candidate` events are being correctly relayed between the peers. If a user joins, does the server log it and emit `online-users`? When an offer is sent, does the server log receiving it and forwarding it to the correct target? If signaling isn't working, P2P connections won't establish.
    2.  **Check Browser Console (Both Peers):** Look for WebRTC-specific errors (e.g., `Failed to set remote description`, `ICE connection failed`, Data Channel errors) in the console tab on *both* browsers involved in the chat. Also check the `ghostline_debug` object in the console (e.g., `window.ghostline_debug.getPeers()`, `window.ghostline_debug.getDataChannels()`).
    3.  **STUN/TURN Servers:** The default configuration uses Google's public STUN server. This works for many networks, but complex NATs might require a TURN server for relaying traffic. If peers are on very different/restrictive networks, this might be the issue. Setting up TURN is beyond this basic example.
    4.  **Data Channel State:** Check `window.ghostline_debug.getDataChannels()` in the browser console. Are the data channels reaching the `open` state for the intended peers?
    5.  **Message Broadcasting Logic:** Check the `broadcastMessage` function in `webrtc.ts` and its logs. Are messages being sent? Are there errors during sending?

-   **Dependencies:** Ensure dependencies are installed (`npm install`). Sometimes deleting `node_modules` and `package-lock.json` (or `yarn.lock`) and running `npm install` again helps.
