import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { toast } from "sonner";

interface ShareChatModalProps {
  chatId: Id<"chats">;
  onClose: () => void;
}

export function ShareChatModal({ chatId, onClose }: ShareChatModalProps) {
  const [isPublic, setIsPublic] = useState(false);
  const [description, setDescription] = useState("");
  const [isSharing, setIsSharing] = useState(false);
  const [shareId, setShareId] = useState<string | null>(null);

  const shareChat = useMutation(api.chats.shareChat);
  const chat = useQuery(api.chats.getChat, { chatId });

  const handleShare = async () => {
    setIsSharing(true);
    try {
      const id = await shareChat({
        chatId,
        isPublic,
        description: description.trim() || undefined,
      });
      setShareId(id);
      toast.success("Chat shared successfully!");
    } catch (error) {
      toast.error("Failed to share chat");
    } finally {
      setIsSharing(false);
    }
  };

  const copyShareLink = () => {
    if (shareId) {
      const url = `${window.location.origin}/shared/${shareId}`;
      navigator.clipboard.writeText(url);
      toast.success("Share link copied to clipboard!");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="retro-container p-6 max-w-md w-full">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold retro-text">SHARE CHAT</h3>
          <button
            onClick={onClose}
            className="retro-button p-1"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {!shareId ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium retro-text mb-2">
                CHAT TITLE
              </label>
              <div className="retro-container p-2">
                <span className="retro-text-dim">{chat?.title}</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium retro-text mb-2">
                DESCRIPTION (OPTIONAL)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="DESCRIBE THIS CHAT..."
                className="retro-input w-full"
                rows={3}
              />
            </div>

            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  className="sr-only"
                />
                <div className={`feature-indicator ${isPublic ? 'active' : ''}`}>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  PUBLIC
                </div>
                <span className="text-sm retro-text-dim">
                  MAKE DISCOVERABLE TO ALL USERS
                </span>
              </label>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleShare}
                disabled={isSharing}
                className="retro-button flex-1"
              >
                {isSharing ? "SHARING..." : "SHARE CHAT"}
              </button>
              <button
                onClick={onClose}
                className="retro-button-secondary flex-1"
              >
                CANCEL
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-center">
              <div className="retro-glow-strong p-4 mb-4">
                <svg className="w-12 h-12 mx-auto retro-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h4 className="font-bold retro-text mb-2">CHAT SHARED SUCCESSFULLY!</h4>
              <p className="text-sm retro-text-dim">
                YOUR CHAT IS NOW {isPublic ? "PUBLIC" : "PRIVATE"}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium retro-text mb-2">
                SHARE LINK
              </label>
              <div className="flex gap-2">
                <input
                  value={`${window.location.origin}/shared/${shareId}`}
                  readOnly
                  className="retro-input flex-1 text-xs"
                />
                <button
                  onClick={copyShareLink}
                  className="retro-button px-3"
                  title="Copy Link"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>
            </div>

            <button
              onClick={onClose}
              className="retro-button w-full"
            >
              CLOSE
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
