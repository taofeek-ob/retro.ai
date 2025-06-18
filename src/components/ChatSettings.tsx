import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { toast } from "sonner";

interface ChatSettingsProps {
  chatId: Id<"chats">;
  onClose: () => void;
}

export function ChatSettings({ chatId, onClose }: ChatSettingsProps) {
  const userSettings = useQuery(api.settings.getUserSettings);
  const updateUserSettings = useMutation(api.settings.updateUserSettings);
  const [isUpdating, setIsUpdating] = useState(false);

  const handleUpdateSettings = async (updates: any) => {
    setIsUpdating(true);
    try {
      await updateUserSettings(updates);
      toast.success("Settings updated");
    } catch (error) {
      toast.error("Failed to update settings");
    } finally {
      setIsUpdating(false);
    }
  };

  if (!userSettings) return null;

  return (
    <div className="retro-container border-b-2 border-current p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold retro-text">&gt; CHAT SETTINGS</h3>
        <button
          onClick={onClose}
          className="retro-button p-1"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium retro-text mb-2">
            DEFAULT MODEL
          </label>
          <select
            value={userSettings.defaultModel}
            onChange={(e) => handleUpdateSettings({ defaultModel: e.target.value })}
            disabled={isUpdating}
            className="retro-select w-full"
          >
            <option value="gpt-4.1-nano">GPT-4.1 NANO</option>
            <option value="gpt-4o-mini">GPT-4O MINI</option>
          </select>
        </div>

        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={userSettings.enableWebSearch}
              onChange={(e) => handleUpdateSettings({ enableWebSearch: e.target.checked })}
              disabled={isUpdating}
              className="sr-only"
            />
            <div className={`feature-indicator ${userSettings.enableWebSearch ? 'active' : ''}`}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              WEB SEARCH
            </div>
          </label>
        </div>

        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={userSettings.enableImageGeneration}
              onChange={(e) => handleUpdateSettings({ enableImageGeneration: e.target.checked })}
              disabled={isUpdating}
              className="sr-only"
            />
            <div className={`feature-indicator ${userSettings.enableImageGeneration ? 'active' : ''}`}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              IMAGE GEN
            </div>
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium retro-text mb-2">
            THEME
          </label>
          <select
            value={userSettings.theme}
            onChange={(e) => handleUpdateSettings({ theme: e.target.value })}
            disabled={isUpdating}
            className="retro-select w-full"
          >
            <option value="system">SYSTEM</option>
            <option value="light">LIGHT</option>
            <option value="dark">DARK</option>
          </select>
        </div>
      </div>
    </div>
  );
}
