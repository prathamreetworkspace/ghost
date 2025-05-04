'use client';

import { useState, useEffect } from 'react';
import { LandingPage } from '@/components/landing-page';
import { ChatInterface } from '@/components/chat-interface';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { User, MessageCircle, LogOut } from 'lucide-react';

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

export default function Home() {
  const [username, setUsername] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [tempUsername, setTempUsername] = useState<string>('');
  const [onlineUsers, setOnlineUsers] = useState<UserType[]>([]);
  const [messages, setMessages] = useState<MessageType[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const { toast } = useToast();

  // Placeholder: Simulate user joining/leaving and messages for UI testing
  useEffect(() => {
    if (isConnected && username && userId) {
      // Simulate initial online users list
      setOnlineUsers([
        { id: userId, name: username },
        { id: 'user2', name: 'Alice' },
        { id: 'user3', name: 'Bob' },
      ]);

      // Simulate receiving a message
      const timer = setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          {
            id: `msg-${Date.now()}`,
            senderId: 'user2',
            senderName: 'Alice',
            text: 'Hey there!',
            timestamp: Date.now(),
          },
        ]);
      }, 3000);

      // Simulate another user joining
      const joinTimer = setTimeout(() => {
        const newUser = { id: 'user4', name: 'Charlie' };
        setOnlineUsers((prev) => [...prev, newUser]);
        toast({
          title: 'User Joined',
          description: `${newUser.name} has joined the chat.`,
        });
        setMessages((prev) => [
           ...prev,
           {
             id: `system-${Date.now()}`,
             senderId: 'system',
             senderName: 'System',
             text: `${newUser.name} joined.`,
             timestamp: Date.now(),
           },
         ]);
      }, 5000);

       // Simulate a user leaving
       const leaveTimer = setTimeout(() => {
        const leavingUser = onlineUsers.find(u => u.id === 'user3');
        if (leavingUser) {
          setOnlineUsers((prev) => prev.filter(u => u.id !== 'user3'));
          toast({
            title: 'User Left',
            description: `${leavingUser.name} has left the chat.`,
          });
          setMessages((prev) => [
             ...prev,
             {
               id: `system-${Date.now() + 1}`,
               senderId: 'system',
               senderName: 'System',
               text: `${leavingUser.name} left.`,
               timestamp: Date.now() + 1,
             },
           ]);
        }
      }, 8000);

      return () => {
        clearTimeout(timer);
        clearTimeout(joinTimer);
        clearTimeout(leaveTimer);
      }
    }
  }, [isConnected, username, userId, toast]);


  const handleJoin = () => {
    if (tempUsername.trim()) {
      const newUserId = `user-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      setUsername(tempUsername.trim());
      setUserId(newUserId);
      setIsConnected(true); // Simulate successful connection
      toast({
        title: 'Connected!',
        description: `Welcome, ${tempUsername.trim()}!`,
      });
       setMessages([{
         id: `system-join-${Date.now()}`,
         senderId: 'system',
         senderName: 'System',
         text: `You joined as ${tempUsername.trim()}.`,
         timestamp: Date.now(),
       }]);
    } else {
      toast({
        title: 'Error',
        description: 'Please enter a username.',
        variant: 'destructive',
      });
    }
  };

   const handleLeave = () => {
    setIsConnected(false);
    setUsername(null);
    setUserId(null);
    setOnlineUsers([]);
    setMessages([]);
    setTempUsername('');
    toast({
      title: 'Disconnected',
      description: 'You have left the chat.',
    });
  };

  const handleSendMessage = (text: string) => {
     if (!userId || !username) return; // Should not happen if connected

    const newMessage: MessageType = {
      id: `msg-${Date.now()}-${userId}`,
      senderId: userId,
      senderName: username, // Use the logged-in username
      text: text,
      timestamp: Date.now(),
    };
    setMessages((prevMessages) => [...prevMessages, newMessage]);
    // In a real app, send this message via WebRTC DataChannel here
    console.log('Sending message:', newMessage);

    // Simulate receiving the message back for demo purposes
    // In a real P2P scenario, the message would only appear once (sent)
    // unless explicitly echoed back by peers or the signaling server (not recommended).
    // For this UI demo, we'll just add it directly.
  };


  if (!isConnected || !username) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-center text-foreground">
              Welcome to GhostLine
            </CardTitle>
            <CardDescription className="text-center text-muted-foreground">
              Enter a username to join the P2P chat.
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
            />
            <Button onClick={handleJoin} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
              Join Chat
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }


  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Sidebar for Online Users */}
      <aside className="w-64 border-r border-border p-4 flex flex-col">
        <h2 className="text-xl font-semibold mb-4 flex items-center">
          <User className="mr-2 h-5 w-5 text-primary" /> Online Users
        </h2>
        <ScrollArea className="flex-grow">
          <ul className="space-y-2">
            {onlineUsers.map((user) => (
              <li key={user.id} className="flex items-center text-sm p-1 rounded hover:bg-muted">
                 <span className={`h-2 w-2 rounded-full mr-2 ${user.id === userId ? 'bg-green-500' : 'bg-primary'}`}></span>
                {user.name} {user.id === userId && '(You)'}
              </li>
            ))}
          </ul>
        </ScrollArea>
         <Separator className="my-4" />
         <div className="text-center">
            <p className="text-sm text-muted-foreground mb-2">Logged in as: <strong>{username}</strong></p>
             <Button variant="outline" size="sm" onClick={handleLeave} className="w-full">
                <LogOut className="mr-2 h-4 w-4" /> Leave Chat
             </Button>
         </div>
      </aside>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col">
        <header className="border-b border-border p-4">
          <h1 className="text-2xl font-bold text-foreground flex items-center">
            <MessageCircle className="mr-2 h-6 w-6 text-primary" /> GhostLine Chat
          </h1>
        </header>
        <ChatInterface messages={messages} onSendMessage={handleSendMessage} currentUser={{ id: userId!, name: username! }} />
      </main>

      {/* Placeholder for Active Channels - can be added later */}
      {/*
      <aside className="w-48 border-l border-border p-4">
        <h2 className="text-lg font-semibold mb-4">Channels</h2>
        <ul>
          <li className="text-sm text-muted-foreground">#general (Default)</li>
        </ul>
      </aside>
      */}
    </div>
  );
}
