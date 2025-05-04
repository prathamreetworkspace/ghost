// src/lib/webrtc.ts
'use client'; // Mark as client component as it uses browser APIs and interacts with UI state

import io, { Socket } from 'socket.io-client';
import type { UserType, MessageType } from '@/app/page';

// --- Configuration ---
// Replace with your actual signaling server URL
// For local development, if your signaling server runs on port 3001:
const SIGNALING_SERVER_URL = process.env.NEXT_PUBLIC_SIGNALING_SERVER_URL || 'http://localhost:3001';

const iceConfiguration: RTCConfiguration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        // Add TURN servers here if needed for NAT traversal issues
        // {
        //   urls: 'turn:your.turn.server.com',
        //   username: 'user',
        //   credential: 'password'
        // }
    ]
};

// --- State Variables ---
let socket: Socket | null = null;
let localUserId: string | null = null;
let localUsername: string | null = null;
let isConnected = false;
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
        if (isConnected || socket?.connected) {
            console.warn('Already connected or connecting.');
            resolve();
            return;
        }

        console.log('Connecting to signaling server...');
        localUserId = userId;
        localUsername = username;

        // Set callbacks
        onConnectedCallback = callbacks.onConnected;
        onDisconnectedCallback = callbacks.onDisconnected;
        onUserListUpdateCallback = callbacks.onUserListUpdate;
        onMessageReceivedCallback = callbacks.onMessageReceived;
        onErrorCallback = callbacks.onError;


        socket = io(SIGNALING_SERVER_URL, {
             reconnectionAttempts: 3,
             timeout: 10000,
        });

        // --- Socket Event Handlers ---
        socket.on('connect', () => {
            console.log('Connected to signaling server with socket ID:', socket?.id);
            isConnected = true;
            socket?.emit('join', { userId: localUserId, username: localUsername });
            onConnectedCallback();
             resolve(); // Resolve the promise on successful connection
        });

        socket.on('connect_error', (error) => {
            console.error('Signaling server connection error:', error);
            onErrorCallback(`Failed to connect to signaling server: ${error.message}`);
            cleanup();
            reject(error); // Reject the promise on connection error
        });

         socket.on('disconnect', (reason) => {
            console.log('Disconnected from signaling server:', reason);
            onErrorCallback(`Disconnected: ${reason}. Attempting to reconnect...`);
            cleanup(); // Clean up peers on disconnect
            // The onDisconnectedCallback should be called by the UI when it *initiates* the disconnect,
            // or potentially here if the disconnection was unexpected.
             // For now, let the UI handle calling onDisconnectedCallback via the disconnect() function.
         });

        socket.on('online-users', (users: UserType[]) => {
            console.log('Received online users:', users);
            onUserListUpdateCallback(users);
            // Initiate connections to new users (avoid connecting to self)
             users.forEach(user => {
                 if (user.id !== localUserId && !peers.has(user.id)) {
                     console.log(`Found new user ${user.name} (${user.id}), initiating connection.`);
                     createPeerConnection(user.id, true); // true: we are the initiator
                 }
             });
             // Clean up connections for users who are no longer online
             const onlineUserIds = new Set(users.map(u => u.id));
             peers.forEach((_, peerId) => {
                 if (!onlineUserIds.has(peerId) && peerId !== localUserId) {
                     console.log(`User ${peerId} is no longer online. Closing connection.`);
                     closePeerConnection(peerId);
                 }
             });
        });

        socket.on('offer', async (data: { senderId: string; senderName: string; offer: RTCSessionDescriptionInit }) => {
            const { senderId, senderName, offer } = data;
             if (senderId === localUserId) return; // Ignore offers from self

            console.log(`Received offer from ${senderName} (${senderId})`);
             // Ensure peer connection exists (create if receiving offer first)
            const pc = createPeerConnection(senderId, false); // false: we are receiving offer

             try {
                 await pc.setRemoteDescription(new RTCSessionDescription(offer));
                 console.log(`Set remote description for offer from ${senderId}`);
                 const answer = await pc.createAnswer();
                 await pc.setLocalDescription(answer);
                 console.log(`Created and set local answer for ${senderId}`);
                 socket?.emit('answer', { targetId: senderId, answer: pc.localDescription });
                 console.log(`Sent answer to ${senderId}`);
             } catch (error) {
                 console.error(`Error handling offer from ${senderId}:`, error);
                 onErrorCallback(`Error handling offer from ${senderName}: ${error}`);
             }

        });

        socket.on('answer', async (data: { senderId: string; answer: RTCSessionDescriptionInit }) => {
            const { senderId, answer } = data;
             if (senderId === localUserId) return;

            console.log(`Received answer from ${senderId}`);
            const pc = peers.get(senderId);
            if (pc && pc.signalingState === 'have-local-offer') { // Check state before setting remote answer
                 try {
                     await pc.setRemoteDescription(new RTCSessionDescription(answer));
                     console.log(`Set remote description for answer from ${senderId}`);
                 } catch (error) {
                     console.error(`Error setting remote description for answer from ${senderId}:`, error);
                     onErrorCallback(`Error processing answer from peer: ${error}`);
                 }
            } else {
                console.warn(`Received answer from ${senderId}, but no matching peer connection found or state is invalid (${pc?.signalingState})`);
            }
        });

        socket.on('ice-candidate', async (data: { senderId: string; candidate: RTCIceCandidateInit | null }) => {
            const { senderId, candidate } = data;
             if (senderId === localUserId) return;

            const pc = peers.get(senderId);
            if (pc && candidate) {
                 try {
                     // Add candidate only if remote description is set
                     if (pc.remoteDescription) {
                         await pc.addIceCandidate(new RTCIceCandidate(candidate));
                         // console.log(`Added ICE candidate from ${senderId}`);
                     } else {
                         console.warn(`Received ICE candidate from ${senderId} before remote description was set. Queueing is not implemented, candidate might be lost.`);
                         // TODO: Implement queueing if necessary, though often candidates arrive after description
                     }
                 } catch (error) {
                     // Ignore benign errors like candidate already added or invalid state
                     if (!error.message.includes("Error processing ICE candidate")) {
                         console.error(`Error adding ICE candidate from ${senderId}:`, error);
                     }
                 }
            } else if (!candidate) {
                 // console.log(`Received end-of-candidates signal from ${senderId}`);
            } else {
                console.warn(`Received ICE candidate from ${senderId}, but no matching peer connection found.`);
            }
        });
    });
}

/**
 * Disconnects from the signaling server and closes all peer connections.
 */
export function disconnect(): void {
    console.log('Disconnecting...');
    if (!socket) {
        console.warn('Not connected.');
        return;
    }
    cleanup();
    onDisconnectedCallback(); // Notify the UI immediately
    isConnected = false;
    localUserId = null;
    localUsername = null;
}

/**
 * Sends a message to a specific peer.
 */
export function sendMessageToPeer(peerId: string, messageText: string): void {
    if (!localUserId || !localUsername) {
        console.error('Cannot send message: not connected.');
        onErrorCallback('Cannot send message: not connected.');
        return;
    }

    const dc = dataChannels.get(peerId);
    const message: MessageType = {
        id: `msg-${Date.now()}-${localUserId}`,
        senderId: localUserId,
        senderName: localUsername,
        text: messageText,
        timestamp: Date.now(),
    };

    if (dc && dc.readyState === 'open') {
        try {
            dc.send(JSON.stringify(message));
            console.log(`Message sent to ${peerId}:`, messageText);
            // The UI should handle adding the *sent* message to its local state
        } catch (error) {
            console.error(`Failed to send message to ${peerId}:`, error);
            onErrorCallback(`Failed to send message to peer: ${error}`);
        }
    } else {
        console.warn(`Data channel with peer ${peerId} not open or doesn't exist. State: ${dc?.readyState}`);
        onErrorCallback(`Cannot send message: connection to peer is not open.`);
    }
}

/**
 * Sends a message to all connected peers.
 */
export function broadcastMessage(messageText: string): void {
    if (!localUserId || !localUsername) {
        console.error('Cannot broadcast message: not connected.');
        onErrorCallback('Cannot broadcast message: not connected.');
        return;
    }
    console.log('Broadcasting message:', messageText);

     const message: MessageType = {
        id: `msg-${Date.now()}-${localUserId}`,
        senderId: localUserId,
        senderName: localUsername,
        text: messageText,
        timestamp: Date.now(),
    };

    let sentToAny = false;
    dataChannels.forEach((dc, peerId) => {
        if (dc.readyState === 'open') {
            try {
                dc.send(JSON.stringify(message));
                sentToAny = true;
                 // console.log(`Broadcast message sent to ${peerId}`);
            } catch (error) {
                console.error(`Failed to broadcast message to ${peerId}:`, error);
            }
        } else {
             console.warn(`Data channel with peer ${peerId} not open for broadcast. State: ${dc?.readyState}`);
        }
    });

    if (!sentToAny && dataChannels.size > 0) {
        onErrorCallback('Could not send message: no connections currently open.');
    } else if (dataChannels.size === 0) {
         console.log("No peers connected to broadcast to.");
         // Optionally notify user they are alone?
    } else {
         console.log("Broadcast attempt finished.");
    }
     // The UI should handle adding the *sent* message to its local state
}


// --- Internal Helper Functions ---

/**
 * Creates or retrieves an RTCPeerConnection for a given peer.
 * @param peerId The ID of the peer to connect to.
 * @param isInitiator True if the local client is initiating the connection (sending offer).
 */
function createPeerConnection(peerId: string, isInitiator: boolean): RTCPeerConnection {
    if (peers.has(peerId)) {
        // console.log(`Peer connection with ${peerId} already exists.`);
        return peers.get(peerId)!;
    }
     if (peerId === localUserId) {
         throw new Error("Attempted to create peer connection with self.");
     }

    console.log(`Creating ${isInitiator ? 'initiating' : 'receiving'} peer connection with ${peerId}`);
    const pc = new RTCPeerConnection(iceConfiguration);
    peers.set(peerId, pc);

    // --- PeerConnection Event Handlers ---
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            // console.log(`Sending ICE candidate to ${peerId}`);
            socket?.emit('ice-candidate', { targetId: peerId, candidate: event.candidate });
        } else {
            // console.log(`All ICE candidates sent for ${peerId}`);
             socket?.emit('ice-candidate', { targetId: peerId, candidate: null }); // Signal end of candidates
        }
    };

    pc.onicegatheringstatechange = () => {
         // console.log(`ICE gathering state change for ${peerId}: ${pc.iceGatheringState}`);
    };

    pc.onconnectionstatechange = () => {
        console.log(`Connection state with ${peerId}: ${pc.connectionState}`);
        switch (pc.connectionState) {
            case 'connected':
                console.log(`Successfully connected with peer ${peerId}`);
                // Data channel should be open or opening soon
                break;
             case 'failed':
                console.error(`Connection with ${peerId} failed.`);
                 onErrorCallback(`Connection to peer failed.`);
                 // Attempt to restart ICE? Often better to just close and retry.
                 closePeerConnection(peerId);
                 // Maybe try reconnecting after a delay?
                 setTimeout(() => {
                     if (socket?.connected && !peers.has(peerId)) { // Check if still connected to signaling
                         console.log(`Attempting to reconnect to ${peerId}...`);
                         createPeerConnection(peerId, true); // Try initiating again
                     }
                 }, 5000); // 5 second delay before retry
                break;
            case 'disconnected':
                console.warn(`Peer ${peerId} disconnected. Connection might recover...`);
                 onErrorCallback(`Peer disconnected. Trying to re-establish...`);
                 // Browsers might automatically try to reconnect. If not, close and retry.
                break;
            case 'closed':
                console.log(`Connection with ${peerId} closed.`);
                // Ensure cleanup happens if not already triggered
                closePeerConnection(peerId);
                break;
        }
    };

     pc.onsignalingstatechange = () => {
         // console.log(`Signaling state change for ${peerId}: ${pc.signalingState}`);
     };

    // --- Data Channel Setup ---
    if (isInitiator) {
        // Create the data channel
        console.log(`Creating data channel 'chat' for ${peerId}`);
        const dc = pc.createDataChannel('chat', { negotiated: false }); // Use built-in negotiation
        setupDataChannel(dc, peerId);
        dataChannels.set(peerId, dc);

         // Create and send offer after setting up handlers
         pc.createOffer()
             .then(offer => pc.setLocalDescription(offer))
             .then(() => {
                 console.log(`Sending offer to ${peerId}`);
                 socket?.emit('offer', { targetId: peerId, offer: pc.localDescription });
             })
             .catch(error => {
                 console.error(`Error creating offer for ${peerId}:`, error);
                 onErrorCallback(`Error initiating connection: ${error}`);
                 closePeerConnection(peerId); // Clean up failed attempt
             });

    } else {
        // Wait for the remote peer to create the data channel
        pc.ondatachannel = (event) => {
            console.log(`Data channel 'chat' received from ${peerId}`);
            const dc = event.channel;
            setupDataChannel(dc, peerId);
            dataChannels.set(peerId, dc);
        };
    }

    return pc;
}


/**
 * Sets up standard event listeners for a data channel.
 */
function setupDataChannel(dc: RTCDataChannel, peerId: string): void {
    dc.onopen = () => {
        console.log(`Data channel with ${peerId} opened`);
        // Send a system message or ping? Optional.
        // Example: sendMessageToPeer(peerId, JSON.stringify({ type: 'system', text: 'Connection established!' }));
    };

    dc.onclose = () => {
        console.log(`Data channel with ${peerId} closed`);
        // Connection state change likely handles cleanup, but we can remove DC here
        dataChannels.delete(peerId);
    };

    dc.onerror = (error) => {
        console.error(`Data channel error with ${peerId}:`, error);
        onErrorCallback(`Data channel error with peer: ${error}`);
    };

    dc.onmessage = (event) => {
        // console.log(`Raw message received from ${peerId}:`, event.data);
        try {
            const message = JSON.parse(event.data) as MessageType;
            if (message.senderId === localUserId) {
                console.warn("Received own message back, ignoring."); // Should ideally not happen in pure P2P
                return;
            }
             // Add basic validation
            if (message && message.id && message.senderId && message.text && message.timestamp) {
                console.log(`Parsed message received from ${message.senderName} (${peerId}):`, message.text);
                onMessageReceivedCallback(message);
            } else {
                console.warn(`Received malformed message from ${peerId}:`, event.data);
            }
        } catch (e) {
            console.error(`Failed to parse message from ${peerId}:`, event.data, e);
             // Handle non-JSON messages if necessary
             // onMessageReceivedCallback({ // Treat as plain text if needed
             //     id: `raw-${Date.now()}-${peerId}`,
             //     senderId: peerId, // Might need senderName lookup
             //     senderName: `User ${peerId}`, // Placeholder
             //     text: event.data,
             //     timestamp: Date.now()
             // });
        }
    };
}

/**
 * Closes the peer connection and cleans up associated resources.
 */
function closePeerConnection(peerId: string): void {
    const pc = peers.get(peerId);
    if (pc) {
        console.log(`Closing peer connection with ${peerId}`);
        pc.close(); // This also closes the data channel
        peers.delete(peerId);
    }
    // Ensure data channel is also removed if pc.close() didn't trigger its onclose
    if (dataChannels.has(peerId)) {
        // console.log(`Removing data channel reference for ${peerId}`);
        dataChannels.delete(peerId);
    }
}

/**
 * Cleans up all connections and socket listeners.
 */
function cleanup(): void {
    console.log('Cleaning up WebRTC connections and socket...');
    peers.forEach((pc, peerId) => {
        closePeerConnection(peerId);
    });
    peers.clear();
    dataChannels.clear(); // Data channels are closed when PCs are closed

    if (socket) {
        socket.off('connect');
        socket.off('connect_error');
        socket.off('disconnect');
        socket.off('online-users');
        socket.off('offer');
        socket.off('answer');
        socket.off('ice-candidate');
        if (socket.connected) {
             socket.disconnect();
        }
        socket = null;
    }
     isConnected = false;
}

// --- Debugging ---
// Expose state for debugging purposes (use cautiously)
if (typeof window !== 'undefined') {
  // @ts-ignore
  window.webRTCState = {
    peers,
    dataChannels,
    socket,
    isConnected: () => isConnected,
    localUserId: () => localUserId,
  };
}
