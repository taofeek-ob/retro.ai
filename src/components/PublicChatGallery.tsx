import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Link } from "react-router-dom";
import { useState } from "react";

export function PublicChatGallery() {
  const [cursor, setCursor] = useState<string | undefined>();
  const publicChats = useQuery(api.sharedChats.listPublicChats, { cursor });

  if (!publicChats) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="retro-blink retro-text">LOADING PUBLIC CHATS...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold retro-text mb-2">PUBLIC CHAT GALLERY</h2>
        <p className="retro-text-dim">Explore conversations shared by the community</p>
      </div>

      {publicChats.chats.length === 0 ? (
        <div className="text-center retro-container p-8">
          <p className="retro-text-dim">NO PUBLIC CHATS YET</p>
          <p className="text-sm retro-text-muted mt-2">
            Be the first to share a public conversation!
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {publicChats.chats.map((chat) => (
            <Link
              key={chat._id}
              to={`/shared/${chat.shareId}`}
              className="retro-container p-4 hover:retro-glow-strong transition-all"
            >
              <h3 className="font-bold retro-text mb-2 truncate">{chat.title}</h3>
              {chat.description && (
                <p className="text-sm retro-text-dim mb-3 line-clamp-2">
                  {chat.description}
                </p>
              )}
              <div className="flex items-center justify-between text-xs retro-text-muted">
                <span>BY {chat.creatorName}</span>
                <span>{chat.viewCount} VIEWS</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {publicChats.nextCursor && (
        <div className="text-center mt-6">
          <button
            onClick={() => setCursor(publicChats.nextCursor!)}
            className="retro-button"
          >
            LOAD MORE
          </button>
        </div>
      )}
    </div>
  );
}
