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
    This application requires a separate Socket.IO signaling server to facilitate the WebRTC connection handshake between peers. You'll need to set one up. A basic example can be found in various online tutorials. Ensure the server URL matches the `SIGNALING_SERVER_URL` in `src/lib/webrtc.ts` (or configure it via environment variables).

3.  **Environment Variables:**
    You might want to configure the signaling server URL via an environment variable. Create a `.env.local` file in the root directory:
    ```.env.local
    NEXT_PUBLIC_SIGNALING_SERVER_URL=http://your-signaling-server-url:port
    ```

4.  **Run the Development Server:**
    ```bash
    npm run dev
    # or
    yarn dev
    # or
    pnpm dev
    ```

5.  **Run the Signaling Server:**
    Start your signaling server in a separate terminal.

6.  **Open the App:**
    Open [http://localhost:9002](http://localhost:9002) (or your specified port) in multiple browser tabs or on different devices on the same network to test the P2P chat.

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
-   `src/lib/webrtc.ts`: Contains the core WebRTC connection logic, including signaling via Socket.IO, peer connection management, and data channel handling.
-   `src/components/chat-interface.tsx`: The component responsible for displaying messages and the message input field.
-   `src/app/globals.css`: Global styles and Tailwind CSS/ShadCN theme configuration.
-   `tailwind.config.ts`: Tailwind CSS configuration.
