// src/components/Sidebar.tsx (REPLACE ENTIRE FILE)

import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  selectedChatId: Id<"chats"> | null;
}

export function Sidebar({ isOpen, onToggle, selectedChatId }: SidebarProps) {
  const chats = useQuery(api.chats.listChats) || [];
  const createChat = useMutation(api.chats.createChat);
  const deleteChat = useMutation(api.chats.deleteChat);
  const [isCreating, setIsCreating] = useState(false);
  const [showChatList, setShowChatList] = useState(false);
  const navigate = useNavigate();

  const handleNewChat = async () => {
    setIsCreating(true);
    try {
      const chatId = await createChat({
        title: "New Chat",
        model: "gpt-4.1-nano",
        provider: "openai",
      });
      navigate(`/chat/${chatId}`);
      toast.success("New chat created");
    } catch (error) {
      toast.error("Failed to create chat");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteChat = async (e: React.MouseEvent, chatId: Id<"chats">) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      await deleteChat({ chatId });
      toast.success("Chat deleted");
      if (selectedChatId === chatId) {
        navigate("/");
      }
    } catch (error) {
      toast.error("Failed to delete chat");
    }
  };

  const handleChatClick = (e: React.MouseEvent, chatId: Id<"chats">) => {
    e.preventDefault();
    e.stopPropagation();
    navigate(`/chat/${chatId}`);
    setShowChatList(false); // Close the dropdown after selecting
  };

  if (!isOpen) {
    return (
      <div className="w-16 retro-container border-r-2 flex flex-col items-center py-4 pt-16 h-screen sticky top-0 ">
        <button onClick={onToggle} className="retro-button p-2 mb-4" title="Open Sidebar">
          {/* <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg> */}
           <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
        </button>
        <button onClick={handleNewChat} disabled={isCreating} className="retro-button p-2 mb-4" title="New Chat">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="w-64 retro-container border-r-2 flex flex-col h-screen sticky top-0">
      <div className="p-4 border-b-2 border-current flex items-center justify-between">
        <button onClick={handleNewChat} disabled={isCreating} className="retro-button w-full flex items-center gap-2 px-3 py-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {isCreating ? "CREATING..." : "NEW CHAT"}
        </button>
        <button onClick={onToggle} className="retro-button p-2 ml-2" title="Close Sidebar">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {chats.length === 0 ? (
          <div className="text-center retro-text-muted mt-8">
            <p> NO CHATS YET</p>
            <p className="text-sm">CREATE A CHAT TO START</p>
          </div>
        ) : (
          <div className="space-y-1">
            {chats.map((chat) => (
              <div
                key={chat._id}
                className={`group flex items-center gap-2 p-2 cursor-pointer transition-all ${
                  selectedChatId === chat._id
                    ? "retro-glow retro-text"
                    : "retro-text-dim hover:retro-text"
                }`}
                onClick={(e) => handleChatClick(e, chat._id)}
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <span className="flex-1 truncate text-sm font-mono">{chat?.parentChatId && (
              <span className="feature-indicator">
                BRANCH
              </span>
            )} {chat.title}  </span>
                <button
                  onClick={(e) => handleDeleteChat(e, chat._id)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-opacity"
                  title="Delete Chat"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}