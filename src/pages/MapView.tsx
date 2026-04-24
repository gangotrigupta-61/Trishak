import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { 
  Navigation, 
  Layers, 
  Maximize2,
  Minimize2
} from 'lucide-react';
import { cn } from '../lib/utils';
import CrisisMap from '../components/CrisisMap';

export default function MapView() {
  const { profile } = useAuth();
  const [isFullscreen, setIsFullscreen] = useState(false);

  return (
    <div className={cn(
      "flex flex-col gap-4 lg:gap-6 relative transition-all duration-500",
      isFullscreen ? "fixed inset-0 z-[200] bg-slate-50 p-4 md:p-10" : "h-[calc(100vh-180px)] lg:h-[calc(100vh-140px)] pb-16 lg:pb-0 font-sans"
    )}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3 lg:gap-4">
          <div className="bg-red-600 p-2.5 lg:p-3 rounded-xl lg:rounded-2xl shadow-lg shadow-red-100">
            <Navigation className="w-5 h-5 lg:w-6 lg:h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl lg:text-3xl font-black text-slate-900 tracking-tight">Command Map</h1>
            <p className="text-xs lg:text-sm text-slate-500 font-medium tracking-tight flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Live Situational Tracking
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-white border border-slate-200 rounded-xl lg:rounded-2xl text-slate-600 font-bold hover:bg-slate-50 transition-all shadow-sm text-xs lg:text-base"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4 lg:w-5 lg:h-5" /> : <Maximize2 className="w-4 h-4 lg:w-5 lg:h-5" />}
            <span>{isFullscreen ? 'Exit' : 'Fullscreen'}</span>
          </button>
        </div>
      </div>

      <div className="flex-1 relative">
        {profile?.organizationId ? (
          <CrisisMap 
            organizationId={profile.organizationId} 
            height="100%" 
            className="border-none"
            showFloorSelector={true}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center p-12 bg-slate-100 rounded-[2.5rem] border-4 border-white shadow-xl">
             <Layers className="w-16 h-16 text-slate-300 mb-4" />
             <p className="text-slate-500 font-bold uppercase tracking-widest">Awaiting Organization Authorization...</p>
          </div>
        )}
      </div>
    </div>
  );
}
