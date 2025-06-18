import { Id } from "../../convex/_generated/dataModel";
import { MessageBubble } from "./MessageBubble";

interface Message {
  _id: Id<"messages">;
  role: "user" | "assistant" | "system";
  content: string;
  _creationTime: number;
  attachments?: Id<"_storage">[];
  attachmentDetails?: Array<{
    _id: Id<"attachments">;
    fileName: string;
    fileType: string;
    url: string | null;
    _creationTime: number;
    extractedText?: string;
    storageId: Id<"_storage">;
    fileSize: number;
    uploadedBy: Id<"users">;
  } | null>;
  metadata?: {
    model?: string;
    provider?: string;
    tokens?: number;
    cost?: number;
  };
}

interface MessageListProps {
  messages: Message[];
  chatId?: Id<"chats">;
  onBranchCreated?: (branchId: Id<"chats">) => void;
  isSharedView?: boolean;
  onEditMessage?: (messageId: Id<"messages">, content: string) => Promise<void>;
  onRetryMessage?: (messageId: Id<"messages">) => Promise<void>;
  onStopResponse?: () => void;
  isStreaming?: boolean;
  streamingMessageId?: Id<"messages"> | null;
}

export function MessageList({ 
  messages, 
  chatId, 
  onBranchCreated,
  isSharedView = false,
  onEditMessage,
  onRetryMessage,
  onStopResponse,
  isStreaming = false,
  streamingMessageId
}: MessageListProps) {
  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 retro-glow flex items-center justify-center">
            <svg className="w-6 h-6 retro-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <p className="retro-text-dim">
            {isSharedView ? "&gt; SHARED CONVERSATION" : "&gt; START CONVERSATION"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {messages.map((message, index) => (
        <MessageBubble
          key={message._id}
          message={message}
          isLast={index === messages.length - 1}
          messageIndex={index}
          chatId={chatId}
          onBranchCreated={onBranchCreated}
          isSharedView={isSharedView}
          onEditMessage={onEditMessage}
          onRetryMessage={onRetryMessage}
          onStopResponse={onStopResponse}
          isStreaming={isStreaming && message._id === streamingMessageId}
        />
      ))}
    </div>
  );
}
