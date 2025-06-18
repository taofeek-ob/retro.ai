import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useState, useRef, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { ChatSettings } from "./ChatSettings";
import { ShareChatModal } from "./ShareChatModal";

interface ChatInterfaceProps {
  chatId: Id<"chats"> | null;
  onChatCreated?: (chatId: Id<"chats">) => void;
  onBranchCreated?: (branchId: Id<"chats">) => void;
}

export function ChatInterface({ chatId, onChatCreated, onBranchCreated }: ChatInterfaceProps) {
  // --- HOOKS AND STATE REFACTOR ---

  // Queries and mutations remain essential
  const chat = useQuery(api.chats.getChat, chatId ? { chatId } : "skip");
  const userSettings = useQuery(api.settings.getUserSettings);
  const addMessageAndUpdateTitle = useMutation(api.messages.addMessageAndUpdateTitle);
  const createChat = useMutation(api.chats.createChat);
  const createEmptyAssistantMessage = useMutation(api.messages.createEmptyAssistantMessage);
  const updateMessage = useMutation(api.messages.updateMessage);
  const markMessageAborted = useMutation(api.messages.markMessageAborted);
  // const retryAssistantMessageMutation = useMutation(api.retryAssistantMessage.retryAssistantMessage); // Old retry
  const streamRetryAction = useAction(api.ai.streamRetry);
  const editUserMessageAndRegenerate = useMutation(api.editUserMessage.editUserMessageAndRegenerate);
  
  // Use the new `streamChat` internal action
  const streamChat = useAction(api.ai.streamChat);

  // State is now much simpler
  const [isLoading, setIsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<Id<"messages"> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // This effect will now smoothly scroll as the last message grows,
  // or when a new message is added.
  // useEffect(() => {
  //   messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  // }, [chat?.messages?.length, chat?.messages?.[chat.messages.length - 1]?.content]);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [
    // Dependency 1: The number of messages
    chat?.messages?.length,
    // Dependency 2: The content of the very last message (for streaming)
    // This access is now safe from the "cannot read properties of undefined" error.
    chat?.messages?.[(chat.messages.length || 1) - 1]?.content,
  ]);
  // --- CORE LOGIC REFACTOR: handleSendMessage ---

  const handleSendMessage = async (
    content: string, 
    attachments?: Id<"_storage">[], 
    selectedModel?: string,
    enableWebSearch?: boolean
  ) => {
    if (!content.trim() || isLoading) return;

    let currentChatId = chatId;
    const model = selectedModel || userSettings?.defaultModel || "gpt-4.1-nano";

    // 1. Create a new chat if one doesn't exist
    if (!currentChatId) {
      try {
        currentChatId = await createChat({ title: "New Chat", model, provider: "openai" });
        onChatCreated?.(currentChatId);
      } catch (error) {
        toast.error("Failed to create new chat.");
        console.error("Failed to create chat:", error);
        return;
      }
    }

    // Set loading state to prevent multiple submissions
    setIsLoading(true);

    try {
      // 2. Add the user's message to the database
      await addMessageAndUpdateTitle({
        chatId: currentChatId,
        role: "user",
        content: content.trim(),
        attachments,
      });

      // 3. Prepare message history for the AI
      const messagesForApi = [
        ...(chat?.messages || []).map(msg => ({
          role: msg.role,
          content: msg.content,
        })),
        { role: "user" as const, content: content.trim() },
      ];

      // 4. Create the empty assistant message placeholder
      const assistantMessageId = await createEmptyAssistantMessage({
        chatId: currentChatId,
        metadata: { model, provider: "openai" },
      });

      // 5. Set streaming state
      setIsStreaming(true);
      setStreamingMessageId(assistantMessageId);
      abortControllerRef.current = new AbortController();

      // 6. Start the AI streaming action in the background
      streamChat({
        messages: messagesForApi,
        messageId: assistantMessageId,
        model,
        enableWebSearch,
      }).catch((error) => {
        if (error.name === 'AbortError') {
          console.log('Streaming aborted');
        } else {
          console.error('Streaming error:', error);
          toast.error('An error occurred while generating the response');
        }
      }).finally(() => {
        setIsStreaming(false);
        setStreamingMessageId(null);
        abortControllerRef.current = null;
      });

    } catch (error) {
      console.error("Error sending message:", error);
      toast.error("An error occurred while sending your message. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditMessage = async (messageId: Id<"messages">, newContent: string) => {
    if (!chatId) {
      toast.error("Chat not found. Cannot edit message.");
      return;
    }
    if (!newContent.trim()) {
      toast.error("Message content cannot be empty.");
      return;
    }

    // Determine model, provider, and webSearch settings
    const model = chat?.model || userSettings?.defaultModel || "gpt-4.1-nano";
    const provider = chat?.provider || userSettings?.defaultProvider || "openai"; // Assuming defaultProvider in userSettings
    const enableWebSearch = userSettings?.enableWebSearch ?? false;

    setIsLoading(true); // Indicate activity for the edit operation
    try {
      await editUserMessageAndRegenerate({
        messageId,
        newContent: newContent.trim(),
        chatId,
        model,
        provider,
        enableWebSearch,
      });
      // Optimistic updates or Convex's reactivity should handle UI changes.
      // No need to manually set isStreaming here as the backend mutation handles the new stream.
      toast.success("Message edited and new response is generating.");
    } catch (error) {
      console.error("Error editing message and regenerating response:", error);
      toast.error("Failed to edit message. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetryMessage = async (messageId: Id<"messages">) => {
    if (!chatId) {
      toast.error("Chat not found. Cannot retry message.");
      return;
    }

    const messageToRetry = chat?.messages?.find(msg => msg._id === messageId);
    if (!messageToRetry || messageToRetry.role !== 'assistant') {
      toast.error("Cannot retry: Original message not found or not an assistant message.");
      return;
    }

    const latestVersion = messageToRetry.responseVersions?.[messageToRetry.currentVersionIndex || 0];
    const model = latestVersion?.metadata?.model || userSettings?.defaultModel || "gpt-4o-mini";

    let messagesForRetryContext: { role: "user" | "assistant" | "system"; content: string }[] = [];
    if (chat?.messages) {
      const assistantMessageIndex = chat.messages.findIndex(msg => msg._id === messageId);
      if (assistantMessageIndex > 0) {
        let userPromptIndex = -1;
        for (let i = assistantMessageIndex - 1; i >= 0; i--) {
          if (chat.messages[i].role === 'user') {
            userPromptIndex = i;
            break;
          }
        }
        if (userPromptIndex !== -1) {
          messagesForRetryContext = chat.messages.slice(0, userPromptIndex + 1).map(msg => ({
            role: msg.role as "user" | "assistant" | "system",
            content: msg.role === 'user' ? msg.content || "" :
                     (msg.responseVersions && msg.responseVersions.length > 0 && msg.responseVersions[msg.currentVersionIndex || 0]) ?
                     msg.responseVersions[msg.currentVersionIndex || 0].content || "" :
                     msg.content || "",
          }));
        } else {
          const lastUserMessage = chat.messages.filter(m => m.role === 'user').pop();
          if (lastUserMessage?.content) {
            messagesForRetryContext.push({ role: 'user', content: lastUserMessage.content });
            toast.info("Could not find a preceding user message for full context. Retrying with last user message.");
          } else {
            toast.info("Could not find a preceding user message for full context. Retrying with no prior user context.");
          }
        }
      } else {
        toast.info("Assistant message is at the start or not found. Retrying with no prior context.");
      }
    }
    
    if (messagesForRetryContext.length === 0) {
        // This is a critical fallback if the above logic somehow results in an empty context
        // when it shouldn't (e.g. assistant message is not first, but no user prompt found).
        // Try to at least get the message directly before the assistant message if it was a user message.
        const assistantMessageIndex = chat?.messages?.findIndex(msg => msg._id === messageId);
        if (assistantMessageIndex && assistantMessageIndex > 0) {
            const potentialUserPrompt = chat?.messages[assistantMessageIndex-1];
            if (potentialUserPrompt && potentialUserPrompt.role === 'user' && potentialUserPrompt.content) {
                messagesForRetryContext.push({role: 'user', content: potentialUserPrompt.content});
                toast.info("Retry context construction was complex, using immediate preceding user message.");
            }
        }
    }

    if (messagesForRetryContext.length === 0) {
        toast.error("Cannot construct any message context for retry. Aborting retry.");
        return;
    }

    setIsLoading(true); 
    setIsStreaming(true); 
    setStreamingMessageId(messageId); 
    abortControllerRef.current = new AbortController();

    try {
      await streamRetryAction({ 
        originalMessageId: messageId,
        chatId,
        model,
        messagesForRetryContext,
        enableWebSearch: userSettings?.enableWebSearch || false, 
      });
    } catch (error: any) {
      console.error("Failed to stream retry message:", error);
      // Avoid showing a generic 'Unknown error' if the error object has a message
      const errorMessage = error?.message || (typeof error === 'string' ? error : "Unknown error during retry stream");
      toast.error(`Message retry stream failed: ${errorMessage}`);
    } finally {
      setIsStreaming(false);
      setStreamingMessageId(null);
      if (abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
         abortControllerRef.current = null; 
      }
      setIsLoading(false);
    }
  };

  const handleStopResponse = async () => {
    if (streamingMessageId) {
      try {
        await markMessageAborted({ messageId: streamingMessageId });
        setIsStreaming(false);
        setStreamingMessageId(null);
        abortControllerRef.current = null;
      } catch (error) {
        console.error("Error stopping response:", error);
        toast.error("Failed to stop response");
      }
    }
  };

  // --- JSX REMAINS LARGELY THE SAME ---

  // Default "new chat" interface (no changes needed)
  if (!chatId) {
    return (
      <div className="flex-1 flex flex-col h-full">
       
        {/* Welcome Header */}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center retro-container p-8 max-w-2xl">
            <div className="w-16 h-16 mx-auto mb-4 retro-glow flex items-center justify-center">
              <svg className="w-8 h-8 retro-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold retro-text mb-4">
              &gt; WELCOME TO RETRO.CHAT
            </h2>
            <p className="retro-text-dim mb-6">
              START A NEW CONVERSATION BELOW
            </p>
            <div className="text-sm retro-text-muted space-y-1 mb-6">
              <p>[✓] MULTIPLE AI MODELS</p>
              <p>[✓] FILE ATTACHMENTS</p>
              <p>[✓] REAL-TIME STREAMING</p>
              <p>[✓] WEB SEARCH INTEGRATION</p>
              <p>[✓] CHAT BRANCHING</p>
              <p>[✓] PUBLIC SHARING</p>
            </div>
          </div>
        </div>
        <div className="border-t-2 border-current retro-container">
          <MessageInput
            onSendMessage={handleSendMessage}
            isLoading={isLoading}
            chatId={null}
          />
        </div>
      </div>
    );
  }

  // Active chat interface
  return (
    <div className="flex-1 flex flex-col h-full">
      {/* ... your chat header JSX ... */}
      {/* Chat Header */}
      <div className="sticky top-0 z-10 retro-container border-b-2 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="font-bold retro-text">
              &gt; {chat?.title || "LOADING..."}
            </h2>
            {/* {chat?.parentChatId && (
              <span className="feature-indicator">
                BRANCH
              </span>
            )} */}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowShareModal(true)}
              className="retro-button-secondary p-2"
              title="Share Chat"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
              </svg>
            </button>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="retro-button p-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {showSettings && (
        <ChatSettings chatId={chatId} onClose={() => setShowSettings(false)} />
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <MessageList 
          messages={chat?.messages || []} 
          chatId={chatId}
          onBranchCreated={onBranchCreated}
          onEditMessage={handleEditMessage}
          onRetryMessage={handleRetryMessage}
          onStopResponse={handleStopResponse}
          isStreaming={isStreaming}
          streamingMessageId={streamingMessageId}
        />
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <div className="sticky bottom-0 border-t-2 border-current retro-container">
        <MessageInput
          onSendMessage={handleSendMessage}
          isLoading={isLoading}
          chatId={chatId}
          isStreaming={isStreaming}
          onStopResponse={handleStopResponse}
        />
      </div>

      {showShareModal && (
        <ShareChatModal chatId={chatId} onClose={() => setShowShareModal(false)} />
      )}
    </div>
  );
}