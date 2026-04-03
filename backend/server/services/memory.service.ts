import { BaseMessage, HumanMessage, AIMessage } from "@langchain/core/messages";

class MemoryService {
    // In-memory store for session ID to List of messages mapping
    private sessions = new Map<string, BaseMessage[]>();

    getHistory(sessionId: string): BaseMessage[] {
        return this.sessions.get(sessionId) || [];
    }

    addHumanMessage(sessionId: string, message: string) {
        const history = this.getHistory(sessionId);
        history.push(new HumanMessage(message));
        
        // Sliding window: keeping only last 6 messages (3 interactions)
        const MAX_MESSAGES = 6;
        if (history.length > MAX_MESSAGES) {
           history.splice(0, history.length - MAX_MESSAGES);
        }
        
        this.sessions.set(sessionId, history);
    }

    addAIMessage(sessionId: string, message: string) {
        const history = this.getHistory(sessionId);
        history.push(new AIMessage(message));
        this.sessions.set(sessionId, history);
    }
    
    clearHistory(sessionId: string) {
        this.sessions.delete(sessionId);
    }
}

export const memoryService = new MemoryService();
