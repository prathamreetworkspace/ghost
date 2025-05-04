// src/app/page.tsx
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { User, MessageCircle, LogOut, Wifi, WifiOff, Loader } from 'lucide-react';
import { ChatInterface } from '@/components/chat-interface';
import * as WebRTC from '@/lib/webrtc'; // Import WebRTC functions

// Define DEFAULT_SIGNALING_URL here as well for the error message
const DEFAULT_SIGNALING_URL = 'http://localhost:3001';

export type UserType = {
  id: string;
  name: string;
};

export type MessageType = {
  id: string; // Unique message ID
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
};

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export default function Home() {
  const [username, setUsername] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [tempUsername, setTempUsername] = useState<string>('');
  const [onlineUsers, setOnlineUsers] = useState<UserType[]>([]);
  const [messages, setMessages] = useState<MessageType[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const { toast } = useToast();
   const isConnecting = useRef(false); // Prevent multiple connection attempts
   const lastErrorRef = useRef<string | null>(null); // Store last error message

  // --- WebRTC Event Handlers ---

  const handleConnectionSuccess = useCallback(() => {
    console.log('WebRTC handleConnectionSuccess called');
    setConnectionStatus('connected');
    isConnecting.current = false;
    lastErrorRef.current = null; // Clear last error on success
    toast({
      title: 'Connected!',
      description: `Welcome, ${username}! You are now connected via WebRTC.`,
    });
     // Add initial system message
     setMessages((prev) => [{
        id: `system-join-${Date.now()}`,
        senderId: 'system',
        senderName: 'System',
        text: `You joined as ${username}. Waiting for peers...`,
        timestamp: Date.now(),
      }, ...prev]); // Add to the beginning
  }, [toast, username]);

   const handleDisconnection = useCallback(() => {
     console.log('WebRTC handleDisconnection called');
     if (connectionStatus === 'disconnected') return; // Avoid multiple calls if already disconnected

     setConnectionStatus('disconnected');
     isConnecting.current = false;
     setUsername(null);
     setUserId(null);
     setOnlineUsers([]);
     setMessages([]);
     setTempUsername(''); // Clear input field on voluntary disconnect
     // Only show toast if it wasn't an error state before
     if (connectionStatus !== 'error') {
        toast({
          title: 'Disconnected',
          description: 'You have left the chat.',
        });
     }
   }, [toast, connectionStatus]);


  const handleUserListUpdate = useCallback((users: UserType[]) => {
    console.log('WebRTC handleUserListUpdate called', users);
    const currentUser = users.find(u => u.id === userId);
    const otherUsers = users.filter(u => u.id !== userId);

    // Keep current user first if present
    const sortedUsers = currentUser ? [currentUser, ...otherUsers] : otherUsers;

    // Calculate joined and left users based on the *new* sorted list vs previous state
    setOnlineUsers(prevOnlineUsers => {
       const currentIds = new Set(sortedUsers.map(u => u.id));
       const prevIds = new Set(prevOnlineUsers.map(u => u.id));

       const joinedUsers = sortedUsers.filter(u => !prevIds.has(u.id) && u.id !== userId);
       const leftUsers = prevOnlineUsers.filter(u => !currentIds.has(u.id) && u.id !== userId);

       const systemMessages: MessageType[] = [];
       joinedUsers.forEach(u => {
         systemMessages.push({
           id: `system-join-${u.id}-${Date.now()}`,
           senderId: 'system',
           senderName: 'System',
           text: `${u.name} joined.`,
           timestamp: Date.now() + Math.random(), // Avoid key collision
         });
       });
       leftUsers.forEach(u => {
         systemMessages.push({
            id: `system-left-${u.id}-${Date.now()}`,
           senderId: 'system',
           senderName: 'System',
           text: `${u.name} left.`,
           timestamp: Date.now() + Math.random(),
         });
       });

       if (systemMessages.length > 0) {
         // Ensure messages are sorted by timestamp before adding to state
         setMessages(prevMessages => [...prevMessages, ...systemMessages].sort((a, b) => a.timestamp - b.timestamp));
       }

       return sortedUsers; // Update the state with the new sorted list
    });


  }, [userId]); // Depend on userId to filter self

  const handleMessageReceived = useCallback((message: MessageType) => {
    console.log('WebRTC handleMessageReceived called', message);
    if (message.senderId === userId) return; // Ignore messages from self
     setMessages((prevMessages) => {
         // Prevent duplicates
         if (prevMessages.some(m => m.id === message.id)) {
             return prevMessages;
         }
          // Ensure messages are sorted by timestamp
         return [...prevMessages, message].sort((a, b) => a.timestamp - b.timestamp);
     });
  }, [userId]); // Depend on userId to filter self

  const handleError = useCallback((error: string) => {
    console.error('WebRTC Error:', error); // Log the user-friendly error passed from webrtc.ts
     // Avoid flooding toasts for the same error, especially common connection errors
     if (error !== lastErrorRef.current || connectionStatus !== 'error') {
          lastErrorRef.current = error; // Store the new error

          // Determine the specific error type for better messaging
          let userFriendlyError = error || 'An unexpected error occurred.';
           // Fetch the actual URL being used (consider making this available from webrtc lib if needed)
           const signalingUrlUsed = process.env.NEXT_PUBLIC_SIGNALING_SERVER_URL || DEFAULT_SIGNALING_URL;
           let troubleshootingAdvice = ` Check the browser console (Network/Console tabs) and **crucially, the signaling server's own console logs** for specific errors (like CORS issues, port conflicts, etc.). Refer to the README for detailed troubleshooting steps.`;

           // Refine error messages based on keywords passed from webrtc.ts
           if (error.includes('signaling server')) {
                 // Common connection issues
                 if (error.includes('timeout') || error.includes('polling error')) {
                     userFriendlyError = `Connection timeout or polling error with signaling server (${signalingUrlUsed}).`;
                     troubleshootingAdvice = ` Please ensure the server is running at this exact URL, is accessible from your network, and its CORS configuration allows connections from your origin (${window.location.origin}). Verify the **signaling server logs** for startup or runtime errors. See README troubleshooting.`;
                 } else if (error.includes('WebSocket connection failed')) {
                     userFriendlyError = `WebSocket connection to signaling server failed (${signalingUrlUsed}).`;
                     troubleshootingAdvice = ` This often means the server isn't running, the URL in your \`.env.local\` (NEXT_PUBLIC_SIGNALING_SERVER_URL) is wrong (or defaulting to ${DEFAULT_SIGNALING_URL}), or a firewall/network issue is blocking the connection. **Check the signaling server logs** first. See README troubleshooting.`;
                 } else if (error.includes('Connection refused')) {
                     userFriendlyError = `Connection to signaling server refused (${signalingUrlUsed}).`;
                     troubleshootingAdvice = ` Ensure the signaling server is running on the expected address and port and isn't blocked by a firewall. Check the **signaling server logs** to confirm it started correctly. See README troubleshooting.`;
                 } else if (error.includes('Server disconnected')) {
                     userFriendlyError = `The signaling server (${signalingUrlUsed}) disconnected you.`;
                     troubleshootingAdvice = ` Check the **signaling server logs** for the reason. It might have restarted or encountered an internal error. See README troubleshooting.`;
                 } else {
                     // Generic signaling server error
                     userFriendlyError = `Problem connecting to signaling server (${signalingUrlUsed}): ${error}.`;
                     troubleshootingAdvice = ` Verify the server is running, the URL (\`.env.local\` or default) is correct, and CORS is configured properly on the server. **Check the signaling server logs** for details. See README troubleshooting.`;
                 }
           } else if (error.includes('peer')) {
                 userFriendlyError = `Problem connecting to a peer: ${error}.`;
                 troubleshootingAdvice = ` This might be due to network issues (NAT/Firewall) between peers or problems with STUN/TURN servers. Check browser console for specific WebRTC errors. See README troubleshooting.`;
            } else if (error.includes('initialization failed') || error.includes('initialize connection')) {
                 userFriendlyError = `Failed to initialize connection: ${error}`;
                 troubleshootingAdvice = ` This could be an issue setting up the socket or initial configuration. Check the browser console and **signaling server logs** for more clues. See README troubleshooting.`;
            }


          toast({
            title: 'Connection Issue',
            description: `${userFriendlyError}${troubleshootingAdvice}`,
            variant: 'destructive',
            duration: 15000, // Show connection errors longer
          });
     }
     setConnectionStatus('error');
     isConnecting.current = false; // Allow retry
    // Consider if disconnect should be called here automatically - NO, let user retry
  }, [toast, connectionStatus]); // Added connectionStatus dependency


  // --- Component Logic ---

  const handleJoin = useCallback(async () => {
    if (isConnecting.current) return; // Prevent multiple clicks
    if (!tempUsername.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a username.',
        variant: 'destructive',
      });
      return;
    }

    isConnecting.current = true;
    setConnectionStatus('connecting');
    lastErrorRef.current = null; // Clear previous errors on new attempt
    const newUsername = tempUsername.trim();
    // Simple ID generation for prototype - consider more robust UUIDs for production
    const newUserId = `user-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;


    // Set state immediately for UI feedback, but WebRTC connect confirms it
    setUsername(newUsername);
    setUserId(newUserId);

    try {
        // Ensure any previous connection attempts are fully cleaned up before starting a new one.
        // Do not disconnect if already disconnected or in error state from previous attempt
        if (connectionStatus !== 'disconnected' && connectionStatus !== 'error') {
             await WebRTC.disconnect(); // Explicitly disconnect only if potentially connected/connecting
        } else {
             WebRTC.cleanup(); // Ensure clean state even if not connected (safer)
        }


        await WebRTC.connect(newUserId, newUsername, {
            onConnected: handleConnectionSuccess,
            onDisconnected: handleDisconnection, // Handles cleanup and UI update
            onUserListUpdate: handleUserListUpdate,
            onMessageReceived: handleMessageReceived,
            onError: handleError, // Centralized error handling
        });
        // Connection success is now handled by the onConnected callback
    } catch (error: any) { // Catch errors from the initial connect() promise (e.g., socket init failure)
        console.error("Failed to initiate connection promise:", error);
        // The `handleError` callback might have already been called by connect's internal logic
        // if the error happens after socket setup. Call it here ONLY if it hasn't been called yet.
        if (lastErrorRef.current === null) {
            handleError(error.message || "Failed to initialize connection.");
        }
        // Ensure state is consistent with failure
        setConnectionStatus('error');
        isConnecting.current = false;
        setUsername(null);
        setUserId(null);
        // No need to call handleDisconnection here, cleanup should happen within connect or handleError
    }

  }, [tempUsername, toast, connectionStatus, handleConnectionSuccess, handleDisconnection, handleUserListUpdate, handleMessageReceived, handleError]);

   const handleLeave = useCallback(() => {
     if (connectionStatus !== 'disconnected') {
         WebRTC.disconnect(); // Trigger the WebRTC disconnection process
     }
     // The onDisconnected callback handles the state cleanup.
   }, [connectionStatus]);

  const handleSendMessage = useCallback((text: string) => {
     if (!userId || !username || connectionStatus !== 'connected') {
          toast({ title: 'Error', description: 'Not connected.', variant: 'destructive' });
          return;
     };

     // Add message locally immediately for responsiveness
      const newMessage: MessageType = {
        id: `msg-${Date.now()}-${userId}`, // Use local user ID for locally sent messages
        senderId: userId,
        senderName: username, // Use the logged-in username
        text: text,
        timestamp: Date.now(),
      };
      // Ensure messages are sorted by timestamp when adding
      setMessages((prevMessages) => [...prevMessages, newMessage].sort((a, b) => a.timestamp - b.timestamp));


    // Broadcast the message to all peers
    WebRTC.broadcastMessage(text);

  }, [userId, username, connectionStatus, toast]);


   // Cleanup on component unmount
  useEffect(() => {
    return () => {
      // Ensure disconnection happens when the component unmounts
      // e.g., navigating away or closing the tab.
      if (WebRTC.isConnected()) {
          console.log('Component unmounting, disconnecting WebRTC...');
          WebRTC.disconnect();
      }
       isConnecting.current = false;
    };
  }, []); // Empty dependency array ensures this runs only on unmount


  // --- Rendering Logic ---

  // Login Screen
  if (connectionStatus === 'disconnected' || connectionStatus === 'error') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-center text-foreground">
              Welcome to GhostLine P2P Chat
            </CardTitle>
            <CardDescription className="text-center text-muted-foreground">
              Enter a username to join or reconnect.
              {connectionStatus === 'error' && (
                <p className="text-destructive mt-2 text-sm font-medium"> {/* Added font-medium */}
                   Connection failed. Error: "{lastErrorRef.current || 'Unknown error'}".
                   <br /> {/* Line break for better readability */}
                    Please ensure the <strong className="font-semibold">signaling server</strong> is running, accessible,
                   and correctly configured (especially CORS).
                    <br/>
                   **Check the signaling server's console logs** and your browser's developer console (Network/Console tabs) for specific errors. Refer to the <a href="https://github.com/YOUR_REPO/blob/main/README.md#troubleshooting" target="_blank" rel="noopener noreferrer" className="underline hover:text-destructive/80">README</a> for detailed troubleshooting.
                 </p>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              type="text"
              placeholder="Enter your username"
              value={tempUsername}
              onChange={(e) => setTempUsername(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !isConnecting.current && tempUsername.trim() && handleJoin()}
              className="text-base"
              disabled={connectionStatus === 'connecting'} // Disable input while connecting
              aria-label="Username input"
            />
            <Button
                onClick={handleJoin}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90" // Use primary color
                disabled={connectionStatus === 'connecting' || !tempUsername.trim()} // Disable button
                aria-live="polite" // Announce changes for screen readers
            >
                {connectionStatus === 'connecting' ? (
                    <> <Loader className="mr-2 h-4 w-4 animate-spin" /> Connecting... </>
                ) : (
                   connectionStatus === 'error' ? 'Retry Connection' : 'Join Chat' // Change button text on error
                )}
            </Button>
             <p className="text-xs text-center text-muted-foreground">
                Requires a running <a href="https://github.com/YOUR_REPO/blob/main/README.md#troubleshooting" target="_blank" rel="noopener noreferrer" className="underline text-primary hover:text-primary/80">signaling server</a> with correct URL (check `.env.local`) & CORS setup. See README.
             </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Connecting Screen (optional, but good UX)
  if (connectionStatus === 'connecting') {
     return (
       <div className="flex items-center justify-center min-h-screen bg-background flex-col space-y-4">
         <Loader className="h-16 w-16 animate-spin text-primary" />
         <p className="text-xl text-muted-foreground">Connecting to the P2P network...</p>
         <p className="text-sm text-muted-foreground">(Connecting to signaling server at {process.env.NEXT_PUBLIC_SIGNALING_SERVER_URL || DEFAULT_SIGNALING_URL})</p>
       </div>
     );
   }


  // Main Chat UI (Connected)
  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Sidebar for Online Users */}
      <aside className="w-64 border-r border-border p-4 flex flex-col bg-card shadow-md"> {/* Added shadow */}
         <div className="flex justify-between items-center mb-4 pb-2 border-b border-border"> {/* Added bottom border */}
             <h2 className="text-lg font-semibold flex items-center text-foreground"> {/* Adjusted size/weight */}
              <User className="mr-2 h-5 w-5 text-primary" /> Online ({onlineUsers.length})
            </h2>
             <span title={connectionStatus === 'connected' ? 'Connected to Signaling Server' : 'Signaling Server Connection Issue'} className="ml-auto">
               {connectionStatus === 'connected' ? (
                 <Wifi className="h-5 w-5 text-green-500" />
               ) : (
                 <WifiOff className="h-5 w-5 text-destructive" /> // Use destructive color for error
               )}
             </span>
          </div>
        <ScrollArea className="flex-grow pr-2"> {/* Added padding right */}
          <ul className="space-y-1"> {/* Reduced spacing */}
            {onlineUsers.map((user) => (
              <li key={user.id} className="flex items-center text-sm p-1.5 rounded hover:bg-muted transition-colors duration-150 ease-in-out"> {/* Adjusted padding/added transition */}
                 <span className={`h-2 w-2 rounded-full mr-2 flex-shrink-0 ${user.id === userId ? 'bg-green-500 animate-pulse' : 'bg-primary/70'}`}></span> {/* Added pulse for self, slightly muted for others */}
                <span className="truncate font-medium text-foreground/90" title={user.name}>{user.name}</span> {/* Adjusted text color/weight */}
                {user.id === userId && <span className="ml-auto text-xs text-muted-foreground">(You)</span>} {/* Moved (You) to right */}
              </li>
            ))}
             {onlineUsers.length === 1 && userId && (
                 <li className="text-xs text-center text-muted-foreground italic py-4">Waiting for others to join...</li>
            )}
             {onlineUsers.length === 0 && ( // Should not happen if connected, but for safety
                 <li className="text-xs text-center text-muted-foreground italic py-4">No users online.</li>
            )}
          </ul>
        </ScrollArea>
         <Separator className="my-3" /> {/* Adjusted margin */}
         <div className="mt-auto space-y-2"> {/* Pushes to bottom, added spacing */}
             <p className="text-xs text-muted-foreground truncate px-1">Logged in as: <strong className="text-foreground">{username}</strong></p>
             <Button variant="outline" size="sm" onClick={handleLeave} className="w-full text-destructive border-destructive/50 hover:bg-destructive/10 hover:text-destructive">
                <LogOut className="mr-2 h-4 w-4" /> Leave Chat
             </Button>
         </div>
      </aside>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col">
         <header className="border-b border-border p-3 flex items-center justify-between bg-card shadow-sm"> {/* Added background/shadow */}
          <h1 className="text-xl font-semibold text-foreground flex items-center"> {/* Adjusted size */}
            <MessageCircle className="mr-2 h-5 w-5 text-primary" /> {/* Adjusted size */}
             GhostLine P2P Chat
          </h1>
           {/* Maybe add active peer count or other info here later */}
        </header>
        <ChatInterface
          messages={messages}
          onSendMessage={handleSendMessage}
          currentUser={{ id: userId!, name: username! }} // Non-null assertion safe here due to connection status check
        />
      </main>
    </div>
  );
}
