
// src/lib/webrtc.ts
'use client'; // Mark as client component as it uses browser APIs and interacts with UI state

import io, { Socket } from 'socket.io-client';
import type { UserType, MessageType } from '@/app/page';

// --- Configuration ---
// Default signaling server URL (can be overridden by environment variable)
const DEFAULT_SIGNALING_URL = 'http://localhost:3001';
const SIGNALING_SERVER_URL = process.env.NEXT_PUBLIC_SIGNALING_SERVER_URL || DEFAULT_SIGNALING_URL;

const iceConfiguration: RTCConfiguration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        // Add TURN servers here if needed for NAT traversal issues
        // Example:
        // {
        //   urls: 'turn:your.turn.server.com:3478',
        //   username: 'user',
        //   credential: 'password'
        // }
    ]
};

// --- State Variables ---
let socket: Socket | null = null;
let localUserId: string | null = null;
let localUsername: string | null = null;
let _isConnected = false; // Internal connection state flag
const peers = new Map<string, RTCPeerConnection>(); // Map<peerId, RTCPeerConnection>
const dataChannels = new Map<string, RTCDataChannel>(); // Map<peerId, RTCDataChannel>

// --- Callback Hooks ---
// These will be set by the main application to update its state
let onConnectedCallback: () => void = () => {};
let onDisconnectedCallback: () => void = () => {};
let onUserListUpdateCallback: (users: UserType[]) => void = () => {};
let onMessageReceivedCallback: (message: MessageType) => void = () => {};
let onErrorCallback: (error: string) => void = () => {};

// --- Public API ---

/**
 * Checks if the WebSocket connection to the signaling server is currently active.
 * @returns {boolean} True if connected, false otherwise.
 */
export function isConnected(): boolean {
    return _isConnected && socket?.connected === true;
}


/**
 * Connects to the signaling server and initializes WebRTC listeners.
 */
export function connect(
    userId: string,
    username: string,
    callbacks: {
        onConnected: () => void;
        onDisconnected: () => void;
        onUserListUpdate: (users: UserType[]) => void;
        onMessageReceived: (message: MessageType) => void;
        onError: (error: string) => void;
    }
): Promise<void> {
     return new Promise((resolve, reject) => {
        if (_isConnected || socket?.connected) {
            console.warn('Attempted to connect when already connected or connecting.');
            resolve(); // Indicate success as it's already connected
            return;
        }
        if (socket) {
             console.warn('Socket instance exists but not connected. Cleaning up previous instance.');
             cleanup(); // Ensure clean state before new attempt
        }

        console.log(`Attempting to connect to signaling server at ${SIGNALING_SERVER_URL}...`);
        localUserId = userId;
        localUsername = username;

        // Set callbacks
        onConnectedCallback = callbacks.onConnected;
        onDisconnectedCallback = callbacks.onDisconnected;
        onUserListUpdateCallback = callbacks.onUserListUpdate;
        onMessageReceivedCallback = callbacks.onMessageReceived;
        onErrorCallback = callbacks.onError;

        try {
            socket = io(SIGNALING_SERVER_URL, {
                reconnectionAttempts: 3, // Limit automatic reconnection attempts
                timeout: 10000, // Connection timeout
                // Consider adding transports: ['websocket'] if polling is problematic
                // transports: ['websocket'],
            });
        } catch (error: any) { // Added type annotation for error
            console.error("Error creating Socket.IO client:", error);
            onErrorCallback(`Initialization failed: ${error.message}`);
            cleanup(); // Ensure cleanup if io() throws
            reject(new Error(`Failed to initialize Socket.IO: ${error.message}`));
            return;
        }


        // --- Socket Event Handlers ---
        socket.on('connect', () => {
            console.log('Successfully connected to signaling server with socket ID:', socket?.id);
            _isConnected = true;
            // Join the room with user details
            socket?.emit('join', { userId: localUserId, username: localUsername });
            onConnectedCallback(); // Notify the UI component
            resolve(); // Resolve the promise on successful connection
        });

        socket.on('connect_error', (error) => {
            console.error('Signaling server connection error:', error.message);
            // Provide a more user-friendly error message
            let errorMessage = `Failed to connect to signaling server (${SIGNALING_SERVER_URL}). `;
            if (error.message.includes('xhr poll error') || error.message.includes('timeout')) {
                errorMessage += 'Please ensure the server is running and check CORS configuration.';
            } else {
                errorMessage += `Details: ${error.message}`;
            }
            onErrorCallback(errorMessage);
            cleanup(); // Clean up resources on failure
            reject(new Error(errorMessage)); // Reject the promise
        });

         socket.on('disconnect', (reason) => {
            console.log('Disconnected from signaling server. Reason:', reason);
             // Only call error callback for unexpected disconnects
             if (reason !== 'io client disconnect') { // "io client disconnect" is triggered by calling disconnect()
                 onErrorCallback(`Lost connection to signaling server: ${reason}.`);
             }
            cleanup(); // Clean up peers and socket state
             // Important: The UI callback 'onDisconnectedCallback' should primarily be triggered
             // by the user initiating disconnect via the disconnect() function below,
             // or after errors in the connect phase. Handling unexpected disconnects
             // might require different UI logic (e.g., showing a reconnecting state).
             // We call it here to ensure the UI reflects the disconnected state
             // even for unexpected server-side disconnects.
             onDisconnectedCallback();
         });

        socket.on('online-users', (users: UserType[]) => {
            console.log('Received online users:', users);
            onUserListUpdateCallback(users); // Update the UI list
            // Filter out self before processing
            const otherUsers = users.filter(user => user.id !== localUserId);

            // Initiate connections to new users not already peered
             otherUsers.forEach(user => {
                 if (!peers.has(user.id) && !dataChannels.has(user.id)) { // Check both maps
                     console.log(`New user detected: ${user.name} (${user.id}). Initiating peer connection.`);
                     createPeerConnection(user.id, true); // true: we are the initiator
                 }
             });

             // Clean up connections for users who have left
             const onlineUserIds = new Set(otherUsers.map(u => u.id));
             peers.forEach((_, peerId) => {
                 if (!onlineUserIds.has(peerId)) {
                     console.log(`User ${peerId} is no longer online. Closing peer connection.`);
                     closePeerConnection(peerId);
                 }
             });
        });

        // Handle incoming WebRTC offers
        socket.on('offer', async (data: { senderId: string; senderName: string; offer: RTCSessionDescriptionInit }) => {
            const { senderId, senderName, offer } = data;
             if (senderId === localUserId) return; // Sanity check: ignore offers from self

            console.log(`Received offer from ${senderName} (${senderId})`);
            // Ensure peer connection exists. Create if receiving offer first.
            const pc = createPeerConnection(senderId, false); // false: we are NOT the initiator

             try {
                 // Set the received offer as the remote description
                 await pc.setRemoteDescription(new RTCSessionDescription(offer));
                 console.log(`Set remote description (offer) from ${senderId}`);

                 // Create an answer
                 const answer = await pc.createAnswer();
                 // Set the created answer as the local description
                 await pc.setLocalDescription(answer);
                 console.log(`Created and set local description (answer) for ${senderId}`);

                 // Send the answer back to the offering peer via the signaling server
                 socket?.emit('answer', { targetId: senderId, answer: pc.localDescription });
                 console.log(`Sent answer to ${senderId}`);
             } catch (error: any) { // Added type annotation for error
                 console.error(`Error handling offer from ${senderId}:`, error);
                 onErrorCallback(`Error processing offer from ${senderName}: ${error.message}`);
                 closePeerConnection(senderId); // Clean up on error
             }
        });

        // Handle incoming WebRTC answers
        socket.on('answer', async (data: { senderId: string; answer: RTCSessionDescriptionInit }) => {
            const { senderId, answer } = data;
             if (senderId === localUserId) return; // Ignore answers from self

            console.log(`Received answer from ${senderId}`);
            const pc = peers.get(senderId);

            if (pc && pc.signalingState === 'have-local-offer') {
                 try {
                     // Set the received answer as the remote description
                     await pc.setRemoteDescription(new RTCSessionDescription(answer));
                     console.log(`Set remote description (answer) from ${senderId}`);
                     // Connection should now proceed with ICE candidates
                 } catch (error: any) { // Added type annotation for error
                     console.error(`Error setting remote description (answer) from ${senderId}:`, error);
                     onErrorCallback(`Error processing answer from peer: ${error.message}`);
                     closePeerConnection(senderId); // Clean up on error
                 }
            } else {
                console.warn(`Received answer from ${senderId}, but peer connection not found or in unexpected state: ${pc?.signalingState}`);
            }
        });

        // Handle incoming ICE candidates
        socket.on('ice-candidate', async (data: { senderId: string; candidate: RTCIceCandidateInit | null }) => {
            const { senderId, candidate } = data;
             if (senderId === localUserId) return; // Ignore own candidates

            const pc = peers.get(senderId);
            if (pc) {
                 if (candidate) {
                     try {
                         // Add the ICE candidate if remote description is set
                         // Browsers often handle queueing internally if description isn't set yet,
                         // but adding an explicit check or queue can be more robust.
                         if (pc.remoteDescription) {
                             await pc.addIceCandidate(new RTCIceCandidate(candidate));
                             // console.log(`Added ICE candidate from ${senderId}`);
                         } else {
                             console.warn(`Received ICE candidate from ${senderId} before remote description set. Relying on browser queueing.`);
                             // TODO: Implement manual queueing if issues arise.
                         }
                     } catch (error: any) { // Added type annotation for error
                         // Ignore benign errors like "Error processing ICE candidate" which can happen
                         // if candidates arrive out of order or state changes rapidly.
                         if (!error.message.includes("Error processing ICE candidate")) {
                             console.error(`Error adding ICE candidate from ${senderId}:`, error);
                             onErrorCallback(`Error processing network candidate from peer: ${error.message}`);
                         }
                     }
                 } else {
                     // console.log(`Received end-of-candidates signal from ${senderId}`);
                     // Null candidate indicates the peer has finished gathering candidates
                 }
            } else {
                console.warn(`Received ICE candidate from ${senderId}, but no matching peer connection found.`);
            }
        });

        // Handle potential errors during socket setup more gracefully
        socket.on('error', (error) => {
            console.error('Generic Socket error:', error);
            onErrorCallback(`Signaling server error: ${error.message || error}`);
            // Consider if cleanup is needed depending on the error type
        });
    });
}

/**
 * Disconnects from the signaling server and closes all peer connections.
 * This is the function the UI should call when the user explicitly leaves.
 */
export function disconnect(): void {
    console.log('User initiated disconnect...');
    if (!_isConnected && !socket) {
        console.warn('Disconnect called but not connected.');
        return; // Nothing to do
    }
    cleanup(); // Perform all necessary cleanup
    onDisconnectedCallback(); // Notify the UI that disconnection is complete
}

/**
 * Sends a message to a specific peer. (Not currently used for broadcast)
 */
// export function sendMessageToPeer(peerId: string, messageText: string): void {
//     // ... (implementation remains the same as before)
// }

/**
 * Sends a message to all connected peers via their data channels.
 */
export function broadcastMessage(messageText: string): void {
    if (!localUserId || !localUsername) {
        console.error('Cannot broadcast message: local user info missing.');
        onErrorCallback('Cannot send message: user information not available.');
        return;
    }
     if (!isConnected()) {
         console.error('Cannot broadcast message: Not connected to signaling/peers.');
         onErrorCallback('Cannot send message: not connected.');
         return;
     }
    console.log('Attempting to broadcast message:', messageText);

    const message: MessageType = {
        id: `msg-${Date.now()}-${localUserId}`, // Unique message ID
        senderId: localUserId,
        senderName: localUsername,
        text: messageText,
        timestamp: Date.now(),
    };

    let sentToAnyPeer = false;
    dataChannels.forEach((dc, peerId) => {
        if (dc.readyState === 'open') {
            try {
                dc.send(JSON.stringify(message));
                sentToAnyPeer = true;
                // console.log(`Broadcast message successfully sent to ${peerId}`);
            } catch (error: any) { // Added type annotation for error
                console.error(`Failed to send broadcast message to ${peerId}:`, error);
                // Maybe notify user about specific peer send failure?
                onErrorCallback(`Failed to send message to some peers: ${error.message}`);
            }
        } else {
            console.warn(`Data channel with peer ${peerId} not open for broadcast. State: ${dc.readyState}`);
        }
    });

    if (!sentToAnyPeer && dataChannels.size > 0) {
        console.warn('Broadcast attempted, but no data channels were open.');
        onErrorCallback('Could not send message: no peer connections currently open.');
    } else if (dataChannels.size === 0) {
        console.log("No peers connected to broadcast the message to.");
        // Optionally inform the user they are alone in the chat
        // onErrorCallback("You're the only one here! Message not sent.");
    } else if (sentToAnyPeer) {
        console.log("Broadcast message sent to open channels.");
    }
    // The UI should handle adding the *sent* message to its local state immediately
    // regardless of successful delivery to peers.
}


// --- Internal Helper Functions ---

/**
 * Creates or retrieves an RTCPeerConnection for a given peer.
 * Sets up all necessary event handlers for the peer connection.
 * @param peerId The ID of the peer to connect to.
 * @param isInitiator True if the local client is initiating the connection (sending offer).
 * @returns The created or existing RTCPeerConnection.
 */
function createPeerConnection(peerId: string, isInitiator: boolean): RTCPeerConnection {
    if (peers.has(peerId)) {
        // console.log(`Peer connection with ${peerId} already exists.`);
        return peers.get(peerId)!;
    }
     if (peerId === localUserId) {
         console.error("Attempted to create peer connection with self.");
         throw new Error("Cannot create peer connection with self.");
     }

    console.log(`Creating ${isInitiator ? 'initiating' : 'receiving'} peer connection with ${peerId}`);
    const pc = new RTCPeerConnection(iceConfiguration);
    peers.set(peerId, pc);

    // --- PeerConnection Event Handlers ---

    // Handle ICE candidates generated locally
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            // Send the candidate to the remote peer via the signaling server
            // console.log(`Sending ICE candidate to ${peerId}:`, event.candidate.type);
            socket?.emit('ice-candidate', { targetId: peerId, candidate: event.candidate });
        } else {
            // console.log(`All local ICE candidates gathered for ${peerId}. Sending null candidate.`);
            // Send null candidate to signal completion (some implementations require this)
             socket?.emit('ice-candidate', { targetId: peerId, candidate: null });
        }
    };

    // Monitor ICE gathering state changes (for debugging)
    pc.onicegatheringstatechange = () => {
         // console.log(`ICE gathering state change for ${peerId}: ${pc.iceGatheringState}`);
    };

    // Monitor the overall connection state
    pc.onconnectionstatechange = () => {
        console.log(`Peer connection state with ${peerId}: ${pc.connectionState}`);
        switch (pc.connectionState) {
            case 'connected':
                console.log(`WebRTC connection established with peer ${peerId}`);
                // Data channel should be open or opening shortly
                break;
            case 'failed':
                console.error(`WebRTC connection with ${peerId} failed.`);
                onErrorCallback(`Connection attempt with a peer failed.`);
                // Attempt to restart ICE negotiation? Often simpler to just close and retry signaling.
                closePeerConnection(peerId); // Clean up failed connection
                 // Optional: Attempt to re-initiate connection after a delay
                 // setTimeout(() => {
                 //     if (isConnected() && !peers.has(peerId)) { // Check if still connected to signaling
                 //         console.log(`Attempting to reconnect to ${peerId} after failure...`);
                 //         createPeerConnection(peerId, true); // Try initiating again
                 //     }
                 // }, 5000); // 5 second delay
                break;
            case 'disconnected':
                console.warn(`WebRTC connection with peer ${peerId} disconnected. Might recover...`);
                // Connection was lost, browser might try to reconnect automatically.
                 onErrorCallback(`Connection with a peer was interrupted. Attempting recovery...`);
                 // If recovery doesn't happen, may need manual intervention or rely on signaling refresh.
                break;
            case 'closed':
                console.log(`WebRTC connection with ${peerId} closed.`);
                // Connection is fully closed, ensure cleanup.
                closePeerConnection(peerId);
                break;
             case 'connecting':
                 console.log(`WebRTC connection with ${peerId} is connecting...`);
                break;
             case 'new':
                 console.log(`WebRTC connection with ${peerId} is new.`);
                break;

        }
    };

    // Monitor signaling state changes (for debugging)
     pc.onsignalingstatechange = () => {
         // console.log(`Signaling state change for ${peerId}: ${pc.signalingState}`);
     };

    // --- Data Channel Setup ---
    if (isInitiator) {
        // Initiator creates the data channel
        console.log(`Creating data channel 'chat' to ${peerId}`);
        // Use reliable, ordered delivery by default
        const dc = pc.createDataChannel('chat', { negotiated: false }); // Let browser handle negotiation
        setupDataChannel(dc, peerId); // Attach common event listeners
        dataChannels.set(peerId, dc); // Store reference

         // Create and send offer *after* potentially creating data channel
         pc.createOffer()
             .then(offer => pc.setLocalDescription(offer))
             .then(() => {
                 console.log(`Sending offer to ${peerId}`);
                 // Send the offer via the signaling server
                 socket?.emit('offer', {
                     targetId: peerId,
                     senderName: localUsername, // Send sender name along with offer
                     offer: pc.localDescription
                 });
             })
             .catch(error => {
                 console.error(`Error creating or sending offer for ${peerId}:`, error);
                 onErrorCallback(`Error initiating connection: ${error.message}`);
                 closePeerConnection(peerId); // Clean up failed attempt
             });

    } else {
        // Receiver waits for the remote peer to establish the data channel
        pc.ondatachannel = (event) => {
            console.log(`Data channel 'chat' received from ${peerId}`);
            const dc = event.channel;
            setupDataChannel(dc, peerId); // Attach common event listeners
            dataChannels.set(peerId, dc); // Store reference
        };
    }

    return pc;
}


/**
 * Sets up standard event listeners ('open', 'close', 'error', 'message') for a data channel.
 * @param dc The RTCDataChannel instance.
 * @param peerId The ID of the peer associated with this data channel.
 */
function setupDataChannel(dc: RTCDataChannel, peerId: string): void {
    dc.onopen = () => {
        console.log(`Data channel with ${peerId} is open and ready.`);
        // Optional: Send a confirmation or trigger UI update
        // Example: sendMessageToPeer(peerId, JSON.stringify({ type: 'system', text: 'Chat connection established!' }));
    };

    dc.onclose = () => {
        console.log(`Data channel with ${peerId} closed.`);
        // The peer connection state change usually handles cleanup, but ensure DC ref is removed.
        dataChannels.delete(peerId);
        // Check if the associated peer connection is also closed/failed
        if (!peers.has(peerId) || ['closed', 'failed'].includes(peers.get(peerId)?.connectionState ?? 'closed')) {
            console.log(`Peer connection for ${peerId} also closed/failed.`);
        } else {
            console.warn(`Data channel closed for ${peerId}, but peer connection state is: ${peers.get(peerId)?.connectionState}`);
        }
    };

    dc.onerror = (errorEvent) => { // Use specific event type
        // errorEvent is an RTCErrorEvent, access error detail via errorEvent.error
        const error = (errorEvent as any).error; // Cast to any to access error property if needed
        console.error(`Data channel error with ${peerId}:`, error?.message || errorEvent);
        onErrorCallback(`Network data channel error with peer: ${error?.message || 'Unknown data channel error'}`); // Simplify message
    };


    // Handle incoming messages on the data channel
    dc.onmessage = (event) => {
        // console.log(`Raw message received from ${peerId}:`, event.data); // Log raw data for debugging
        try {
            if (typeof event.data !== 'string') {
                 console.warn(`Received non-string message from ${peerId}:`, event.data);
                 return; // Ignore non-string messages for now
            }
            const message = JSON.parse(event.data) as MessageType;

            // Basic validation of the received message structure
            if (message && message.id && message.senderId && message.senderName && message.text && message.timestamp) {
                 // Ignore messages that loop back from self (shouldn't happen in P2P but good check)
                if (message.senderId === localUserId) {
                    console.warn("Ignoring message received from self.");
                    return;
                }
                console.log(`Parsed message received from ${message.senderName} (${peerId}): "${message.text}"`);
                // Pass the valid message to the UI callback
                onMessageReceivedCallback(message);
            } else {
                console.warn(`Received malformed message object from ${peerId}:`, event.data);
                 onErrorCallback(`Received unreadable message from a peer.`);
            }
        } catch (e: any) { // Added type annotation for error
            console.error(`Failed to parse JSON message from ${peerId}. Data:`, event.data, 'Error:', e);
            onErrorCallback(`Received invalid message format from a peer.`);
            // Optional: Handle non-JSON text messages if needed
            // onMessageReceivedCallback({ id: `raw-${Date.now()}`, senderId: peerId, senderName: `Peer ${peerId}`, text: event.data, timestamp: Date.now() });
        }
    };
}

/**
 * Closes the peer connection and removes associated data channel and peer references.
 * @param peerId The ID of the peer whose connection should be closed.
 */
function closePeerConnection(peerId: string): void {
    const pc = peers.get(peerId);
    if (pc) {
        // Avoid multiple close attempts or logging if already closed
        if (pc.connectionState !== 'closed') {
             console.log(`Closing peer connection with ${peerId} (State: ${pc.connectionState})`);
             pc.close(); // Gracefully close the connection
        }
        peers.delete(peerId); // Remove from map
    }

    // Ensure data channel reference is also removed, even if onclose didn't fire
    if (dataChannels.has(peerId)) {
        // console.log(`Removing data channel reference for closed peer ${peerId}`);
        dataChannels.delete(peerId);
    }
}

/**
 * Cleans up all WebRTC peer connections, data channels, and disconnects the socket.
 * Resets internal state variables.
 */
function cleanup(): void {
    console.log('Performing full WebRTC and Socket cleanup...');
    // Close all active peer connections
    peers.forEach((pc, peerId) => {
        closePeerConnection(peerId); // Use helper to ensure proper closure
    });
    // Clear maps (should be empty after closing PCs, but belt-and-suspenders)
    peers.clear();
    dataChannels.clear();

    // Remove all socket listeners and disconnect
    if (socket) {
        console.log('Removing socket listeners and disconnecting socket...');
        socket.removeAllListeners(); // Remove all listeners for safety
        if (socket.connected) {
             socket.disconnect(); // Disconnect if connected
        }
        socket = null; // Release the socket object
    }

    // Reset state flags and user info
    _isConnected = false;
    // Keep localUserId/localUsername if disconnect might be temporary?
    // For full cleanup, reset them:
    // localUserId = null;
    // localUsername = null;

    console.log('Cleanup complete.');
}

// --- Debugging ---
// Expose minimal state for debugging in browser console (use with caution)
if (typeof window !== 'undefined') {
  // @ts-ignore
  window.ghostline_debug = {
    getPeers: () => Array.from(peers.keys()),
    getDataChannels: () => Array.from(dataChannels.keys()).map(id => ({ id, state: dataChannels.get(id)?.readyState })),
    getSocket: () => socket,
    isConnected: () => isConnected(),
    getLocalUserId: () => localUserId,
    getLocalUsername: () => localUsername,
    forceDisconnect: () => disconnect(),
  };
}
