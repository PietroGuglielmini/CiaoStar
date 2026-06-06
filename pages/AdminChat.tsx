
import React, { useState, useEffect, useRef } from 'react';
import { User, ChatMessage, Conversation, UserRole } from '../types';
import { subscribeToConversations, subscribeToMessages, sendMessage, markConversationAsRead, updateChatMessage, deleteChatMessage } from '../services/dataService';
import { Send, Search, User as UserIcon, Loader2, MessageCircle as MsgIcon, Pencil, Trash2, X, Check, Inbox } from 'lucide-react';

interface AdminChatProps {
    user: User;
}

const AdminChat: React.FC<AdminChatProps> = ({ user }) => {
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const [loadingConvs, setLoadingConvs] = useState(true);

    const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
    const [editText, setEditText] = useState('');

    useEffect(() => {
        const unsubscribe = subscribeToConversations((convs) => {
            setConversations(convs);
            setLoadingConvs(false);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (!selectedConvId) return;

        markConversationAsRead(selectedConvId, UserRole.ADMIN);

        const unsubscribe = subscribeToMessages(selectedConvId, (msgs) => {
            setMessages(msgs);
            setTimeout(() => {
                const container = chatContainerRef.current;
                const end = messagesEndRef.current;
                if (end) {
                    if (container) {
                        const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 250;
                        if (isNearBottom) {
                            end.scrollIntoView({ behavior: 'smooth' });
                        }
                    } else {
                        end.scrollIntoView({ behavior: 'smooth' });
                    }
                }
            }, 100);
        });

        setEditingMsgId(null);
        return () => unsubscribe();
    }, [selectedConvId]);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedConvId || !newMessage.trim()) return;

        try {
            await sendMessage(selectedConvId, user.id, newMessage, true);
            setNewMessage('');
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        } catch (err) {
            console.error(err);
            alert("Errore invio.");
        }
    };

    const startEditing = (msg: ChatMessage) => {
        setEditingMsgId(msg.id);
        setEditText(msg.text);
    };

    const cancelEditing = () => {
        setEditingMsgId(null);
        setEditText('');
    };

    const saveEdit = async (msgId: string) => {
        if (!selectedConvId || !editText.trim()) return;
        try {
            await updateChatMessage(selectedConvId, msgId, editText);
            cancelEditing();
        } catch (e) {
            console.error("Error editing message:", e);
            alert("Errore modifica messaggio");
        }
    };

    const handleDelete = async (msgId: string) => {
        if (!selectedConvId) return;
        if (confirm("Sei sicuro di voler eliminare questo messaggio?")) {
            try {
                await deleteChatMessage(selectedConvId, msgId);
            } catch (e) {
                console.error("Error deleting message:", e);
                alert("Errore eliminazione messaggio");
            }
        }
    };

    const filteredConversations = conversations.filter(c => 
        (c.userName || 'Utente').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const selectedConversation = conversations.find(c => c.id === selectedConvId);

    if (user.role !== UserRole.ADMIN) return <div className="p-20 text-center font-bold">Accesso negato</div>;

    return (
        <div className="flex h-[calc(100vh-64px)] max-w-7xl mx-auto bg-white shadow-sm overflow-hidden border-l border-r border-gray-100">
            
            {/* Sidebar Conversazioni */}
            <div className="w-1/3 border-r border-gray-200 flex flex-col bg-gray-50/50">
                <div className="p-6 border-b border-gray-200 bg-white">
                    <h2 className="text-xl font-extrabold text-slate-900 mb-4 flex items-center gap-2">
                        <Inbox className="w-5 h-5 text-indigo-600" />
                        Inbox Supporto
                    </h2>
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 text-gray-400 w-4 h-4" />
                        <input 
                            type="text" 
                            placeholder="Cerca utente..." 
                            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-indigo-50 bg-white transition-all font-medium"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
                
                <div className="flex-1 overflow-y-auto no-scrollbar">
                    {loadingConvs ? (
                        <div className="flex justify-center p-8"><Loader2 className="animate-spin text-indigo-500"/></div>
                    ) : filteredConversations.length === 0 ? (
                        <div className="p-12 text-center">
                             <div className="bg-gray-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4">
                                 <MsgIcon className="w-6 h-6 text-gray-400" />
                             </div>
                             <p className="text-gray-400 text-xs font-bold uppercase tracking-widest leading-relaxed">Nessuna richiesta<br/>di supporto attiva.</p>
                        </div>
                    ) : (
                        filteredConversations.map(conv => (
                            <div 
                                key={conv.id}
                                onClick={() => setSelectedConvId(conv.id)}
                                className={`p-5 border-b border-gray-100 cursor-pointer transition-all flex items-start gap-4 ${selectedConvId === conv.id ? 'bg-white shadow-sm ring-1 ring-inset ring-indigo-100 border-l-4 border-l-indigo-600' : 'hover:bg-white/80'}`}
                            >
                                <div className="relative flex-shrink-0">
                                    <div className="w-12 h-12 rounded-2xl bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold overflow-hidden border border-indigo-50 shadow-sm">
                                        {conv.userAvatar ? <img src={conv.userAvatar} className="w-full h-full object-cover"/> : <UserIcon className="w-6 h-6"/>}
                                    </div>
                                    {conv.unreadCountAdmin > 0 && (
                                        <div className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] w-6 h-6 flex items-center justify-center rounded-full font-black border-2 border-white shadow-lg animate-pulse">
                                            {conv.unreadCountAdmin}
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-baseline mb-1">
                                        <h3 className={`text-sm truncate font-extrabold ${conv.unreadCountAdmin > 0 ? 'text-slate-900' : 'text-slate-700'}`}>
                                            {conv.userName || 'Utente'}
                                        </h3>
                                        <span className="text-[10px] text-slate-400 font-bold uppercase">
                                            {conv.lastMessageAt?.toDate ? conv.lastMessageAt.toDate().toLocaleDateString([], {day:'2-digit', month:'2-digit'}) : 'Oggi'}
                                        </span>
                                    </div>
                                    <p className={`text-xs truncate font-medium ${conv.unreadCountAdmin > 0 ? 'text-indigo-600 font-bold' : 'text-slate-500'}`}>
                                        {conv.lastMessage}
                                    </p>
                                    <div className="mt-2">
                                        <span className={`text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest ${conv.userRole === UserRole.TALENT ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                            {conv.userRole}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Area Messaggi */}
            <div className="flex-1 flex flex-col bg-white">
                {selectedConvId && selectedConversation ? (
                    <>
                        <div className="h-16 border-b border-gray-100 flex items-center px-8 justify-between bg-white z-10 shadow-sm">
                            <div className="flex items-center gap-4">
                                <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-black text-sm uppercase shadow-lg shadow-indigo-100">
                                    {(selectedConversation.userName || 'U').charAt(0)}
                                </div>
                                <div>
                                    <h3 className="font-extrabold text-slate-900 text-sm leading-none mb-1">{selectedConversation.userName}</h3>
                                    <span className="text-indigo-500 text-[10px] font-black uppercase tracking-widest">{selectedConversation.userRole}</span>
                                </div>
                            </div>
                        </div>

                        <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-8 space-y-6 bg-gray-50/30 no-scrollbar">
                            {messages.map((msg) => {
                                const isMe = !!msg.isAdmin; 
                                const isEditing = editingMsgId === msg.id;

                                return (
                                    <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} group relative`}>
                                        <div className={`max-w-[75%] rounded-[1.5rem] px-5 py-3.5 shadow-sm relative ${
                                            isMe 
                                            ? 'bg-indigo-600 text-white rounded-br-none' 
                                            : 'bg-white text-slate-800 border border-gray-100 rounded-bl-none'
                                        } ${isMe && !isEditing ? 'pr-12' : ''}`}>
                                            {isEditing ? (
                                                <div className="flex items-center gap-2">
                                                    <input 
                                                        className="bg-indigo-700 text-white border border-indigo-400 rounded-xl px-3 py-1.5 text-sm focus:outline-none w-full min-w-[250px] font-medium"
                                                        value={editText}
                                                        onChange={(e) => setEditText(e.target.value)}
                                                        autoFocus
                                                    />
                                                    <button onClick={() => saveEdit(msg.id)} className="text-white hover:text-emerald-300 transition-colors"><Check className="w-5 h-5"/></button>
                                                    <button onClick={cancelEditing} className="text-white hover:text-red-300 transition-colors"><X className="w-5 h-5"/></button>
                                                </div>
                                            ) : (
                                                <>
                                                    <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap">
                                                        {msg.text}
                                                        {msg.isEdited && <span className="text-[10px] opacity-60 italic ml-2 font-bold tracking-tight">(modificato)</span>}
                                                    </p>
                                                    <p className={`text-[10px] mt-2 font-black uppercase tracking-widest ${isMe ? 'text-indigo-200' : 'text-slate-400'}`}>
                                                        {msg.timestamp?.toDate ? msg.timestamp.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '...'}
                                                    </p>

                                                    {isMe && (
                                                        <div className="absolute top-2.5 right-2.5 hidden group-hover:flex gap-1.5 bg-black/10 rounded-xl p-1.5 backdrop-blur-sm transition-all border border-white/10">
                                                            <button 
                                                                onClick={() => startEditing(msg)} 
                                                                className="text-white hover:text-emerald-300 transition-colors"
                                                                title="Modifica"
                                                            >
                                                                <Pencil className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button 
                                                                onClick={() => handleDelete(msg.id)}
                                                                className="text-white hover:text-red-400 transition-colors"
                                                                title="Elimina"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                            <div ref={messagesEndRef} />
                        </div>

                        <form onSubmit={handleSend} className="p-6 border-t border-gray-100 bg-white flex gap-4 shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.02)]">
                            <input 
                                className="flex-1 border-gray-200 border-2 rounded-2xl px-6 py-4 text-sm focus:outline-none focus:ring-4 focus:ring-indigo-50 bg-gray-50 transition-all font-medium text-slate-700"
                                placeholder="Scrivi una risposta risolutiva all'utente..."
                                value={newMessage}
                                onChange={(e) => setNewMessage(e.target.value)}
                            />
                            <button 
                                type="submit" 
                                disabled={!newMessage.trim()}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white p-4.5 rounded-2xl transition-all shadow-xl shadow-indigo-100 disabled:opacity-50 active:scale-95"
                            >
                                <Send className="w-6 h-6" />
                            </button>
                        </form>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-300 bg-gray-50/20">
                        <Inbox className="w-24 h-24 mb-6 opacity-10 text-indigo-900" />
                        <p className="text-sm font-black uppercase tracking-widest opacity-40">Seleziona una chat dalla sidebar</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminChat;
