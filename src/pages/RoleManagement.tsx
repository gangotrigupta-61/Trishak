import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Search, 
  Filter, 
  Edit2, 
  Trash2, 
  CheckCircle2, 
  XCircle, 
  Shield, 
  UserCircle, 
  Key,
  RefreshCw,
  Copy,
  Check,
  AlertCircle,
  ExternalLink,
  Mail,
  User,
  Hash,
  Phone
} from 'lucide-react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp,
  orderBy,
  getDocs,
  limit
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { SOS_TYPES } from '../constants';
import { RoleCode, UserRole, UserProfile, SecurityType } from '../types';
import { cn } from '../lib/utils';

const ROLE_OPTIONS: UserRole[] = ['receptionist', 'security', 'staff'];

export default function RoleManagement() {
  const { profile } = useAuth();
  const [roleCodes, setRoleCodes] = useState<RoleCode[]>([]);
  const [usersMap, setUsersMap] = useState<Record<string, UserProfile>>({});
  const [loading, setLoading] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSecurityTypeModalOpen, setIsSecurityTypeModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingCode, setEditingCode] = useState<RoleCode | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    role: 'staff' as UserRole,
    securityType: 'fire' as SecurityType,
    customCode: '',
    name: '',
    phone: '',
    status: 'active' as 'active' | 'inactive'
  });

  // Real-time Role Codes Sync
  useEffect(() => {
    if (!profile?.organizationId) return;

    const q = query(
      collection(db, 'roleCodes'),
      where('organizationId', '==', profile.organizationId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setRoleCodes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RoleCode)));
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'roleCodes');
      setError('Failed to sync role codes.');
    });

    return () => unsubscribe();
  }, [profile?.organizationId]);

  // Real-time Users Sync (for Duty Status)
  useEffect(() => {
    if (!profile?.organizationId) return;

    const q = query(
      collection(db, 'users'),
      where('organizationId', '==', profile.organizationId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newMap: Record<string, UserProfile> = {};
      snapshot.docs.forEach(doc => {
        newMap[doc.id] = { uid: doc.id, ...doc.data() } as UserProfile;
      });
      setUsersMap(newMap);
      setLoadingUsers(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'users');
      setError('Unable to fetch live duty status.');
    });

    return () => unsubscribe();
  }, [profile?.organizationId]);

  const activeCounts = {
    staff: roleCodes.filter(c => c.role === 'staff' && c.assignedTo && usersMap[c.assignedTo]?.status === 'active').length,
    security: roleCodes.filter(c => c.role === 'security' && c.assignedTo && usersMap[c.assignedTo]?.status === 'active').length,
    receptionist: roleCodes.filter(c => c.role === 'receptionist' && c.assignedTo && usersMap[c.assignedTo]?.status === 'active').length,
  };

  const generateRandomCode = (role: UserRole, securityType?: SecurityType) => {
    if (role === 'security' && securityType) {
      const typeCodes: Record<SecurityType, string> = {
        fire: 'FI',
        medical: 'MD',
        theft: 'TH',
        other: 'OT'
      };
      const random = Math.floor(10 + Math.random() * 90);
      return `SE${random}${typeCodes[securityType]}`;
    }
    const prefix = role.substring(0, 2).toUpperCase();
    const random = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}${random}`;
  };

  const showSuccess = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3000);
  };

  const formatPhoneNumber = (phone: string) => {
    // Remove all non-digit characters except '+'
    let cleaned = phone.trim().replace(/[^\d+]/g, '');
    
    if (cleaned.startsWith('+')) return cleaned;
    
    // 10 digits: 9140130868 -> +919140130868
    if (cleaned.length === 10) return `+91${cleaned}`;
    
    // 12 digits starting with 91: 919140130868 -> +919140130868
    if (cleaned.length === 12 && cleaned.startsWith('91')) return `+${cleaned}`;
    
    return cleaned;
  };

  const isValidPhone = (phone: string) => {
    const formatted = formatPhoneNumber(phone);
    const digitCount = formatted.replace('+', '').length;
    return formatted.startsWith('+') && digitCount >= 12 && digitCount <= 15;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.organizationId) return;

    if (!isValidPhone(formData.phone)) {
      setError('Enter a valid phone number with country code');
      return;
    }

    setError(null);
    try {
      const codeToSave = formData.customCode || generateRandomCode(formData.role, formData.role === 'security' ? formData.securityType : undefined);
      const formattedPhone = formatPhoneNumber(formData.phone);
      
      const roleCodeData: any = {
        role: formData.role,
        code: codeToSave,
        name: formData.name,
        phone: formattedPhone,
        updatedAt: serverTimestamp()
      };

      if (formData.role === 'security') {
        roleCodeData.securityType = formData.securityType;
      }

      if (editingCode) {
        await updateDoc(doc(db, 'roleCodes', editingCode.id), roleCodeData);
        showSuccess('Role code updated successfully');
      } else {
        await addDoc(collection(db, 'roleCodes'), {
          ...roleCodeData,
          organizationId: profile.organizationId,
          status: 'active',
          createdAt: serverTimestamp()
        });

        // Send Onboarding SMS (Non-blocking)
        fetch('/api/send-onboarding-sms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: formattedPhone,
            role: formData.role.toUpperCase(),
            uniqueId: codeToSave,
            organizationId: profile.organizationId
          })
        })
        .then(async (res) => {
          if (!res.ok) {
            const data = await res.json();
            if (data.code === 'TWILIO_UNVERIFIED_NUMBER') {
              setError('Role generated, but SMS failed: The phone number is not verified in your Twilio Trial account.');
            } else {
              console.error('SMS API Error:', data.error);
            }
          }
        })
        .catch(err => console.error('Failed to send onboarding SMS:', err));

        showSuccess('New role code generated');
      }
      
      setIsModalOpen(false);
      setIsSecurityTypeModalOpen(false);
      setEditingCode(null);
      setFormData({ role: 'staff', securityType: 'fire', customCode: '', name: '', phone: '', status: 'active' });
    } catch (err: any) {
      handleFirestoreError(err, editingCode ? OperationType.UPDATE : OperationType.CREATE, `roleCodes/${editingCode?.id || 'new'}`);
      setError('Failed to save role code. Please try again.');
    }
  };

  const handleDelete = (id: string) => {
    setDeletingId(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingId) return;
    setError(null);
    try {
      await deleteDoc(doc(db, 'roleCodes', deletingId));
      showSuccess('ID deleted successfully');
      setIsDeleteModalOpen(false);
      setDeletingId(null);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.DELETE, `roleCodes/${deletingId}`);
      setError('Failed to delete. Try again.');
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    showSuccess('Code copied to clipboard');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredCodes = roleCodes.filter(code => {
    const user = code.assignedTo ? usersMap[code.assignedTo] : null;
    const dutyStatus = user?.status || 'inactive';

    const matchesSearch = code.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         code.role.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (code.email && code.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
                         (user?.displayName && user.displayName.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesRole = roleFilter === 'all' || code.role === roleFilter;
    const matchesStatus = statusFilter === 'all' || dutyStatus === statusFilter;
    
    return matchesSearch && matchesRole && matchesStatus;
  });

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'receptionist': return <UserCircle className="w-4 h-4" />;
      case 'security': return <Shield className="w-4 h-4" />;
      default: return <Key className="w-4 h-4" />;
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Role Code Management</h1>
          <p className="text-slate-500 font-medium">Control panel for staff registration and duty status</p>
        </div>
        <button
          onClick={() => {
            setEditingCode(null);
            setFormData({ role: 'staff', securityType: 'fire', customCode: '', name: '', phone: '+91', status: 'active' });
            setIsModalOpen(true);
          }}
          className="flex items-center justify-center gap-3 bg-slate-900 text-white px-6 py-3 rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 active:scale-95 w-full md:w-auto"
        >
          <Plus className="w-5 h-5" />
          <span>Generate New ID</span>
        </button>
      </div>

      {/* Active User Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'Staff On Duty', count: activeCounts.staff, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'Security On Duty', count: activeCounts.security, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Receptionist On Duty', count: activeCounts.receptionist, color: 'text-purple-600', bg: 'bg-purple-50' },
        ].map((stat, i) => (
          <div key={i} className={cn("p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center justify-between bg-white")}>
            <div>
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">{stat.label}</p>
              <motion.p 
                key={stat.count}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className={cn("text-3xl font-black", stat.color)}
              >
                {stat.count}
              </motion.p>
            </div>
            <div className={cn("p-4 rounded-2xl", stat.bg)}>
              <div className={cn("w-3 h-3 rounded-full animate-pulse", stat.count > 0 ? "bg-green-500" : "bg-slate-300")} />
            </div>
          </div>
        ))}
      </div>

      {/* Notifications */}
      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-2xl flex items-center gap-3 font-medium"
          >
            <AlertCircle className="w-5 h-5" />
            {error}
          </motion.div>
        )}
        {success && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-green-50 border border-green-100 text-green-600 px-4 py-3 rounded-2xl flex items-center gap-3 font-medium"
          >
            <CheckCircle2 className="w-5 h-5" />
            {success}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filters & Search */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-6 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search by code, role, or name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-4 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-slate-100 focus:border-slate-400 outline-none transition-all font-medium"
          />
        </div>
        <div className="lg:col-span-3 relative">
          <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="w-full pl-10 pr-4 py-4 bg-white border border-slate-200 rounded-2xl appearance-none focus:ring-4 focus:ring-slate-100 outline-none font-medium cursor-pointer"
          >
            <option value="all">All Roles</option>
            {ROLE_OPTIONS.map(role => (
              <option key={role} value={role}>{role.charAt(0).toUpperCase() + role.slice(1)}</option>
            ))}
          </select>
        </div>
        <div className="lg:col-span-3 relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-4 py-4 bg-white border border-slate-200 rounded-2xl appearance-none focus:ring-4 focus:ring-slate-100 outline-none font-medium cursor-pointer"
          >
            <option value="all">All Status</option>
            <option value="active">On Duty</option>
            <option value="inactive">Off Duty</option>
          </select>
        </div>
      </div>

      {/* Data Grid: Table on Desktop, Cards on Mobile */}
      <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-8 py-5 text-xs font-black text-slate-400 uppercase tracking-widest">Role Code</th>
                <th className="px-8 py-5 text-xs font-black text-slate-400 uppercase tracking-widest">Role</th>
                <th className="px-8 py-5 text-xs font-black text-slate-400 uppercase tracking-widest">Duty Status</th>
                <th className="px-8 py-5 text-xs font-black text-slate-400 uppercase tracking-widest">Assignment</th>
                <th className="px-8 py-5 text-xs font-black text-slate-400 uppercase tracking-widest">Created</th>
                <th className="px-8 py-5 text-xs font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading || loadingUsers ? (
                <tr>
                  <td colSpan={6} className="px-8 py-20 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <RefreshCw className="w-10 h-10 animate-spin text-slate-300" />
                      <span className="text-slate-400 font-bold uppercase tracking-widest text-xs">Synchronizing...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredCodes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-8 py-20 text-center">
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <Search className="w-12 h-12 opacity-20 mb-2" />
                      <p className="font-bold">No records found</p>
                      <p className="text-sm">Try adjusting your filters or search term</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredCodes.map((code) => {
                  const user = code.assignedTo ? usersMap[code.assignedTo] : null;
                  const isAssigned = !!code.assignedTo;
                  const userFound = !!user;
                  const dutyStatus = user?.status || 'inactive';

                  return (
                    <tr key={code.id} className="group hover:bg-slate-50/50 transition-colors">
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-3">
                          <div className="bg-slate-100 px-3 py-1.5 rounded-xl font-mono font-black text-slate-900 border border-slate-200">
                            {code.code}
                          </div>
                          <button
                            onClick={() => copyToClipboard(code.code, code.id)}
                            className="p-2 text-slate-400 hover:text-slate-900 hover:bg-white hover:shadow-sm rounded-xl transition-all"
                            title="Copy Code"
                          >
                            {copiedId === code.id ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                          </button>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-3 text-slate-700 font-bold">
                          <div className="p-2 bg-slate-100 rounded-xl text-slate-500">
                            {getRoleIcon(code.role)}
                          </div>
                          <span className="capitalize">
                            {code.role === 'security' && code.securityType 
                              ? `${code.securityType.charAt(0).toUpperCase() + code.securityType.slice(1)} Security`
                              : code.role}
                          </span>
                        </div>
                        {code.role === 'security' && code.securityType && (
                          <div className={cn(
                            "mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10px] font-bold border",
                            code.securityType === 'fire' ? "bg-red-50 border-red-100 text-red-600" :
                            code.securityType === 'medical' ? "bg-blue-50 border-blue-100 text-blue-600" :
                            code.securityType === 'theft' ? "bg-orange-50 border-orange-100 text-orange-600" :
                            "bg-slate-50 border-slate-100 text-slate-500"
                          )}>
                            <span>{SOS_TYPES.find(t => t.id === code.securityType)?.emoji}</span>
                            <span className="uppercase">{code.securityType}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-8 py-6">
                        {!isAssigned ? (
                          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-slate-50 border border-slate-100 text-slate-300">
                            Not Assigned
                          </div>
                        ) : !userFound ? (
                          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-red-50 border border-red-100 text-red-400">
                            User Not Found
                          </div>
                        ) : (
                          <div className={cn(
                            "inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-widest border transition-all",
                            dutyStatus === 'active' 
                              ? "bg-green-50 border-green-100 text-green-600" 
                              : "bg-slate-50 border-slate-100 text-slate-400"
                          )}>
                            <div className={cn(
                              "w-2 h-2 rounded-full",
                              dutyStatus === 'active' ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" : "bg-slate-300"
                            )} />
                            {dutyStatus === 'active' ? 'On Duty' : 'Off Duty'}
                          </div>
                        )}
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                            <User className="w-3 h-3 text-slate-400" />
                            {code.name || user?.displayName || code.email?.split('@')[0] || 'Assigned User'}
                          </div>
                          <div className="flex items-center gap-2 text-slate-400 text-[10px] font-medium">
                            <Phone className="w-3 h-3" />
                            {code.phone || user?.phone || 'No Phone'}
                          </div>
                          {user?.email && (
                            <div className="flex items-center gap-2 text-slate-400 text-[10px] font-medium">
                              <Mail className="w-3 h-3" />
                              {user.email}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-slate-900">
                            {code.createdAt?.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                          <span className="text-[10px] text-slate-400 font-medium">
                            {code.createdAt?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </td>
                      <td className="px-8 py-6 text-right">
                        <div className="flex justify-end gap-2 transition-opacity">
                          <button
                            onClick={() => {
                              setEditingCode(code);
                              setFormData({
                                role: code.role,
                                securityType: code.securityType || 'fire',
                                customCode: code.code,
                                name: code.name || '',
                                phone: code.phone || '',
                                status: code.status as 'active' | 'inactive'
                              });
                              setIsModalOpen(true);
                            }}
                            className="p-3 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-2xl transition-all"
                            title="Edit Role"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(code.id)}
                            className="p-3 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-2xl transition-all"
                            title="Delete Record"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile View: Cards */}
        <div className="md:hidden divide-y divide-slate-100">
          {loading || loadingUsers ? (
            <div className="p-12 text-center flex flex-col items-center gap-3">
              <RefreshCw className="w-8 h-8 animate-spin text-slate-300" />
              <span className="text-slate-400 font-black text-[10px] uppercase tracking-widest">Synchronizing...</span>
            </div>
          ) : filteredCodes.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <p className="font-bold">No records found</p>
            </div>
          ) : (
            filteredCodes.map((code) => {
              const user = code.assignedTo ? usersMap[code.assignedTo] : null;
              const dutyStatus = user?.status || 'inactive';
              return (
                <div key={code.id} className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="bg-slate-100 px-3 py-1.5 rounded-xl font-mono font-black text-slate-900 border border-slate-200 text-sm">
                        {code.code}
                      </div>
                      <button onClick={() => copyToClipboard(code.code, code.id)} className="p-2 text-slate-400">
                        {copiedId === code.id ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                    <div className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all",
                      dutyStatus === 'active' ? "bg-green-50 border-green-100 text-green-600" : "bg-slate-50 border-slate-100 text-slate-400"
                    )}>
                      <div className={cn("w-1.5 h-1.5 rounded-full", dutyStatus === 'active' ? "bg-green-500" : "bg-slate-300")} />
                      {dutyStatus === 'active' ? 'On Duty' : 'Off Duty'}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-slate-100 rounded-2xl text-slate-500">
                      {getRoleIcon(code.role)}
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-slate-900 capitalize">
                        {code.role === 'security' && code.securityType 
                          ? `${code.securityType.charAt(0).toUpperCase() + code.securityType.slice(1)} Security`
                          : code.role}
                      </h4>
                      <p className="text-xs text-slate-500 font-medium">{code.name || user?.displayName || 'User Not Assigned'}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-50">
                    <button
                      onClick={() => {
                        setEditingCode(code);
                        setFormData({
                          role: code.role,
                          securityType: code.securityType || 'fire',
                          customCode: code.code,
                          name: code.name || '',
                          phone: code.phone || '',
                          status: code.status as 'active' | 'inactive'
                        });
                        setIsModalOpen(true);
                      }}
                      className="flex items-center justify-center gap-2 py-3 bg-blue-50 text-blue-600 rounded-xl text-xs font-bold"
                    >
                      <Edit2 className="w-4 h-4" />
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(code.id)}
                      className="flex items-center justify-center gap-2 py-3 bg-red-50 text-red-600 rounded-xl text-xs font-bold"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="p-6 md:p-8 bg-slate-50 border-b border-slate-100 shrink-0">
                <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">
                  {editingCode ? 'Edit Role ID' : 'Generate New ID'}
                </h2>
                <p className="text-slate-500 text-sm font-medium mt-1">
                  {editingCode ? 'Update existing role configuration' : 'Create a new unique identifier for staff'}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-4 md:space-y-6 overflow-y-auto custom-scrollbar">
                <div className="space-y-3">
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest">
                    Select Role
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {ROLE_OPTIONS.map((role) => (
                      <button
                        key={role}
                        type="button"
                        onClick={() => setFormData({ ...formData, role })}
                        className={cn(
                          "flex items-center gap-3 px-4 py-3 rounded-2xl border-2 transition-all font-bold text-sm",
                          formData.role === role
                            ? "bg-slate-900 border-slate-900 text-white shadow-lg shadow-slate-200"
                            : "bg-white border-slate-100 text-slate-600 hover:border-slate-200"
                        )}
                      >
                        {getRoleIcon(role)}
                        <span className="capitalize">{role}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest">
                    Full Name (Required)
                  </label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <input
                      type="text"
                      required
                      placeholder="e.g. Anamika Verma"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-slate-100 focus:border-slate-400 outline-none transition-all font-bold"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest">
                    Phone Number (Required)
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <input
                      type="tel"
                      required
                      placeholder="e.g. +91XXXXXXXXXX"
                      value={formData.phone}
                      onChange={(e) => {
                        let val = e.target.value;
                        if (!val.startsWith('+')) {
                          val = '+' + val.replace(/[^\d]/g, '');
                        }
                        setFormData({ ...formData, phone: val });
                      }}
                      className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-slate-100 focus:border-slate-400 outline-none transition-all font-bold"
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 font-medium">
                    Phone will be stored in international format (e.g. +91)
                  </p>
                </div>

                <div className="space-y-3">
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest">
                    Custom Code (Optional)
                  </label>
                  <div className="relative">
                    <Hash className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <input
                      type="text"
                      placeholder="e.g. RE123"
                      value={formData.customCode}
                      onChange={(e) => setFormData({ ...formData, customCode: e.target.value.toUpperCase() })}
                      className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-slate-100 focus:border-slate-400 outline-none transition-all font-mono font-bold"
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 font-medium">
                    Leave blank for auto-generated code (Prefix + 4 digits)
                  </p>
                </div>

                <div className="flex gap-4 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 px-6 py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all active:scale-95"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!formData.name.trim() || !formData.phone.trim() || formData.phone === '+91'}
                    className="flex-1 px-6 py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={(e) => {
                      if (!editingCode && formData.role === 'security' && !isSecurityTypeModalOpen) {
                        e.preventDefault();
                        setIsSecurityTypeModalOpen(true);
                        return;
                      }
                    }}
                  >
                    {editingCode ? <CheckCircle2 className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                    <span>{editingCode ? 'Save Changes' : 'Generate ID'}</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {isSecurityTypeModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSecurityTypeModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white rounded-[2.5rem] shadow-2xl w-full max-w-sm overflow-hidden p-8"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-blue-50 rounded-2xl text-blue-600">
                  <Shield className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-900 tracking-tight">Select Security Type</h2>
                  <p className="text-slate-500 text-xs font-medium">Assign emergency specialization</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-8">
                {SOS_TYPES.map((type) => (
                  <button
                    key={type.id}
                    onClick={() => {
                      setFormData({ ...formData, securityType: type.id as SecurityType });
                    }}
                    className={cn(
                      "flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all group",
                      formData.securityType === type.id
                        ? "bg-slate-900 border-slate-900 shadow-lg shadow-slate-100"
                        : "bg-white border-slate-50 hover:border-slate-100"
                    )}
                  >
                    <span className="text-2xl group-hover:scale-110 transition-transform">{type.emoji}</span>
                    <span className={cn(
                      "text-xs font-black uppercase tracking-widest",
                      formData.securityType === type.id ? "text-white" : "text-slate-500"
                    )}>
                      {type.label}
                    </span>
                  </button>
                ))}
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => setIsSecurityTypeModalOpen(false)}
                  className="flex-1 px-6 py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all active:scale-95"
                >
                  Back
                </button>
                <button
                  onClick={handleSubmit}
                  className="flex-1 px-6 py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 active:scale-95"
                >
                  Confirm ID
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {isDeleteModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDeleteModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white rounded-[2.5rem] shadow-2xl w-full max-w-sm overflow-hidden p-8 text-center"
            >
              <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertCircle className="w-10 h-10 text-red-500" />
              </div>
              
              <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-2">
                Are you sure?
              </h2>
              <p className="text-slate-500 font-medium mb-8">
                Are you sure you want to delete this ID? This action cannot be undone.
              </p>

              <div className="flex gap-4">
                <button
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="flex-1 px-6 py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all active:scale-95"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  className="flex-1 px-6 py-4 bg-red-600 text-white rounded-2xl font-bold hover:bg-red-700 transition-all shadow-xl shadow-red-200 active:scale-95"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
