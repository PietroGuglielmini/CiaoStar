
import React, { useState, useEffect, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { User, ChatMessage, Conversation, UserRole } from '../types';
import { sendMessage, subscribeToMessages, subscribeToMyConversation, markConversationAsRead, updateChatMessage, deleteChatMessage } from '../services/dataService';
import { Send, Loader2, ShieldCheck, User as UserIcon, Pencil, Trash2, X, Check, MessageSquare } from 'lucide-react';

interface UserChatProps {
    user: User;
}

const UserChat: React.FC<UserChatProps> = ({ user }) => {
    // PROTEZIONE: Se l'admin entra qui, lo mandiamo alla sua console
    if (user.role === UserRole.ADMIN) {
        return <Navigate to="/admin/chat" replace />;
    }

    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [conversationInfo, setConversationInfo] = useState<Conversation | null>(null);
    const [loading, setLoading] = useState(true);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);

    const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
    const [editText, setEditText] = useState('');

    useEffect(() => {
        const unsubscribeMsgs = subscribeToMessages(user.id, (msgs) => {
            setMessages(msgs);
            setLoading(false);
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

        const unsubscribeConv = subscribeToMyConversation(user.id, (conv) => {
            setConversationInfo(conv);
            if (conv && conv.unreadCountUser > 0) {
                markConversationAsRead(user.id, user.role);
            }
        });

        return () => {
            unsubscribeMsgs();
            unsubscribeConv();
        };
    }, [user.id, user.role]);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim()) return;

        try {
            await sendMessage(user.id, user.id, newMessage, false);
            setNewMessage('');
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        } catch (err: any) {
            console.error("Errore invio messaggio", err);
            alert(err instanceof Error ? err.message : "Impossibile inviare il messaggio.");
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
        if (!editText.trim()) return;
        try {
            await updateChatMessage(user.id, msgId, editText);
            cancelEditing();
        } catch (e) {
            console.error("Error editing message:", e);
            alert("Errore modifica messaggio");
        }
    };

    const handleDelete = async (msgId: string) => {
        if (confirm("Sei sicuro di voler eliminare questo messaggio?")) {
            try {
                await deleteChatMessage(user.id, msgId);
            } catch (e) {
                console.error("Error deleting message:", e);
                alert("Errore eliminazione messaggio");
            }
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-4 sm:p-6 h-[calc(100vh-64px)] flex flex-col">
            <div className="bg-white rounded-t-3xl shadow-sm border border-gray-100 p-6 flex items-center justify-between z-10">
                <div className="flex items-center gap-4">
                     <div className="bg-indigo-600 p-2.5 rounded-2xl text-white shadow-lg shadow-indigo-100">
                         <ShieldCheck className="w-6 h-6" />
                     </div>
                     <div>
                         <h1 className="text-lg font-extrabold text-slate-900 leading-none mb-1">Supporto CiaoStar</h1>
                         <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Chat Diretta Staff</p>
                     </div>
                </div>
            </div>

            <div ref={chatContainerRef} className="flex-1 bg-gray-50/50 overflow-y-auto p-6 space-y-6 border-l border-r border-gray-100 no-scrollbar">
                {loading ? (
                    <div className="flex flex-col items-center justify-center pt-20 gap-4">
                        <Loader2 className="animate-spin text-indigo-600 h-8 w-8" />
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Connessione sicura...</p>
                    </div>
                ) : messages.length === 0 ? (
                    <div className="text-center mt-20 bg-white p-10 rounded-3xl border border-gray-100 shadow-sm max-w-sm mx-auto">
                        <MessageSquare className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                        <p className="text-slate-900 font-extrabold mb-1">Nessun messaggio.</p>
                        <p className="text-xs font-medium text-slate-400">Inviaci una domanda qui sotto, ti risponderemo il prima possibile.</p>
                    </div>
                ) : (
                    messages.map((msg) => {
                        const isMe = !msg.isAdmin; 
                        const isEditing = editingMsgId === msg.id;

                        return (
                            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} group relative`}>
                                <div className={`max-w-[85%] sm:max-w-[75%] rounded-[1.5rem] px-5 py-3.5 shadow-sm relative ${
                                    isMe 
                                    ? 'bg-indigo-600 text-white rounded-br-none' 
                                    : 'bg-white text-slate-800 border border-gray-100 rounded-bl-none shadow-indigo-50/50'
                                } ${isMe && !isEditing ? 'pr-12' : ''}`}>
                                    {isEditing ? (
                                        <div className="flex items-center gap-2">
                                            <input 
                                                className="bg-indigo-700 text-white border border-indigo-400 rounded-xl px-3 py-1.5 text-sm focus:outline-none w-full min-w-[200px] font-medium"
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
                                            <p className={`text-[10px] mt-2 font-bold uppercase tracking-widest ${isMe ? 'text-indigo-200' : 'text-slate-400'}`}>
                                                {msg.timestamp?.toDate ? msg.timestamp.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Adesso'}
                                            </p>

                                            {isMe && (
                                                <div className="absolute top-2 right-2 hidden group-hover:flex gap-1.5 bg-black/10 rounded-xl p-1.5 backdrop-blur-sm transition-all border border-white/10">
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
                    })
                )}
                <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSend} className="bg-white p-6 rounded-b-3xl border border-gray-100 shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.02)] flex items-center gap-3">
                <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Scrivi qui per aiuto o info..."
                    className="flex-1 border-gray-200 border-2 rounded-2xl px-5 py-3.5 focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-300 bg-gray-50 transition-all font-medium text-slate-700"
                />
                <button 
                    type="submit" 
                    disabled={!newMessage.trim()}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white p-4 rounded-2xl transition-all shadow-xl shadow-indigo-100 disabled:opacity-50 disabled:scale-100 disabled:shadow-none active:scale-95"
                >
                    <Send className="w-5 h-5" />
                </button>
            </form>
        </div>
    );
};

export default UserChat;
