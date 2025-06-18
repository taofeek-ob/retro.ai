import { Id } from "../../convex/_generated/dataModel";
import { CodeBlock } from "./CodeBlock";
import { ImageViewer } from "./ImageViewer";
import { BranchButton } from "./BranchButton";
import { useState, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { toast } from "sonner";

interface Message {
  _id: Id<"messages">;
  role: "user" | "assistant" | "system";
  content: string;
  _creationTime: number;
  responseVersions?: Array<{
    content: string;
    timestamp: number;
    metadata?: {
      model?: string;
      provider?: string;
      tokens?: number;
      cost?: number;
      errorDetails?: string;
    };
    isError?: boolean;
    attachments?: Id<"_storage">[];
  }>;
  currentVersionIndex?: number;
  isStreaming?: boolean;
  isAborted?: boolean;
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

interface MessageBubbleProps {
  message: Message;
  isLast: boolean;
  messageIndex?: number;
  chatId?: Id<"chats">;
  onBranchCreated?: (branchId: Id<"chats">) => void;
  isSharedView?: boolean;
  onEditMessage?: (messageId: Id<"messages">, content: string) => Promise<void>;
  onRetryMessage?: (messageId: Id<"messages">) => Promise<Message | { version: number }>;
  onStopResponse?: () => void;
  isStreaming?: boolean;
}

interface FormattedContent {
  type: 'text' | 'code' | 'bold' | 'italic' | 'inline-code';
  content: string;
  language?: string;
}

interface AttachmentPreviewProps {
  attachmentId: Id<"attachments">;
}

export function MessageBubble({ 
  message, 
  isLast, 
  messageIndex, 
  chatId, 
  onBranchCreated,
  isSharedView = false,
  onEditMessage,
  onRetryMessage,
  onStopResponse,
  isStreaming = false
}: MessageBubbleProps) {
  const [showMetadata, setShowMetadata] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(message.content);
  const [formattedContent, setFormattedContent] = useState<FormattedContent[]>([]);
  const [currentVersionIndex, setCurrentVersionIndex] = useState(message.currentVersionIndex || 0);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const isAssistantMessage = message.role === "assistant";
  
  const createBranch = useMutation(api.chats.createBranch);
  const switchVersion = useMutation(api.switchMessageVersion.switchMessageVersion);
  
  const chat = useQuery(api.chats.getChat, chatId ? { chatId } : "skip");
  
  // Get current version data from responseVersions
  const currentVersionData = message.responseVersions?.[currentVersionIndex] || null;
  const totalVersions = message.responseVersions?.length || 1;
  const hasMultipleVersions = totalVersions > 1;
  
  // Use current version content or fallback to message content
  const displayContent = currentVersionData?.content || message.content;
  const displayMetadata = currentVersionData?.metadata || message.metadata;
  const displayAttachments = currentVersionData?.attachments || message.attachments;

  useEffect(() => {
    // Pre-parse content for instant formatting
    const parseContent = (content: string): FormattedContent[] => {
      const parts: FormattedContent[] = [];
      const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
      let lastIndex = 0;
      let match;

      // Handle code blocks first
      while ((match = codeBlockRegex.exec(content)) !== null) {
        // Add text before code block
        if (match.index > lastIndex) {
          const textBefore = content.slice(lastIndex, match.index);
          if (textBefore.trim()) {
            parts.push({ type: 'text', content: textBefore });
          }
        }
        
        // Add code block
        parts.push({
          type: 'code',
          content: match[2],
          language: match[1] || 'text'
        });
        
        lastIndex = match.index + match[0].length;
      }

      // Add remaining text
      if (lastIndex < content.length) {
        const remainingText = content.slice(lastIndex);
        if (remainingText.trim()) {
          parts.push({ type: 'text', content: remainingText });
        }
      }

      // If no code blocks, treat as single text block
      if (parts.length === 0) {
        parts.push({ type: 'text', content });
      }

      return parts;
    };

    setFormattedContent(parseContent(displayContent));
  }, [displayContent]);

  const renderFormattedText = (text: string) => {
    return text.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g).map((segment, index) => {
      if (segment.startsWith("**") && segment.endsWith("**")) {
        return <strong key={index} className="retro-text">{segment.slice(2, -2)}</strong>;
      } else if (segment.startsWith("*") && segment.endsWith("*") && !segment.startsWith("**")) {
        return <em key={index} className="retro-text-dim">{segment.slice(1, -1)}</em>;
      } else if (segment.startsWith("`") && segment.endsWith("`")) {
        return (
          <code key={index} className="retro-container px-1 py-0.5 text-sm inline-block">
            {segment.slice(1, -1)}
          </code>
        );
      }
      return segment;
    });
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(displayContent);
      toast.success("Message copied to clipboard");
    } catch (error) {
      toast.error("Failed to copy message");
    }
  };

  const handleEdit = async () => {
    if (!onEditMessage) return;
    try {
      await onEditMessage(message._id, editedContent);
      setIsEditing(false);
    } catch (error) {
      toast.error("Failed to edit message");
    }
  };

  const handleRetry = async () => {
    if (isRetrying || !isAssistantMessage || !onRetryMessage) return;
    setIsRetrying(true);
    
    try {
      const result = await onRetryMessage(message._id);
      // After retry, switch to the new version
      if (result && 'version' in result && result.version) {
        setCurrentVersionIndex(result.version);
      }
      toast.success("Response regenerated");
    } catch (error) {
      toast.error("Failed to retry message");
    } finally {
      setIsRetrying(false);
    }
  };

  const handleVersionChange = async (newVersionIndex: number) => {
    if (newVersionIndex === currentVersionIndex || !message.responseVersions) return;
    
    try {
      await switchVersion({
        messageId: message._id,
        targetVersionIndex: newVersionIndex
      });
      setCurrentVersionIndex(newVersionIndex);
    } catch (error) {
      toast.error("Failed to switch version");
    }
  };
  
  const goToPrevVersion = () => {
    if (currentVersionIndex > 0) {
      handleVersionChange(currentVersionIndex - 1);
    }
  };
  
  const goToNextVersion = () => {
    if (currentVersionIndex < totalVersions - 1) {
      handleVersionChange(currentVersionIndex + 1);
    }
  };

  const handleCreateBranch = async (
    messageIndex: number,
    onBranchCreated: (branchId: Id<"chats">) => void
  ) => {
    if (!chatId) {
      toast.error("No chat selected — can't branch.");
      return;
    }
  
    setIsCreating(true);
    try {
      const branchId = await createBranch({
        parentChatId: chatId,
        branchPoint: messageIndex + 1,
        title: chat?.title || "",
      });
      onBranchCreated(branchId);
      toast.success("Branch created successfully!");
    } catch {
      toast.error("Failed to create branch");
    } finally {
      setIsCreating(false);
    }
  };

  if (isSystem) {
    return (
      <div className="flex justify-center">
        <div className="retro-container px-3 py-2 text-sm" style={{ borderColor: 'var(--retro-warning)' }}>
          <span style={{ color: 'var(--retro-warning)' }}>[SYSTEM] {displayContent}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} group`}>
      <div className={`max-w-3xl ${isUser ? "order-2" : "order-1"}`}>
        <div className={`retro-container px-4 py-3 ${isUser ? 'retro-glow' : ''}`}>
          {/* Attachments */}
          {message.attachmentDetails && message.attachmentDetails.length > 0 && (
            <div className="mb-3 space-y-2">
              {message.attachmentDetails.filter(Boolean).map((attachment) => (
                <div key={attachment!._id} className="flex items-center gap-2">
                  {attachment!.fileType.startsWith("image/") && attachment!.url ? (
                    <ImageViewer src={attachment!.url} alt={attachment!.fileName} />
                  ) : (
                    <div className="flex items-center gap-2 p-2 retro-container">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span className="text-sm retro-text">{attachment!.fileName}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Content */}
          {isEditing ? (
            <div className="space-y-2">
              <textarea
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                className="w-full p-2 retro-container retro-text bg-transparent"
                rows={4}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleEdit();
                  }
                }}
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setIsEditing(false)}
                  className="retro-button-secondary px-2 py-1 text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEdit}
                  className="retro-button px-2 py-1 text-sm"
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <div className="retro-text">
              {formattedContent.map((part, index) => {
                if (part.type === 'code') {
                  return (
                    <CodeBlock
                      key={index}
                      code={part.content}
                      language={part.language || 'text'}
                    />
                  );
                } else {
                  return (
                    <div key={index} className="whitespace-pre-wrap">
                      {part.content.split("\n").map((line, lineIndex) => (
                        <div key={lineIndex}>
                          {renderFormattedText(line)}
                        </div>
                      ))}
                    </div>
                  );
                }
              })}
              {message.isStreaming && (
                <span className="streaming-indicator ml-1 retro-text-dim">▊</span>
              )}
            </div>
          )}

          {/* Version Controls - only show for assistant messages with multiple versions */}
          {isAssistantMessage && hasMultipleVersions && (
            <div className="flex items-center justify-center gap-2 mt-3 pt-2 border-t border-current">
              <button 
                className="retro-button-secondary px-2 py-1 text-xs"
                onClick={goToPrevVersion}
                disabled={currentVersionIndex === 0}
                title="Previous version"
              >
                ←
              </button>
              
              <span className="text-xs retro-text-muted px-2">
                Version {currentVersionIndex + 1} of {totalVersions}
              </span>
              
              <button 
                className="retro-button-secondary px-2 py-1 text-xs"
                onClick={goToNextVersion}
                disabled={currentVersionIndex === totalVersions - 1}
                title="Next version"
              >
                →
              </button>
            </div>
          )}

          {/* Metadata */}
          {!isUser && displayMetadata && (
            <div className="mt-2 pt-2 border-t border-current">
              <button
                onClick={() => setShowMetadata(!showMetadata)}
                className="text-xs retro-text-muted hover:retro-text-dim"
              >
                [{displayMetadata.model}] [{displayMetadata.provider}]
                {displayMetadata.tokens && ` [${displayMetadata.tokens} TOKENS]`}
              </button>
              {showMetadata && (
                <div className="mt-1 text-xs retro-text-muted space-y-1">
                  <div>MODEL: {displayMetadata.model}</div>
                  <div>PROVIDER: {displayMetadata.provider}</div>
                  {displayMetadata.tokens && <div>TOKENS: {displayMetadata.tokens}</div>}
                  {displayMetadata.cost && <div>COST: ${displayMetadata.cost.toFixed(4)}</div>}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Message Actions */}
        <div className="flex items-center justify-between text-xs retro-text-muted mt-1">
          <div className="flex items-center gap-2">
            <span>
              {isUser ? "[USER]" : "[AI]"} {new Date(message._creationTime).toLocaleTimeString()}
            </span>
            
            {/* Action Buttons */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={handleCopy}
                className="retro-button-secondary p-1"
                title="Copy Message"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                </svg>
              </button>
              
              {isUser && onEditMessage && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="retro-button-secondary p-1"
                  title="Edit Message"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              )}
              
              {isAssistantMessage && !message.isStreaming && onRetryMessage && (
                <button
                  onClick={handleRetry}
                  disabled={isRetrying}
                  className="retro-button-secondary p-1"
                  title="Retry this response"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              )}
              
              {message.isStreaming && onStopResponse && (
                <button
                  onClick={onStopResponse}
                  className="retro-button-secondary p-1"
                  title="Stop Response"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
              
              {message.isAborted && (
                <span className="text-yellow-500" title="Message was aborted">
                  ⚠️
                </span>
              )}
            </div>
          </div>
          
          {!isSharedView && !isUser && chatId && messageIndex !== undefined && onBranchCreated && (
            <button
              onClick={() => handleCreateBranch(messageIndex, onBranchCreated)}
              className="opacity-0 group-hover:opacity-100 retro-button text-xs px-2 py-1 ml-2"
              title="Create Branch"
              disabled={isCreating}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              {isCreating ? "..." : "BRANCH"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}