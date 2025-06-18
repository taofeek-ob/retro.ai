import { useState } from "react";

import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { toast } from "sonner";
import { useQuery, useMutation, useAction } from "convex/react";
interface BranchButtonProps {
  chatId: Id<"chats">;
  messageIndex: number;
  onBranchCreated: (branchId: Id<"chats">) => void;
}

export function BranchButton({ chatId, messageIndex, onBranchCreated }: BranchButtonProps) {
  const [showModal, setShowModal] = useState(false);
  const [branchTitle, setBranchTitle] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const createBranch = useMutation(api.chats.createBranch);

  const chat = useQuery(api.chats.getChat, chatId ? { chatId } : "skip");
  console.log("chat", chat);
  const handleCreateBranch = async () => {
    if (!branchTitle.trim()) {
      toast.error("Please enter a branch title");
      return;
    }

    setIsCreating(true);
    try {
      const branchId = await createBranch({
        parentChatId: chatId,
        branchPoint: messageIndex + 1,
        title: branchTitle.trim(),
      });
      
      onBranchCreated(branchId);
      setShowModal(false);
      setBranchTitle("");
      toast.success("Branch created successfully!");
    } catch (error) {
      toast.error("Failed to create branch");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="opacity-0 group-hover:opacity-100 retro-button text-xs px-2 py-1 ml-2"
        title="Create Branch"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        BRANCH
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="retro-container p-6 max-w-md w-full">
            <h3 className="text-lg font-bold retro-text mb-4">CREATE BRANCH</h3>
            <p className="text-sm retro-text-dim mb-4">
              Create an alternative conversation path from this point.
            </p>
            
            <div className="mb-4">
              <label className="block text-sm font-medium retro-text mb-2">
                BRANCH TITLE
              </label>
              <input
                type="text"
                value={branchTitle}
                onChange={(e) => setBranchTitle(e.target.value)}
                placeholder="ALTERNATIVE CONVERSATION..."
                className="retro-input w-full"
                autoFocus
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleCreateBranch}
                disabled={isCreating || !branchTitle.trim()}
                className="retro-button flex-1"
              >
                {isCreating ? "CREATING..." : "CREATE BRANCH"}
              </button>
              <button
                onClick={() => {
                  setShowModal(false);
                  setBranchTitle("");
                }}
                className="retro-button-secondary flex-1"
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
