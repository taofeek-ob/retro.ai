interface ModelSelectorProps {
  selectedModel: string;
  selectedProvider: string;
  onModelChange: (model: string) => void;
  onProviderChange: (provider: string) => void;
}

export function ModelSelector({
  selectedModel,
  selectedProvider,
  onModelChange,
  onProviderChange,
}: ModelSelectorProps) {
  const models = {
    openai: [
      { id: "gpt-4.1-nano", name: "GPT-4.1 Nano" },
      { id: "gpt-4o-mini", name: "GPT-4o Mini" },
    ],
  };

  return (
    <div className="flex items-center gap-2">
      <select
        value={selectedProvider}
        onChange={(e) => onProviderChange(e.target.value)}
        className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white"
      >
        <option value="openai">OpenAI</option>
      </select>
      
      <select
        value={selectedModel}
        onChange={(e) => onModelChange(e.target.value)}
        className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white"
      >
        {models[selectedProvider as keyof typeof models]?.map((model) => (
          <option key={model.id} value={model.id}>
            {model.name}
          </option>
        ))}
      </select>
    </div>
  );
}
