import { ReactNode, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { auth, db } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { 
  Home, 
  Map as MapIcon, 
  Shield, 
  BarChart3, 
  LogOut, 
  Menu, 
  X,
  AlertTriangle,
  User,
  Key,
  Power,
  Clock
} from 'lucide-react';
import { cn, getRoleDisplayName } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

import Modal from './Modal';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { profile, user, guestData, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [showSignOutModal, setShowSignOutModal] = useState(false);

  const handleSignOut = async () => {
    setShowSignOutModal(false);
    await logout();
    navigate('/login');
  };

  const toggleDutyStatus = async () => {
    if (!profile || isUpdatingStatus) return;
    
    setIsUpdatingStatus(true);
    try {
      const newStatus = profile.status === 'active' ? 'inactive' : 'active';
      if (profile.uniqueId) {
        // ID-based user
        await updateDoc(doc(db, 'roleCodes', profile.uid), {
          status: newStatus,
          updatedAt: serverTimestamp()
        });
      } else if (user) {
        // Firebase Auth user
        await updateDoc(doc(db, 'users', user.uid), {
          status: newStatus,
          lastDutyChange: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
    } catch (error) {
      console.error('Error updating duty status:', error);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const showDutyToggle = profile && ['staff', 'security', 'receptionist'].includes(profile.role);

  const navItems = [
    { label: 'Dashboard', icon: Home, path: '/', roles: ['guest', 'admin'] },
    { label: 'Staff Dashboard', icon: Home, path: '/staff/dashboard', roles: ['staff'] },
    { label: `${getRoleDisplayName(profile)} Dashboard`, icon: Home, path: '/security/dashboard', roles: ['security'] },
    { label: 'SOS', icon: AlertTriangle, path: '/sos', roles: ['guest', 'receptionist', 'staff', 'security', 'admin'] },
    { label: 'Reception', icon: User, path: '/reception/dashboard', roles: ['receptionist'] },
    { label: 'Roles', icon: Key, path: '/admin/roles', roles: ['admin'] },
    { label: 'Map', icon: MapIcon, path: '/map', roles: ['receptionist', 'staff', 'security', 'admin'] },
    { label: 'Incidents', icon: Shield, path: '/incidents', roles: ['receptionist', 'staff', 'security', 'admin'] },
    { label: 'Analytics', icon: BarChart3, path: '/analytics', roles: ['admin'] },
  ];

  const filteredNavItems = navItems.filter(item => 
    profile && item.roles.includes(profile.role)
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 px-4 py-3 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="bg-red-600 p-1.5 rounded-lg">
            <Shield className="text-white w-5 h-5" />
          </div>
          <span className="font-bold text-xl tracking-tight text-slate-900">TRISHAK</span>
        </Link>

        <div className="flex items-center gap-3">
          {showDutyToggle && (
            <button
              onClick={toggleDutyStatus}
              disabled={isUpdatingStatus}
              className={cn(
                "hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg",
                profile.status === 'active' 
                  ? "bg-green-600 text-white shadow-green-100 hover:bg-green-700" 
                  : "bg-slate-200 text-slate-600 shadow-slate-100 hover:bg-slate-300"
              )}
            >
              <Power className={cn("w-3.5 h-3.5", isUpdatingStatus && "animate-pulse")} />
              {profile.status === 'active' ? 'On Duty' : 'Off Duty'}
            </button>
          )}

          <button 
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="md:hidden p-2 text-slate-500 hover:bg-slate-100 rounded-full"
          >
            {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>

          <div className="hidden md:flex items-center gap-3 pl-3 border-l border-slate-200">
            <div className="text-right">
              <p className="text-sm font-medium text-slate-900">
                {profile?.role === 'guest' 
                  ? (guestData?.name || profile?.displayName || 'Guest') 
                  : (profile?.displayName || 'User')}
              </p>
              <p className="text-xs text-slate-500">{getRoleDisplayName(profile)}</p>
            </div>
            <img 
              src={profile?.photoURL || `https://ui-avatars.com/api/?name=${profile?.role === 'guest' ? (guestData?.name || profile?.displayName || 'Guest') : (profile?.displayName || 'User')}`} 
              alt="Profile" 
              className="w-8 h-8 rounded-full border border-slate-200"
            />
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Desktop */}
        <aside className="hidden md:flex flex-col w-64 bg-white border-r border-slate-200 p-4 gap-2">
          {filteredNavItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
                location.pathname === item.path 
                  ? "bg-red-50 text-red-600 font-semibold" 
                  : "text-slate-600 hover:bg-slate-50"
              )}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </Link>
          ))}
          
          <div className="mt-auto pt-4 border-t border-slate-100">
            <button 
              onClick={() => setShowSignOutModal(true)}
              className="flex items-center gap-3 px-4 py-3 w-full text-slate-600 hover:bg-red-50 hover:text-red-600 rounded-xl transition-all"
            >
              <LogOut className="w-5 h-5" />
              Sign Out
            </button>
          </div>
        </aside>

        {/* Mobile Menu Overlay */}
        <AnimatePresence>
          {isMenuOpen && (
            <motion.div
              initial={{ opacity: 0, x: -100 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -100 }}
              className="fixed inset-0 z-40 md:hidden bg-white p-6 flex flex-col gap-4"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <img 
                    src={profile?.photoURL || `https://ui-avatars.com/api/?name=${profile?.displayName}`} 
                    alt="Profile" 
                    className="w-12 h-12 rounded-full border-2 border-red-100"
                  />
                  <div>
                    <p className="font-bold text-slate-900">
                      {profile?.role === 'guest' 
                        ? (guestData?.name || profile?.displayName || 'Guest') 
                        : (profile?.displayName || 'User')}
                    </p>
                    <p className="text-sm text-slate-500">{getRoleDisplayName(profile)}</p>
                  </div>
                </div>
                <button onClick={() => setIsMenuOpen(false)} className="p-2 bg-slate-100 rounded-full">
                  <X className="w-6 h-6" />
                </button>
              </div>

              {showDutyToggle && (
                <button
                  onClick={toggleDutyStatus}
                  disabled={isUpdatingStatus}
                  className={cn(
                    "flex items-center justify-between px-6 py-5 rounded-3xl transition-all mb-2 shadow-xl",
                    profile.status === 'active' 
                      ? "bg-green-600 text-white shadow-green-100" 
                      : "bg-slate-100 text-slate-600 shadow-slate-50"
                  )}
                >
                  <div className="flex items-center gap-4">
                    <Power className={cn("w-6 h-6", isUpdatingStatus && "animate-pulse")} />
                    <div className="text-left">
                      <p className="font-black uppercase tracking-widest text-sm">Duty Status</p>
                      <p className="text-xs opacity-80 font-bold">{profile.status === 'active' ? 'You are currently ON DUTY' : 'You are currently OFF DUTY'}</p>
                    </div>
                  </div>
                  <div className={cn(
                    "w-12 h-6 rounded-full relative transition-all",
                    profile.status === 'active' ? "bg-white/30" : "bg-slate-300"
                  )}>
                    <div className={cn(
                      "absolute top-1 w-4 h-4 rounded-full bg-white transition-all",
                      profile.status === 'active' ? "right-1" : "left-1"
                    )} />
                  </div>
                </button>
              )}

              {filteredNavItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setIsMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-4 px-5 py-4 rounded-2xl text-lg transition-all",
                    location.pathname === item.path 
                      ? "bg-red-600 text-white shadow-lg shadow-red-200" 
                      : "text-slate-600 hover:bg-slate-50"
                  )}
                >
                  <item.icon className="w-6 h-6" />
                  {item.label}
                </Link>
              ))}

              <button 
                onClick={() => setShowSignOutModal(true)}
                className="mt-auto flex items-center gap-4 px-5 py-4 w-full text-red-600 font-semibold border-2 border-red-50 rounded-2xl"
              >
                <LogOut className="w-6 h-6" />
                Sign Out
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>


      {/* Sign Out Confirmation Modal */}
      <Modal
        isOpen={showSignOutModal}
        onClose={() => setShowSignOutModal(false)}
        title="Confirm Sign Out"
      >
        <div className="space-y-6">
          <p className="text-slate-600 font-medium">
            Are you sure you want to sign out?
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => setShowSignOutModal(false)}
              className="flex-1 px-6 py-4 rounded-2xl bg-slate-100 text-slate-600 font-bold hover:bg-slate-200 transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleSignOut}
              className="flex-1 px-6 py-4 rounded-2xl bg-red-600 text-white font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-100"
            >
              Sign Out
            </button>
          </div>
        </div>
      </Modal>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden bg-white border-t border-slate-200 px-6 py-3 flex items-center justify-between sticky bottom-0 z-30">
        {filteredNavItems.slice(0, 4).map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={cn(
              "flex flex-col items-center gap-1",
              location.pathname === item.path ? "text-red-600" : "text-slate-400"
            )}
          >
            <item.icon className="w-6 h-6" />
            <span className="text-[10px] font-medium">{item.label}</span>
          </Link>
        ))}
      </nav>

      {/* Footer */}
      <footer className="bg-black text-white py-12 px-4 border-t border-slate-800">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-3">
            <div className="bg-red-600 p-2 rounded-xl">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="font-black text-xl tracking-tight">TRISHAK</h3>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Crisis Coordination System</p>
            </div>
          </div>
          
          <div className="text-center md:text-right space-y-2">
            <p className="text-sm font-black uppercase tracking-widest text-slate-400">
              Created by <span className="text-white">Holists</span>
            </p>
            <p className="text-xs text-slate-500 font-medium">
              © 2026 TRISHAK. All rights reserved. • v1.0.4
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
