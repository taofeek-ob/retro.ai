import { Authenticated, Unauthenticated } from "convex/react";
import { SignInForm } from "./SignInForm";
import { SignOutButton } from "./SignOutButton";
import { Toaster } from "sonner";
import { ChatInterface } from "./components/ChatInterface";
import { Sidebar } from "./components/Sidebar";
import { SharedChatView } from "./components/SharedChatView";
import { PublicChatGallery } from "./components/PublicChatGallery";
import { useState } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { Id } from "../convex/_generated/dataModel";

export default function App() {
  const [selectedChatId, setSelectedChatId] = useState<Id<"chats"> | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [currentView, setCurrentView] = useState<'chat' | 'gallery'>('chat');
  const location = useLocation();

  // Check if this is a shared chat URL
  const isSharedChat = location.pathname.startsWith('/shared/');
  
  if (isSharedChat) {
    return (
      <Routes>
        <Route path="/shared/:shareId" element={<SharedChatView />} />
      </Routes>
    );
  }

  const handleChatCreated = (chatId: Id<"chats">) => {
    setSelectedChatId(chatId);
  };

  const handleBranchCreated = (branchId: Id<"chats">) => {
    setSelectedChatId(branchId);
  };

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--retro-bg)' }}>
      <Authenticated>
        <div className="flex w-full h-screen">
          <Sidebar
            isOpen={sidebarOpen}
            onToggle={() => setSidebarOpen(!sidebarOpen)}
            selectedChatId={selectedChatId}
            onSelectChat={setSelectedChatId}
          />
          <div className="flex-1 flex flex-col h-full">
            <header className="sticky top-0 z-10 retro-container border-b-2 px-4 py-3 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                  className="retro-button p-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
                <h1 className="text-xl font-bold retro-text">RETRO.CHAT</h1>
                
                {/* View Toggle */}
                <div className="flex gap-1 ml-4">
                  <button
                    onClick={() => setCurrentView('chat')}
                    className={`retro-button text-sm px-3 py-1 ${currentView === 'chat' ? 'retro-glow' : ''}`}
                  >
                    CHAT
                  </button>
                  <button
                    onClick={() => setCurrentView('gallery')}
                    className={`retro-button text-sm px-3 py-1 ${currentView === 'gallery' ? 'retro-glow' : ''}`}
                  >
                    GALLERY
                  </button>
                </div>
              </div>
              <SignOutButton />
            </header>
            
            <main className="flex-1 overflow-hidden">
            <ChatInterface 
                  chatId={selectedChatId} 
                  onChatCreated={handleChatCreated}
                  onBranchCreated={handleBranchCreated}
                />
              {/* {currentView === 'chat' ? (
                <ChatInterface 
                  chatId={selectedChatId} 
                  onChatCreated={handleChatCreated}
                  onBranchCreated={handleBranchCreated}
                />
              ) : (
                <PublicChatGallery />
              )} */}
            </main>
          </div>
        </div>
      </Authenticated>

      <Unauthenticated>
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-md mx-auto">
            <div className="text-center mb-8">
              <h1 className="text-4xl font-bold retro-text mb-4 retro-glow-strong">RETRO.CHAT</h1>
              <p className="text-lg retro-text-dim">
                &gt; ADVANCED AI CHAT INTERFACE
              </p>
              <p className="text-sm retro-text-muted mt-2">
                [MULTIPLE MODELS] [FILE UPLOADS] [REAL-TIME STREAMING] [CHAT BRANCHING]
              </p>
            </div>
            <div className="retro-container p-6">
              <SignInForm />
            </div>
          </div>
        </div>
      </Unauthenticated>

      <Toaster 
        theme="dark"
        toastOptions={{
          style: {
            background: 'var(--retro-surface)',
            border: '2px solid var(--retro-primary)',
            color: 'var(--retro-text)',
            fontFamily: 'Courier New, Monaco, Menlo, monospace',
          },
        }}
      />
    </div>
  );
}
