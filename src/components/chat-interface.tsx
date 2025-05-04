'use client';

import type { MessageType, UserType } from '@/app/page';
import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, MessageSquareText, UserCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface ChatInterfaceProps {
  messages: MessageType[];
  onSendMessage: (text: string) => void;
  currentUser: UserType;
}

export function ChatInterface({ messages, onSendMessage, currentUser }: ChatInterfaceProps) {
  const [inputText, setInputText] = useState('');
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

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

  // Auto-scroll to bottom
  useEffect(() => {
    if (viewportRef.current) {
        // Use setTimeout to ensure scroll happens after render update
        setTimeout(() => {
             if (viewportRef.current) {
                 viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
             }
        }, 0);
    }
}, [messages]); // Dependency array includes messages

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Message Display Area */}
      <ScrollArea className="flex-1 p-4" ref={scrollAreaRef} viewportRef={viewportRef}>
        <div className="space-y-4">
          {messages.map((msg) => {
             const isCurrentUser = msg.senderId === currentUser.id;
             const isSystemMessage = msg.senderId === 'system';

             if (isSystemMessage) {
                return (
                    <div key={msg.id} className="text-center my-2">
                        <span className="text-xs text-muted-foreground italic px-2 py-1 bg-muted rounded-full">
                            {msg.text} - {formatDistanceToNow(new Date(msg.timestamp), { addSuffix: true })}
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
                     'max-w-[70%] p-3 rounded-lg shadow-sm flex flex-col',
                      isCurrentUser
                       ? 'bg-primary text-primary-foreground'
                       : 'bg-card border'
                   )}
                 >
                   {!isCurrentUser && (
                      <span className="text-xs font-semibold mb-1 flex items-center opacity-80">
                        <UserCircle className="h-4 w-4 mr-1 inline-block" />
                        {msg.senderName}
                      </span>
                   )}
                    <p className="text-sm break-words">{msg.text}</p>
                   <span className={cn(
                        "text-xs mt-1 opacity-70",
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
      <div className="border-t border-border p-4 bg-muted/50">
        <div className="flex items-center space-x-2">
          <Input
            type="text"
            placeholder="Type your message..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-background focus:ring-primary"
            aria-label="Chat message input"
          />
          <Button onClick={handleSend} className="bg-accent text-accent-foreground hover:bg-accent/90" aria-label="Send message">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
