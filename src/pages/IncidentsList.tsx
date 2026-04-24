import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  where,
  deleteDoc,
  doc,
  getDocs
} from 'firebase/firestore';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  Search, 
  Filter, 
  ShieldAlert, 
  Clock, 
  MapPin, 
  ArrowRight,
  ChevronRight,
  AlertCircle,
  Download,
  FileText,
  Table as TableIcon,
  Tag,
  Globe,
  Trash2
} from 'lucide-react';
import { motion } from 'motion/react';
import { cn, formatTimestamp, getSeverityColor, getStatusColor } from '../lib/utils';
import { Incident, IncidentStatus, IncidentType } from '../types';
import { SOS_TYPES, mapOldIncidentType } from '../constants';

export default function IncidentsList() {
  const { profile } = useAuth();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<IncidentStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<IncidentType | 'all'>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.organizationId) return;

    let constraints = [
      where('organizationId', '==', profile.organizationId),
      orderBy('createdAt', 'desc')
    ];

    if (statusFilter !== 'all') {
      const statusValues = statusFilter === 'responding' 
        ? ['responding', 'acknowledged', 'assigned', 'escalated'] 
        : statusFilter === 'resolved' 
          ? ['resolved', 'closed'] 
          : [statusFilter];
      constraints.push(where('status', 'in', statusValues));
    }

    if (typeFilter !== 'all') {
      constraints.push(where('type', '==', typeFilter));
    }

    const q = query(collection(db, 'incidents'), ...constraints);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setIncidents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Incident)));
      setLoading(false);
    }, (err) => {
      console.error("Error fetching incidents:", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [statusFilter, typeFilter, profile?.organizationId]);

  const filteredIncidents = incidents.filter(incident => 
    incident.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
    incident.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    incident.location.address.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const exportToCSV = () => {
    const headers = ['ID', 'Type', 'Severity', 'Status', 'Description', 'Location', 'Floor', 'Created At'];
    const rows = filteredIncidents.map(inc => [
      inc.id,
      inc.type,
      inc.severity,
      inc.status,
      `"${inc.description.replace(/"/g, '""')}"`,
      `"${inc.location.address.replace(/"/g, '""')}"`,
      inc.location.floor,
      formatTimestamp(inc.createdAt)
    ]);

    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `incidents_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.text("TRISHAK Incident Logs", 14, 15);
    doc.setFontSize(10);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 22);
    
    const tableData = filteredIncidents.map(inc => [
      inc.type,
      inc.severity,
      inc.status,
      inc.description,
      inc.location.address,
      formatTimestamp(inc.createdAt)
    ]);

    autoTable(doc, {
      head: [['Type', 'Severity', 'Status', 'Description', 'Location', 'Date']],
      body: tableData,
      startY: 30,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [220, 38, 38] } // Red-600
    });

    doc.save(`incidents_export_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const handleDeleteIncident = async (e: React.MouseEvent, incidentId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this incident log? This will remove all associated messages and data from TRISHAK.')) return;
    
    try {
      // 1. Delete all messages first
      const messagesRef = collection(db, `incidents/${incidentId}/messages`);
      const messagesSnap = await getDocs(messagesRef);
      for (const mDoc of messagesSnap.docs) {
        await deleteDoc(mDoc.ref);
      }
      
      // 2. Delete the incident main document
      await deleteDoc(doc(db, 'incidents', incidentId));
    } catch (error) {
      console.error('Error deleting incident:', error);
      alert('Failed to delete incident.');
    }
  };

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-black text-slate-900 mb-2">Incident Logs</h1>
          <p className="text-sm lg:text-base text-slate-500 font-medium tracking-tight">Full audit trail of all emergency reports and responses.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3">
          {profile?.role === 'admin' && (
            <div className="grid grid-cols-2 sm:flex items-center gap-2 lg:mr-4">
              <button 
                onClick={exportToCSV}
                className="flex items-center justify-center gap-2 bg-white border-2 border-slate-100 px-4 py-3 rounded-2xl text-[10px] lg:text-xs font-black uppercase tracking-widest text-slate-600 hover:border-blue-600 hover:text-blue-600 transition-all shadow-sm"
                title="Export to CSV"
              >
                <TableIcon className="w-4 h-4" />
                <span>CSV</span>
              </button>
              <button 
                onClick={exportToPDF}
                className="flex items-center justify-center gap-2 bg-white border-2 border-slate-100 px-4 py-3 rounded-2xl text-[10px] lg:text-xs font-black uppercase tracking-widest text-slate-600 hover:border-red-600 hover:text-red-600 transition-all shadow-sm"
                title="Export to PDF"
              >
                <FileText className="w-4 h-4" />
                <span>PDF</span>
              </button>
            </div>
          )}
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 lg:w-5 lg:h-5" />
            <input 
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search incidents..."
              className="w-full bg-white border-2 border-slate-100 rounded-xl lg:rounded-2xl pl-10 lg:pl-12 pr-4 py-2.5 lg:py-3 focus:border-red-600 focus:ring-0 transition-all text-xs lg:text-sm shadow-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-3">
            <div className="relative">
              <Tag className="absolute left-3 lg:left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <select 
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as any)}
                className="w-full bg-white border-2 border-slate-100 rounded-xl lg:rounded-2xl pl-9 lg:pl-12 pr-6 lg:pr-10 py-2.5 lg:py-3 focus:border-red-600 focus:ring-0 transition-all text-[10px] lg:text-sm font-bold text-slate-700 appearance-none shadow-sm"
              >
                <option value="all">Types</option>
                {SOS_TYPES.map(t => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="relative">
              <Filter className="absolute left-3 lg:left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <select 
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="w-full bg-white border-2 border-slate-100 rounded-xl lg:rounded-2xl pl-9 lg:pl-12 pr-6 lg:pr-10 py-2.5 lg:py-3 focus:border-red-600 focus:ring-0 transition-all text-[10px] lg:text-sm font-bold text-slate-700 appearance-none shadow-sm"
              >
                <option value="all">Status</option>
                <option value="reported">Reported</option>
                <option value="responding">Responding</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-10 h-10 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-slate-500 font-medium">Loading incident logs...</p>
          </div>
        ) : filteredIncidents.length > 0 ? (
          filteredIncidents.map((incident) => (
            <Link key={incident.id} to={`/incident/${incident.id}`}>
              <motion.div 
                whileHover={{ x: 4 }}
                className={cn(
                  "bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row md:items-center gap-6",
                  incident.isGlobal && "animate-pulse-red border-red-200 ring-2 ring-red-100 ring-inset"
                )}
              >
                <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center shrink-0", getSeverityColor(incident.severity))}>
                  <ShieldAlert className="w-8 h-8" />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-3 mb-2">
                    {incident.isGlobal && (
                      <div className="flex items-center gap-1.5 px-3 py-1 bg-red-600 text-white rounded-full shadow-lg shadow-red-200 scale-110 origin-left">
                        <Globe className="w-3 h-3 animate-pulse" />
                        <span className="text-[10px] font-black uppercase tracking-widest">🌐 GLOBAL</span>
                      </div>
                    )}
                    <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 bg-slate-100 text-slate-600 rounded-full">
                      {SOS_TYPES.find(t => t.id === mapOldIncidentType(incident.type))?.label || incident.type}
                    </span>
                    <span className={cn("text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full", getStatusColor(incident.status).replace('text-', 'bg-').replace('-600', '-50').replace('-500', '-50'))}>
                      {incident.status}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                      <Clock className="w-3 h-3" /> 
                      {formatTimestamp(incident.createdAt)}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mb-1">{incident.description}</h3>
                </div>

                <div className="flex items-center gap-4 border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-6">
                  <div className="text-center">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Responders</p>
                    <div className="flex -space-x-2 justify-center">
                      {incident.responders.slice(0, 3).map((rid) => (
                        <div key={rid} className="w-8 h-8 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center text-[10px] font-bold text-slate-600">
                          {rid.slice(0, 2).toUpperCase()}
                        </div>
                      ))}
                      {incident.responders.length > 3 && (
                        <div className="w-8 h-8 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-[10px] font-bold text-slate-400">
                          +{incident.responders.length - 3}
                        </div>
                      )}
                      {incident.responders.length === 0 && <span className="text-xs text-slate-400">None</span>}
                    </div>
                  </div>
                  {(profile?.role === 'admin' || profile?.role === 'receptionist') && (
                    <button 
                      onClick={(e) => handleDeleteIncident(e, incident.id)}
                      className="p-3 bg-red-50 text-red-600 rounded-2xl hover:bg-red-600 hover:text-white transition-all shadow-sm border border-red-100"
                      title="Delete Incident"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  )}
                  <div className="bg-slate-50 p-3 rounded-2xl">
                    <ChevronRight className="w-6 h-6 text-slate-400" />
                  </div>
                </div>
              </motion.div>
            </Link>
          ))
        ) : (
          <div className="bg-white p-20 rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-center">
            <div className="bg-slate-50 p-6 rounded-full mb-6">
              <AlertCircle className="text-slate-300 w-12 h-12" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">No Incidents Found</h3>
            <p className="text-slate-500 max-w-xs">Try adjusting your search or filter to find what you're looking for.</p>
          </div>
        )}
      </div>
    </div>
  );
}
