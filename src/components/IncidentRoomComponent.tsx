import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  doc, 
  onSnapshot, 
  collection, 
  query, 
  where,
  getDocs,
  orderBy, 
  addDoc, 
  serverTimestamp, 
  updateDoc,
  arrayUnion
} from 'firebase/firestore';
import { 
  Send, 
  Shield, 
  Clock, 
  MapPin, 
  Users, 
  CheckCircle2, 
  AlertTriangle,
  Zap,
  MoreVertical,
  Phone,
  Video,
  ArrowUpCircle,
  Truck,
  Timer,
  CheckCircle,
  Bot,
  Info,
  Copy,
  Edit2,
  Save,
  XCircle,
  Globe,
  Camera,
  Maximize2,
  Mic,
  MicOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, formatTimestamp, getSeverityColor, getStatusColor } from '../lib/utils';
import { Incident, Message, ResponderDetail, UserRole, SecurityType } from '../types';
import { SOS_TYPES, mapOldIncidentType } from '../constants';
import CrisisMap from './CrisisMap';
import Modal from './Modal';
import { analyzeIncidentImage, generateResponsePlan } from '../services/gemini';

interface IncidentRoomComponentProps {
  incidentId: string;
  onBack?: () => void;
  fullScreenLink?: boolean;
}

function CountdownTimer({ targetTime, onComplete }: { targetTime: any, onComplete?: () => void }) {
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!targetTime) return;

    // Convert Firestore Timestamp or Date to milliseconds
    const targetMs = targetTime.seconds ? targetTime.seconds * 1000 : new Date(targetTime).getTime();

    const interval = setInterval(() => {
      const now = Date.now();
      const diff = targetMs - now;

      if (diff <= 0) {
        setTimeLeft(0);
        clearInterval(interval);
        onComplete?.();
      } else {
        setTimeLeft(diff);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [targetTime, onComplete]);

  if (timeLeft === null) return null;
  if (timeLeft <= 0) return null;

  const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);

  return (
    <span className="inline-flex items-center gap-2 text-red-700 font-mono font-black tabular-nums animate-pulse bg-red-100 px-3 py-1.5 rounded-xl border-2 border-red-200 shadow-lg shadow-red-100 scale-110 ml-2">
      <Timer className="w-4 h-4 text-red-600 animate-[spin_4s_linear_infinite]" />
      <span className="text-sm tracking-tight">{minutes}:{seconds.toString().padStart(2, '0')}</span>
    </span>
  );
}

export default function IncidentRoomComponent({ incidentId, onBack, fullScreenLink = true }: IncidentRoomComponentProps) {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [aiPlan, setAiPlan] = useState<any>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [analyzingImage, setAnalyzingImage] = useState(false);
  const [etaInput, setEtaInput] = useState('');
  const [showEtaModal, setShowEtaModal] = useState(false);
  const [showSecurityTypeModal, setShowSecurityTypeModal] = useState(false);
  const [assigningSecurity, setAssigningSecurity] = useState(false);
  const [submittingEta, setSubmittingEta] = useState(false);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ description: '', severity: '' });
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [handledPromptIds, setHandledPromptIds] = useState<Set<string>>(new Set());
  const [tick, setTick] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !incidentId || !user) return;

    setAnalyzingImage(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = (reader.result as string).split(',')[1];
      const dataUrl = reader.result as string;
      
      const analysis = await analyzeIncidentImage(base64, incident?.type || 'unknown');
      
      // Send the image message
      await addDoc(collection(db, `incidents/${incidentId}/messages`), {
        incidentId: incidentId,
        senderId: user.uid,
        senderName: profile?.displayName || 'User',
        senderRole: profile?.role || 'guest',
        text: 'Shared an image for analysis',
        mediaUrl: dataUrl,
        type: 'image',
        timestamp: serverTimestamp()
      });

      // Send the AI analysis as a separate follow-up message
      await addDoc(collection(db, `incidents/${incidentId}/messages`), {
        incidentId: incidentId,
        senderId: 'ai',
        senderName: 'AI Vision Dispatch',
        senderRole: 'ai',
        text: analysis,
        type: 'text',
        timestamp: serverTimestamp()
      });

      setAnalyzingImage(false);
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (!incidentId) return;

    const unsubIncident = onSnapshot(doc(db, 'incidents', incidentId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as Incident;
        if (profile?.organizationId && data.organizationId && data.organizationId !== profile.organizationId) {
          return;
        }
        setIncident({ id: docSnap.id, ...data } as Incident);
      }
    }, (error) => {
      console.error("Incident room listener error:", error);
      if (error.code === 'permission-denied') {
        try { handleFirestoreError(error, OperationType.GET, `incidents/${incidentId}`); } catch {}
      }
    });

    const q = query(
      collection(db, `incidents/${incidentId}/messages`),
      orderBy('timestamp', 'asc')
    );

    const unsubMessages = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message)));
    }, (error) => {
      console.error("Messages listener error:", error);
      if (error.code === 'permission-denied') {
        try { handleFirestoreError(error, OperationType.LIST, `incidents/${incidentId}/messages`); } catch {}
      }
    });

    return () => {
      unsubIncident();
      unsubMessages();
    };
  }, [incidentId, profile?.organizationId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Periodic tick to catch ended timers
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 5000);
    return () => clearInterval(interval);
  }, []);

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() || !user || !incidentId) return;

    const messageData = {
      incidentId: incidentId,
      senderId: user.uid,
      senderName: profile?.displayName || 'Unknown',
      senderRole: profile?.role || 'guest',
      text: inputText,
      type: 'text',
      timestamp: serverTimestamp()
    };

    setInputText('');
    await addDoc(collection(db, `incidents/${incidentId}/messages`), messageData);
  };

  const handleAIAssist = async () => {
    if (!incident) return;
    setLoadingPlan(true);
    try {
      const plan = await generateResponsePlan(incident);
      setAiPlan(plan);
      
      await addDoc(collection(db, `incidents/${incidentId}/messages`), {
        incidentId,
        senderId: 'ai',
        senderName: 'AI Incident Commander',
        senderRole: 'ai',
        text: `AI has generated a response plan. Check the "Response Plan" tab for details.`,
        type: 'system',
        timestamp: serverTimestamp()
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingPlan(false);
    }
  };

  const handleEscalate = async (targetRole: UserRole) => {
    if (!incidentId || !user || !incident) return;
    
    const isToAdmin = targetRole === 'admin';
    const newStatus = isToAdmin ? 'escalated' : 'assigned';
    
    await updateDoc(doc(db, 'incidents', incidentId), {
      status: newStatus,
      assignedToRoles: arrayUnion(targetRole),
      severity: isToAdmin && incident.severity === 'low' ? 'high' : incident.severity,
      updatedAt: serverTimestamp()
    });

    const messageText = isToAdmin 
      ? `🚨 CRITICAL ESCALATION: This incident has been escalated to ADMIN level. Immediate oversight required.`
      : `📋 ASSIGNMENT: Incident assigned to ${targetRole.toUpperCase()} team for response.`;

    await addDoc(collection(db, `incidents/${incidentId}/messages`), {
      incidentId,
      senderId: user.uid,
      senderName: 'TRISHAK System',
      senderRole: 'system',
      text: messageText,
      type: 'system',
      timestamp: serverTimestamp()
    });
  };

  const handleAssignSecurity = async (securityType: SecurityType) => {
    if (!incidentId || !user || !profile || assigningSecurity || !incident) return;
    setAssigningSecurity(true);
    
    try {
      // Fetch matching security users for specialized dispatch
      const usersRef = collection(db, 'users');
      const q = query(
        usersRef,
        where('role', '==', 'security'),
        where('securityType', '==', securityType),
        where('status', '==', 'active'),
        where('organizationId', '==', incident.organizationId)
      );
      
      const snapshot = await getDocs(q);
      const assignedUserIds = snapshot.docs.map(doc => doc.id);

      await updateDoc(doc(db, 'incidents', incidentId), {
        status: 'assigned',
        assignedTo: 'security',
        securityType: securityType,
        assignedUsers: assignedUserIds,
        updatedAt: serverTimestamp()
      });

      const messageText = `📋 SPECIALIZED DISPATCH: Incident assigned ONLY to ${securityType.toUpperCase()} security specialists (${assignedUserIds.length} users notified).`;

      await addDoc(collection(db, `incidents/${incidentId}/messages`), {
        incidentId: incidentId,
        senderId: user.uid,
        senderName: 'TRISHAK System',
        senderRole: 'system',
        text: messageText,
        type: 'system',
        timestamp: serverTimestamp()
      });

      setShowSecurityTypeModal(false);
      setToast({ 
        message: `Incident assigned to ${assignedUserIds.length} security specialists`, 
        type: 'success' 
      });
    } catch (err) {
      console.error('Failed to assign security:', err);
      setToast({ message: 'Failed to assign security', type: 'error' });
    } finally {
      setAssigningSecurity(false);
    }
  };

  const handleConfirmETA = async () => {
    if (!incidentId || !user || !profile || !etaInput || submittingEta) return;
    
    setSubmittingEta(true);
    try {
      const minutes = parseInt(etaInput.split(' ')[0]) || 0;
      const arrivalTime = new Date(Date.now() + minutes * 60 * 1000);
      
      let responderLoc = null;
      if (navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject);
          });
          responderLoc = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude
          };
        } catch (e) {
          console.warn('Could not get responder location');
        }
      }

      const detail: ResponderDetail = {
        uid: user.uid,
        name: profile.displayName,
        role: profile.role,
        status: 'responding',
        eta: etaInput || 'TBD',
        estimatedArrivalTime: arrivalTime,
        location: responderLoc || undefined,
        updatedAt: serverTimestamp()
      };

      await updateDoc(doc(db, 'incidents', incidentId), {
        status: 'responding',
        responders: arrayUnion(user.uid),
        [`responderDetails.${user.uid}`]: detail,
        updatedAt: serverTimestamp()
      });

      await addDoc(collection(db, `incidents/${incidentId}/messages`), {
        incidentId: incidentId,
        senderId: user.uid,
        senderName: profile.displayName,
        senderRole: profile.role,
        text: `I am responding. ETA: ${detail.eta}.`,
        type: 'system',
        estimatedArrivalTime: arrivalTime,
        timestamp: serverTimestamp()
      });

      setShowEtaModal(false);
      setEtaInput('');
    } catch (error) {
      console.error('Failed to Confirm ETA:', error);
      setToast({ message: 'Failed to confirm ETA. Please check your connection.', type: 'error' });
    } finally {
      setSubmittingEta(false);
    }
  };

  const handleConfirmArrival = async (responderId: string, arrived: boolean, messageId: string) => {
    if (!incidentId || !incident) return;
    
    // Hide immediately in UI
    setHandledPromptIds(prev => {
      const next = new Set(prev);
      next.add(messageId);
      return next;
    });

    const responder = incident.responderDetails?.[responderId];
    if (!responder) return;

    if (arrived) {
      await updateDoc(doc(db, 'incidents', incidentId), {
        [`responderDetails.${responderId}.status`]: 'arrived',
        [`responderDetails.${responderId}.updatedAt`]: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      await addDoc(collection(db, `incidents/${incidentId}/messages`), {
        incidentId: incidentId,
        senderId: 'system',
        senderName: 'System',
        senderRole: 'system',
        text: `Security has arrived at the incident location.`,
        type: 'system',
        timestamp: serverTimestamp()
      });
    } else {
      // Step 3: Add "not arrived" message and brand new ETA message
      const minutes = parseInt(responder.eta?.split(' ')[0] || '2') || 2;
      const newArrivalTime = new Date(Date.now() + minutes * 60 * 1000);

      // Post "not arrived" message
      await addDoc(collection(db, `incidents/${incidentId}/messages`), {
        incidentId: incidentId,
        senderId: 'system',
        senderName: 'System',
        senderRole: 'system',
        text: `Security has not arrived yet.`,
        type: 'system',
        timestamp: serverTimestamp()
      });

      // Post "New ETA started" message with a fresh timer
      await addDoc(collection(db, `incidents/${incidentId}/messages`), {
        incidentId: incidentId,
        senderId: responderId,
        senderName: responder.name,
        senderRole: responder.role,
        text: `New ETA started: ${responder.eta}.`,
        type: 'system',
        estimatedArrivalTime: newArrivalTime,
        timestamp: serverTimestamp()
      });

      // Update parent for live sidebar status
      await updateDoc(doc(db, 'incidents', incidentId), {
        [`responderDetails.${responderId}.estimatedArrivalTime`]: newArrivalTime,
        [`responderDetails.${responderId}.updatedAt`]: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }
  };

  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setToast({ message: 'Voice typing is not supported in this browser.', type: 'error' });
      return;
    }

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      const initialText = inputText;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        let sessionTranscript = '';
        for (let i = 0; i < event.results.length; ++i) {
          sessionTranscript += event.results[i][0].transcript;
        }
        
        const fullText = initialText + (initialText ? ' ' : '') + sessionTranscript;
        setInputText(fullText);
      };

      recognition.onend = () => {
        setIsListening(false);
        recognitionRef.current = null;
      };

      recognition.onerror = (event: any) => {
        // 'aborted' is common when stop() is called or browser cancels the task
        if (event.error !== 'aborted') {
          console.error('Speech recognition error', event.error);
          if (event.error === 'not-allowed') {
            setToast({ message: 'Microphone access denied. Please check permissions.', type: 'error' });
          } else if (event.error === 'network') {
            setToast({ message: 'Voice connection timed out. Please check your internet or retry.', type: 'error' });
          } else {
            setToast({ message: `Voice error: ${event.error}`, type: 'error' });
          }
        }
        setIsListening(false);
        recognitionRef.current = null;
      };

      recognition.start();
    } catch (err) {
      console.error('Failed to start recognition:', err);
      setIsListening(false);
    }
  };

  const handleResolve = async () => {
    if (!incidentId) return;
    await updateDoc(doc(db, 'incidents', incidentId), {
      status: 'resolved',
      updatedAt: serverTimestamp()
    });
  };

  const handleUpdateIncident = async () => {
    if (!incidentId || !incident || !user || !profile) return;

    const changes: string[] = [];
    const updateData: any = { updatedAt: serverTimestamp() };

    if (editForm.description !== incident.description) {
      updateData.description = editForm.description;
      changes.push(`description changed to "${editForm.description}"`);
    }

    if (editForm.severity !== incident.severity) {
      updateData.severity = editForm.severity;
      changes.push(`severity changed to ${editForm.severity.toUpperCase()}`);
    }

    if (changes.length === 0) {
      setIsEditing(false);
      return;
    }

    try {
      await updateDoc(doc(db, 'incidents', incidentId), updateData);

      await addDoc(collection(db, `incidents/${incidentId}/messages`), {
        incidentId: incidentId,
        senderId: user.uid,
        senderName: 'TRISHAK System',
        senderRole: 'system',
        text: `AUDIT: ${profile.displayName} updated incident: ${changes.join(', ')}.`,
        type: 'system',
        timestamp: serverTimestamp()
      });

      setIsEditing(false);
    } catch (err) {
      console.error('Failed to update incident:', err);
    }
  };

  const handleToggleGlobal = async () => {
    if (!incident || !['admin', 'receptionist'].includes(profile?.role || '')) return;
    
    const newGlobalStatus = !incident.isGlobal;
    try {
      await updateDoc(doc(db, 'incidents', incidentId), {
        isGlobal: newGlobalStatus,
        triggeredBy: user?.uid,
        triggeredByRole: profile?.role,
        updatedAt: serverTimestamp()
      });

      await addDoc(collection(db, `incidents/${incidentId}/messages`), {
        incidentId: incidentId,
        senderId: user.uid,
        senderName: 'TRISHAK System',
        senderRole: 'system',
        text: `AUDIT: ${profile.displayName} marked incident as ${newGlobalStatus ? 'GLOBAL' : 'LOCAL'}.`,
        type: 'system',
        timestamp: serverTimestamp()
      });
    } catch (err) {
      console.error('Failed to toggle global status:', err);
    }
  };

  const startEditing = () => {
    if (!incident) return;
    setEditForm({
      description: incident.description,
      severity: incident.severity
    });
    setIsEditing(true);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  if (!incident) return (
    <div className="flex flex-col items-center justify-center p-20 text-slate-400">
      <Timer className="w-10 h-10 animate-spin mb-4" />
      <p className="font-bold">Syncing Incident Room...</p>
    </div>
  );

  return (
    <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 h-full lg:max-h-[85vh] lg:overflow-hidden pb-12 lg:pb-0">
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-4 left-1/2 -translate-x-1/2 z-[200] px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-2 font-black text-xs lg:text-sm uppercase tracking-widest ${
              toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
            }`}
          >
            {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Left Column: Incident Details */}
      <div className="w-full lg:w-72 xl:w-80 flex flex-col gap-4 shrink-0 lg:overflow-y-auto custom-scrollbar">
        {onBack && (
          <button 
            onClick={onBack}
            className="flex items-center gap-2 text-slate-500 hover:text-slate-900 font-bold text-sm mb-2"
          >
            <Clock className="w-4 h-4" /> Back
          </button>
        )}

        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col flex-1">
          <div className={cn("p-4 lg:p-6 text-white relative shrink-0", getSeverityColor(incident.severity))}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="bg-white/20 p-2 rounded-xl backdrop-blur-md">
                  <Shield className="w-4 h-4 lg:w-5 lg:h-5" />
                </div>
                {fullScreenLink && (
                  <button 
                    onClick={() => navigate(`/incident/${incidentId}`)}
                    className="bg-white/20 p-2 rounded-xl hover:bg-white/30 transition-all backdrop-blur-md"
                    title="Open Fullscreen"
                  >
                    <Maximize2 className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!isEditing && ['admin', 'receptionist'].includes(profile?.role || '') && (
                  <button 
                    onClick={handleToggleGlobal}
                    className={cn(
                      "px-2 lg:px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 lg:gap-2 backdrop-blur-md border border-white/20",
                      incident.isGlobal 
                        ? "bg-white text-red-600 shadow-lg shadow-black/10" 
                        : "bg-white/10 hover:bg-white/20 text-white"
                    )}
                  >
                    <Globe className={cn("w-3 h-3 lg:w-3.5 lg:h-3.5", incident.isGlobal && "animate-pulse")} />
                    <span className="text-[8px] lg:text-[9px] font-black uppercase tracking-[0.1em] lg:tracking-[0.15em]">
                      {incident.isGlobal ? "Global" : "Local"}
                    </span>
                  </button>
                )}
                {!isEditing && ['admin', 'receptionist', 'security', 'staff'].includes(profile?.role || '') && (
                  <button 
                    onClick={startEditing}
                    className="p-1.5 lg:p-2 hover:bg-white/20 rounded-xl transition-all backdrop-blur-md border border-white/20"
                  >
                    <Edit2 className="w-3 h-3 lg:w-3.5 lg:h-3.5" />
                  </button>
                )}
              </div>
            </div>
            <h1 className="text-xl lg:text-2xl font-black tracking-tight mb-1 lg:mb-1.5 capitalize leading-none">
              {SOS_TYPES.find(t => t.id === mapOldIncidentType(incident.type))?.label || incident.type}
            </h1>
            <div className="flex items-center gap-3">
              <p className="text-white/80 text-[9px] lg:text-[10px] font-bold flex items-center gap-1.5 uppercase tracking-wider">
                <Clock className="w-3 h-3" /> {formatTimestamp(incident.createdAt)}
              </p>
            </div>
          </div>

          <div className="p-5 space-y-6 overflow-y-auto custom-scrollbar flex-1">
            <div className="flex items-center gap-4 border-b border-slate-50 pb-4">
              <div className="flex-1">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Status</h3>
                <div className={cn("inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-[0.05em]", getStatusColor(incident.status).replace('text-', 'bg-').replace('-600', '-100').replace('-500', '-100').replace('-400', '-100'), getStatusColor(incident.status))}>
                  <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse shadow-sm", getStatusColor(incident.status).replace('text-', 'bg-'))}></div>
                  {incident.status}
                </div>
              </div>
              <div className="w-px h-8 bg-slate-100" />
              <div className="flex-1">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Priority</h3>
                <span className={cn("inline-block text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl shadow-sm text-white", getSeverityColor(incident.severity))}>
                  {incident.severity}
                </span>
              </div>
            </div>

            <div>
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2.5">Detailed Intel</h3>
              {isEditing ? (
                <div className="space-y-3">
                  <textarea 
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs font-bold min-h-[100px] outline-none focus:border-blue-500 transition-colors"
                  />
                  <div className="flex gap-2">
                    <button onClick={handleUpdateIncident} className="flex-1 bg-slate-900 text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-colors">Confirm</button>
                    <button onClick={() => setIsEditing(false)} className="flex-1 bg-slate-100 text-slate-600 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-colors">Discard</button>
                  </div>
                </div>
              ) : (
                <p className="text-[13px] font-bold text-slate-700 leading-relaxed pr-2">{incident.description}</p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Responders</h3>
                <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg">{incident.responders.length}</span>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {incident.responders.map((rid) => {
                  const detail = incident.responderDetails?.[rid];
                  return (
                    <div key={rid} className="flex items-center gap-3 p-2.5 bg-slate-50/50 rounded-2xl border border-slate-100 group hover:border-blue-200 transition-colors">
                      <div className="w-8 h-8 rounded-xl bg-white border border-slate-100 flex items-center justify-center text-[10px] font-black text-slate-600 shrink-0 shadow-sm group-hover:scale-105 transition-transform">
                        {detail?.name.slice(0, 2).toUpperCase() || 'UN'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-black text-slate-900 truncate tracking-tight">{detail?.name || 'Unknown'}</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">{detail?.role || 'Respective Team'}</p>
                      </div>
                      {detail?.status === 'responding' && (
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 rounded-lg">
                           <div className="w-1 h-1 rounded-full bg-blue-600 animate-pulse" />
                           <span className="text-[8px] font-black text-blue-600 uppercase">En Route</span>
                        </div>
                      )}
                    </div>
                  );
                })}
                {incident.responders.length === 0 && (
                  <div className="py-8 flex flex-col items-center justify-center text-slate-300 border-2 border-dashed border-slate-100 rounded-3xl">
                    <Users className="w-6 h-6 mb-2 opacity-50" />
                    <p className="text-[10px] font-bold uppercase tracking-widest">Awaiting Responders</p>
                  </div>
                )}
              </div>
            </div>

          </div>

          <div className="p-4 bg-slate-50 border-t border-slate-100 flex flex-col gap-3 shadow-inner">
            {profile?.role === 'receptionist' && (
              <div className="space-y-2">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Dispatch Controls</h3>
                <div className="grid grid-cols-3 gap-2">
                  <button 
                    onClick={() => setShowSecurityTypeModal(true)} 
                    className="flex flex-col items-center justify-center gap-1.5 p-3 bg-white border border-slate-200 rounded-2xl hover:border-red-600 hover:text-red-600 transition-all shadow-sm group"
                  >
                    <Shield className="w-4 h-4 text-slate-400 group-hover:text-red-600 transition-colors" />
                    <span className="text-[9px] font-black uppercase tracking-tight">Security</span>
                  </button>
                  <button 
                    onClick={() => handleEscalate('staff')} 
                    className="flex flex-col items-center justify-center gap-1.5 p-3 bg-white border border-slate-200 rounded-2xl hover:border-blue-600 hover:text-blue-600 transition-all shadow-sm group"
                  >
                    <Users className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition-colors" />
                    <span className="text-[9px] font-black uppercase tracking-tight">Staff</span>
                  </button>
                  <button 
                    onClick={() => handleEscalate('admin')} 
                    className="flex flex-col items-center justify-center gap-1.5 p-3 bg-white border border-slate-200 rounded-2xl hover:border-amber-600 hover:text-amber-600 transition-all shadow-sm group"
                  >
                    <Zap className="w-4 h-4 text-slate-400 group-hover:text-amber-600 transition-colors" />
                    <span className="text-[9px] font-black uppercase tracking-tight">Escalate</span>
                  </button>
                </div>
              </div>
            )}

            {['staff', 'security', 'admin', 'responder'].includes(profile?.role || '') && !incident.responders.includes(user?.uid || '') && (
              <button onClick={() => setShowEtaModal(true)} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-3 rounded-xl shadow-lg shadow-blue-100 text-xs flex items-center justify-center gap-2">
                <Truck className="w-4 h-4" /> ACCEPT
              </button>
            )}

            {incident.status !== 'resolved' && (incident.responders.includes(user?.uid || '') || profile?.role === 'admin') && (
              <button onClick={handleResolve} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 rounded-xl text-xs flex items-center justify-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5" /> Resolve
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Middle Column: Chat & AI */}
      <div className="flex-1 flex flex-col bg-slate-50/30 rounded-[1.5rem] lg:rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-200/50 overflow-hidden min-h-[450px] lg:min-h-[400px]">
        {/* Chat Header */}
        <div className="px-5 py-4 lg:px-8 lg:py-6 border-b border-slate-200 flex flex-row items-center justify-between gap-4 bg-white/80 backdrop-blur-xl shrink-0">
          <div className="flex items-center gap-3 lg:gap-4">
            <div className="w-10 h-10 lg:w-12 lg:h-12 bg-red-600 rounded-xl lg:rounded-2xl flex items-center justify-center shadow-lg shadow-red-200 rotate-3 group hover:rotate-0 transition-transform cursor-pointer shrink-0">
              <Users className="text-white w-5 h-5 lg:w-6 lg:h-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm lg:text-lg font-black text-slate-900 tracking-tight leading-tight truncate">Operation Room</h2>
              <div className="flex items-center gap-1.5 lg:gap-2">
                <span className="w-1.5 lg:w-2 h-1.5 lg:h-2 rounded-full bg-green-500 animate-pulse shrink-0" />
                <p className="text-[8px] lg:text-[10px] text-slate-400 font-bold uppercase tracking-[0.1em] lg:tracking-[0.2em] truncate">Live Sync Active</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={handleAIAssist}
              disabled={loadingPlan}
              className="flex items-center gap-1.5 lg:gap-2 px-3 lg:px-5 py-2 lg:py-2.5 bg-slate-900 text-white rounded-xl lg:rounded-2xl hover:bg-black transition-all disabled:opacity-50 text-[8px] lg:text-[10px] font-black uppercase tracking-widest shadow-lg shadow-slate-900/20 group"
            >
              <Bot className={cn("w-3.5 h-3.5 lg:w-4 lg:h-4 text-yellow-400 group-hover:scale-110 transition-transform", loadingPlan && "animate-spin")} />
              <span className="hidden sm:inline">{loadingPlan ? 'Syncing...' : 'AI STRATEGY'}</span>
              <span className="sm:hidden">{loadingPlan ? '...' : 'AI'}</span>
            </button>
          </div>
        </div>

        {/* Messages List */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4 lg:p-8 space-y-2 custom-scrollbar bg-white/40 min-h-[300px]"
        >
          {messages.map((msg, idx) => {
            const isMe = msg.senderId === user?.uid;
            const isAI = msg.senderRole === 'ai';
            const isSystem = msg.type === 'system' || msg.senderRole === 'system';
            const prevMsg = idx > 0 ? messages[idx - 1] : null;
            const isSameSender = prevMsg && prevMsg.senderId === msg.senderId && !isSystem;

            if (isSystem && !isAI) {
              const responderDetail = incident.responderDetails?.[msg.senderId];
              const targetTime = msg.estimatedArrivalTime || (msg.text.includes('ETA:') ? responderDetail?.estimatedArrivalTime : null);
              const hasCountdown = targetTime && responderDetail?.status === 'responding';
              
              // Only show the buttons on the LATEST timer for this responder to avoid multiple prompts in history
              const latestTimerIdx = messages.slice().reverse().findIndex(m => 
                (m.estimatedArrivalTime || m.text.includes('ETA:')) && m.senderId === msg.senderId
              );
              const isLatestTimer = latestTimerIdx !== -1 && (messages.length - 1 - latestTimerIdx) === idx;

              return (
                <div key={msg.id} className="flex items-start gap-4 py-2 group">
                  <div className="flex flex-col items-center gap-1 shrink-0 mt-1">
                    <div className="w-2 h-2 rounded-full border-2 border-slate-200 bg-white" />
                    <div className="w-0.5 grow bg-slate-100 min-h-[10px]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">System Event</p>
                      <span className="text-[8px] font-medium text-slate-300">{formatTimestamp(msg.timestamp)}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                       <p className="text-xs font-bold text-slate-600 leading-tight">
                        {msg.text}
                      </p>
                      {hasCountdown && (
                        <CountdownTimer 
                          targetTime={targetTime} 
                        />
                      )}
                    </div>
                    {isLatestTimer && hasCountdown && targetTime && !handledPromptIds.has(msg.id) && (new Date(targetTime.seconds ? targetTime.seconds * 1000 : targetTime).getTime() < Date.now()) && (
                      <div className="mt-3 p-4 bg-blue-50 border border-blue-100 rounded-2xl">
                        <p className="text-[11px] font-black text-blue-900 uppercase tracking-wider mb-3">Has {responderDetail.role} arrived?</p>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => handleConfirmArrival(msg.senderId, true, msg.id)}
                            className="px-4 py-2 bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
                          >
                            Yes
                          </button>
                          <button 
                            onClick={() => handleConfirmArrival(msg.senderId, false, msg.id)}
                            className="px-4 py-2 bg-white border border-blue-200 text-blue-600 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-blue-50 transition-colors"
                          >
                            No
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            }

            return (
              <div key={msg.id} className={cn(
                "flex flex-col group", 
                isMe ? "items-end" : "items-start",
                isSameSender ? "mt-0.5" : "mt-4"
              )}>
                <div className={cn("max-w-[85%] flex flex-col", isMe ? "items-end" : "items-start")}>
                  {!isSameSender && (
                    <div className={cn("flex items-center gap-1.5 mb-1.5 px-1", isMe ? "flex-row-reverse" : "flex-row")}>
                      <span className="text-[10px] font-black text-slate-900 uppercase tracking-tight">{msg.senderName}</span>
                      <div className={cn(
                        "text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-tighter",
                        isAI ? "bg-yellow-100 text-yellow-700" : "bg-slate-100 text-slate-500"
                      )}>
                        {msg.senderRole}
                      </div>
                      <span className="text-[9px] text-slate-300 font-medium tabular-nums ml-1">{formatTimestamp(msg.timestamp)}</span>
                    </div>
                  )}
                  <div className={cn(
                    "px-4 py-2.5 rounded-2xl text-[13px] leading-relaxed shadow-sm transition-all duration-200",
                    isMe ? "bg-red-600 text-white rounded-tr-none hover:bg-red-700" : 
                    isAI ? "bg-slate-900 text-slate-100 rounded-tl-none border-l-4 border-yellow-400 shadow-xl" :
                    "bg-slate-100 text-slate-800 rounded-tl-none border border-slate-200 hover:bg-slate-200"
                  )}>
                    {msg.mediaUrl && (
                      <div 
                        className="mb-2 cursor-pointer group/img relative overflow-hidden rounded-xl border border-white/20"
                        onClick={() => setSelectedImage(msg.mediaUrl!)}
                      >
                        <img 
                          src={msg.mediaUrl} 
                          alt="Incident attachment" 
                          className="w-full max-w-[240px] aspect-video object-cover transition-transform group-hover/img:scale-105"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                          <Maximize2 className="w-5 h-5 text-white" />
                        </div>
                      </div>
                    )}
                    {msg.text}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Chat Input */}
        <div className="p-2.5 lg:p-6 bg-white/80 backdrop-blur-md border-t border-slate-100 shrink-0">
          <form onSubmit={handleSendMessage} className="flex items-center gap-1 lg:gap-3">
            <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleImageUpload} />
            <div className="flex gap-1.5">
              <button 
                type="button" 
                onClick={() => fileInputRef.current?.click()}
                disabled={analyzingImage}
                className={cn(
                  "p-2.5 lg:p-3.5 rounded-2xl transition-all border-2",
                  analyzingImage 
                    ? "bg-slate-50 text-slate-300 border-slate-100" 
                    : "bg-white text-slate-600 border-slate-200 hover:border-red-600 hover:text-red-600 shadow-sm active:scale-95"
                )}
              >
                <Camera className="w-5 h-5 lg:w-6 lg:h-6" />
              </button>
              <button 
                type="button" 
                onClick={startListening}
                className={cn(
                  "p-2.5 lg:p-3.5 rounded-2xl transition-all border-2",
                  isListening 
                    ? "bg-red-600 text-white border-red-700 animate-pulse scale-110 shadow-lg shadow-red-200" 
                    : "bg-white text-slate-600 border-slate-200 hover:border-red-600 hover:text-red-600 shadow-sm active:scale-95"
                )}
              >
                {isListening ? <Mic className="w-5 h-5 lg:w-6 lg:h-6" /> : <MicOff className="w-5 h-5 lg:w-6 lg:h-6" />}
              </button>
            </div>
            <div className="flex-1 relative">
              <input 
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Message..."
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 lg:px-6 py-3 lg:py-4 focus:border-red-600 focus:bg-white outline-none transition-all text-xs lg:text-sm font-bold shadow-inner"
              />
            </div>
            <button type="submit" className="p-3 lg:p-4 bg-red-600 text-white rounded-2xl hover:bg-red-700 shadow-xl shadow-red-200 hover:scale-105 transition-all shrink-0">
              <Send className="w-5 h-5" />
            </button>
          </form>
        </div>
      </div>

      {/* Right Column: AI Strategy */}
      <AnimatePresence>
        {aiPlan && (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="w-full lg:w-96 shrink-0 z-50 lg:z-0 fixed lg:relative inset-0 bg-white lg:bg-transparent lg:border-none flex flex-col shadow-2xl lg:shadow-none overflow-hidden"
          >
            <div className="p-6 lg:p-8 bg-slate-950 text-white flex items-center justify-between shrink-0 lg:rounded-t-[2.5rem]">
              <div className="flex items-center gap-4">
                <div className="bg-yellow-400 p-2.5 rounded-2xl shadow-[0_0_20px_rgba(250,204,21,0.4)] rotate-3">
                  <Zap className="w-6 h-6 text-slate-950" />
                </div>
                <div>
                  <h3 className="text-xl font-black tracking-tight leading-none text-white">AI Strategy</h3>
                  <p className="text-[10px] text-yellow-400 font-black uppercase tracking-[0.2em] mt-1.5">Live Intelligence</p>
                </div>
              </div>
              <button 
                onClick={() => setAiPlan(null)} 
                className="p-2 hover:bg-white/10 rounded-xl transition-colors border border-white/10"
              >
                <XCircle className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 lg:p-8 space-y-8 bg-white lg:rounded-b-[2.5rem] lg:border border-slate-200 custom-scrollbar pb-24 lg:pb-8">
              {/* Immediate Actions Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Priority Alpha</h4>
                  <div className="flex gap-1">
                    <div className="w-1 h-1 rounded-full bg-red-500" />
                    <div className="w-1 h-1 rounded-full bg-red-500/30" />
                  </div>
                </div>
                
                {aiPlan.steps
                  .filter((s: any) => s.priority === 'immediate')
                  .map((step: any, i: number) => (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      key={i} 
                      className="bg-red-50/50 p-5 rounded-[1.75rem] border-2 border-red-100 shadow-sm group hover:border-red-200 transition-all relative overflow-hidden"
                    >
                      <div className="flex gap-4 relative z-10">
                        <span className="text-xs font-black text-red-600 bg-white w-7 h-7 rounded-lg flex items-center justify-center shrink-0 shadow-sm border border-red-100">{i + 1}</span>
                        <p className="text-[13px] font-black text-red-900 leading-snug tracking-tight">{step.action}</p>
                      </div>
                    </motion.div>
                ))}
              </div>

              {/* Secondary & Others */}
              {aiPlan.steps.some((s: any) => s.priority !== 'immediate') && (
                <div className="space-y-3">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Next Steps</h4>
                  <div className="bg-white rounded-2xl border border-slate-100 divide-y divide-slate-50 overflow-hidden shadow-sm">
                    {aiPlan.steps
                      .filter((s: any) => s.priority !== 'immediate')
                      .map((step: any, i: number) => (
                        <div key={i} className="p-3 bg-white hover:bg-slate-50 transition-colors">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className={cn(
                              "text-[8px] font-black uppercase px-2 py-0.5 rounded-full",
                              step.priority === 'secondary' ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-500"
                            )}>
                              {step.priority}
                            </span>
                          </div>
                          <p className="text-[11px] font-bold text-slate-700 leading-snug">{step.action}</p>
                        </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Evacuation Warning */}
              {aiPlan.evacuationRequired && (
                <div className="bg-amber-50 p-4 rounded-2xl border border-amber-200 space-y-2">
                  <div className="flex items-center gap-2 text-amber-900 font-black text-[10px] uppercase tracking-widest">
                    <ArrowUpCircle className="w-4 h-4 text-amber-600" />
                    Evacuation Advised
                  </div>
                  <p className="text-xs font-bold text-amber-800 leading-relaxed italic border-l-2 border-amber-200 pl-3">
                    {aiPlan.evacuationRoute || "Standard emergency routes active."}
                  </p>
                </div>
              )}

              {/* Resources */}
              {aiPlan.nearbyResources && aiPlan.nearbyResources.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Nearby Resources</h4>
                  <div className="flex flex-wrap gap-2">
                    {aiPlan.nearbyResources.map((res: string, i: number) => (
                      <span key={i} className="text-[9px] font-black bg-slate-900 text-white px-3 py-1.5 rounded-xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-1" style={{ animationDelay: `${i * 100}ms` }}>
                        <Info className="w-3 h-3 text-blue-400" />
                        {res}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSecurityTypeModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              className="bg-white rounded-[2.5rem] p-10 w-full max-w-lg shadow-2xl"
            >
              <h3 className="text-xl lg:text-2xl font-black text-slate-900 mb-6 lg:mb-10 text-center tracking-tight">Dispatch Security</h3>
              
              <div className="grid grid-cols-2 gap-4 lg:gap-6">
                {SOS_TYPES.map((type) => (
                  <button 
                    key={type.id} 
                    onClick={() => handleAssignSecurity(type.id as SecurityType)} 
                    className="flex flex-col items-center justify-center gap-3 lg:gap-5 p-4 lg:p-8 rounded-[1.5rem] lg:rounded-[2rem] bg-white border border-slate-100 hover:shadow-xl hover:border-slate-200 transition-all group"
                  >
                    <div className={cn(
                      "w-14 h-14 lg:w-20 lg:h-20 rounded-2xl lg:rounded-3xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300",
                      type.bg
                    )}>
                      <type.icon className="w-6 h-6 lg:w-10 lg:h-10 text-white" strokeWidth={2.5} />
                    </div>
                    <span className="text-[10px] lg:text-xs font-black uppercase tracking-[0.1em] text-slate-900">{type.label}</span>
                  </button>
                ))}
              </div>
              
              <div className="mt-10 text-center">
                <button 
                  onClick={() => setShowSecurityTypeModal(false)} 
                  className="text-slate-400 font-bold hover:text-slate-900 transition-all text-sm uppercase tracking-widest"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showEtaModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-[2rem] p-6 w-full max-w-sm">
              <h3 className="text-lg font-black text-slate-900 mb-4 text-center">Estimated ETA</h3>
              <div className="grid grid-cols-2 gap-2 mb-6">
                {['2 mins', '5 mins', '10 mins', '15 mins'].map((time) => (
                  <button key={time} onClick={() => setEtaInput(time)} className={cn("py-2 rounded-xl text-xs font-bold transition-all border-2", etaInput === time ? "bg-blue-600 border-blue-600 text-white" : "bg-slate-50 border-slate-100 text-slate-600")}>{time}</button>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowEtaModal(false)} className="flex-1 py-3 text-slate-500 font-bold text-xs">Cancel</button>
                <button onClick={handleConfirmETA} disabled={!etaInput || submittingEta} className="flex-[2] bg-blue-600 text-white font-black py-3 rounded-xl text-xs disabled:opacity-50 transition-opacity">
                  {submittingEta ? 'Confirming...' : 'Confirm'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <Modal
        isOpen={!!selectedImage}
        onClose={() => setSelectedImage(null)}
        title="Evidence View"
        className="max-w-4xl"
      >
        <div className="flex flex-col items-center gap-4">
          <img 
            src={selectedImage || ''} 
            alt="Incident Evidence" 
            className="w-full h-auto rounded-2xl shadow-2xl"
            referrerPolicy="no-referrer"
          />
          <button 
            onClick={() => setSelectedImage(null)}
            className="px-8 py-3 bg-slate-900 text-white font-black rounded-2xl uppercase tracking-widest text-xs hover:bg-black transition-all"
          >
            Close Inspector
          </button>
        </div>
      </Modal>
    </div>
  );
}
