// src/lib/webrtc.ts
'use client'; // Mark as client component as it uses browser APIs and interacts with UI state

import io, { Socket } from 'socket.io-client';
import type { UserType, MessageType } from '@/app/page';

// --- Configuration ---
// Default signaling server URL (can be overridden by environment variable)
const DEFAULT_SIGNALING_URL = 'http://localhost:3001';
const SIGNALING_SERVER_URL = process.env.NEXT_PUBLIC_SIGNALING_SERVER_URL || DEFAULT_SIGNALING_URL;

// Log the URL being used for debugging connection issues
console.log(`Using signaling server URL: ${SIGNALING_SERVER_URL}`);


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
    // Check both the internal flag and the socket's actual connected status
    return _isConnected && socket?.connected === true;
}

/**
* Performs cleanup of all WebRTC and Socket.IO resources.
* Safe to call multiple times.
*/
export function cleanup(): void { // Export cleanup for use in page component
    console.log('Performing full WebRTC and Socket cleanup...');

    // Close all active peer connections (this will also trigger data channel closure)
    // Iterate over a copy of keys to avoid issues while modifying the map
    const peerIds = Array.from(peers.keys());
    peerIds.forEach(peerId => {
        closePeerConnection(peerId);
    });

    // Ensure maps are empty after closing PCs
    if (peers.size > 0 || dataChannels.size > 0) {
        console.warn(`Maps not empty after cleanup loop: Peers=${peers.size}, DCs=${dataChannels.size}. Forcing clear.`);
        peers.clear();
        dataChannels.clear();
    }

    // Remove all socket listeners and disconnect
    if (socket) {
        const currentSocket = socket; // Capture ref in case socket is reassigned during async ops
        console.log('Removing socket listeners and disconnecting socket...');
        currentSocket.removeAllListeners(); // Remove all listeners for safety
        if (currentSocket.connected) {
             currentSocket.disconnect(); // Disconnect if connected
        }
        // Only nullify if it's the currently active socket instance
        if (socket === currentSocket) {
             socket = null; // Release the socket object reference
        }
    }

    // Reset state flags, but potentially keep user info if reconnect is desired
     _isConnected = false;
    // localUserId = null; // Reset if needed
    // localUsername = null; // Reset if needed

    console.log('Cleanup complete.');
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
     // This promise primarily signals the *initial* successful connection setup intent.
     // Actual connection status and errors are handled via callbacks.
     return new Promise((resolve, reject) => {
        if (_isConnected || socket?.connected) {
            console.warn('Attempted to connect when already connected or connecting.');
            if (_isConnected) {
                 resolve(); // Already connected, resolve immediately
                 return; // Prevent further execution
            } else {
                console.warn("Inconsistent state: socket connected but _isConnected is false. Forcing cleanup.");
                cleanup(); // Force cleanup and let the new connection attempt proceed
            }
            // Allow the connection attempt to proceed even if warning was logged.
        }
        // If socket instance exists but isn't connected/consistent, clean it up first.
        if (socket && (!_isConnected || !socket.connected)) {
             console.warn('Socket instance exists but not connected/consistent. Cleaning up previous instance before new attempt.');
             cleanup(); // Ensure clean state
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
                transports: ['websocket', 'polling'],
                // query: { userId: localUserId } // Send userId in query if server expects it
            });
        } catch (error: any) {
            console.error("Error creating Socket.IO client:", error);
            const initErrorMsg = `Initialization failed: ${error.message}`;
            onErrorCallback(initErrorMsg);
            cleanup(); // Ensure cleanup if io() throws
            reject(new Error(initErrorMsg)); // Reject the promise for initialization errors
            return;
        }


        // --- Socket Event Handlers ---
        socket.on('connect', () => {
            console.log('Successfully connected to signaling server with socket ID:', socket?.id);
            _isConnected = true;
            socket?.emit('join', { userId: localUserId, username: localUsername });
            onConnectedCallback(); // Notify the UI component
            resolve(); // Resolve the promise on successful connection
        });

        socket.on('connect_error', (error) => {
            console.error('Signaling server connection error:', error.message, error); // Log full error object
            // Provide a more user-friendly error message for the UI callback
            let errorMessage = `Failed to connect to signaling server (${SIGNALING_SERVER_URL}). `;
            // Check for common causes and create specific messages
             if (error.message.includes('xhr poll error') || error.message.includes('timeout') || error.message.includes('transport close')) {
                 errorMessage += 'Connection timeout or polling error. Check server status and CORS.';
             } else if (error.message.includes('websocket error')) {
                 errorMessage += 'WebSocket connection failed. Check **signaling server logs** and network/firewall settings.'; // Keep hint
             } else if (error.message.includes('Connection refused')) {
                 errorMessage += 'Connection refused. Ensure the server is running and accessible.';
             } else {
                errorMessage += `Details: ${error.message}.`;
            }
            onErrorCallback(errorMessage); // Inform the UI/user
            cleanup(); // Clean up resources on failure
            // *** IMPORTANT: Do NOT reject the promise here ***
            // Let the calling code know via the onError callback and state change.
            // Rejecting here leads to unhandled promise rejections in the UI component's async join handler.
            // Instead of rejecting, we might resolve or do nothing, relying on the error callback
            // to signal failure to the UI layer. Let's resolve to fulfill the promise contract,
            // but the UI should check the connectionStatus state set by onErrorCallback.
            resolve(); // Fulfill promise, but error is signaled via callback
        });

         socket.on('disconnect', (reason, description) => {
            console.log('Disconnected from signaling server. Reason:', reason, description || '');
             const wasConnected = _isConnected; // Check state *before* cleanup
             _isConnected = false; // Update state immediately

             // Only call error callback for *unexpected* disconnects while we thought we were connected
             if (wasConnected && reason !== 'io client disconnect') { // "io client disconnect" is triggered by calling disconnect() locally
                let errorReason = reason;
                 if (reason === 'transport close') errorReason = 'Connection lost (transport closed)';
                 else if (reason === 'ping timeout') errorReason = 'Connection timed out (ping timeout)';
                 else if (reason === 'io server disconnect') errorReason = 'Server disconnected you';
                // Pass a user-friendly error message
                 onErrorCallback(`Lost connection to signaling server: ${errorReason}. Check server status.`);
             }
             // Ensure cleanup happens regardless of the reason
             cleanup();
             // Notify the UI of disconnection, allowing it to reset state.
             // This is important even for expected disconnects.
             onDisconnectedCallback();
         });

        socket.on('online-users', (users: UserType[]) => {
            if (!_isConnected) {
                 console.warn("Received 'online-users' but not connected. Ignoring.");
                 return;
            }
            console.log('Received online users:', users);
            onUserListUpdateCallback(users); // Update the UI list
            // Filter out self before processing
            const otherUsers = users.filter(user => user.id !== localUserId);

            // Initiate connections to new users not already peered
             otherUsers.forEach(user => {
                 if (!peers.has(user.id) && !dataChannels.has(user.id)) {
                     console.log(`New user detected: ${user.name} (${user.id}). Initiating peer connection.`);
                     createPeerConnection(user.id, true);
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
            if (!_isConnected) return;
            const { senderId, senderName, offer } = data;
             if (senderId === localUserId) return;

            console.log(`Received offer from ${senderName} (${senderId})`);
             try {
                const pc = createPeerConnection(senderId, false);
                 await pc.setRemoteDescription(new RTCSessionDescription(offer));
                 console.log(`Set remote description (offer) from ${senderId}`);
                 const answer = await pc.createAnswer();
                 await pc.setLocalDescription(answer);
                 console.log(`Created and set local description (answer) for ${senderId}`);
                 socket?.emit('answer', { targetId: senderId, answer: pc.localDescription });
                 console.log(`Sent answer to ${senderId}`);
             } catch (error: any) {
                 console.error(`Error handling offer from ${senderId}:`, error);
                 onErrorCallback(`Error processing offer from ${senderName}: ${error.message}`);
                 closePeerConnection(senderId);
             }
        });

        // Handle incoming WebRTC answers
        socket.on('answer', async (data: { senderId: string; answer: RTCSessionDescriptionInit }) => {
             if (!_isConnected) return;
            const { senderId, answer } = data;
             if (senderId === localUserId) return;

            console.log(`Received answer from ${senderId}`);
            const pc = peers.get(senderId);

            if (pc && pc.signalingState === 'have-local-offer') {
                 try {
                     await pc.setRemoteDescription(new RTCSessionDescription(answer));
                     console.log(`Set remote description (answer) from ${senderId}`);
                 } catch (error: any) {
                     console.error(`Error setting remote description (answer) from ${senderId}:`, error);
                     onErrorCallback(`Error processing answer from peer: ${error.message}`);
                     closePeerConnection(senderId);
                 }
            } else {
                console.warn(`Received answer from ${senderId}, but peer connection not found or in unexpected state: ${pc?.signalingState}`);
                 if (pc) {
                     onErrorCallback(`Received unexpected answer from a peer (state: ${pc.signalingState}).`);
                     closePeerConnection(senderId);
                 }
            }
        });

        // Handle incoming ICE candidates
        socket.on('ice-candidate', async (data: { senderId: string; candidate: RTCIceCandidateInit | null }) => {
             if (!_isConnected) return;
            const { senderId, candidate } = data;
             if (senderId === localUserId) return;

            const pc = peers.get(senderId);
            if (pc) {
                 if (['closed', 'failed', 'disconnected'].includes(pc.connectionState)) {
                     console.warn(`Ignoring ICE candidate from ${senderId} because connection state is ${pc.connectionState}`);
                     return;
                 }

                 if (candidate) {
                     try {
                         await pc.addIceCandidate(new RTCIceCandidate(candidate));
                     } catch (error: any) {
                         if (!error.message.includes("Error processing ICE candidate") && !error.message.includes("remote description")) {
                             console.error(`Error adding ICE candidate from ${senderId}:`, error);
                             onErrorCallback(`Error processing network candidate from peer: ${error.message}`);
                         }
                     }
                 }
            } else {
                console.warn(`Received ICE candidate from ${senderId}, but no matching peer connection found.`);
            }
        });

        // Handle potential generic socket errors
        socket.on('error', (error) => {
            console.error('Generic Socket error:', error);
            if (_isConnected) {
                 onErrorCallback(`Signaling server communication error: ${error.message || error}. Check server logs.`);
                 cleanup(); // Be safe and cleanup on unknown errors
                 onDisconnectedCallback(); // Ensure UI resets
            }
        });
    });
}

/**
 * Disconnects from the signaling server and closes all peer connections.
 * This is the function the UI should call when the user explicitly leaves.
 */
export function disconnect(): Promise<void> {
     return new Promise((resolve) => {
         console.log('User initiated disconnect...');
         if (!socket && !_isConnected) {
             console.warn('Disconnect called but not connected.');
             resolve();
             return;
         }
         const wasConnected = _isConnected;
         _isConnected = false;
         cleanup();

         if (wasConnected) {
              onDisconnectedCallback();
         }
         resolve();
     });
}

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
         console.warn('Cannot broadcast message: Not connected to signaling/peers.');
         onErrorCallback('Cannot send message: not connected.');
         return;
     }
    console.log('Attempting to broadcast message:', messageText);

    const message: MessageType = {
        id: `msg-${Date.now()}-${localUserId}`,
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
            } catch (error: any) {
                console.error(`Failed to send broadcast message to ${peerId}:`, error);
                onErrorCallback(`Failed to send message to a peer: ${error.message}`);
            }
        } else {
            console.warn(`Data channel with peer ${peerId} not open for broadcast. State: ${dc.readyState}`);
            if (dc.readyState === 'closed' || dc.readyState === 'closing') {
                 dataChannels.delete(peerId);
                 if (!peers.has(peerId)) {
                     // console.log(`Cleaned up closed data channel ref for ${peerId}`);
                 } else {
                     console.warn(`Data channel closed for ${peerId} but peer connection exists.`);
                 }
            }
        }
    });

    if (!sentToAnyPeer && dataChannels.size > 0) {
        console.warn('Broadcast attempted, but no data channels were open.');
        onErrorCallback('Could not send message: no active peer connections.');
    } else if (dataChannels.size === 0) {
        console.log("No peers connected to broadcast the message to.");
    } else if (sentToAnyPeer) {
        console.log("Broadcast message sent to open channels.");
    }
}


// --- Internal Helper Functions ---

/**
 * Creates or retrieves an RTCPeerConnection for a given peer.
 * Sets up all necessary event handlers for the peer connection.
 * Ensures connection is not made to self.
 * @param peerId The ID of the peer to connect to.
 * @param isInitiator True if the local client is initiating the connection (sending offer).
 * @returns The created or existing RTCPeerConnection.
 * @throws {Error} if attempting to connect to self or if state is inconsistent.
 */
function createPeerConnection(peerId: string, isInitiator: boolean): RTCPeerConnection {
     if (peerId === localUserId) {
         console.error("Attempted to create peer connection with self.");
         throw new Error("Cannot create peer connection with self.");
     }

    if (peers.has(peerId) || dataChannels.has(peerId)) {
        console.log(`Connection logic already initiated or complete for ${peerId}. Retrieving existing PC or returning.`);
        const existingPc = peers.get(peerId);
        if (existingPc) {
            return existingPc;
        } else {
             console.warn(`Data channel exists for ${peerId}, but peer connection reference is missing. Potential race condition.`);
             // Do not throw error, attempt to recreate PC gracefully
             peers.delete(peerId); // Clean up potential inconsistent state
             dataChannels.delete(peerId); // Clean up potential inconsistent state
             console.log(`Cleaned potentially inconsistent state for ${peerId}. Proceeding with new PC creation.`);
        }
    }


    console.log(`Creating ${isInitiator ? 'initiating' : 'receiving'} peer connection with ${peerId}`);
    const pc = new RTCPeerConnection(iceConfiguration);
    peers.set(peerId, pc); // Add *before* setting up listeners to handle potential races

    // --- PeerConnection Event Handlers ---

    pc.onicecandidate = (event) => {
        if (!socket || !socket.connected) {
             console.warn(`Socket not connected. Cannot send ICE candidate to ${peerId}.`);
             return;
        }
        if (event.candidate) {
            socket?.emit('ice-candidate', { targetId: peerId, candidate: event.candidate });
        } else {
             socket?.emit('ice-candidate', { targetId: peerId, candidate: null });
        }
    };

    pc.onicegatheringstatechange = () => {
         // console.log(`ICE gathering state change for ${peerId}: ${pc.iceGatheringState}`);
    };

    pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        console.log(`Peer connection state with ${peerId}: ${state}`);
        switch (state) {
            case 'connected':
                console.log(`WebRTC connection established with peer ${peerId}`);
                // Ensure data channel is open or opening
                 const dc = dataChannels.get(peerId);
                 if (dc && dc.readyState !== 'open') {
                     console.warn(`Peer connected, but data channel state is ${dc.readyState}. Waiting for 'open'.`);
                 } else if (!dc) {
                     console.warn(`Peer connected, but no data channel found for ${peerId}. Should have been created/received.`);
                 }
                break;
            case 'failed':
                console.error(`WebRTC connection with ${peerId} failed.`);
                onErrorCallback(`Connection attempt with a peer failed. Check network or STUN/TURN.`); // Simplified error
                closePeerConnection(peerId);
                break;
            case 'disconnected':
                console.warn(`WebRTC connection with peer ${peerId} disconnected. Might recover...`);
                 onErrorCallback(`Connection with a peer was interrupted.`);
                 closePeerConnection(peerId); // Close proactively
                break;
            case 'closed':
                console.log(`WebRTC connection with ${peerId} closed.`);
                closePeerConnection(peerId); // Ensure cleanup here too
                break;
             case 'connecting':
                 console.log(`WebRTC connection with ${peerId} is connecting...`);
                break;
             case 'new':
                 console.log(`WebRTC connection with ${peerId} is new.`);
                break;
             default:
                 console.log(`Unhandled peer connection state with ${peerId}: ${state}`);
                break;
        }
    };

     pc.onsignalingstatechange = () => {
         // console.log(`Signaling state change for ${peerId}: ${pc.signalingState}`);
     };

    // --- Data Channel Setup ---
    if (isInitiator) {
        console.log(`Creating data channel 'chat' to ${peerId}`);
        try {
             const dc = pc.createDataChannel('chat', { negotiated: false });
             setupDataChannel(dc, peerId);
             dataChannels.set(peerId, dc);

             pc.createOffer()
                 .then(offer => pc.setLocalDescription(offer))
                 .then(() => {
                      if (!socket || !socket.connected) {
                         console.warn(`Socket disconnected before offer could be sent to ${peerId}.`);
                         throw new Error("Signaling channel unavailable.");
                      }
                     console.log(`Sending offer to ${peerId}`);
                     socket?.emit('offer', {
                         targetId: peerId,
                         senderName: localUsername, // Send local username
                         offer: pc.localDescription
                     });
                 })
                 .catch(error => {
                     console.error(`Error creating or sending offer for ${peerId}:`, error);
                     onErrorCallback(`Error initiating peer connection: ${error.message}`);
                     closePeerConnection(peerId);
                 });
         } catch (error: any) {
             console.error(`Error creating data channel for ${peerId}:`, error);
             onErrorCallback(`Failed to create data channel: ${error.message}`);
             closePeerConnection(peerId);
         }
    } else {
        pc.ondatachannel = (event) => {
            console.log(`Data channel '${event.channel.label}' received from ${peerId}`);
             if (event.channel.label === 'chat') {
                 const dc = event.channel;
                 setupDataChannel(dc, peerId);
                 if (!dataChannels.has(peerId)) {
                    dataChannels.set(peerId, dc);
                 } else {
                    console.warn(`Duplicate datachannel event for ${peerId}. Re-using existing.`);
                    // Ensure setup is run on the original DC as well, just in case
                     setupDataChannel(dataChannels.get(peerId)!, peerId);
                 }
            } else {
                console.warn(`Received unexpected data channel from ${peerId}: ${event.channel.label}`);
            }
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
    // Remove previous listeners if setting up again (e.g., due to race conditions)
    dc.onopen = null;
    dc.onclose = null;
    dc.onerror = null;
    dc.onmessage = null;

    if (dc.readyState !== 'connecting' && dc.readyState !== 'open') {
         console.warn(`Setting up data channel for ${peerId} in unexpected state: ${dc.readyState}`);
         if (dc.readyState === 'closed' || dc.readyState === 'closing') return;
    }

    dc.onopen = () => {
        console.log(`Data channel with ${peerId} is open (state: ${dc.readyState}).`);
        const pcState = peers.get(peerId)?.connectionState;
        if (pcState !== 'connected') {
            console.warn(`Data channel open for ${peerId}, but PC state is ${pcState}.`);
        }
    };

    dc.onclose = () => {
        console.log(`Data channel with ${peerId} closed (state: ${dc.readyState}).`);
        dataChannels.delete(peerId);
        const pc = peers.get(peerId);
        if (pc && pc.connectionState !== 'closed' && pc.connectionState !== 'failed') {
             console.warn(`Data channel closed for ${peerId}, but peer connection state is still ${pc.connectionState}. Closing PC.`);
             closePeerConnection(peerId);
        } else {
             console.log(`Data channel closed for ${peerId}. Peer connection already closed or failed.`);
        }
    };

    dc.onerror = (errorEvent) => {
        const error = (errorEvent as any).error;
        console.error(`Data channel error with ${peerId}:`, error?.message || errorEvent);
        onErrorCallback(`Network data channel error with peer: ${error?.message || 'Unknown error'}`);
        // Consider closing the connection on data channel errors
        // closePeerConnection(peerId);
    };


    dc.onmessage = (event) => {
        try {
            if (typeof event.data !== 'string') {
                 console.warn(`Received non-string message from ${peerId}: Type ${typeof event.data}`);
                 return;
            }
            const message = JSON.parse(event.data) as MessageType;

            if (message && message.id && message.senderId && message.senderName && message.text && message.timestamp) {
                if (message.senderId === localUserId) {
                    console.warn("Ignoring message received from self.");
                    return;
                }
                console.log(`Parsed message received from ${message.senderName} (${peerId}): "${message.text}"`);
                onMessageReceivedCallback(message);
            } else {
                console.warn(`Received malformed message object from ${peerId}:`, event.data);
                 onErrorCallback(`Received unreadable message from a peer.`);
            }
        } catch (e: any) {
            console.error(`Failed to parse JSON message from ${peerId}. Data:`, event.data, 'Error:', e);
            onErrorCallback(`Received invalid message format from a peer.`);
        }
    };
}

/**
 * Closes the peer connection and removes associated data channel and peer references.
 * Safe to call multiple times.
 * @param peerId The ID of the peer whose connection should be closed.
 */
function closePeerConnection(peerId: string): void {
    const pc = peers.get(peerId);
    const dc = dataChannels.get(peerId);

    if (dc && dc.readyState !== 'closed' && dc.readyState !== 'closing') {
        console.log(`Closing data channel with ${peerId} (State: ${dc.readyState})`);
        dc.close();
    }
    dataChannels.delete(peerId);

    if (pc) {
        if (pc.connectionState !== 'closed' && pc.connectionState !== 'failed') {
             console.log(`Closing peer connection with ${peerId} (State: ${pc.connectionState})`);
             pc.close();
        }
        peers.delete(peerId);
    } else {
        // If PC ref is missing but DC existed, log it.
        if (dc) console.warn(`Closed lingering data channel for ${peerId}, but PeerConnection reference was already removed.`);
    }
}


// --- Debugging ---
// Expose minimal state for debugging in browser console (use with caution)
if (typeof window !== 'undefined') {
  // @ts-ignore Assign to window for easy access
  window.ghostline_debug = {
    getPeers: () => Array.from(peers.keys()).map(id => ({ id, state: peers.get(id)?.connectionState, signalingState: peers.get(id)?.signalingState })),
    getDataChannels: () => Array.from(dataChannels.keys()).map(id => ({ id, state: dataChannels.get(id)?.readyState, label: dataChannels.get(id)?.label })),
    getSocket: () => socket,
    isConnected: () => isConnected(),
    getInternalConnectedFlag: () => _isConnected,
    getLocalUserId: () => localUserId,
    getLocalUsername: () => localUsername,
    forceDisconnect: () => disconnect(),
    forceCleanup: () => cleanup(),
     forceConnectAttempt: (id: string, name: string) => {
         console.log("DEBUG: Forcing connect attempt...");
         connect(id, name, {
             onConnected: () => console.log("DEBUG: Connected"),
             onDisconnected: () => console.log("DEBUG: Disconnected"),
             onUserListUpdate: (u) => console.log("DEBUG: Users:", u),
             onMessageReceived: (m) => console.log("DEBUG: Message:", m),
             onError: (e) => console.error("DEBUG: Error:", e),
         }).catch(err => console.error("DEBUG: Connect promise rejected:", err));
     }
  };
}
