/**
 * Interfaz de persistencia de Chat History
 * 
 * El Chat History se guarda por usuario + repositorio.
 * NO forma parte del Project Brain.
 * NO modifica arquitectura ni contexto global.
 */

import { ChatHistory, ChatMessage } from "@/lib/types/chat-history"

export interface ChatHistoryStorage {
  /**
   * Guarda un mensaje en el historial de chat
   */
  saveMessage(userId: string, repositoryId: string, message: ChatMessage): Promise<void>
  
  /**
   * Obtiene el historial completo de chat para un usuario y repositorio
   */
  getChatHistory(userId: string, repositoryId: string): Promise<ChatHistory | null>
  
  /**
   * Obtiene los últimos N mensajes del historial
   */
  getRecentMessages(userId: string, repositoryId: string, limit?: number): Promise<ChatMessage[]>
  
  /**
   * Elimina el historial de chat de un usuario y repositorio
   */
  deleteChatHistory(userId: string, repositoryId: string): Promise<void>
  
  /**
   * Elimina todos los historiales de chat de un usuario
   */
  deleteAllUserChatHistory(userId: string): Promise<void>
  
  /**
   * Verifica si existe historial de chat para un usuario y repositorio
   */
  hasChatHistory(userId: string, repositoryId: string): Promise<boolean>
  
  /**
   * Obtiene la lista de repositorios con historial de chat para un usuario
   */
  getUserRepositories(userId: string): Promise<string[]>
}

// Nota: La implementación filesystem se creará en storage-filesystem.ts
// siguiendo el mismo patrón que RepositoryStorage

