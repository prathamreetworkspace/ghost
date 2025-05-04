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

  // --- WebRTC Event Handlers ---

  const handleConnectionSuccess = useCallback(() => {
    console.log('WebRTC handleConnectionSuccess called');
    setConnectionStatus('connected');
    isConnecting.current = false;
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

    setOnlineUsers(currentUser ? [currentUser, ...otherUsers] : otherUsers); // Keep current user first if present

    // Add system messages for users joining/leaving based on difference
    setOnlineUsers(prevOnlineUsers => {
       const currentIds = new Set(users.map(u => u.id));
       const prevIds = new Set(prevOnlineUsers.map(u => u.id));

       const joinedUsers = users.filter(u => !prevIds.has(u.id) && u.id !== userId);
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
         setMessages(prevMessages => [...prevMessages, ...systemMessages]);
       }

       return users; // Update the state
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
         return [...prevMessages, message];
     });
  }, [userId]); // Depend on userId to filter self

  const handleError = useCallback((error: string) => {
    console.error('WebRTC Error:', error);
     // Avoid flooding toasts for the same error
     // Basic check, could be more sophisticated
     if (connectionStatus !== 'error') {
          toast({
            title: 'Connection Error',
            description: error || 'An unexpected error occurred.',
            variant: 'destructive',
          });
     }
     setConnectionStatus('error');
     isConnecting.current = false; // Allow retry
    // Consider if disconnect should be called here automatically
    // WebRTC.disconnect(); // This might be too aggressive
  }, [toast, connectionStatus]);


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
    const newUsername = tempUsername.trim();
    const newUserId = `user-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`; // More robust ID

    // Set state immediately for UI feedback, but WebRTC connect confirms it
    setUsername(newUsername);
    setUserId(newUserId);

    try {
        await WebRTC.connect(newUserId, newUsername, {
            onConnected: handleConnectionSuccess,
            onDisconnected: handleDisconnection, // We handle UI updates here or in handleLeave
            onUserListUpdate: handleUserListUpdate,
            onMessageReceived: handleMessageReceived,
            onError: handleError,
        });
        // Connection success is handled by the onConnected callback
    } catch (error) {
        console.error("Failed to initiate connection:", error);
        isConnecting.current = false;
        setConnectionStatus('error');
        setUsername(null); // Rollback state on failure
        setUserId(null);
         toast({
           title: 'Connection Failed',
           description: error.message || 'Could not connect to the signaling server.',
           variant: 'destructive',
         });
    }

  }, [tempUsername, toast, handleConnectionSuccess, handleDisconnection, handleUserListUpdate, handleMessageReceived, handleError]);

   const handleLeave = useCallback(() => {
     if (connectionStatus !== 'disconnected') {
         WebRTC.disconnect(); // Trigger the WebRTC disconnection process
     }
     // The onDisconnected callback handles the state cleanup
     handleDisconnection(); // Explicitly call to ensure UI updates if already disconnected
   }, [connectionStatus, handleDisconnection]);

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
      setMessages((prevMessages) => [...prevMessages, newMessage]);


    // Broadcast the message to all peers
    WebRTC.broadcastMessage(text);

  }, [userId, username, connectionStatus, toast]);


   // Cleanup on component unmount
  useEffect(() => {
    return () => {
      if (connectionStatus !== 'disconnected') {
        WebRTC.disconnect();
      }
       isConnecting.current = false;
    };
  }, [connectionStatus]); // Rerun cleanup logic if connection status changes


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
                <p className="text-destructive mt-2">Connection failed. Please try again.</p>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              type="text"
              placeholder="Enter your username"
              value={tempUsername}
              onChange={(e) => setTempUsername(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              className="text-base"
              disabled={connectionStatus === 'connecting'}
            />
            <Button
                onClick={handleJoin}
                className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
                disabled={connectionStatus === 'connecting' || !tempUsername.trim()}
            >
                {connectionStatus === 'connecting' ? (
                    <> <Loader className="mr-2 h-4 w-4 animate-spin" /> Connecting... </>
                ) : (
                    'Join Chat'
                )}

            </Button>
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
       </div>
     );
   }


  // Main Chat UI (Connected)
  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Sidebar for Online Users */}
      <aside className="w-64 border-r border-border p-4 flex flex-col bg-card">
         <div className="flex justify-between items-center mb-4">
             <h2 className="text-xl font-semibold flex items-center">
              <User className="mr-2 h-5 w-5 text-primary" /> Online ({onlineUsers.length})
            </h2>
             <span title={connectionStatus === 'connected' ? 'Connected' : 'Connection Issue'} className="ml-auto">
               {connectionStatus === 'connected' ? (
                 <Wifi className="h-5 w-5 text-green-500" />
               ) : (
                 <WifiOff className="h-5 w-5 text-destructive" />
               )}
             </span>
          </div>
        <ScrollArea className="flex-grow">
          <ul className="space-y-2">
            {onlineUsers.map((user) => (
              <li key={user.id} className="flex items-center text-sm p-1 rounded hover:bg-muted">
                 {/* Green dot for self, primary for others */}
                 <span className={`h-2 w-2 rounded-full mr-2 flex-shrink-0 ${user.id === userId ? 'bg-green-500' : 'bg-primary'}`}></span>
                <span className="truncate" title={user.name}>{user.name}</span>
                {user.id === userId && <span className="ml-1 text-xs text-muted-foreground">(You)</span>}
              </li>
            ))}
          </ul>
        </ScrollArea>
         <Separator className="my-4" />
         <div className="text-center mt-auto"> {/* Pushes to bottom */}
            <p className="text-sm text-muted-foreground mb-2 truncate">Logged in as: <strong>{username}</strong></p>
             <Button variant="outline" size="sm" onClick={handleLeave} className="w-full">
                <LogOut className="mr-2 h-4 w-4" /> Leave Chat
             </Button>
         </div>
      </aside>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col">
        <header className="border-b border-border p-4">
          <h1 className="text-2xl font-bold text-foreground flex items-center">
            <MessageCircle className="mr-2 h-6 w-6 text-primary" /> GhostLine P2P Chat
          </h1>
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
