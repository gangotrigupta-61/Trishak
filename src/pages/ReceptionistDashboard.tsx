import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigate, Link } from 'react-router-dom';
import { db } from '../lib/firebase';
import { 
  collection, 
  addDoc, 
  setDoc,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query, 
  where, 
  onSnapshot, 
  serverTimestamp, 
  orderBy,
  limit,
  updateDoc,
  arrayUnion
} from 'firebase/firestore';
import { 
  UserPlus, 
  Ticket, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  Copy,
  Check,
  RefreshCw,
  Users,
  ShieldAlert,
  MapPin,
  ArrowRight,
  X,
  UserCog,
  Zap,
  Trash2,
  Mail,
  Globe,
  Shield,
  AlertTriangle,
  Phone,
  UserCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Guest, Incident } from '../types';
import { SOS_TYPES, mapOldIncidentType } from '../constants';
import { cn, formatTimestamp, getSeverityColor, getStatusColor } from '../lib/utils';
import Modal from '../components/Modal';

export default function ReceptionistDashboard() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [guests, setGuests] = useState<Guest[]>([]);
  const [loadingGuests, setLoadingGuests] = useState(true);
  const [activeIncidents, setActiveIncidents] = useState<Incident[]>([]);
  const [loadingIncidents, setLoadingIncidents] = useState(true);
  const [escalatedIncidents, setEscalatedIncidents] = useState<Incident[]>([]);
  const [generating, setGenerating] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [showTokenForm, setShowTokenForm] = useState(false);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [tokenToDelete, setTokenToDelete] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [securityModalIncidentId, setSecurityModalIncidentId] = useState<string | null>(null);
  const [phoneInput, setPhoneInput] = useState(profile?.phone || '');
  const [updatingProfile, setUpdatingProfile] = useState(false);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setUpdatingProfile(true);
    try {
      await updateDoc(doc(db, 'users', profile.uid), {
        phone: phoneInput,
        updatedAt: serverTimestamp()
      });
      setIsProfileModalOpen(false);
      setToast({ message: 'Profile updated successfully', type: 'success' });
    } catch (error) {
      console.error('Error updating profile:', error);
      setToast({ message: 'Failed to update profile', type: 'error' });
    } finally {
      setUpdatingProfile(false);
    }
  };

  const [togglingDuty, setTogglingDuty] = useState(false);

  const toggleDuty = async () => {
    if (!profile || togglingDuty) return;
    setTogglingDuty(true);
    const newStatus = profile.status === 'active' ? 'inactive' : 'active';
    try {
      await updateDoc(doc(db, 'users', profile.uid), {
        status: newStatus,
        lastDutyChange: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setToast({ 
        message: `You are now ${newStatus === 'active' ? 'On Duty' : 'Off Duty'}`, 
        type: 'success' 
      });
    } catch (error) {
      console.error('Error updating duty status:', error);
      setToast({ message: 'Failed to update duty status', type: 'error' });
    } finally {
      setTogglingDuty(false);
    }
  };

  const [showGlobalModal, setShowGlobalModal] = useState(false);
  const [globalModalIncidentId, setGlobalModalIncidentId] = useState<string | null>(null);
  const [isTogglingGlobal, setIsTogglingGlobal] = useState(false);
  const [performingAction, setPerformingAction] = useState<string | null>(null);

  const handleToggleGlobal = async (incidentId: string) => {
    if (!profile || isTogglingGlobal) return;
    setIsTogglingGlobal(true);
    
    try {
      const incidentRef = doc(db, 'incidents', incidentId);
      await updateDoc(incidentRef, {
        isGlobal: true,
        updatedAt: serverTimestamp()
      });

      // Add system message
      await addDoc(collection(db, `incidents/${incidentId}/messages`), {
        incidentId,
        senderId: profile.uid,
        senderName: 'TRISHAK System',
        senderRole: 'system',
        text: `AUDIT: ${profile.displayName} (Receptionist) marked this incident as GLOBAL. It is now visible to the entire organization.`,
        type: 'system',
        timestamp: serverTimestamp()
      });

      setToast({ message: 'Incident is now GLOBAL', type: 'success' });
      setShowGlobalModal(false);
      setGlobalModalIncidentId(null);
    } catch (error) {
      console.error('Error toggling global state:', error);
      setToast({ message: 'Failed to update incident', type: 'error' });
    } finally {
      setIsTogglingGlobal(false);
    }
  };

  const handleAdminAction = async (incidentId: string, action: 'assign' | 'forward', targetRole?: any, securityType?: string) => {
    if (!profile || performingAction) return;
    setPerformingAction(`${incidentId}-${action}`);
    
    try {
      if (action === 'assign' && targetRole) {
        let assignedUserIds: string[] = [];
        
        // If assigning to security specialized, fetch matching users
        if (targetRole === 'security' && securityType) {
          const usersRef = collection(db, 'users');
          const q = query(
            usersRef,
            where('role', '==', 'security'),
            where('securityType', '==', securityType),
            where('status', '==', 'active'),
            where('organizationId', '==', profile.organizationId)
          );
          const snapshot = await getDocs(q);
          assignedUserIds = snapshot.docs.map(doc => doc.id);
        }

        const updateData: any = {
          status: 'assigned',
          assignedTo: targetRole,
          assignedToRoles: arrayUnion(targetRole),
          updatedAt: serverTimestamp()
        };

        if (securityType) {
          updateData.securityType = securityType;
          if (assignedUserIds.length > 0) {
            updateData.assignedUsers = assignedUserIds;
          }
        }

        await updateDoc(doc(db, 'incidents', incidentId), updateData);

        // Add system message
        const specializedSuffix = securityType ? ` (${securityType.toUpperCase()} specialists: ${assignedUserIds.length} users)` : '';
        await addDoc(collection(db, `incidents/${incidentId}/messages`), {
          incidentId,
          senderId: user!.uid,
          senderName: 'TRISHAK System',
          senderRole: 'system',
          text: `AUDIT: ${profile.displayName} (Receptionist) assigned incident to ${targetRole.toUpperCase()}${specializedSuffix}.`,
          type: 'system',
          timestamp: serverTimestamp()
        });
      } else if (action === 'forward') {
        await updateDoc(doc(db, 'incidents', incidentId), {
          status: 'escalated',
          assignedToRoles: arrayUnion('admin'),
          updatedAt: serverTimestamp()
        });

        // Add system message
        await addDoc(collection(db, `incidents/${incidentId}/messages`), {
          incidentId,
          senderId: user!.uid,
          senderName: 'TRISHAK System',
          senderRole: 'system',
          text: `AUDIT: ${profile.displayName} (Receptionist) escalated incident to Admin/Command Center.`,
          type: 'system',
          timestamp: serverTimestamp()
        });
      }
      setToast({ message: `Incident ${action === 'assign' ? 'assigned' : 'escalated'} successfully`, type: 'success' });
    } catch (error) {
      console.error('Error performing admin action:', error);
      setToast({ message: 'Action failed. Please try again.', type: 'error' });
    } finally {
      setPerformingAction(null);
    }
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    if (!profile?.organizationId) return;

    // Guests Query
    const guestsQuery = query(
      collection(db, 'guests'),
      where('organizationId', '==', profile.organizationId),
      orderBy('createdAt', 'desc'),
      limit(20)
    );

    setLoadingGuests(true);
    const unsubscribeGuests = onSnapshot(guestsQuery, (snapshot) => {
      setGuests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Guest)));
      setLoadingGuests(false);
    }, (error) => {
      console.error('Error in guests listener:', error);
      setLoadingGuests(false);
    });

    // Active Incidents Query
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const incidentsQuery = query(
      collection(db, 'incidents'),
      where('organizationId', '==', profile.organizationId),
      where('status', 'in', ['reported', 'assigned', 'escalated', 'responding']),
      where('createdAt', '>=', todayStart),
      orderBy('createdAt', 'desc'),
      limit(20)
    );

    setLoadingIncidents(true);
    const unsubscribeIncidents = onSnapshot(incidentsQuery, (snapshot) => {
      const incidents = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Incident));
      setActiveIncidents(incidents);
      setLoadingIncidents(false);
      
      const escalated = incidents.filter(inc => inc.status === 'escalated');
      setEscalatedIncidents(escalated);
    }, (error) => {
      console.error('Error in incidents listener:', error);
      setLoadingIncidents(false);
    });

    return () => {
      unsubscribeGuests();
      unsubscribeIncidents();
    };
  }, [user, profile?.organizationId]);

  const generateToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile?.organizationId || !guestName || !guestPhone) return;
    setGenerating(true);
    
    try {
      // Generate a random 6-digit alphanumeric code
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24); // Valid for 24 hours

      const tokenRef = doc(db, 'guestTokens', code);
      const tokenSnap = await getDoc(tokenRef);
      
      if (tokenSnap.exists() && tokenSnap.data().status === 'active') {
        // Collision with active token! Rare, but let's retry.
        setGenerating(false);
        return generateToken(e);
      }

      await setDoc(tokenRef, {
        code,
        guestName,
        guestPhone,
        receptionistId: user.uid,
        organizationId: profile.organizationId,
        status: 'active',
        createdAt: serverTimestamp(),
        expiresAt: expiresAt
      });

      // Also create record in 'guests' collection as requested
      await setDoc(doc(db, 'guests', code), {
        guestId: code,
        code: code, // Add code field for explicit search compatibility
        name: guestName,
        phone: guestPhone,
        organizationId: profile.organizationId,
        status: 'active',
        createdAt: serverTimestamp()
      });

      // Send SMS via Twilio backend
      try {
        await fetch('/api/send-guest-sms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: guestName,
            phone: guestPhone,
            guestId: code
          })
        });
      } catch (smsErr) {
        console.error('Failed to trigger guest SMS:', smsErr);
        // We don't block the UI for SMS failure as the record is already saved
      }

      setLastGenerated(code);
      setGuestName('');
      setGuestPhone('');
      setShowTokenForm(false);
      setTimeout(() => setLastGenerated(null), 15000); // Hide after 15s
    } catch (error) {
      console.error('Error generating token:', error);
    } finally {
      setGenerating(false);
    }
  };

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      setToast({ message: 'Copy failed', type: 'error' });
    }
  };

  const handleDeleteConfirm = async () => {
    if (!tokenToDelete) return;
    
    try {
      // Delete from both collections
      await deleteDoc(doc(db, 'guestTokens', tokenToDelete));
      await deleteDoc(doc(db, 'guests', tokenToDelete));
      setToast({ message: 'Guest ID deleted successfully', type: 'success' });
    } catch (error) {
      console.error('Error deleting token:', error);
      setToast({ message: 'Failed to delete. Try again.', type: 'error' });
    } finally {
      setShowDeleteModal(false);
      setTokenToDelete(null);
    }
  };

  const formatDateTime = (timestamp: any) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return (
      <div className="flex flex-col">
        <span className="text-slate-900 font-bold">{date.toLocaleDateString()}</span>
        <span className="text-[10px] text-slate-400">{date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-0 py-6 md:py-10 space-y-8 relative">
      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className={cn(
              "fixed bottom-8 right-8 z-50 px-6 py-3 rounded-2xl shadow-2xl font-bold flex items-center gap-3",
              toast.type === 'success' ? "bg-green-600 text-white" : "bg-red-600 text-white"
            )}
          >
            {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
      {/* Critical Escalations Section (Copied from Admin) */}
      <AnimatePresence>
        {escalatedIncidents.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-4"
          >
            <div className="flex items-center gap-2 px-2">
              <AlertTriangle className="w-5 h-5 text-red-600 animate-pulse" />
              <h2 className="text-xl font-black text-red-600 uppercase tracking-widest">Critical Escalations</h2>
              <span className="ml-auto bg-red-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                {escalatedIncidents.length} URGENT
              </span>
            </div>
            
            <div className="grid gap-4">
              {escalatedIncidents.map((incident) => (
                <div key={incident.id} className="bg-white p-6 rounded-[2.5rem] border-2 border-red-100 shadow-xl shadow-red-50 flex flex-col md:flex-row md:items-center gap-6 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                    <ShieldAlert className="w-24 h-24 text-red-600" />
                  </div>

                  <div className="w-16 h-16 bg-red-600 rounded-3xl flex items-center justify-center shrink-0 shadow-lg shadow-red-200">
                    <ShieldAlert className="w-8 h-8 text-white" />
                  </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-black uppercase tracking-widest bg-red-50 text-red-600 px-3 py-1 rounded-full border border-red-100">
                          {SOS_TYPES.find(t => t.id === mapOldIncidentType(incident.type))?.label || incident.type}
                        </span>
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                          {formatTimestamp(incident.createdAt)}
                        </span>
                        {incident.securityType && (
                          <span className="text-[10px] font-black uppercase tracking-widest bg-yellow-400 text-slate-900 px-3 py-1 rounded-full border border-yellow-500 shadow-sm animate-pulse ml-1">
                            {incident.securityType}
                          </span>
                        )}
                      </div>
                      <h3 className="text-lg font-black text-slate-900 leading-tight">{incident.description}</h3>
                    </div>

                    <div className="flex items-center gap-1.5 relative z-10 shrink-0">
                      <div className="flex bg-slate-50 p-1 rounded-2xl border border-slate-100">
                        {!incident.isGlobal && (
                          <button 
                            onClick={() => {
                              setGlobalModalIncidentId(incident.id);
                              setShowGlobalModal(true);
                            }}
                            className="p-2.5 hover:bg-white hover:text-red-600 hover:shadow-sm rounded-xl transition-all text-slate-400"
                            title="Make it Global"
                          >
                            <Globe className="w-4 h-4" />
                          </button>
                        )}
                        {incident.isGlobal && (
                          <div className="p-2.5 text-red-600" title="Global Alert Active">
                            <Globe className="w-4 h-4 animate-pulse" />
                          </div>
                        )}
                        
                        <div className="w-px h-6 bg-slate-200 my-auto mx-1" />

                        <button 
                          onClick={() => handleAdminAction(incident.id, 'assign', 'staff')}
                          disabled={performingAction === `${incident.id}-assign`}
                          className="p-2.5 hover:bg-white hover:text-blue-600 hover:shadow-sm rounded-xl transition-all text-slate-400 disabled:opacity-50"
                          title="Assign to Staff"
                        >
                          <Users className="w-4 h-4" />
                        </button>

                        <button 
                          onClick={() => {
                            setSecurityModalIncidentId(incident.id);
                            setShowSecurityModal(true);
                          }}
                          disabled={performingAction?.startsWith(incident.id)}
                          className="p-2.5 hover:bg-white hover:text-red-600 hover:shadow-sm rounded-xl transition-all text-slate-400 disabled:opacity-50"
                          title="Assign to Security"
                        >
                          <Shield className="w-4 h-4" />
                        </button>

                        <button 
                          onClick={() => handleAdminAction(incident.id, 'forward')}
                          disabled={performingAction === `${incident.id}-forward`}
                          className="p-2.5 hover:bg-white hover:text-amber-600 hover:shadow-sm rounded-xl transition-all text-slate-400 disabled:opacity-50"
                          title="Escalate to Command Center"
                        >
                          <Zap className="w-4 h-4" />
                        </button>
                      </div>

                      <Link 
                        to={`/incident/${incident.id}`}
                        className="p-3 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl transition-all shadow-lg shadow-slate-200"
                        title="Open Control Room"
                      >
                        <ArrowRight className="w-5 h-5" />
                      </Link>
                    </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-black text-slate-900 tracking-tight">
            Hello, {(profile?.displayName || 'Receptionist').split(' ')[0]}
          </h1>
          <div className="flex flex-wrap gap-2 lg:gap-4 mt-3 lg:mt-2">
            <div className="flex items-center gap-2 bg-slate-100 px-3 lg:px-4 py-1.5 lg:py-2 rounded-2xl border border-slate-200">
              <Users className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-slate-500" />
              <span className="text-[10px] lg:text-xs font-bold text-slate-700">{profile?.displayName}</span>
            </div>
            {profile?.phone && (
              <div className="flex items-center gap-2 bg-slate-100 px-3 lg:px-4 py-1.5 lg:py-2 rounded-2xl border border-slate-200">
                <Phone className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-slate-500" />
                <span className="text-[10px] lg:text-xs font-bold text-slate-700">{profile.phone}</span>
              </div>
            )}
            {profile?.uniqueId && (
              <div className="flex items-center gap-2 bg-slate-100 px-3 lg:px-4 py-1.5 lg:py-2 rounded-2xl border border-slate-200">
                <Ticket className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-slate-500" />
                <span className="text-[10px] lg:text-xs font-bold text-slate-700">ID: {profile.uniqueId}</span>
              </div>
            )}
          </div>
        </div>
        
        <div className="grid grid-cols-2 sm:flex sm:items-center gap-3 lg:gap-4">
          <button
            onClick={() => {
              setPhoneInput(profile?.phone || '');
              setIsProfileModalOpen(true);
            }}
            className="p-3 lg:p-4 bg-white border border-slate-200 rounded-[1.25rem] lg:rounded-2xl text-slate-600 hover:bg-slate-50 transition-all shadow-sm flex items-center justify-center gap-2 font-bold text-xs"
            title="Update Profile"
          >
            <UserCog className="w-4 h-4 lg:w-5 lg:h-5" />
            <span>Profile</span>
          </button>

          {!showTokenForm && (
            <button
              onClick={() => setShowTokenForm(true)}
              className="flex items-center justify-center gap-2 lg:gap-3 bg-red-600 text-white px-4 lg:px-8 py-3 lg:py-4 rounded-[1.25rem] lg:rounded-2xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-100 text-xs lg:text-sm"
            >
              <UserPlus className="w-4 h-4 lg:w-5 lg:h-5" />
              <span>Register Guest</span>
            </button>
          )}
        </div>
      </div>

      {/* Duty Status Toggle */}
      {profile && (
        <div className="bg-slate-900 p-6 lg:p-8 rounded-2xl lg:rounded-3xl text-white border border-slate-800 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10 hidden md:block">
            <UserCircle className="w-32 h-32" />
          </div>
          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6 lg:gap-8">
            <div className="space-y-3 lg:space-y-4">
              <div className={cn(
                "inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border",
                profile.status === 'active' 
                  ? "bg-green-500/20 text-green-400 border-green-500/30" 
                  : "bg-slate-500/20 text-slate-400 border-slate-500/30"
              )}>
                <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", profile.status === 'active' ? "bg-green-500" : "bg-slate-500")}></div>
                {profile.status === 'active' ? 'On Duty' : 'Off Duty'}
              </div>
              <h2 className="text-xl lg:text-2xl font-black tracking-tight">Receptionist Duty Status</h2>
              <p className="text-slate-400 max-w-md font-medium text-xs lg:text-base leading-relaxed">
                {profile.status === 'active' 
                  ? "You are currently on active duty. You can register guests and manage incidents."
                  : "You are currently off duty. Please check-in to start managing guests and emergencies."}
              </p>
            </div>
            <div className="flex flex-wrap gap-4">
              <button 
                onClick={toggleDuty}
                disabled={togglingDuty}
                className={cn(
                  "font-black py-3.5 lg:py-4 px-6 lg:px-8 rounded-xl lg:rounded-2xl transition-all active:scale-95 text-xs lg:text-sm flex items-center justify-center gap-2 disabled:opacity-50 w-full lg:w-auto",
                  profile.status === 'active' 
                    ? "bg-white text-slate-900 hover:bg-slate-100" 
                    : "bg-red-600 text-white hover:bg-red-700 shadow-lg shadow-red-900/20"
                )}
              >
                {togglingDuty && <RefreshCw className="w-4 h-4 animate-spin" />}
                {profile.status === 'active' ? 'GO OFF-DUTY' : 'CHECK-IN FOR DUTY'}
              </button>
            </div>
          </div>
        </div>
      )}

      <AnimatePresence>
        {showTokenForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-black text-slate-900">Guest Details</h2>
              <button 
                onClick={() => setShowTokenForm(false)}
                className="p-2 hover:bg-slate-100 rounded-xl transition-all text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={generateToken} className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Guest Full Name</label>
                <input 
                  type="text" 
                  required
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="Enter guest's full name"
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 text-sm focus:border-red-600 focus:ring-0 transition-all font-medium"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Guest Phone Number</label>
                <input 
                  type="tel" 
                  required
                  value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value)}
                  placeholder="Enter guest's phone number"
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 text-sm focus:border-red-600 focus:ring-0 transition-all font-medium"
                />
              </div>
              <div className="md:col-span-2 flex flex-col sm:flex-row justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowTokenForm(false)}
                  className="sm:hidden px-6 py-4 rounded-2xl bg-slate-100 text-slate-600 font-bold hover:bg-slate-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={generating}
                  className="flex items-center justify-center gap-3 bg-red-600 text-white px-10 py-4 rounded-2xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-100 disabled:opacity-50 w-full sm:w-auto"
                >
                  {generating ? (
                    <RefreshCw className="w-5 h-5 animate-spin" />
                  ) : (
                    <Zap className="w-5 h-5" />
                  )}
                  Generate Secure Guest ID
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {lastGenerated && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-red-600 p-8 rounded-3xl text-white shadow-2xl shadow-red-200 flex flex-col items-center text-center relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
              <Ticket className="w-64 h-64 -translate-x-1/2 -translate-y-1/2 absolute" />
            </div>
            
            <p className="text-red-100 font-bold uppercase tracking-widest text-xs mb-4">New Guest ID Generated</p>
            <div className="flex items-center gap-4 mb-4">
              <span className="text-6xl font-black tracking-[0.2em]">{lastGenerated}</span>
              <button 
                onClick={() => copyToClipboard(lastGenerated, 'last-generated')}
                className="p-3 bg-white/20 rounded-xl hover:bg-white/30 transition-all"
              >
                {copiedId === 'last-generated' ? (
                  <Check className="w-6 h-6 text-green-400" />
                ) : (
                  <Copy className="w-6 h-6" />
                )}
              </button>
            </div>
            <p className="text-sm text-red-100 max-w-xs">
              Provide this code to the guest. It will expire in 24 hours or after first use.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Active Incidents List (Copied from Admin) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-3">
              <div className="bg-slate-100 p-2 rounded-xl">
                <ShieldAlert className="w-5 h-5 text-slate-600" />
              </div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">Active Incidents</h2>
            </div>
            <Link to="/incidents" className="text-sm font-bold text-red-600 hover:underline flex items-center gap-1">
              Incident Log <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="space-y-4">
            {loadingIncidents ? (
              <div className="bg-white p-12 rounded-3xl border border-slate-100 flex flex-col items-center justify-center text-center">
                <RefreshCw className="text-red-600 w-10 h-10 animate-spin mb-4" />
                <p className="text-sm text-slate-500 font-bold">Syncing incidents...</p>
              </div>
            ) : activeIncidents.length > 0 ? (
              activeIncidents
                .slice(0, 10)
                .map((incident) => (
                  <motion.div 
                    key={incident.id}
                    whileHover={{ scale: 1.01 }}
                    className={cn(
                      "bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row md:items-center gap-6",
                      incident.isGlobal && "animate-pulse-red border-red-200 ring-2 ring-red-100 ring-inset"
                    )}
                  >
                    <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-slate-100", getSeverityColor(incident.severity))}>
                      <ShieldAlert className="w-7 h-7 text-white" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <Link to={`/incident/${incident.id}`} className="block group">
                        <div className="flex items-center gap-2 mb-1">
                          {incident.isGlobal && (
                            <span className="text-[9px] font-black uppercase tracking-widest bg-red-600 text-white px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm shadow-red-200">
                              🌐 GLOBAL
                            </span>
                          )}
                          <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full">
                            {SOS_TYPES.find(t => t.id === mapOldIncidentType(incident.type))?.label || incident.type}
                          </span>
                          <span className={cn("text-[9px] font-black uppercase tracking-widest", getStatusColor(incident.status))}>
                            {incident.status}
                          </span>
                        </div>
                        <h3 className="font-bold text-slate-900 truncate group-hover:text-red-600 transition-colors uppercase tracking-tight">{incident.description}</h3>
                        <p className="text-[10px] text-slate-500 flex items-center gap-1 mt-1 font-bold italic">
                          <Clock className="w-3 h-3 text-red-600" /> {formatTimestamp(incident.createdAt)}
                        </p>
                      </Link>
                    </div>

                    <div className="flex items-center gap-1 shrink-0 bg-slate-50 p-1 rounded-xl border border-slate-100">
                      {!incident.isGlobal && (
                        <button 
                          onClick={() => {
                            setGlobalModalIncidentId(incident.id);
                            setShowGlobalModal(true);
                          }}
                          className="p-2 hover:bg-white hover:text-red-600 rounded-lg transition-all text-slate-400"
                          title="Make it Global"
                        >
                          <Globe className="w-3.5 h-3.5" />
                        </button>
                      )}
                      
                      <button 
                        onClick={() => handleAdminAction(incident.id, 'assign', 'staff')}
                        disabled={performingAction?.startsWith(incident.id)}
                        className="p-2 hover:bg-white hover:text-blue-600 rounded-lg transition-all text-slate-400 disabled:opacity-50"
                        title="Assign to Staff"
                      >
                        <Users className="w-3.5 h-3.5" />
                      </button>

                      <button 
                        onClick={() => {
                          setSecurityModalIncidentId(incident.id);
                          setShowSecurityModal(true);
                        }}
                        disabled={performingAction?.startsWith(incident.id)}
                        className="p-2 hover:bg-white hover:text-red-600 rounded-lg transition-all text-slate-400 disabled:opacity-50"
                        title="Assign to Security"
                      >
                        <Shield className="w-3.5 h-3.5" />
                      </button>

                      <button 
                        onClick={() => handleAdminAction(incident.id, 'forward')}
                        disabled={performingAction?.startsWith(incident.id)}
                        className="p-2 hover:bg-white hover:text-amber-600 rounded-lg transition-all text-slate-400 disabled:opacity-50"
                        title="Escalate to Admin"
                      >
                        <Zap className="w-3.5 h-3.5" />
                      </button>

                      <Link 
                        to={`/incident/${incident.id}`}
                        className="p-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg transition-all shadow-sm"
                        title="Open Control Room"
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </motion.div>
                ))
            ) : (
              <div className="bg-white p-12 rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-center">
                <div className="bg-slate-50 p-4 rounded-full mb-4">
                  <CheckCircle2 className="text-slate-300 w-10 h-10" />
                </div>
                <h3 className="font-bold text-slate-900 mb-1">All Clear</h3>
                <p className="text-sm text-slate-500">No active emergencies at this time.</p>
              </div>
            )}
          </div>
        </div>

        {/* Recent Tokens */}
        <div className="lg:col-span-3 bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-slate-100 p-2 rounded-xl">
                <Ticket className="w-5 h-5 text-slate-600" />
              </div>
              <h2 className="font-bold text-slate-900">Recent Guest IDs</h2>
            </div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Last 20 entries</span>
          </div>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Guest Details</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Email</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Code</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Created</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loadingGuests ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <RefreshCw className="w-8 h-8 text-red-600 animate-spin" />
                        <p className="text-sm text-slate-400 font-medium">Loading guest records...</p>
                      </div>
                    </td>
                  </tr>
                ) : guests.map((guest) => (
                  <tr key={guest.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          <span className="font-bold text-slate-900 text-sm">{guest.name || 'N/A'}</span>
                          <span className="text-[10px] text-slate-500 font-medium">{guest.phone || 'N/A'}</span>
                        </div>
                    </td>
                    <td className="px-6 py-4">
                      {guest.email ? (
                        <div className="flex items-center gap-1.5 text-blue-600 group/email">
                          <Mail className="w-3.5 h-3.5" />
                          <span className="text-xs font-bold">{guest.email}</span>
                          <button 
                            onClick={() => copyToClipboard(guest.email!, guest.id + '-email')}
                            className={cn(
                              "transition-all p-1 hover:bg-blue-50 rounded text-blue-600",
                              copiedId === guest.id + '-email' ? "opacity-100" : "opacity-0 group-hover/email:opacity-100"
                            )}
                            title="Copy Email"
                          >
                            {copiedId === guest.id + '-email' ? (
                              <Check className="w-3 h-3 text-green-600" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Email not linked yet</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-slate-900 tracking-wider font-mono bg-slate-100 px-2 py-1 rounded-lg border border-slate-200">{guest.guestId}</span>
                        <button 
                          onClick={() => copyToClipboard(guest.guestId, guest.id)}
                          className="p-1.5 hover:bg-slate-100 rounded-lg transition-all text-slate-400 hover:text-red-600"
                          title="Copy Code"
                        >
                          {copiedId === guest.id ? (
                            <Check className="w-3.5 h-3.5 text-green-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className={cn(
                        "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                        guest.status === 'active' ? "bg-green-50 text-green-600" :
                        guest.status === 'used' ? "bg-blue-50 text-blue-600" :
                        "bg-slate-100 text-slate-500"
                      )}>
                        {guest.status === 'active' ? <Clock className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                        {guest.status}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {formatDateTime(guest.createdAt)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => {
                          setTokenToDelete(guest.id);
                          setShowDeleteModal(true);
                        }}
                        className="p-2 bg-red-50 text-red-600 rounded-xl transition-all hover:bg-red-100"
                        title="Delete Guest ID"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {guests.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <AlertCircle className="w-8 h-8 text-slate-200" />
                        <p className="text-sm text-slate-400 font-medium">No guest IDs generated yet.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List */}
          <div className="md:hidden divide-y divide-slate-100">
            {loadingGuests ? (
              <div className="p-8 text-center">
                 <RefreshCw className="w-8 h-8 text-red-600 animate-spin mx-auto mb-2" />
                 <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Syncing Records...</p>
              </div>
            ) : guests.map((guest) => (
              <div key={guest.id} className="p-5 space-y-4 hover:bg-slate-50 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex flex-col gap-1">
                    <span className="font-black text-slate-900">{guest.name || 'N/A'}</span>
                    <span className="text-xs text-slate-500 font-medium">{guest.phone || 'N/A'}</span>
                  </div>
                  <div className={cn(
                    "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                    guest.status === 'active' ? "bg-green-50 text-green-600" :
                    guest.status === 'used' ? "bg-blue-50 text-blue-600" :
                    "bg-slate-100 text-slate-500"
                  )}>
                    {guest.status}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                   <div className="flex flex-col">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Guest Code</span>
                      <span className="font-black text-slate-900 tracking-widest">{guest.guestId}</span>
                   </div>
                   <button 
                      onClick={() => copyToClipboard(guest.guestId, guest.id)}
                      className="p-3 bg-white hover:bg-slate-50 rounded-xl transition-all text-slate-400 shadow-sm border border-slate-100"
                    >
                      {copiedId === guest.id ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-slate-900" />}
                    </button>
                </div>

                <div className="flex items-center justify-between text-[10px]">
                   <div className="flex items-center gap-2">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span className="text-slate-500 font-medium">Issued {formatDateTime(guest.createdAt)}</span>
                   </div>
                   <button
                      onClick={() => {
                        setTokenToDelete(guest.id);
                        setShowDeleteModal(true);
                      }}
                      className="p-2 text-red-600 font-black uppercase tracking-widest flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3 h-3" /> Delete
                    </button>
                </div>
              </div>
            ))}
            {guests.length === 0 && !loadingGuests && (
              <div className="p-20 text-center">
                 <Ticket className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                 <p className="text-xs text-slate-400 font-bold uppercase tracking-widest leading-loose">No guests registered<br/>Check back later</p>
              </div>
            )}
          </div>
        </div>

        {/* Stats & Info */}
        <div className="lg:col-span-3 grid grid-cols-1 lg:grid-cols-2 gap-8 space-y-6 lg:space-y-0">
          <div className="bg-slate-900 p-6 sm:p-8 rounded-[2rem] text-white">
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-white/10 p-2 rounded-xl">
                <Users className="w-5 h-5 text-red-400" />
              </div>
              <h2 className="font-bold">Guest Stats</h2>
            </div>
            
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-sm">Active Tokens</span>
                <span className="text-2xl font-black">{guests.filter(t => t.status === 'active').length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-sm">Verified Today</span>
                <span className="text-2xl font-black">{guests.filter(t => t.status === 'used').length}</span>
              </div>
              <div className="h-px bg-white/10" />
              <p className="text-xs text-slate-400 leading-relaxed">
                Verified guests are linked to your account for security auditing and crisis coordination.
              </p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-4">Protocol</h3>
            <ul className="space-y-3">
              <ProtocolStep number="1" text="Verify guest's physical identity at the desk." />
              <ProtocolStep number="2" text="Generate a unique 6-digit ID." />
              <ProtocolStep number="3" text="Instruct guest to enter the ID on their device." />
              <ProtocolStep number="4" text="Confirm 'Used' status in your dashboard." />
            </ul>
          </div>
        </div>
      </div>

      {/* Profile Update Modal */}
      <Modal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        title="Update Profile"
      >
        <form onSubmit={handleUpdateProfile} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Phone Number</label>
            <div className="relative">
              <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
              <input 
                type="tel"
                required
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="+1234567890"
                className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl pl-12 pr-4 py-4 font-bold focus:border-red-600 focus:ring-0 transition-all"
              />
            </div>
            <p className="text-[10px] text-slate-400 font-medium px-1">Required for emergency SMS and voice alerts.</p>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setIsProfileModalOpen(false)}
              className="flex-1 px-6 py-4 rounded-2xl bg-slate-100 text-slate-600 font-bold hover:bg-slate-200 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={updatingProfile}
              className="flex-1 px-6 py-4 rounded-2xl bg-slate-900 text-white font-bold hover:bg-slate-800 transition-all disabled:opacity-50 shadow-lg"
            >
              {updatingProfile ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setTokenToDelete(null);
        }}
        title="Delete Guest ID"
      >
        <div className="space-y-6">
          <p className="text-slate-600 font-medium leading-relaxed">
            This action cannot be undone. Are you sure you want to delete this guest ID?
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => {
                setShowDeleteModal(false);
                setTokenToDelete(null);
              }}
              className="flex-1 px-6 py-4 rounded-2xl bg-slate-100 text-slate-600 font-bold hover:bg-slate-200 transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteConfirm}
              className="flex-1 px-6 py-4 rounded-2xl bg-red-600 text-white font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-100"
            >
              Delete
            </button>
          </div>
        </div>
      </Modal>

      {/* Global Confirmation Modal */}
      <Modal
        isOpen={showGlobalModal}
        onClose={() => {
          setShowGlobalModal(false);
          setGlobalModalIncidentId(null);
        }}
        title="Broadcast as Global?"
      >
        <div className="space-y-6">
          <div className="bg-red-50 p-6 rounded-3xl border border-red-100 flex items-center gap-4">
            <div className="w-12 h-12 bg-red-600 rounded-2xl flex items-center justify-center shrink-0">
               <Globe className="w-6 h-6 text-white animate-pulse" />
            </div>
            <div>
              <p className="text-red-900 font-bold text-sm uppercase tracking-tight">Organization-wide Alert</p>
              <p className="text-red-700 text-xs font-medium">This will make the incident visible to EVERY user in your organization.</p>
            </div>
          </div>

          <p className="text-slate-600 font-medium leading-relaxed px-1">
            Marking this as <span className="font-black text-red-600">GLOBAL</span> will prioritize it on all Staff, Security, and Admin dashboards instantly.
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => {
                setShowGlobalModal(false);
                setGlobalModalIncidentId(null);
              }}
              className="flex-1 px-6 py-4 rounded-2xl bg-slate-100 text-slate-600 font-bold hover:bg-slate-200 transition-all font-mono tracking-widest uppercase text-xs"
            >
              Cancel
            </button>
            <button
              onClick={() => globalModalIncidentId && handleToggleGlobal(globalModalIncidentId)}
              disabled={isTogglingGlobal}
              className="flex-1 px-6 py-4 rounded-2xl bg-slate-900 text-white font-black hover:bg-slate-800 transition-all shadow-lg flex items-center justify-center gap-2 uppercase tracking-widest text-xs"
            >
              {isTogglingGlobal ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
              Make Global
            </button>
          </div>
        </div>
      </Modal>

      {/* Security Type Selection Modal */}
      <Modal
        isOpen={showSecurityModal}
        onClose={() => {
          setShowSecurityModal(false);
          setSecurityModalIncidentId(null);
        }}
        title="Dispatch Security"
        className="max-w-lg"
      >
        <div className="space-y-8">
          <div className="grid grid-cols-2 gap-6">
            {SOS_TYPES.map((type) => (
              <button
                key={type.id}
                onClick={() => {
                  if (securityModalIncidentId) {
                    handleAdminAction(securityModalIncidentId, 'assign', 'security', type.id);
                  }
                  setShowSecurityModal(false);
                  setSecurityModalIncidentId(null);
                }}
                className="flex flex-col items-center justify-center gap-5 p-8 rounded-[2rem] bg-white border border-slate-100 hover:shadow-xl hover:border-slate-200 transition-all group"
              >
                <div className={cn(
                  "w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300",
                  type.bg
                )}>
                  <type.icon className="w-8 h-8 text-white" strokeWidth={2.5} />
                </div>
                <span className="text-xs font-black uppercase tracking-[0.1em] text-slate-900">{type.label}</span>
              </button>
            ))}
          </div>

          <div className="pt-4 text-center">
            <button
              onClick={() => {
                setShowSecurityModal(false);
                setSecurityModalIncidentId(null);
              }}
              className="text-slate-400 font-bold hover:text-slate-900 transition-all text-sm uppercase tracking-widest"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function ProtocolStep({ number, text }: { number: string, text: string }) {
  return (
    <li className="flex gap-3">
      <span className="flex-shrink-0 w-5 h-5 bg-slate-100 text-slate-600 rounded-full flex items-center justify-center text-[10px] font-black">{number}</span>
      <p className="text-xs text-slate-500 font-medium leading-relaxed">{text}</p>
    </li>
  );
}
