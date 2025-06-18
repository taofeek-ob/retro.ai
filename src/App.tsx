// src/App.tsx
"use client";
import { useState } from "react";
import {
  Routes,
  Route,
  useParams,
  useNavigate,
  Outlet,
  Link,
} from "react-router-dom";
import { useConvexAuth, Authenticated, Unauthenticated } from "convex/react";
import { SignInForm } from "./SignInForm";
import { SignOutButton } from "./SignOutButton";
import { ChatInterface } from "./components/ChatInterface";
import { Sidebar } from "./components/Sidebar";
import { SharedChatView } from "./components/SharedChatView";
import { Toaster } from "sonner";
import { Id } from "../convex/_generated/dataModel";

/**
 * RequireAuth: handles loading/auth state and renders children if authenticated,
 * otherwise shows the sign-in UI.
 */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();

  if (isLoading) {
    // You can replace with a spinner or skeleton
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <p className="retro-text">Loading...</p>
      </div>
    );
  }
  if (!isAuthenticated) {
    // Show sign-in form if not signed in
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold retro-text mb-4 retro-glow-strong">
              RETRO.CHAT
            </h1>
            <p className="text-lg retro-text-dim">
              ADVANCED AI CHAT INTERFACE
            </p>
            <p className="text-sm retro-text-muted mt-2">
              [MULTIPLE MODELS] [FILE UPLOADS] [REAL-TIME STREAMING] [CHAT
              BRANCHING]
            </p>
          </div>
          <div className="retro-container p-6">
            <SignInForm />
          </div>
        </div>
      </div>
    );
  }
  // Authenticated: render children
  return <>{children}</>;
}

/**
 * AppLayout: layout for authenticated area, with Sidebar, header, SignOutButton,
 * and an <Outlet /> for inner routes.
 */
function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const params = useParams();
  // chatId from URL if present
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
            <Link
              to="/"
              className="text-xl font-bold retro-text hover:retro-glow transition-shadow"
            >
              RETRO.CHAT
            </Link>
          </div>
          <SignOutButton />
        </header>
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/**
 * ChatPageWrapper: pulls chatId from params and passes handlers to ChatInterface.
 */
function ChatPageWrapper() {
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

/**
 * App: root component with routing.
 */
export default function App() {
  return (
    <div className="min-h-screen flex" style={{ background: "var(--retro-bg)" }}>
      <Routes>
        {/* Public shared chat */}
        <Route path="shared/:shareId" element={<SharedChatView />} />

        {/* Protected area under RequireAuth */}
        <Route
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          {/* Index route under authenticated: "/" */}
          <Route path="/" element={<ChatPageWrapper />} />
          {/* Chat by ID */}
          <Route path="chat/:chatId" element={<ChatPageWrapper />} />
          {/* Add other protected routes here */}
        </Route>

        {/* Catch-all: if a user navigates to an undefined path */}
        <Route
          path="*"
          element={
            <Unauthenticated>
              {/* If unauthenticated, show sign-in; if somehow authenticated, could redirect */}
              <div className="flex-1 flex items-center justify-center p-8">
                <div className="w-full max-w-md mx-auto">
                  <div className="text-center mb-8">
                    <h1 className="text-4xl font-bold retro-text mb-4 retro-glow-strong">
                      RETRO.CHAT
                    </h1>
                    <p className="text-lg retro-text-dim">
                      ADVANCED AI CHAT INTERFACE
                    </p>
                  </div>
                  <div className="retro-container p-6">
                    <SignInForm />
                  </div>
                </div>
              </div>
            </Unauthenticated>
          }
        />
      </Routes>

      <Toaster
        theme="dark"
        toastOptions={{
          style: {
            background: "var(--retro-surface)",
            border: "2px solid var(--retro-primary)",
            color: "var(--retro-text)",
            fontFamily: "Courier New, Monaco, Menlo, monospace",
          },
        }}
      />
    </div>
  );
}
