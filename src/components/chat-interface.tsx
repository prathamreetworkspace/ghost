// src/components/chat-interface.tsx
'use client';

import type { MessageType, UserType } from '@/app/page';
import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, UserCircle, Info } from 'lucide-react'; // Added Info icon for system messages
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface ChatInterfaceProps {
  messages: MessageType[];
  onSendMessage: (text: string) => void;
  currentUser: UserType;
}

export function ChatInterface({ messages, onSendMessage, currentUser }: ChatInterfaceProps) {
  const [inputText, setInputText] = useState('');
  const scrollAreaRef = useRef<HTMLDivElement>(null); // Ref for the ScrollArea's viewport


  const handleSend = () => {
    if (inputText.trim()) {
      onSendMessage(inputText.trim());
      setInputText('');
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

 // Auto-scroll to bottom when messages change
  useEffect(() => {
    const viewport = scrollAreaRef.current;
    if (viewport) {
      // Use requestAnimationFrame to ensure scrolling happens after the DOM update
      requestAnimationFrame(() => {
        viewport.scrollTop = viewport.scrollHeight;
      });
    }
  }, [messages]); // Dependency array includes messages


  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Message Display Area */}
      <ScrollArea className="flex-1 p-4 bg-muted/20" viewportRef={scrollAreaRef}>
        <div className="space-y-4">
          {messages.map((msg) => {
             const isCurrentUser = msg.senderId === currentUser.id;
             const isSystemMessage = msg.senderId === 'system';

             if (isSystemMessage) {
                return (
                    <div key={msg.id} className="text-center my-2 flex items-center justify-center space-x-2">
                         <Info className="h-3 w-3 text-muted-foreground flex-shrink-0" /> {/* Added flex-shrink-0 */}
                         <span className="text-xs text-muted-foreground italic px-2 py-0.5">
                            {msg.text}
                            <span className="ml-1 opacity-70">
                                ({formatDistanceToNow(new Date(msg.timestamp), { addSuffix: true })})
                            </span>
                        </span>
                    </div>
                );
             }

             return (
               <div
                 key={msg.id}
                 className={cn(
                   'flex w-full',
                   isCurrentUser ? 'justify-end' : 'justify-start'
                 )}
               >
                 <div
                   className={cn(
                     'max-w-[75%] md:max-w-[65%] p-3 rounded-lg shadow flex flex-col', // Reduced max width slightly
                      isCurrentUser
                       ? 'bg-primary text-primary-foreground rounded-br-none' // Style user's messages
                       : 'bg-card border rounded-bl-none' // Style others' messages
                   )}
                 >
                    {/* Show sender name only for other users' messages */}
                   {!isCurrentUser && (
                      <span className="text-xs font-semibold mb-1 flex items-center opacity-80 text-primary">
                        <UserCircle className="h-4 w-4 mr-1 inline-block flex-shrink-0" /> {/* Added flex-shrink-0 */}
                        {msg.senderName}
                      </span>
                   )}
                    <p className="text-sm break-words whitespace-pre-wrap">{msg.text}</p>
                    {/* Timestamp */}
                   <span className={cn(
                        "text-xs mt-1 opacity-60", // Made timestamp slightly more subtle
                        isCurrentUser ? 'text-right' : 'text-left'
                    )}>
                     {formatDistanceToNow(new Date(msg.timestamp), { addSuffix: true })}
                   </span>
                 </div>
               </div>
             );
          })}
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="border-t border-border p-4 bg-card">
        <div className="flex items-center space-x-2">
          <Input
            type="text"
            placeholder="Type your message..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-background focus:ring-primary focus:ring-offset-0" // Adjusted focus style
            aria-label="Chat message input"
            autoComplete="off"
          />
          <Button
             onClick={handleSend}
             disabled={!inputText.trim()} // Disable button if input is empty
             className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground" aria-label="Send message">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
