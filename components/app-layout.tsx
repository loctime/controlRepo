import React from "react"
import { SidebarDocs } from "./sidebar-docs"
import { ChatPanel } from "./chat-panel"
import { ContextPanel } from "./context-panel"

interface AppLayoutProps {
  children?: React.ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-[1600px] mx-auto h-screen flex flex-col">
        <header className="w-full border-b border-border bg-transparent p-3">
          <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 w-full">
              <div>
                <h1 className="text-lg font-semibold">Wikipedia del Repositorio</h1>
                <p className="text-xs text-muted-foreground">Documentación interactiva del proyecto</p>
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 grid grid-cols-1 md:grid-cols-[320px_1fr]">
          <aside className="hidden md:block border-r border-border p-4">
            <SidebarDocs />
          </aside>

          <main className="p-4">
            {children ? <div className="h-full">{children}</div> : <ChatPanel />}
          </main>
        </div>
      </div>
    </div>
  )
}

export default AppLayout
