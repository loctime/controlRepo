import { ChatInterface } from "@/components/chat-interface"
import { SidebarPanel } from "@/components/sidebar-panel"
import { ContextPanel } from "@/components/context-panel"
import { ThemeToggle } from "@/components/theme-toggle"
import { BookOpen } from "lucide-react"

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
              <BookOpen className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Wikipedia del Repositorio</h1>
              <p className="text-xs text-muted-foreground">Documentación interactiva del proyecto</p>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto p-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-[calc(100vh-8rem)]">
          {/* Sidebar - Documentation Panel */}
          <div className="lg:col-span-3 h-full">
            <SidebarPanel />
          </div>

          {/* Center - Chat Interface */}
          <div className="lg:col-span-6 h-full">
            <ChatInterface />
          </div>

          {/* Right - Context Files Panel */}
          <div className="lg:col-span-3 h-full">
            <ContextPanel />
          </div>
        </div>
      </main>
    </div>
  )
}
