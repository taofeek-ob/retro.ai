import { useState, useEffect } from "react";
import { toast } from "sonner";

interface CodeBlockProps {
  code: string;
  language: string;
}

export function CodeBlock({ code, language }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [highlightedCode, setHighlightedCode] = useState(code);

  useEffect(() => {
    // Simple syntax highlighting for common languages
    const highlightCode = (code: string, lang: string) => {
      if (!lang || lang === 'text') return code;

      let highlighted = code;

      // JavaScript/TypeScript highlighting
      if (['javascript', 'js', 'typescript', 'ts'].includes(lang.toLowerCase())) {
        highlighted = highlighted
          .replace(/\b(const|let|var|function|class|if|else|for|while|return|import|export|from|async|await)\b/g, 
            '<span class="text-blue-400">$1</span>')
          .replace(/\b(true|false|null|undefined)\b/g, 
            '<span class="text-purple-400">$1</span>')
          .replace(/"([^"]*)"/g, 
            '<span class="text-green-400">"$1"</span>')
          .replace(/'([^']*)'/g, 
            '<span class="text-green-400">\'$1\'</span>')
          .replace(/\/\/.*$/gm, 
            '<span class="text-gray-500">$&</span>');
      }

      // Python highlighting
      if (lang.toLowerCase() === 'python') {
        highlighted = highlighted
          .replace(/\b(def|class|if|elif|else|for|while|return|import|from|as|try|except|finally|with|lambda)\b/g, 
            '<span class="text-blue-400">$1</span>')
          .replace(/\b(True|False|None)\b/g, 
            '<span class="text-purple-400">$1</span>')
          .replace(/"([^"]*)"/g, 
            '<span class="text-green-400">"$1"</span>')
          .replace(/'([^']*)'/g, 
            '<span class="text-green-400">\'$1\'</span>')
          .replace(/#.*$/gm, 
            '<span class="text-gray-500">$&</span>');
      }

      return highlighted;
    };

    setHighlightedCode(highlightCode(code, language));
  }, [code, language]);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success("Code copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error("Failed to copy code");
    }
  };

  return (
    <div className="my-4 retro-container overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b-2 border-current bg-black">
        <span className="text-sm retro-text-dim font-mono uppercase">
          [{language || "CODE"}]
        </span>
        <button
          onClick={copyToClipboard}
          className="retro-button text-xs px-2 py-1"
        >
          {copied ? (
            <>
              <svg className="w-3 h-3 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              COPIED
            </>
          ) : (
            <>
              <svg className="w-3 h-3 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              COPY
            </>
          )}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto bg-black text-sm">
        <code 
          className="retro-text font-mono"
          dangerouslySetInnerHTML={{ __html: highlightedCode }}
        />
      </pre>
    </div>
  );
}
