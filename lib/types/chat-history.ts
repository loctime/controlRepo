/**
 * Tipos para Chat History
 * 
 * El Chat History es el historial de conversaciones entre usuario y asistente.
 * Se guarda por usuario + repositorio.
 * NO forma parte del Project Brain.
 * NO modifica arquitectura ni contexto global.
 */

export interface ChatHistory {
  // Identificación
  userId: string // ID del usuario (Firebase UID)
  repositoryId: string // "owner/repo"
  
  // Timestamps
  createdAt: string // ISO 8601 - primera conversación
  updatedAt: string // ISO 8601 - última conversación
  
  // Mensajes de la conversación
  messages: ChatMessage[]
  
  // Metadata de la conversación
  metadata: {
    totalMessages: number
    totalUserMessages: number
    totalAssistantMessages: number
    lastIntent?: string // Última intención detectada
    lastRole?: string // Último rol del asistente usado
  }
}

export interface ChatMessage {
  id: string // ID único del mensaje
  role: "user" | "assistant"
  content: string
  timestamp: string // ISO 8601
  
  // Metadata del mensaje
  metadata?: {
    // Para mensajes del asistente
    intent?: string // Intención detectada de la pregunta del usuario
    role?: string // Rol del asistente usado
    files?: MessageFile[] // Archivos usados como contexto
    sourcesDeclared?: boolean // Si el asistente declaró fuentes explícitamente
    findings?: {
      improvements: string[]
      risks: string[]
    }
    
    // Para mensajes del usuario
    questionType?: string // Tipo de pregunta detectada
  }
}

export interface MessageFile {
  path: string
  name: string
}

/**
 * Memoria de conversación (usada durante la sesión activa)
 * Esta es la memoria temporal que se pasa al backend durante la conversación.
 * NO se persiste directamente, pero se puede usar para construir el historial.
 */
export interface ConversationMemory {
  previousIntents: string[]
  usedSources: string[]
  findings: {
    improvements: string[]
    risks: string[]
  }
  previousRole?: string
}

