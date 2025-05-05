# GhostLine - P2P Chat

This is a Next.js application demonstrating a real-time peer-to-peer (P2P) chat system using WebRTC and Socket.IO for signaling.

## How it Works

-   **Next.js:** Provides the React framework, routing, and server-side capabilities.
-   **React:** Used for building the user interface components (`src/components` and `src/app/page.tsx`).
-   **TypeScript:** Enhances code quality and maintainability.
-   **Tailwind CSS & ShadCN UI:** Used for styling and pre-built UI components.
-   **WebRTC:** Enables direct peer-to-peer communication between browsers for sending messages without a central message server **after** the initial connection is established.
-   **Socket.IO Signaling Server (Crucial & Required):** A **separate Node.js server** (that you need to run) uses Socket.IO as the signaling mechanism. Peers connect to this server **only** to discover each other and exchange the necessary information (SDP offers/answers, ICE candidates) to establish a direct WebRTC connection. **The signaling server does *not* relay the actual chat messages after the P2P connection is live.** Think of it like a phone operator connecting two people initially; once connected, they talk directly. **This server is essential for the app to function.**
-   **Lucide Icons:** Provides icons used throughout the UI.

## Getting Started (Local Development)

Follow these steps carefully to run the chat application locally.

**1. Clone or Download This Repository:**

```bash
# If using git
git clone <repository_url>
cd ghostline

# Or download the source code and navigate into the project directory
```

**2. Install Next.js App Dependencies:**

Open a terminal in the `ghostline` project directory and run:

```bash
npm install
# or
yarn install
# or
pnpm install
```

**3. Set Up the Separate Signaling Server (Mandatory Step):**

**This application requires a separate signaling server to function.** You need to create and run it yourself. It cannot run as part of the Next.js app itself.

*   **Create Server File:** Create a new file named `signaling-server.js` **outside** of your Next.js project directory (e.g., in a completely separate folder).
*   **Paste Server Code:** Copy and paste the following minimal Node.js/Socket.IO server code into `signaling-server.js`:

    ```javascript
    // signaling-server.js
    const { Server } = require("socket.io");
    const http = require('http');

    const server = http.createServer(); // Basic HTTP server
    const PORT = process.env.PORT || 3001; // Use port 3001 by default

    // Configure Socket.IO Server with CORS
    const io = new Server(server, {
      cors: {
        // IMPORTANT: Update this origin to EXACTLY match where your Next.js app runs!
        // Default Next.js port is 3000, but this project uses 9002 via `npm run dev`.
        // Update this if you deploy the Next.js app elsewhere.
        origin: "http://localhost:9002", // Allow connections from your Next.js app
        methods: ["GET", "POST"] // Methods needed by Socket.IO
      }
    });

    console.log(`Signaling server starting on port ${PORT}...`);
    console.log(`CORS configured for origin: ${io.opts.cors.origin}`);


    const onlineUsers = new Map(); // Map<socketId, {userId, username}>

    // Handle Socket.IO connections
    io.on('connection', (socket) => {
      console.log(`\n[Connect] Socket connected: ${socket.id}`);

      // Handle user joining
      socket.on('join', (data) => {
        if (!data || !data.userId || !data.username) {
          console.log(`[Join Error] Invalid join data from ${socket.id}:`, data);
          return; // Ignore invalid join attempts
        }
        console.log(`[Join] Socket ${socket.id} joined as User ID: ${data.userId}, Username: ${data.username}`);
        onlineUsers.set(socket.id, { userId: data.userId, username: data.username });
        // Broadcast updated user list to everyone
        broadcastUserList();
      });

      // Handle WebRTC offers
      socket.on('offer', (data) => {
        if (!data || !data.targetId || !data.offer) {
           console.log(`[Offer Error] Invalid offer data from ${socket.id}:`, data);
           return;
        }
        const targetSocket = findSocketByUserId(data.targetId);
        if (targetSocket) {
          console.log(`[Offer] Relaying offer from ${socket.id} (${getUserInfo(socket.id)?.username}) to ${targetSocket.id} (${getUserInfo(targetSocket.id)?.username})`);
          targetSocket.emit('offer', {
            senderId: getUserInfo(socket.id)?.userId, // Send the *userId*, not socketId
            senderName: getUserInfo(socket.id)?.username,
            offer: data.offer
          });
        } else {
          console.log(`[Offer Warn] Target user ${data.targetId} not found for offer from ${socket.id}.`);
        }
      });

      // Handle WebRTC answers
      socket.on('answer', (data) => {
        if (!data || !data.targetId || !data.answer) {
           console.log(`[Answer Error] Invalid answer data from ${socket.id}:`, data);
           return;
        }
        const targetSocket = findSocketByUserId(data.targetId);
        if (targetSocket) {
          console.log(`[Answer] Relaying answer from ${socket.id} (${getUserInfo(socket.id)?.username}) to ${targetSocket.id} (${getUserInfo(targetSocket.id)?.username})`);
          targetSocket.emit('answer', {
             senderId: getUserInfo(socket.id)?.userId, // Send the *userId*, not socketId
             answer: data.answer
          });
        } else {
          console.log(`[Answer Warn] Target user ${data.targetId} not found for answer from ${socket.id}.`);
        }
      });

      // Handle ICE candidates
      socket.on('ice-candidate', (data) => {
        if (!data || !data.targetId ) { // candidate can be null
             console.log(`[ICE Error] Invalid ICE candidate data from ${socket.id}:`, data);
             return;
         }
        const targetSocket = findSocketByUserId(data.targetId);
        if (targetSocket) {
          // console.log(`[ICE] Relaying ICE candidate from ${socket.id} to ${targetSocket.id}`); // Can be verbose
          targetSocket.emit('ice-candidate', {
             senderId: getUserInfo(socket.id)?.userId, // Send the *userId*, not socketId
             candidate: data.candidate // Can be null
          });
        } else {
           // console.log(`[ICE Warn] Target user ${data.targetId} not found for ICE candidate from ${socket.id}.`); // Can be verbose
        }
      });

      // Handle disconnections
      socket.on('disconnect', (reason) => {
        console.log(`[Disconnect] Socket disconnected: ${socket.id}. Reason: ${reason}`);
        const userInfo = onlineUsers.get(socket.id);
        if (userInfo) {
           console.log(`   User removed: ID=${userInfo.userId}, Username=${userInfo.username}`);
        }
        onlineUsers.delete(socket.id);
        // Broadcast updated user list
        broadcastUserList();
      });

      // Handle generic errors
      socket.on('error', (err) => {
          console.error(`[Socket Error] Error on socket ${socket.id}:`, err);
      });
    });

    // Helper function to broadcast the current list of online users
    function broadcastUserList() {
      const users = Array.from(onlineUsers.values()).map(info => ({
          id: info.userId,
          name: info.username
      }));
      console.log(`[User List Update] Broadcasting ${users.length} users:`, users.map(u => u.name));
      io.emit('online-users', users); // Send to all connected clients
    }

    // Helper function to find a socket by userId
    function findSocketByUserId(userId) {
      for (const [socketId, userInfo] of onlineUsers.entries()) {
        if (userInfo.userId === userId) {
          return io.sockets.sockets.get(socketId);
        }
      }
      return null; // Return null if not found
    }

    // Helper function to get user info by socketId
     function getUserInfo(socketId) {
         return onlineUsers.get(socketId);
     }


    // Start the HTTP server
    server.listen(PORT, () => {
      console.log(`Signaling server listening securely on port ${PORT}`);
      console.log(`Waiting for connections...`);
    });

    // Handle server errors
    server.on('error', (err) => {
        console.error('[Server Error]', err);
    });
    ```

*   **Install Dependency:** Open a terminal **in the directory where you saved `signaling-server.js`** and run:
    ```bash
    npm install socket.io
    ```

*   **Run the Server:** In the **same terminal** (the one for the signaling server), run:
    ```bash
    node signaling-server.js
    ```
    You should see logs like `Signaling server listening securely on port 3001`. **Leave this terminal running.** This server needs to be running constantly for users to connect and find each other.

**4. Configure Next.js App Environment Variable:**

*   Go back to your `ghostline` Next.js project directory.
*   Create a file named `.env.local` in the **root** of the `ghostline` project (if it doesn't already exist).
*   Add the following line to `.env.local`. Make sure the URL and port **exactly match** where your signaling server is running (port `3001` from the example above):
    ```.env.local
    NEXT_PUBLIC_SIGNALING_SERVER_URL=http://localhost:3001
    ```
    *If this variable is not set, the app defaults to `http://localhost:3001`.*

**5. Run the Next.js Development Server:**

*   Open a **new, separate terminal window**.
*   Navigate into your `ghostline` project directory.
*   Run the development server:
    ```bash
    npm run dev
    ```
    This will typically start the Next.js app on `http://localhost:9002`.

**6. Open the App and Test:**

*   Open `http://localhost:9002` in **multiple browser tabs** (or different browsers on the same computer, or even different computers on the same LAN).
*   Enter a unique username in each tab and click "Join Chat".
*   You should see the users appear in the "Online" list in each tab (after a short delay for connection).
*   Try sending messages between the tabs. They should appear in the chat interface.
*   **Observe the terminal output** for both the Next.js app (in the browser console) and **crucially, the signaling server** for connection logs and potential errors.

## Key Files

-   `src/app/page.tsx`: The main page component containing the chat UI logic and integration with the WebRTC library.
-   `src/lib/webrtc.ts`: Contains the core WebRTC connection logic, including signaling via Socket.IO, peer connection management, and data channel handling. Relies on the `NEXT_PUBLIC_SIGNALING_SERVER_URL` environment variable.
-   `src/components/chat-interface.tsx`: The component responsible for displaying messages and the message input field.
-   `src/app/globals.css`: Global styles and Tailwind CSS/ShadCN theme configuration.
-   `tailwind.config.ts`: Tailwind CSS configuration.
-   `signaling-server.js` (**You create this**): The **essential**, separate Node.js server for handling WebRTC signaling (discovery and negotiation).

## Troubleshooting

**The most common issue is the signaling server not running or being misconfigured.**

If you see the **"Connection failed"** screen or encounter errors like `xhr poll error`, `websocket error`, `timeout`, `Connection refused`, `ERR_CONNECTION_REFUSED`, `transport close`, etc., follow these steps meticulously:

1.  **Is the Signaling Server RUNNING?**
    *   **Check the Terminal:** Go to the terminal window where you started `node signaling-server.js`.
    *   **Is it Listening?** Does it show `Signaling server listening securely on port 3001` (or your configured port)?
    *   **Any Errors?** Check for error messages logged *in the signaling server's terminal*. Fix them first. Common errors include port conflicts (if port 3001 is already in use) or syntax errors in the code. **This is the MOST important step.**

2.  **Is the Signaling Server URL CORRECT in the Next.js App?**
    *   **Check `.env.local`:** Open the `.env.local` file in your `ghostline` project root.
    *   **Verify `NEXT_PUBLIC_SIGNALING_SERVER_URL`:** Ensure the protocol (`http` or `https`), hostname (`localhost` or your server's IP/domain), and port (`3001` or your chosen port) **exactly** match the address your signaling server is listening on. Typos are very common.
    *   **Check Browser Console:** The Next.js app logs the URL it's trying to use when it starts (`Using signaling server URL: ...`). Does this match your running server?
    *   **Restart Next.js:** If you changed `.env.local`, you **must** stop (`Ctrl+C`) and restart the Next.js development server (`npm run dev`) for the changes to take effect.

3.  **Is Signaling Server CORS Configured CORRECTLY? (Very Common Issue!)**
    *   **Check `signaling-server.js`:** Look at the `cors: { origin: "..." }` configuration within the `new Server(...)` call in your `signaling-server.js`.
    *   **Verify `origin`:** The `origin` value *must* exactly match the origin of your Next.js app, including the port (e.g., `http://localhost:9002` for local development, or `https://your-ghostline-app.vercel.app` if deployed). Using `"*"` is insecure and might still cause issues.
    *   **Restart Signaling Server:** After changing CORS settings in `signaling-server.js`, **stop and restart the signaling server** (`Ctrl+C` then `node signaling-server.js`).

4.  **Check Browser Developer Console (Network Tab):**
    *   Open Developer Tools (F12) in your browser (on the `http://localhost:9002` page).
    *   Go to the **Network** tab.
    *   Filter for "ws" (WebSocket) or requests to your signaling server URL (e.g., `localhost:3001`).
    *   Look for **failed requests** (red status, `(failed)`, `pending` for a long time).
    *   **Click on a failed request.** Check the **Headers** tab. Look for `Access-Control-Allow-Origin`. If it's missing or doesn't match your Next.js app's origin, it's a CORS problem (Step 3). If the status is 404 (Not Found), the URL might be wrong (Step 2). If it's 5xx (Server Error), check the signaling server logs (Step 1). If it says `ERR_CONNECTION_REFUSED`, the server isn't running or is blocked (Step 1 or 6).

5.  **Check Signaling Server LOGS (Again - CRUCIAL):**
    *   **Observe the terminal output** where `node signaling-server.js` is running. This is the primary source of truth for server-side issues.
    *   When you try to connect from the Next.js app (`localhost:9002`):
        *   Does it log `[Connect] Socket connected: ...`? If not, the connection isn't even reaching the server (check URL, firewall, CORS).
        *   Does it log receiving the `[Join] ...` event?
        *   Does it log `[Offer] ...`, `[Answer] ...`, `[ICE] ...` events being relayed?
        *   Are there any `[Error]`, `[Socket Error]` or `[Warn]` messages logged *on the server side*? These point directly to server issues.

6.  **Firewall/Network Issues:**
    *   Ensure no firewall on your computer (or network) is blocking incoming connections to the signaling server port (e.g., 3001).
    *   Ensure both the Next.js app and the signaling server are accessible on your local network (if testing on LAN).

7.  **Try a Different Browser/Incognito Mode:**
    *   Sometimes browser extensions interfere. Test in an incognito/private window or a different browser.

**Other Issues:**

-   **Users connect but don't see each other / Messages not sending:**
    1.  **Verify Signaling Flow (Server Logs):** Use your detailed signaling server logs (Step 5 above) to confirm that `[Join]`, `[User List Update]`, `[Offer]`, `[Answer]`, and `[ICE]` events are being correctly logged and relayed between the peers. If a user joins, does the server log it and broadcast `[User List Update]`? When an offer is sent, does the server log receiving it and relaying it to the correct target? If signaling isn't working, P2P connections won't establish.
    2.  **Check Browser Console (Both Peers):** Look for WebRTC-specific errors (e.g., `Failed to set remote description`, `ICE connection failed`, Data Channel errors) in the console tab on *both* browsers involved in the chat. Also check the `window.ghostline_debug` object in the console (e.g., `window.ghostline_debug.getPeers()`, `window.ghostline_debug.getDataChannels()`).
    3.  **STUN/TURN Servers:** The default configuration uses Google's public STUN server (`stun:stun.l.google.com:19302`). This works for many networks, but complex NATs might require a TURN server for relaying traffic. If peers are on very different/restrictive networks, this might be the issue. Setting up TURN is beyond this basic example.
    4.  **Data Channel State:** Check `window.ghostline_debug.getDataChannels()` in the browser console. Are the data channels reaching the `open` state for the intended peers?
    5.  **Message Broadcasting Logic:** Check the `broadcastMessage` function in `webrtc.ts` and its logs. Are messages being sent? Are there errors during sending? Is the `dataChannels` map populated correctly?

-   **Dependencies:** Ensure dependencies are installed (`npm install` in both the Next.js project and the signaling server directory). Sometimes deleting `node_modules` and `package-lock.json` (or `yarn.lock`) and running `npm install` again helps.

## Deployment

Deploying this application requires **two separate deployments**:

1.  **Signaling Server:** Deploy the `signaling-server.js` (or your equivalent) to a Node.js hosting platform (e.g., Render, Heroku, Fly.io, a VPS). **The signaling server CANNOT be deployed as part of the Next.js frontend deployment on platforms like Vercel.**
2.  **Next.js Frontend:** Deploy the `ghostline` Next.js application to a frontend hosting platform like Vercel, Netlify, etc.

**Deployment Steps:**

1.  **Deploy Signaling Server:**
    *   Choose a Node.js hosting provider.
    *   Prepare your signaling server directory: Make sure it has a `package.json` listing `socket.io` as a dependency.
        ```json
        // Example package.json for signaling-server directory
        {
          "name": "ghostline-signaling",
          "version": "1.0.0",
          "description": "Signaling server for GhostLine P2P Chat",
          "main": "signaling-server.js",
          "scripts": {
            "start": "node signaling-server.js"
          },
          "dependencies": {
            "socket.io": "^4.7.5" // Use the version compatible with your client
          }
        }
        ```
    *   Deploy the `signaling-server.js` file and its `package.json` to your chosen host.
    *   Configure the hosting environment:
        *   Set the `PORT` environment variable if required by the host (many set it automatically).
        *   **Crucially, configure the CORS origin (`cors: { origin: "..." }`) in your `signaling-server.js` to match the URL of your *deployed* Next.js frontend** (e.g., `https://your-ghostline-app.vercel.app`).
    *   Note the public URL of your deployed signaling server (e.g., `https://your-signaling-server.onrender.com`). It **must** use `https://` if your frontend is deployed with HTTPS.

2.  **Deploy Next.js Frontend:**
    *   Push your `ghostline` code to a Git repository (GitHub, GitLab, etc.).
    *   Connect your repository to Vercel (or your chosen frontend host).
    *   **Set Environment Variable:** In your Vercel project settings (or equivalent), add an environment variable:
        *   **Name:** `NEXT_PUBLIC_SIGNALING_SERVER_URL`
        *   **Value:** The full **public HTTPS URL** of your deployed signaling server (from step 1).
    *   Trigger a deployment on Vercel.

3.  **Test:** Access your deployed Next.js application URL (`https://your-ghostline-app.vercel.app`) and test the chat functionality with multiple users. Check browser consoles and the deployed signaling server logs if issues arise. Common deployment issues include incorrect signaling server URL or misconfigured CORS on the deployed signaling server.
