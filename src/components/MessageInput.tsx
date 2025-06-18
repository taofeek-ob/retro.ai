import { useState, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { toast } from "sonner";

interface MessageInputProps {
  onSendMessage: (
    content: string, 
    attachments?: Id<"_storage">[], 
    selectedModel?: string,
    enableWebSearch?: boolean,
    enableImageGeneration?: boolean
  ) => void;
  isLoading: boolean;
  chatId: Id<"chats"> | null;
  isStreaming?: boolean;
  onStopResponse?: () => void;
}

export function MessageInput({
  onSendMessage,
  isLoading,
  chatId,
  isStreaming,
  onStopResponse,
}: MessageInputProps) {
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<Id<"_storage">[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedModel, setSelectedModel] = useState("gpt-4.1-nano");
  const [enableWebSearch, setEnableWebSearch] = useState(false);
  const [enableImageGeneration, setEnableImageGeneration] = useState(false);
  const [showFeatures, setShowFeatures] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const generateUploadUrl = useMutation(api.messages.generateUploadUrl);
  const saveAttachment = useMutation(api.messages.saveAttachment);
  const userSettings = useQuery(api.settings.getUserSettings);

  const models = [
    { id: "gpt-4.1-nano", name: "GPT-4.1 NANO" },
    { id: "gpt-4o-mini", name: "GPT-4O MINI" },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || isLoading) return;

    const content = message.trim();
    setMessage("");
    
     onSendMessage(
      content, 
      attachments.length > 0 ? attachments : undefined,
      selectedModel,
      enableWebSearch,
      enableImageGeneration
    );
    setAttachments([]);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      for (const file of Array.from(files)) {
        const uploadUrl = await generateUploadUrl();
        
        const result = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });

        if (!result.ok) {
          throw new Error(`Upload failed: ${result.statusText}`);
        }

        const { storageId } = await result.json();

        await saveAttachment({
          storageId,
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
        });

        setAttachments(prev => [...prev, storageId]);
      }
      
      toast.success("Files uploaded successfully");
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Failed to upload files");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (isStreaming) return; // Prevent sending if streaming
      handleSubmit(e as any);
    }
  };

  return (
    <div className="p-4">
      {/* Model and Features Selection */}
      <div className="mb-3 flex items-center gap-2 flex-wrap">
        <select
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value)}
          className="retro-select text-xs"
        >
          {models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name}
            </option>
          ))}
        </select>

        <button
          onClick={() => setShowFeatures(!showFeatures)}
          className="retro-button text-xs p-1"
          title="Toggle Features"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
          </svg>
        </button>

        {showFeatures && (
          <div className="flex gap-2">
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={enableWebSearch}
                onChange={(e) => setEnableWebSearch(e.target.checked)}
                className="sr-only"
              />
              <div className={`feature-indicator ${enableWebSearch ? 'active' : ''}`}>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                WEB
              </div>
            </label>
            
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={enableImageGeneration}
                onChange={(e) => setEnableImageGeneration(e.target.checked)}
                className="sr-only"
              />
              <div className={`feature-indicator ${enableImageGeneration ? 'active' : ''}`}>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                IMG
              </div>
            </label>
          </div>
        )}
      </div>

      {/* Active Features Display */}
      {(enableWebSearch || enableImageGeneration) && (
        <div className="mb-3 flex gap-2">
          {enableWebSearch && (
            <span className="feature-indicator active">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              WEB SEARCH ENABLED
            </span>
          )}
          {enableImageGeneration && (
            <span className="feature-indicator active">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              IMAGE GEN ENABLED
            </span>
          )}
        </div>
      )}

      {/* Attachments Preview */}
      {attachments.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {attachments.map((attachment, index) => (
            <div
              key={index}
              className="flex items-center gap-2 retro-container px-3 py-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
              <span className="text-sm retro-text">FILE_{index + 1}</span>
              <button
                onClick={() => removeAttachment(index)}
                className="retro-text-muted hover:text-red-400"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <div className="flex-1">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="&gt; TYPE YOUR MESSAGE..."
            className="retro-input w-full resize-none"
            rows={1}
            style={{
              minHeight: "52px",
              maxHeight: "200px",
              height: "auto",
            }}
            disabled={isLoading}
          />
        </div>

        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileUpload}
            className="hidden"
            accept="image/*,.pdf,.doc,.docx,.txt"
            style={{
              height: "52px",
              // maxHeight: "200px",
              // height: "auto",
            }}
          />
          
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || isLoading || isStreaming}
            className="retro-button p-3"
            title="Upload File"
           
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </button>

          {isStreaming ? (
            <button
              type="button"
              onClick={onStopResponse}
              disabled={!onStopResponse} 
              className=" px-4 py-3 bg-red-500 hover:bg-red-600 text-white flex items-center justify-center"
              title="Stop Generating"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5 5a1 1 0 011-1h8a1 1 0 011 1v8a1 1 0 01-1 1H6a1 1 0 01-1-1V5z" clipRule="evenodd" />
              </svg>
            </button>
          ) : (
            <button
              type="submit"
              disabled={!message.trim() || isLoading || isUploading}
              className="retro-button px-4 py-3"
            >
              {isLoading ? (
                <div className="retro-blink">PROCESSING...</div>
              ) : (
                "SEND"
              )}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
