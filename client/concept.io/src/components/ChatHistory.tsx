import {useEffect, useRef, useState, useCallback} from "react";
import MessageEntry from "./Entry/MessageEntry.tsx";
import {WebSocketService} from "../services/WebSocketService";

interface chatMessage {
    user: string;
    content: string;
    userProfile: string;
    timestamp: number;
    sentBy: string;
}
const stimulateChat = [
    { user: 'Dave', content: 'Hows the progress', userProfile: '/avatars/cat.png', timestamp: Date.now(), sentBy: 'Dave' },
    { user: 'Dave', content: 'Finished doing the design Finished doing the designFinished doing the designFinished doing the design', userProfile: '/avatars/cat.png', timestamp: Date.now(), sentBy: 'Anna' },
    { user: 'Dave', content: 'Working on features', userProfile: '/avatars/cat.png', timestamp: Date.now(), sentBy: 'Charlie' },
    { user: 'Dave', content: 'Need more time', userProfile: '/avatars/cat.png', timestamp: Date.now(), sentBy: 'Faith' },
    { user: 'Dave', content: 'Review the files please', userProfile: '/avatars/cat.png', timestamp: Date.now(), sentBy: 'Dave' },
    { user: 'Anna', content: 'I’ll update docs', userProfile: '/avatars/cat.png', timestamp: Date.now(), sentBy: 'Anna' },
    { user: 'Charlie', content: 'Testing build', userProfile: '/avatars/cat.png', timestamp: Date.now(), sentBy: 'Charlie' },
    { user: 'Faith', content: 'Almost done', userProfile: '/avatars/cat.png', timestamp: Date.now(), sentBy: 'Faith' },
];

const ChatHistory = () => {
    
    const [messages, setMessages] = useState<chatMessage[]>(stimulateChat);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        containerRef.current?.scrollTo( {
            top: containerRef.current?.scrollHeight,
            behavior: 'smooth'
        });
    }, [messages]);
    
    
    useEffect(() => {
        const ws = WebSocketService.getInstance();
        ws.setCallbacks({
            onMessageAdded: (msg: chatMessage) => {
                setMessages(messages => [...messages,
                    {
                        user: msg.user,
                        content: msg.content,
                        userProfile: "/avatars/cat.png", // or from server
                        timestamp: Date.now(),
                        sentBy: msg.sentBy,
                    }
                ]);
            }
        })
    })
    return (
        <div className="relative h-64 w-80 rounded-lg">
            {/* Scrollable area */}
            <div
                ref={containerRef}
                className="h-full w-full overflow-y-auto scrollbar-hide fade-mask bg-transparent p-4 flex flex-col space-y-4"
            >
                {messages.map((entry, index) => (
                    <MessageEntry
                        key={index}
                        user={entry.user}
                        content={entry.content}
                        userProfile={entry.userProfile}
                        timestamp={entry.timestamp}
                        sentBy={entry.sentBy}
                    />
                ))}
            </div>
        </div>
    );
};

export default ChatHistory;