"use client"

import React, { createContext, useContext, useState } from "react"

interface ContextFile {
  name: string
  path: string
}

interface ContextFilesContextType {
  contextFiles: ContextFile[]
  setContextFiles: (files: ContextFile[]) => void
}

const ContextFilesContext = createContext<ContextFilesContextType | undefined>(undefined)

export function ContextFilesProvider({ children }: { children: React.ReactNode }) {
  const [contextFiles, setContextFiles] = useState<ContextFile[]>([])

  return (
    <ContextFilesContext.Provider value={{ contextFiles, setContextFiles }}>
      {children}
    </ContextFilesContext.Provider>
  )
}

export function useContextFiles() {
  const context = useContext(ContextFilesContext)
  if (context === undefined) {
    throw new Error("useContextFiles must be used within a ContextFilesProvider")
  }
  return context
}

