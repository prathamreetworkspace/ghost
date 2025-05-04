'use client';

import type { UserType } from '@/app/page'; // Assuming UserType is defined here
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { User, Hash } from 'lucide-react';

interface LandingPageProps {
  onlineUsers: UserType[];
  activeChannels: string[]; // Example: ['#general', '#random']
}

export function LandingPage({ onlineUsers, activeChannels }: LandingPageProps) {
  return (
    <div className="container mx-auto p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
       {/* This component might not be directly used if the logic is merged into page.tsx for simplicity */}
       {/* Keeping it here as an example of abstraction */}

      <Card className="md:col-span-1">
        <CardHeader>
          <CardTitle className="flex items-center text-lg">
            <User className="mr-2 h-5 w-5 text-primary" /> Online Users ({onlineUsers.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-48">
            {onlineUsers.length > 0 ? (
              <ul className="space-y-1">
                {onlineUsers.map((user) => (
                  <li key={user.id} className="text-sm flex items-center">
                     <span className="h-2 w-2 rounded-full bg-primary mr-2"></span>
                     {user.name}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No users currently online.</p>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      <Card className="md:col-span-1">
         <CardHeader>
          <CardTitle className="flex items-center text-lg">
            <Hash className="mr-2 h-5 w-5 text-primary" /> Active Channels ({activeChannels.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
           <ScrollArea className="h-48">
            {activeChannels.length > 0 ? (
              <ul className="space-y-1">
                {activeChannels.map((channel) => (
                  <li key={channel} className="text-sm font-medium text-accent hover:underline cursor-pointer">
                    {channel}
                  </li>
                ))}
              </ul>
            ) : (
               <p className="text-sm text-muted-foreground">No active channels.</p>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Placeholder for Chat Preview or Join Action */}
      <Card className="md:col-span-1 flex items-center justify-center bg-secondary">
        <CardContent className="text-center">
          <p className="text-muted-foreground">Join the conversation!</p>
          {/* Add Join Button or similar action here if needed */}
        </CardContent>
      </Card>
    </div>
  );
}
