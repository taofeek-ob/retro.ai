// src/App.tsx (REPLACE ENTIRE FILE)

import { Authenticated, Unauthenticated } from "convex/react";
import { SignInForm } from "./SignInForm";
import { SignOutButton } from "./SignOutButton";
import { Toaster } from "sonner";
import { ChatInterface } from "./components/ChatInterface";
import { Sidebar } from "./components/Sidebar";
import { SharedChatView } from "./components/SharedChatView";
import { useState } from "react";
import { Routes, Route, useParams, useNavigate, Outlet, Link } from "react-router-dom";
import { Id } from "../convex/_generated/dataModel";

/**
 * The main layout component for the authenticated part of the app.
 * It contains the persistent sidebar and header.
 * The <Outlet /> component from react-router-dom is the placeholder
 * where the content for the current child route will be rendered.
 */
function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const params = useParams();
  
  // The active chatId is now correctly and consistently derived from the URL.
  const chatId = params.chatId ? (params.chatId as Id<"chats">) : null;

  return (
    <div className="flex w-full h-screen">
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        selectedChatId={chatId}
      />
      <div className="flex-1 flex flex-col h-full">
        <header className="sticky top-0 z-10 retro-container border-b-2 px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            {/* <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="retro-button p-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button> */}
            <Link to="/" className="text-xl font-bold retro-text hover:retro-glow transition-shadow">
              RETRO.CHAT
            </Link>
          </div>
          <SignOutButton />
        </header>
        
        <main className="flex-1 overflow-hidden">
          {/* This Outlet is the magic part. It renders the component for the matched child route. */}
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/**
 * A simple "Wrapper" component. Its only job is to get the `chatId`
 * from the URL params and pass it to the real ChatInterface component.
 * This keeps ChatInterface clean and focused only on props.
 */
function ChatPageWrapper() {
  console.log("Here")
  const navigate = useNavigate();
  const params = useParams();
  const chatId = params.chatId ? (params.chatId as Id<"chats">) : null;

  const handleChatCreated = (newChatId: Id<"chats">) => {
    navigate(`/chat/${newChatId}`);
  };

  const handleBranchCreated = (branchId: Id<"chats">) => {
    navigate(`/chat/${branchId}`);
  };
  
  return (
   
    <ChatInterface
      chatId={chatId}
      onChatCreated={handleChatCreated}
      onBranchCreated={handleBranchCreated}
    />
  );
}

export default function App() {
  return (
    <div className="min-h-screen flex" style={{ background: 'var(--retro-bg)' }}>
      {/* The Routes component now wraps the entire application logic */}
      <Routes>
        {/* All authenticated routes live inside the AppLayout */}
        <Route element={<Authenticated><AppLayout /></Authenticated>}>
          {/* The `index` route renders when the path is "/" */}
          <Route index element={<ChatPageWrapper />} />
          <Route path="chat/:chatId" element={<ChatPageWrapper />} />
          {/* You can add more pages here that use the same layout */}
          {/* <Route path="gallery" element={<PublicChatGallery />} /> */}
        </Route>
        
        {/* Shared Chat Route (Publicly accessible) */}
        <Route path="/shared/:shareId" element={<SharedChatView />} />

        {/* Unauthenticated Route: The sign-in page */}
        <Route path="*" element={
          <Unauthenticated>
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="w-full max-w-md mx-auto">
                <div className="text-center mb-8">
                  <h1 className="text-4xl font-bold retro-text mb-4 retro-glow-strong">RETRO.CHAT</h1>
                  <p className="text-lg retro-text-dim"> ADVANCED AI CHAT INTERFACE</p>
                  <p className="text-sm retro-text-muted mt-2">[MULTIPLE MODELS] [FILE UPLOADS] [REAL-TIME STREAMING] [CHAT BRANCHING]</p>
                </div>
                <div className="retro-container p-6">
                  <SignInForm />
                </div>
              </div>
            </div>
          </Unauthenticated>
        } />
      </Routes>

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