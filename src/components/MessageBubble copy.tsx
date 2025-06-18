import { Id } from "../../convex/_generated/dataModel";
import { CodeBlock } from "./CodeBlock";
import { ImageViewer } from "./ImageViewer";
import { useState, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { toast } from "sonner";

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
  onRetryMessage?: (messageId: Id<"messages">) => Promise<void>;
  onStopResponse?: () => void;
  isStreaming?: boolean;
}

interface FormattedContent {
  type: 'text' | 'code';
  content: string;
  language?: string;
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
  isStreaming = false,
}: MessageBubbleProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(message.content);
  const [formattedContent, setFormattedContent] = useState<FormattedContent[]>([]);
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const [isCreatingBranch, setIsCreatingBranch] = useState(false);

  const createBranchMutation = useMutation(api.chats.createBranch);
  const switchVersionMutation = useMutation(api.switchMessageVersion.switchMessageVersion);

  const currentMessageContent = message.role === 'assistant' && message.responseVersions && typeof message.currentVersionIndex === 'number'
    ? message.responseVersions[message.currentVersionIndex]?.content ?? message.content 
    : message.content;

  const currentMessageMetadata = message.role === 'assistant' && message.responseVersions && typeof message.currentVersionIndex === 'number'
    ? message.responseVersions[message.currentVersionIndex]?.metadata
    : message.metadata; 

  useEffect(() => {
    const parseContent = (contentToParse: string): FormattedContent[] => {
      const parts: FormattedContent[] = [];
      const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
      let lastIndex = 0;
      let match;

      while ((match = codeBlockRegex.exec(contentToParse)) !== null) {
        if (match.index > lastIndex) {
          parts.push({ type: 'text', content: contentToParse.slice(lastIndex, match.index) });
        }
        parts.push({
          type: 'code',
          content: match[2],
          language: match[1] || 'text',
        });
        lastIndex = match.index + match[0].length;
      }

      if (lastIndex < contentToParse.length) {
        parts.push({ type: 'text', content: contentToParse.slice(lastIndex) });
      }
      
      if (parts.length === 0 && contentToParse) { 
        parts.push({ type: 'text', content: contentToParse });
      }
      return parts;
    };
    setFormattedContent(parseContent(currentMessageContent));
  }, [currentMessageContent]);

  const renderFormattedText = (text: string) => {
    return text.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g).map((segment, index) => {
      if (segment.startsWith("**") && segment.endsWith("**")) {
        return <strong key={index} className="retro-text">{segment.slice(2, -2)}</strong>;
      } else if (segment.startsWith("*") && segment.endsWith("*") && !segment.startsWith("**")) {
        return <em key={index} className="retro-text-dim">{segment.slice(1, -1)}</em>;
      } else if (segment.startsWith("`") && segment.endsWith("`")) {
        return <code key={index} className="retro-container px-1 py-0.5 text-sm inline-block">{segment.slice(1, -1)}</code>;
      }
      return segment;
    });
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(currentMessageContent);
      toast.success("Message copied to clipboard");
    } catch (error) {
      toast.error("Failed to copy message");
    }
  };

  const handleBranchCreationAttempt = async () => {
    if (!chatId || typeof messageIndex === 'undefined' || !onBranchCreated) {
      toast.error("Cannot create branch: Required information missing.");
      return;
    }

    setIsCreatingBranch(true);
    try {
      const branchTitle = `Branch: ${currentMessageContent.substring(0, 25)}${currentMessageContent.length > 25 ? '...' : ''}`;
      
      const newBranchChatId = await createBranchMutation({
        parentChatId: chatId,
        branchPoint: messageIndex + 1, 
        title: branchTitle,
      });

      if (newBranchChatId) {
        toast.success(`Branch "${branchTitle}" created!`);
        onBranchCreated(newBranchChatId);
      } else {
        toast.error("Failed to create branch: Operation did not return a new chat ID.");
      }
    } catch (error) {
      console.error("Failed to create branch:", error);
      toast.error(`Error creating branch: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsCreatingBranch(false);
    }
  };

  const handleEdit = async () => {
    if (!onEditMessage || message.role !== 'user') return; 
    try {
      await onEditMessage(message._id, editedContent);
      setIsEditing(false);
    } catch (error) {
      toast.error("Failed to edit message");
    }
  };

  const handleRetry = async () => {
    if (!onRetryMessage || message.role !== 'assistant') return;
    try {
      await onRetryMessage(message._id);
    } catch (error) {
      toast.error("Failed to retry message");
    }
  };

  const handleSwitchVersion = async (newIndex: number) => {
    if (message.role !== 'assistant' || !message.responseVersions) return;
    if (newIndex < 0 || newIndex >= message.responseVersions.length) return;
    try {
      await switchVersionMutation({ messageId: message._id, targetVersionIndex: newIndex });
    } catch (error) {
      console.error("Failed to switch version:", error);
      toast.error("Failed to switch message version.");
    }
  };

  const chat = useQuery(api.chats.getChat, chatId ? { chatId } : "skip");
  const handleCreateBranch = async () => {
    if (!chatId || typeof messageIndex !== 'number' || !onBranchCreated) {
      toast.error("Cannot create branch: Missing required information.");
      return;
    }
    setIsCreatingBranch(true);
    try {
      const branchId = await createBranchMutation({
        parentChatId: chatId,
        branchPoint: messageIndex + 1, 
        title: chat?.title || "Branched Chat",
      });
      onBranchCreated(branchId);
      toast.success("Branch created successfully!");
    } catch (err) {
      console.error("Failed to create branch:", err);
      toast.error("Failed to create branch.");
    } finally {
      setIsCreatingBranch(false);
    }
  };
  
  useEffect(() => {
    if (isEditing) {
      setEditedContent(currentMessageContent);
    }
  }, [isEditing, currentMessageContent]);

  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <div className="retro-container px-3 py-2 text-sm" style={{ borderColor: 'var(--retro-warning)' }}>
          <span style={{ color: 'var(--retro-warning)' }}>[SYSTEM] {message.content}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} group my-1`}>
      <div className={`max-w-3xl w-full ${isUser ? "order-2" : "order-1"}`}>
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
          {isEditing && isUser ? (
            <div className="space-y-2">
              <textarea
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                className="w-full p-2 retro-container retro-text bg-transparent focus:ring-1 focus:ring-[var(--retro-accent)]"
                rows={Math.max(3, editedContent.split('\n').length)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleEdit();
                  }
                  if (e.key === 'Escape') {
                     e.preventDefault();
                     setIsEditing(false);
                  }
                }}
              />
              <div className="flex justify-end gap-2">
                <button onClick={() => setIsEditing(false)} className="retro-button-secondary px-2 py-1 text-sm">Cancel</button>
                <button onClick={handleEdit} className="retro-button px-2 py-1 text-sm">Save</button>
              </div>
            </div>
          ) : (
            <div className="retro-text prose dark:prose-invert prose-sm max-w-none break-words">
              {formattedContent.map((part, index) => 
                part.type === 'code' ? (
                  <CodeBlock key={index} code={part.content} language={part.language || 'text'} />
                ) : (
                  <div key={index} className="whitespace-pre-wrap">
                    {part.content.split("\n").map((line, lineIndex) => (
                      <div key={lineIndex}>{renderFormattedText(line)}</div>
                    ))}
                  </div>
                )
              )}
               {isStreaming && message.role === 'assistant' && <span className="blinking-cursor">▋</span>}
            </div>
          )}

          {/* Separator Line - Show for non-editing user and assistant messages */} 
          {(!isEditing || !isUser) && <hr className="my-2 border-[var(--retro-ui-secondary-text)] opacity-30" />}

          {/* Message Footer */}
          <div className="flex justify-between items-center mt-1 pt-1 text-xs text-[var(--retro-ui-secondary-text)]">
            <div className="flex items-center gap-2">
              {/* Timestamp & Model Name */}
              <span>{new Date(message._creationTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              {message.role === 'assistant' && currentMessageMetadata?.model && (
                <span className="ml-1 font-mono text-xs">[{currentMessageMetadata.model}]</span>
              )}

              {/* Version Navigation */}
              {message.role === 'assistant' && message.responseVersions && message.responseVersions.length > 1 && typeof message.currentVersionIndex === 'number' && (
                <div className="flex items-center gap-1 ml-2">
                  <button
                    onClick={() => handleSwitchVersion(message.currentVersionIndex! - 1)}
                    disabled={message.currentVersionIndex === 0}
                    className="retro-button-secondary p-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Previous Version"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <span>({message.currentVersionIndex + 1}/{message.responseVersions.length})</span>
                  <button
                    onClick={() => handleSwitchVersion(message.currentVersionIndex! + 1)}
                    disabled={message.currentVersionIndex === message.responseVersions.length - 1}
                    className="retro-button-secondary p-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Next Version"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              )}
            </div>

            {/* Action Buttons (Copy, Edit, Retry, Stop) - Show on hover */} 
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={handleCopy} className="retro-button-secondary p-1" title="Copy Message">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
              </button>
              
              {isUser && onEditMessage && !isSharedView && (
                <button onClick={() => setIsEditing(true)} className="retro-button-secondary p-1" title="Edit Message">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                </button>
              )}
              
              {message.role === 'assistant' && onRetryMessage && !isSharedView && (
                <button onClick={handleRetry} className="retro-button-secondary p-1" title="Retry Message" disabled={isStreaming || isCreatingBranch}>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                </button>
              )}
              
              {isStreaming && onStopResponse && message.role === 'assistant' && (
                <button onClick={onStopResponse} className="retro-button-secondary p-1" title="Stop Response">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
            </div>
          </div>
          
          {/* Branch Button - Show on hover for assistant messages in non-shared view 
          {!isSharedView && message.role === 'assistant' && chatId && typeof messageIndex === 'number' && onBranchCreated && (
            <div className="flex justify-end mt-1">
                <button 
                    onClick={handleCreateBranch} 
                    className="opacity-0 group-hover:opacity-100 retro-button text-xs px-2 py-1" 
                    title="Create Branch from this point" 
                    disabled={isCreatingBranch || isStreaming}
  
              // title="Previous Version"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span>
              ({message.currentVersionIndex! + 1}/{message.responseVersions!.length})
            </span>
            <button 
              onClick={() => handleSwitchVersion(message.currentVersionIndex! + 1)}
              disabled={message.currentVersionIndex === message.responseVersions!.length - 1}
              className="retro-button-secondary p-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Next Version"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
              </div>
            )} */}
            
            {/* Action Buttons */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {/* <button
                onClick={handleCopy}
                className="retro-button-secondary p-1"
                title="Copy Message"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                </svg>
              </button> */}
              
              {/* {isUser && onEditMessage && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="retro-button-secondary p-1"
                  title="Edit Message"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              )} */}
              
              {/* {!isUser && onRetryMessage && (
                <button
                  onClick={handleRetry}
                  className="retro-button-secondary p-1"
                  title="Retry Message"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              )} */}
              
              {isStreaming && onStopResponse && (
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
            </div>
          </div>
          
          {!isSharedView && !isUser && chatId && messageIndex !== undefined && onBranchCreated && (
            // <BranchButton
            //   chatId={chatId}
            //   messageIndex={messageIndex}
            //   onBranchCreated={onBranchCreated}
            // />
            <button
            onClick={handleBranchCreationAttempt}
            disabled={isCreatingBranch}
            className="opacity-0 group-hover:opacity-100 retro-button text-xs px-2 py-1 ml-2 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Create Branch"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            BRANCH
          </button>
          )}
        </div>
      </div>
    
  );
}
