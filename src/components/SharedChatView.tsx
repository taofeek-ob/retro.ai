import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useParams, Link, useNavigate } from "react-router-dom";
import { MessageList } from "./MessageList";
import { Id } from "../../convex/_generated/dataModel";
import { useState, useEffect } from "react";
import { toast } from "sonner";

export function SharedChatView() {
  const { shareId } = useParams();
  const navigate = useNavigate();
  const sharedChat = useQuery(api.sharedChats.getSharedChat, { shareId: shareId || "" });
  const continueSharedChat = useMutation(api.sharedChats.continueSharedChat);
  const incrementViewCount = useMutation(api.sharedChats.incrementViewCount);
  const [isContinuing, setIsContinuing] = useState(false);

  // Increment view count when the component mounts
  useEffect(() => {
    if (shareId) {
      incrementViewCount({ shareId }).catch((error) => {
        console.error("Error incrementing view count:", error);
      });
    }
  }, [shareId, incrementViewCount]);

  const handleContinueChat = async () => {
    if (!sharedChat) return;
    
    try {
      setIsContinuing(true);
      const newChatId = await continueSharedChat({
        shareId: sharedChat.shareId,
        content: "Continuing shared chat",
        role: "user"
      });
      
      // Navigate to the new chat
      navigate(`/chat/${newChatId}`);
    } catch (error) {
      console.error("Error continuing chat:", error);
      toast.error("Failed to continue chat. Please try again.");
    } finally {
      setIsContinuing(false);
    }
  };

  if (sharedChat === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center retro-container">
        <div className="text-center">
          <h1 className="text-2xl font-bold retro-text mb-4">LOADING...</h1>
        </div>
      </div>
    );
  }

  if (sharedChat === null) {
    return (
      <div className="min-h-screen flex items-center justify-center retro-container">
        <div className="text-center">
          <h1 className="text-2xl font-bold retro-text mb-4">CHAT NOT FOUND</h1>
          <p className="retro-text-dim mb-4">
            This shared chat may have been deleted or the link is invalid.
          </p>
          <Link to="/" className="retro-button">
            RETURN HOME
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--retro-bg)' }}>
      {/* Header */}
      <header className="retro-container border-b-2 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="retro-button p-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </Link>
            <h1 className="text-xl font-bold retro-text">SHARED: {sharedChat.title}</h1>
            {sharedChat.isPublic && (
              <span className="feature-indicator active">PUBLIC</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm retro-text-muted">
              {sharedChat.viewCount} VIEWS
            </span>
            <button
              onClick={handleContinueChat}
              disabled={isContinuing}
              className="retro-button"
            >
              {isContinuing ? "ADDING..." : "CONTINUE CHAT"}
            </button>
          </div>
        </div>
        {sharedChat.description && (
          <p className="mt-2 retro-text-dim">{sharedChat.description}</p>
        )}
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <MessageList 
          messages={sharedChat.chat.messages} 
          isSharedView={true}
        />
      </div>
    </div>
  );
}

