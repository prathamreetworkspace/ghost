
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
     // This promise primarily signals the *initial* successful connection.
     // Subsequent errors are handled via callbacks.
     return new Promise((resolve, reject) => {
        if (_isConnected || socket?.connected) {
            console.warn('Attempted to connect when already connected or connecting.');
            // If already considered connected, resolve immediately.
            if (_isConnected) {
                 resolve();
            } else {
                // If socket thinks it's connected but our state isn't, it's weird.
                // Reject or force cleanup? For now, log and rely on potential cleanup.
                console.error("Inconsistent state: socket connected but _isConnected is false.");
                reject(new Error("Inconsistent connection state during connect attempt."));
                 cleanup(); // Force cleanup
            }
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
                // Ensure transports are appropriate, websocket preferred
                 transports: ['websocket', 'polling'],
                 // Explicitly allow upgrades
                 // upgrade: true, // This is usually true by default
                 // Add extra debugging if needed
                 // query: { userId: localUserId } // Send userId in query if server expects it
            });
        } catch (error: any) { // Added type annotation for error
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
            // Join the room with user details
            socket?.emit('join', { userId: localUserId, username: localUsername });
            onConnectedCallback(); // Notify the UI component
            resolve(); // Resolve the promise on successful connection
        });

        socket.on('connect_error', (error) => {
            console.error('Signaling server connection error:', error.message, error); // Log full error object
            // Provide a more user-friendly error message
            let errorMessage = `Failed to connect to signaling server (${SIGNALING_SERVER_URL}). `;
            // Check for common causes
             if (error.message.includes('xhr poll error') || error.message.includes('timeout') || error.message.includes('transport close')) {
                 errorMessage += 'Possible causes: Server not running, network issue, or server CORS configuration problem.';
             } else if (error.message.includes('websocket error') || error.message.includes('Connection refused')) { // Added check for ERR_CONNECTION_REFUSED
                 errorMessage += 'WebSocket connection failed. Check **signaling server logs** and network/firewall settings.'; // Enhanced message
             }
             else {
                errorMessage += `Details: ${error.message}.`;
            }
            onErrorCallback(errorMessage); // Inform the UI/user
            cleanup(); // Clean up resources on failure
            // *** Do NOT reject the promise here ***
            // Rejecting here causes unhandled rejections if the calling code doesn't
            // specifically catch async errors *after* the initial await.
            // The error state is handled by the onErrorCallback.
            // reject(new Error(errorMessage)); // REMOVED
        });

         socket.on('disconnect', (reason, description) => {
            console.log('Disconnected from signaling server. Reason:', reason, description || '');
             const wasConnected = _isConnected; // Check state *before* cleanup
             _isConnected = false; // Update state immediately

             // Only call error callback for unexpected disconnects while we thought we were connected
             if (wasConnected && reason !== 'io client disconnect') { // "io client disconnect" is triggered by calling disconnect() locally
                let errorReason = reason;
                if (reason === 'transport close') errorReason = 'Connection lost (transport closed)';
                if (reason === 'ping timeout') errorReason = 'Connection timed out';
                 if (reason === 'io server disconnect') errorReason = 'Server disconnected you'; // Added case
                onErrorCallback(`Lost connection to signaling server: ${errorReason}. Check server status and logs.`); // Added hint
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
                 // Double-check if we are already attempting/connected
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
            if (!_isConnected) return; // Ignore if not connected
            const { senderId, senderName, offer } = data;
             if (senderId === localUserId) return; // Sanity check: ignore offers from self

            console.log(`Received offer from ${senderName} (${senderId})`);
            // Ensure peer connection exists. Create if receiving offer first.
             try {
                const pc = createPeerConnection(senderId, false); // false: we are NOT the initiator

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
             if (!_isConnected) return; // Ignore if not connected
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
                 if (pc) {
                     // If PC exists but state is wrong, maybe it closed/failed?
                     onErrorCallback(`Received unexpected answer from a peer (state: ${pc.signalingState}).`);
                     closePeerConnection(senderId); // Clean up potentially broken state
                 }
            }
        });

        // Handle incoming ICE candidates
        socket.on('ice-candidate', async (data: { senderId: string; candidate: RTCIceCandidateInit | null }) => {
             if (!_isConnected) return; // Ignore if not connected
            const { senderId, candidate } = data;
             if (senderId === localUserId) return; // Ignore own candidates

            const pc = peers.get(senderId);
            if (pc) {
                 // Ignore candidates if connection is closing/closed/failed
                 if (['closed', 'failed', 'disconnected'].includes(pc.connectionState)) {
                     console.warn(`Ignoring ICE candidate from ${senderId} because connection state is ${pc.connectionState}`);
                     return;
                 }

                 if (candidate) {
                     try {
                         // Add the ICE candidate. Browsers generally handle queueing if remote description isn't set yet.
                         await pc.addIceCandidate(new RTCIceCandidate(candidate));
                         // console.log(`Added ICE candidate from ${senderId}`);
                     } catch (error: any) { // Added type annotation for error
                         // Ignore benign errors like "Error processing ICE candidate" or adding candidate before description set.
                         if (!error.message.includes("Error processing ICE candidate") && !error.message.includes("remote description")) {
                             console.error(`Error adding ICE candidate from ${senderId}:`, error);
                             onErrorCallback(`Error processing network candidate from peer: ${error.message}`);
                         } else {
                              // Log benign errors for debugging but don't spam user
                              // console.warn(`Benign error adding ICE candidate from ${senderId}: ${error.message}`);
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

        // Handle potential generic socket errors more gracefully
        socket.on('error', (error) => {
            console.error('Generic Socket error:', error);
            // Avoid redundant error messages if already handled by connect_error or disconnect
            if (_isConnected) { // Only report if we thought we were connected
                 onErrorCallback(`Signaling server communication error: ${error.message || error}. Check server logs.`); // Added hint
                 // Consider if cleanup is needed depending on the error type and state
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
export function disconnect(): Promise<void> { // Return a promise for consistency
     return new Promise((resolve) => {
         console.log('User initiated disconnect...');
         if (!socket && !_isConnected) {
             console.warn('Disconnect called but not connected.');
             resolve(); // Nothing to do
             return;
         }
         const wasConnected = _isConnected; // Capture state before cleanup
         _isConnected = false; // Set immediately to prevent race conditions
         cleanup(); // Perform all necessary cleanup

         // Only call the disconnect callback if we were actually connected,
         // prevents duplicate calls if cleanup was triggered by an error first.
         if (wasConnected) {
              onDisconnectedCallback(); // Notify the UI that disconnection is complete
         }
         resolve(); // Resolve after cleanup
     });
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
         console.warn('Cannot broadcast message: Not connected to signaling/peers.');
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
                onErrorCallback(`Failed to send message to a peer: ${error.message}`);
                // Consider closing the connection to this specific peer if send fails repeatedly?
                // closePeerConnection(peerId);
            }
        } else {
            console.warn(`Data channel with peer ${peerId} not open for broadcast. State: ${dc.readyState}`);
            // Maybe remove stale data channel refs if state is unexpected?
            if (dc.readyState === 'closed' || dc.readyState === 'closing') {
                 dataChannels.delete(peerId);
                 if (!peers.has(peerId)) { // If peer connection also gone, it's expected
                     // console.log(`Cleaned up closed data channel ref for ${peerId}`);
                 } else {
                     console.warn(`Data channel closed for ${peerId} but peer connection exists.`);
                     // Consider closing the peer connection too for consistency
                     // closePeerConnection(peerId);
                 }
            }
        }
    });

    if (!sentToAnyPeer && dataChannels.size > 0) {
        console.warn('Broadcast attempted, but no data channels were open.');
        onErrorCallback('Could not send message: no active peer connections.');
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
 * Ensures connection is not made to self.
 * @param peerId The ID of the peer to connect to.
 * @param isInitiator True if the local client is initiating the connection (sending offer).
 * @returns The created or existing RTCPeerConnection.
 * @throws {Error} if attempting to connect to self.
 */
function createPeerConnection(peerId: string, isInitiator: boolean): RTCPeerConnection {
     if (peerId === localUserId) {
         console.error("Attempted to create peer connection with self.");
         // Throw or just return null/undefined and handle upstream? Throwing is clearer.
         throw new Error("Cannot create peer connection with self.");
     }

    // Check if a connection *or* data channel already exists to prevent duplicates
    if (peers.has(peerId) || dataChannels.has(peerId)) {
        console.log(`Connection logic already initiated or complete for ${peerId}. Retrieving existing PC or returning.`);
        // Return existing PC if it exists, otherwise log that DC exists (implies PC should too or is being set up)
        const existingPc = peers.get(peerId);
        if (existingPc) {
            return existingPc;
        } else {
            // This state (DC exists but PC doesn't) should ideally not happen. Log warning.
             console.warn(`Data channel exists for ${peerId}, but peer connection reference is missing. Potential race condition.`);
             // How to recover? Maybe try closing/cleaning up DC and recreating PC? Risky.
             // For now, just log and potentially let subsequent logic fail.
             throw new Error(`Inconsistent state for peer ${peerId}: data channel exists, but PeerConnection doesn't.`);
        }
    }


    console.log(`Creating ${isInitiator ? 'initiating' : 'receiving'} peer connection with ${peerId}`);
    const pc = new RTCPeerConnection(iceConfiguration);
    peers.set(peerId, pc); // Add *before* setting up listeners to handle potential races

    // --- PeerConnection Event Handlers ---

    // Handle ICE candidates generated locally
    pc.onicecandidate = (event) => {
        // Check if socket is still valid before emitting
        if (!socket || !socket.connected) {
             console.warn(`Socket not connected. Cannot send ICE candidate to ${peerId}.`);
             return;
        }
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
        const state = pc.connectionState;
        console.log(`Peer connection state with ${peerId}: ${state}`);
        switch (state) {
            case 'connected':
                console.log(`WebRTC connection established with peer ${peerId}`);
                // Data channel should be open or opening shortly
                // Could check dc.readyState here if needed
                break;
            case 'failed':
                console.error(`WebRTC connection with ${peerId} failed.`);
                onErrorCallback(`Connection attempt with a peer failed. Check network or STUN/TURN server configuration.`); // Added hint
                closePeerConnection(peerId); // Clean up failed connection immediately
                break;
            case 'disconnected':
                // This state means connectivity is lost, but the browser might recover.
                console.warn(`WebRTC connection with peer ${peerId} disconnected. Might recover...`);
                 onErrorCallback(`Connection with a peer was interrupted.`);
                // Often, it's better to treat 'disconnected' as 'failed' and close proactively
                // unless specific recovery logic (like ICE restart) is implemented.
                // setTimeout(() => { // Add a short delay to see if it recovers
                //     if (pc.connectionState === 'disconnected') {
                //         console.warn(`Connection with ${peerId} did not recover. Closing.`);
                //         closePeerConnection(peerId);
                //     }
                // }, 5000); // 5 seconds grace period
                 // Proactive closure:
                 closePeerConnection(peerId);
                break;
            case 'closed':
                console.log(`WebRTC connection with ${peerId} closed.`);
                // Ensure cleanup is called, although closePeerConnection should handle it.
                closePeerConnection(peerId);
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

    // Monitor signaling state changes (for debugging)
     pc.onsignalingstatechange = () => {
         // console.log(`Signaling state change for ${peerId}: ${pc.signalingState}`);
     };

    // --- Data Channel Setup ---
    if (isInitiator) {
        // Initiator creates the data channel
        console.log(`Creating data channel 'chat' to ${peerId}`);
        // Use reliable, ordered delivery by default
        try {
             const dc = pc.createDataChannel('chat', { negotiated: false }); // Let browser handle negotiation
             setupDataChannel(dc, peerId); // Attach common event listeners
             dataChannels.set(peerId, dc); // Store reference *before* offer

             // Create and send offer *after* creating data channel
             pc.createOffer()
                 .then(offer => pc.setLocalDescription(offer))
                 .then(() => {
                      if (!socket || !socket.connected) {
                         console.warn(`Socket disconnected before offer could be sent to ${peerId}.`);
                         throw new Error("Signaling channel unavailable.");
                      }
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
         } catch (error: any) {
             console.error(`Error creating data channel for ${peerId}:`, error);
             onErrorCallback(`Failed to create data channel: ${error.message}`);
             closePeerConnection(peerId); // Cleanup PC if DC creation fails
         }

    } else {
        // Receiver waits for the remote peer to establish the data channel
        pc.ondatachannel = (event) => {
            console.log(`Data channel '${event.channel.label}' received from ${peerId}`);
             if (event.channel.label === 'chat') {
                 const dc = event.channel;
                 setupDataChannel(dc, peerId); // Attach common event listeners
                 // Ensure we don't overwrite an existing DC reference if somehow triggered twice
                 if (!dataChannels.has(peerId)) {
                    dataChannels.set(peerId, dc); // Store reference
                 } else {
                    console.warn(`Duplicate datachannel event for ${peerId}. Ignoring.`);
                 }
            } else {
                console.warn(`Received unexpected data channel from ${peerId}: ${event.channel.label}`);
                // Close unexpected channels?
                // event.channel.close();
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
    // Sanity check state before adding listeners
    if (dc.readyState !== 'connecting' && dc.readyState !== 'open') {
         console.warn(`Setting up data channel for ${peerId} in unexpected state: ${dc.readyState}`);
         // If closed/closing, maybe don't add listeners?
         if (dc.readyState === 'closed' || dc.readyState === 'closing') return;
    }

    dc.onopen = () => {
        console.log(`Data channel with ${peerId} is open (state: ${dc.readyState}).`);
        // Ensure PC state is also connected for full readiness
        const pcState = peers.get(peerId)?.connectionState;
        if (pcState !== 'connected') {
            console.warn(`Data channel open for ${peerId}, but PC state is ${pcState}.`);
        }
        // Optional: Send a confirmation or trigger UI update
        // Example: sendMessageToPeer(peerId, JSON.stringify({ type: 'system', text: 'Chat connection established!' }));
    };

    dc.onclose = () => {
        console.log(`Data channel with ${peerId} closed (state: ${dc.readyState}).`);
        // Remove the reference from our map
        dataChannels.delete(peerId);
        // PeerConnection state change handler should manage closing the PC itself.
        // Avoid calling closePeerConnection here unless absolutely necessary
        // to prevent potential recursive loops or premature closure.
        const pc = peers.get(peerId);
        if (pc && pc.connectionState !== 'closed' && pc.connectionState !== 'failed') {
             console.warn(`Data channel closed for ${peerId}, but peer connection state is still ${pc.connectionState}. Closing PC.`);
             // If DC closes unexpectedly, likely the PC should close too.
             closePeerConnection(peerId);
        }
    };

    dc.onerror = (errorEvent) => { // Use specific event type
        // errorEvent is an RTCErrorEvent, access error detail via errorEvent.error
        const error = (errorEvent as any).error; // Cast to any to access error property if needed
        console.error(`Data channel error with ${peerId}:`, error?.message || errorEvent);
        onErrorCallback(`Network data channel error with peer: ${error?.message || 'Unknown data channel error'}`); // Simplify message
        // Consider closing the connection on error? Depends on the error type.
        // closePeerConnection(peerId);
    };


    // Handle incoming messages on the data channel
    dc.onmessage = (event) => {
        // console.log(`Raw message received from ${peerId}:`, event.data); // Log raw data for debugging
        try {
            if (typeof event.data !== 'string') {
                 console.warn(`Received non-string message from ${peerId}: Type ${typeof event.data}`);
                 // Handle binary data if needed (e.g., ArrayBuffer, Blob)
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
 * Safe to call multiple times.
 * @param peerId The ID of the peer whose connection should be closed.
 */
function closePeerConnection(peerId: string): void {
    const pc = peers.get(peerId);
    const dc = dataChannels.get(peerId);

    // Close data channel first if it exists and isn't already closing/closed
    if (dc && dc.readyState !== 'closed' && dc.readyState !== 'closing') {
        // console.log(`Closing data channel with ${peerId} (State: ${dc.readyState})`);
        dc.close();
    }
    // Always remove the DC reference after attempting close
    dataChannels.delete(peerId);

    // Close peer connection if it exists and isn't already closing/closed
    if (pc) {
        if (pc.connectionState !== 'closed' && pc.connectionState !== 'failed') {
             console.log(`Closing peer connection with ${peerId} (State: ${pc.connectionState})`);
             // Remove listeners before closing to prevent potential late events? Sometimes needed.
             // pc.onicecandidate = null;
             // pc.onconnectionstatechange = null;
             // pc.onsignalingstatechange = null;
             // pc.ondatachannel = null;
             pc.close(); // Gracefully close the connection
        }
        // Always remove the PC reference after attempting close
        peers.delete(peerId);
    }

    // console.log(`Finished cleanup attempt for peer ${peerId}`);
}

/**
 * Cleans up all WebRTC peer connections, data channels, and disconnects the socket.
 * Resets internal state variables. Safe to call multiple times.
 */
function cleanup(): void {
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
         // Minimal callbacks for debug connect
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
