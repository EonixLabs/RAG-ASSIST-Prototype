/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  Plus, 
  Lightbulb, 
  ChevronDown, 
  AudioLines, 
  Mic,
  Send,
  FileText,
  X,
  Bot,
  User,
  Trash2,
  Pencil,
  Check
} from 'lucide-react';

const EonixLogo = () => (
  <svg viewBox="0 0 100 100" className="w-8 h-8" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M 70 25 L 35 25 C 25 25 20 30 20 40 L 20 60 C 20 70 25 75 35 75 L 70 75" stroke="white" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M 20 50 L 60 50" stroke="white" strokeWidth="10" strokeLinecap="round" />
    <circle cx="80" cy="50" r="8" fill="#ff4500" />
  </svg>
);

interface Source {
  id: string;
  text: string;
  metadata: {
    document_title: string;
    page_number: number;
    section_header: string;
  };
  score: number;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
}

export default function App() {
  const [sessionId] = useState(() => Math.random().toString(36).substring(2, 15));
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Hello! I am your regulatory compliance assistant. Ask me about RBI, SEBI, Health, Fintech, or Edtech guidelines.'
    }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedSource, setSelectedSource] = useState<Source | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [selectedDomain, setSelectedDomain] = useState('Areas');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchChatResponse = async (text: string, currentMessages: Message[]) => {
    setIsLoading(true);
    
    // Create an empty shell message we will stream into
    const systemMsgId = (Date.now() + Math.random()).toString();
    const tempMsg: Message = { id: systemMsgId, role: 'assistant', content: '', sources: undefined };
    setMessages([...currentMessages, tempMsg]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, domain: selectedDomain, sessionId: sessionId })
      });

      if (!res.ok) {
        let errorMessage = 'Failed to fetch response';
        throw new Error(errorMessage);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder("utf-8");
      
      let done = false;
      let buffer = '';
      let accumulatedContent = '';
      let finalSources = undefined;

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          buffer += decoder.decode(value, { stream: true });
          
          let eolIndex;
          // SSE events are separated by double newline
          while ((eolIndex = buffer.indexOf('\n\n')) >= 0) {
            const eventBlock = buffer.slice(0, eolIndex);
            buffer = buffer.slice(eolIndex + 2);
            
            const lines = eventBlock.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                 const dataStr = line.slice(6).trim();
                 if (dataStr === '[DONE]') break;
                 try {
                     const data = JSON.parse(dataStr);
                     if (data.token !== undefined) {
                         accumulatedContent += data.token;
                     }
                     if (data.sources) {
                         finalSources = data.sources;
                     }
                     // Continuously update UI for streaming effect
                     setMessages(prev => prev.map(m => m.id === systemMsgId ? { ...m, content: accumulatedContent, sources: finalSources || m.sources } : m));
                 } catch (e) {
                     // Parse errors are non-fatal, could be split chunk edges if perfectly malformed (rare on \n\n)
                 }
              }
            }
          }
        }
      }
    } catch (error: any) {
      console.error(error);
      setMessages(prev => prev.map(m => m.id === systemMsgId ? { ...m, content: m.content + `\n\nError: ${error.message}` } : m));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteMessage = (id: string) => {
    setMessages(prev => prev.filter(msg => msg.id !== id));
  };

  const startEditing = (msg: Message) => {
    setEditingMessageId(msg.id);
    setEditContent(msg.content);
  };

  const saveEdit = (id: string) => {
    const msgIndex = messages.findIndex(m => m.id === id);
    if (msgIndex === -1) return;

    const editedMsg = messages[msgIndex];
    const newContent = editContent;

    setEditingMessageId(null);
    setEditContent('');

    if (editedMsg.role === 'user') {
      const updatedMessages = messages.slice(0, msgIndex);
      const newUserMsg = { ...editedMsg, content: newContent };
      const newHistory = [...updatedMessages, newUserMsg];
      setMessages(newHistory);
      fetchChatResponse(newContent, newHistory);
    } else {
      setMessages(prev => prev.map(msg => 
        msg.id === id ? { ...msg, content: newContent } : msg
      ));
    }
  };

  const cancelEdit = () => {
    setEditingMessageId(null);
    setEditContent('');
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = (text: string) => {
    if (!text.trim()) return;
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    fetchChatResponse(text, newMessages);
  };

  return (
    <div className="min-h-screen bg-[#050505] flex flex-col font-sans text-gray-200 relative overflow-hidden">
      
      {/* Matrix Background */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 matrix-pattern opacity-40" />
        {/* Shimmering overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0f52ba]/10 to-transparent h-[200%] animate-[matrix-slide_10s_linear_infinite]" />
        
        {/* Blinking code-like particles */}
        <div className="absolute top-[15%] left-[20%] w-1 h-1 bg-green-400 rounded-full shadow-[0_0_8px_#4ade80] animate-ping" style={{ animationDuration: '3s' }} />
        <div className="absolute top-[60%] right-[25%] w-1 h-1 bg-blue-400 rounded-full shadow-[0_0_8px_#60a5fa] animate-ping" style={{ animationDuration: '5s', animationDelay: '1s' }} />
        <div className="absolute bottom-[20%] left-[40%] w-1 h-1 bg-teal-400 rounded-full shadow-[0_0_8px_#2dd4bf] animate-ping" style={{ animationDuration: '4s', animationDelay: '2s' }} />
        <div className="absolute top-[40%] right-[10%] w-1 h-1 bg-indigo-400 rounded-full shadow-[0_0_8px_#818cf8] animate-ping" style={{ animationDuration: '6s', animationDelay: '3s' }} />
      </div>

      {/* Background Hologram */}
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-0">
        <div className="relative flex items-center justify-center">
          <h1 
            className="text-[10vw] font-black text-transparent bg-clip-text opacity-20 tracking-[0.15em] select-none text-center"
            style={{
              backgroundImage: 'linear-gradient(to right, #ef4444, #3b82f6, #22c55e, #ef4444)',
              backgroundSize: '200% auto',
              animation: 'gradient-shift 4s linear infinite'
            }}
          >
            EONIXLABS
          </h1>
          <div 
            className="absolute inset-0 opacity-20 blur-[80px]"
            style={{
              backgroundImage: 'linear-gradient(to right, #ef4444, #3b82f6, #22c55e, #ef4444)',
              backgroundSize: '200% auto',
              animation: 'gradient-shift 4s linear infinite'
            }}
          />
        </div>
      </div>

      {/* Header */}
      <header className="border-b border-white/10 bg-[#111113]/80 backdrop-blur-md p-4 sticky top-0 z-20">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <EonixLogo />
          <h1 className="text-lg font-medium text-white tracking-wide">EONIXLABS Assistant</h1>
        </div>
      </header>

      {/* Main Chat Area */}
      <main className="flex-1 overflow-y-auto p-4 pb-32 relative z-10">
        <div className="max-w-4xl mx-auto space-y-6">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0 mt-1">
                  <Bot size={16} className="text-gray-300" />
                </div>
              )}

              <div className={`flex flex-col gap-2 max-w-[80%] group ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                {/* Message Bubble or Edit Mode */}
                {editingMessageId === msg.id ? (
                  <div className={`p-3 rounded-2xl w-full min-w-[250px] ${msg.role === 'user' ? 'bg-[#2a2a2e] text-white' : 'bg-[#1a1a1c] text-gray-200'} border border-white/20`}>
                    <textarea 
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="w-full bg-transparent outline-none resize-none text-sm min-h-[60px]"
                      autoFocus
                    />
                    <div className="flex justify-end gap-2 mt-2">
                      <button onClick={cancelEdit} className="p-1 hover:bg-white/10 rounded text-gray-400 transition-colors"><X size={14}/></button>
                      <button onClick={() => saveEdit(msg.id)} className="p-1 hover:bg-white/10 rounded text-green-400 transition-colors"><Check size={14}/></button>
                    </div>
                  </div>
                ) : (
                  <div className={`flex items-center gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                    <div className={`p-4 rounded-2xl text-sm leading-relaxed ${
                      msg.role === 'user' 
                        ? 'bg-gradient-to-tr from-violet-600 to-fuchsia-500 text-white rounded-tr-sm' 
                        : 'bg-[#1a1a1c] border border-white/10 text-gray-200 rounded-tl-sm'
                    }`}>
                      {msg.role === 'user' ? (
                        msg.content
                      ) : (
                        <div className="markdown-content">
                          {msg.content === '' && isLoading ? (
                            <div className="flex items-center gap-2 h-5 pl-1 pr-2">
                              <div className="w-2 h-2 rounded-full bg-gray-500 animate-bounce" />
                              <div className="w-2 h-2 rounded-full bg-gray-500 animate-bounce delay-75" />
                              <div className="w-2 h-2 rounded-full bg-gray-500 animate-bounce delay-150" />
                            </div>
                          ) : (
                            <ReactMarkdown 
                              remarkPlugins={[remarkGfm]}
                              components={{
                                p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />,
                                ul: ({node, ...props}) => <ul className="list-disc pl-5 mb-2 space-y-1" {...props} />,
                                ol: ({node, ...props}) => <ol className="list-decimal pl-5 mb-2 space-y-1" {...props} />,
                                li: ({node, ...props}) => <li className="" {...props} />,
                                h1: ({node, ...props}) => <h1 className="text-xl font-bold mb-2 mt-4 text-white" {...props} />,
                                h2: ({node, ...props}) => <h2 className="text-lg font-bold mb-2 mt-3 text-white" {...props} />,
                                h3: ({node, ...props}) => <h3 className="text-base font-bold mb-2 mt-2 text-white" {...props} />,
                                strong: ({node, ...props}) => <strong className="font-semibold text-white" {...props} />,
                                a: ({node, ...props}) => <a className="text-blue-400 hover:underline" {...props} />,
                                code: ({node, className, children, ...props}: any) => {
                                  const match = /language-(\w+)/.exec(className || '');
                                  return match ? (
                                    <pre className="bg-[#0a0a0c] p-3 rounded-lg overflow-x-auto text-xs font-mono my-2 border border-white/5">
                                      <code className={className} {...props}>{children}</code>
                                    </pre>
                                  ) : (
                                    <code className="bg-white/10 rounded px-1.5 py-0.5 text-xs font-mono" {...props}>{children}</code>
                                  )
                                }
                              }}
                            >
                              {msg.content}
                            </ReactMarkdown>
                          )}
                        </div>
                      )}
                    </div>
                    
                    {/* Action Buttons (Hover) */}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 items-center">
                      <button onClick={() => startEditing(msg)} className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-md transition-colors" title="Edit message">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => handleDeleteMessage(msg.id)} className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-white/10 rounded-md transition-colors" title="Delete message">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                )}

                {/* Citation UI */}
                {msg.sources && msg.sources.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-1">
                    {msg.sources.map((source, idx) => (
                      <button
                        key={idx}
                        onClick={() => setSelectedSource(source)}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-gray-400 hover:text-gray-200 transition-colors"
                      >
                        <FileText size={12} />
                        <span>[{idx + 1}] {source.metadata.document_title}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0 mt-1">
                  <User size={16} className="text-gray-300" />
                </div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input Area (Fixed at bottom) */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[#09090b] via-[#09090b] to-transparent pt-12 z-20">
        <div className="max-w-3xl mx-auto">
          <ChatInput 
            onSend={handleSendMessage} 
            disabled={isLoading} 
            selectedDomain={selectedDomain}
            setSelectedDomain={setSelectedDomain}
          />
        </div>
      </div>

      {/* Source Verification Modal */}
      {selectedSource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#111113] border border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10 bg-white/5">
              <div className="flex items-center gap-2 text-gray-200">
                <FileText size={18} className="text-violet-400" />
                <h3 className="font-medium">Source Verification</h3>
              </div>
              <button 
                onClick={() => setSelectedSource(null)}
                className="p-1 rounded-md hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="bg-[#1a1a1c] p-3 rounded-lg border border-white/5">
                    <span className="text-gray-500 block mb-1 text-xs uppercase tracking-wider">Document Title</span>
                    <span className="text-gray-200 font-medium">{selectedSource.metadata.document_title}</span>
                  </div>
                  <div className="bg-[#1a1a1c] p-3 rounded-lg border border-white/5">
                    <span className="text-gray-500 block mb-1 text-xs uppercase tracking-wider">Section</span>
                    <span className="text-gray-200 font-medium">{selectedSource.metadata.section_header}</span>
                  </div>
                  <div className="bg-[#1a1a1c] p-3 rounded-lg border border-white/5">
                    <span className="text-gray-500 block mb-1 text-xs uppercase tracking-wider">Page</span>
                    <span className="text-gray-200 font-medium">{selectedSource.metadata.page_number}</span>
                  </div>
                  <div className="bg-[#1a1a1c] p-3 rounded-lg border border-white/5">
                    <span className="text-gray-500 block mb-1 text-xs uppercase tracking-wider">Relevance Score</span>
                    <span className="text-gray-200 font-medium">{(selectedSource.score * 100).toFixed(1)}%</span>
                  </div>
                </div>

                <div className="mt-6">
                  <span className="text-gray-500 block mb-2 text-xs uppercase tracking-wider">Raw Text Chunk</span>
                  <div className="bg-[#1a1a1c] p-4 rounded-xl border border-white/5 text-sm text-gray-300 leading-relaxed font-mono">
                    {selectedSource.text}
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}

function ChatInput({ 
  onSend, 
  disabled,
  selectedDomain,
  setSelectedDomain
}: { 
  onSend: (text: string) => void, 
  disabled: boolean,
  selectedDomain: string,
  setSelectedDomain: (domain: string) => void
}) {
  const [inputValue, setInputValue] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isDomainOpen, setIsDomainOpen] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  const domains = ['Areas', 'SEBI', 'RBI', 'HEALTH', 'Fintech', 'Edtech'];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDomainOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);

    // Initialize Speech Recognition
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        // Set to true if you want it to keep listening after a pause.
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = false;
        
        recognitionRef.current.onresult = (event: any) => {
          const transcript = event.results[event.results.length - 1][0].transcript;
          setInputValue((prev) => {
            const space = prev && !prev.endsWith(' ') ? ' ' : '';
            return prev + space + transcript;
          });
        };

        recognitionRef.current.onend = () => {
          setIsRecording(false);
        };

        recognitionRef.current.onerror = (event: any) => {
          console.error("Speech Recognition Error:", event.error);
          setIsRecording(false);
        };
      }
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      if (recognitionRef.current) {
        // Prevent onend firing during unmount
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      }
    };
  }, []);

  const toggleRecording = () => {
    if (disabled) return;
    if (isRecording) {
      recognitionRef.current?.stop();
    } else {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
          setIsRecording(true);
        } catch (e) {
          console.error("Speech recognition start error:", e);
        }
      } else {
        alert("Speech recognition is not supported in your browser. Please try using a supported browser like Chrome or Edge.");
      }
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      console.log("File selected:", file.name);
    }
  };

  const handleSend = () => {
    if (!inputValue.trim() || disabled) return;
    onSend(inputValue);
    setInputValue('');
  };

  return (
    <div className="relative w-full group">
      {/* Outer Glow (Illumination) */}
      <div 
        className="absolute -inset-3 rounded-[2.5rem] blur-2xl opacity-60"
        style={{
          background: 'conic-gradient(from var(--angle), #ff4500, #ffd700, #e0f2fe, #0f52ba, #4b0082, #e0f2fe, #ff4500)',
          animation: 'spin-angle 10s linear infinite, pulse-glow 4s ease-in-out infinite'
        }}
      />
      
      {/* Sharp Animated Border */}
      <div 
        className="absolute -inset-[2px] rounded-[2.2rem] opacity-100"
        style={{
          background: 'conic-gradient(from var(--angle), #ff4500, #ffd700, #e0f2fe, #0f52ba, #4b0082, #e0f2fe, #ff4500)',
          animation: 'spin-angle 10s linear infinite'
        }}
      />

      {/* Main Input Container */}
      <div className="relative z-10 bg-[#0a0a0c]/95 backdrop-blur-2xl rounded-[2rem] p-2.5 flex flex-col gap-3 shadow-[inset_0_0_20px_rgba(0,0,0,0.8)]">
        
        {/* Text Input Area */}
        <div className="px-3 pt-2 pb-1">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Ask anything..."
            disabled={disabled}
            className="w-full bg-transparent text-gray-200 placeholder-gray-500 outline-none text-base disabled:opacity-50"
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          />
        </div>

        {/* Bottom Toolbar */}
        <div className="flex items-center justify-between">
          
          {/* Left Controls */}
          <div className="flex items-center gap-2">
            {/* Hidden File Input */}
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              className="hidden" 
            />
            
            {/* Upload Button */}
            <button 
              onClick={handleUploadClick}
              disabled={disabled}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-gray-200 transition-colors disabled:opacity-50"
              aria-label="Upload document"
            >
              <Plus size={18} strokeWidth={2.5} />
            </button>

            {/* Regulatory Domain Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button 
                onClick={() => !disabled && setIsDomainOpen(!isDomainOpen)}
                disabled={disabled}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full transition-colors text-sm font-medium disabled:opacity-50 ${
                  isDomainOpen ? 'bg-white/15 text-gray-200' : 'bg-white/5 hover:bg-white/10 text-gray-300'
                }`}
              >
                <Lightbulb size={14} className={selectedDomain !== 'Areas' ? 'text-yellow-500' : 'text-gray-400'} />
                <span>{selectedDomain}</span>
                <ChevronDown size={14} className="text-gray-500 ml-0.5" />
              </button>

              {/* Dropdown Menu */}
              {isDomainOpen && (
                <div className="absolute bottom-full mb-2 left-0 w-40 bg-[#1a1a1c] border border-white/10 rounded-xl shadow-xl overflow-hidden py-1 z-20 animate-in fade-in slide-in-from-bottom-2 duration-200">
                  {domains.map((domain) => (
                    <button
                      key={domain}
                      onClick={() => {
                        setSelectedDomain(domain);
                        setIsDomainOpen(false);
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                    >
                      {domain}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-2">
            {/* Voice Button */}
            <button 
              onClick={toggleRecording}
              disabled={disabled}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full transition-colors text-sm font-medium disabled:opacity-50 ${
                isRecording 
                  ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' 
                  : 'bg-transparent hover:bg-white/5 text-gray-400 hover:text-gray-300'
              }`}
            >
              {isRecording ? (
                <AudioLines size={16} className="animate-pulse" />
              ) : (
                <Mic size={16} />
              )}
              <span>Voice</span>
            </button>

            {/* Send Button */}
            <button 
              onClick={handleSend}
              disabled={!inputValue.trim() || disabled}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-gradient-to-tr from-violet-600 to-fuchsia-500 text-white shadow-lg disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
              aria-label="Send message"
            >
              <Send size={16} className="ml-0.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

