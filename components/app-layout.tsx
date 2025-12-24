import React from "react"
import { SidebarDocs } from "./sidebar-docs"
import { ChatPanel } from "./chat-panel"
import { ContextPanel } from "./context-panel"
import { ThemeToggle } from "./theme-toggle"
import { LogoutButton } from "./logout-button"
import { HeaderRepository } from "./header-repository"

interface AppLayoutProps {
  children?: React.ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-[1600px] mx-auto h-screen flex flex-col">
        <header className="w-full border-b border-border bg-transparent px-3 py-2 shrink-0">
          <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-4">
            <div className="shrink-0">
              <h1 className="text-lg font-semibold">ControlRepo</h1>
              <p className="text-xs text-muted-foreground">Gestión de repositorios</p>
            </div>
            <HeaderRepository />
            <div className="flex items-center gap-3 flex-shrink-0">
              <ContextPanel />
              <ThemeToggle />
              <LogoutButton />
            </div>
          </div>
        </header>

        <div className="flex-1 grid grid-cols-1 md:grid-cols-[320px_1fr]">
          <aside className="hidden md:block border-r border-border p-2">
            <SidebarDocs />
          </aside>

          <main className="p-2">
            {children ? <div className="h-full">{children}</div> : <ChatPanel />}
          </main>
        </div>
      </div>
    </div>
  )
}

export default AppLayout
