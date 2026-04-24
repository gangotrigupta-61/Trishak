import { useParams, useNavigate } from 'react-router-dom';
import IncidentRoomComponent from '../components/IncidentRoomComponent';
import { motion } from 'motion/react';
import { Zap } from 'lucide-react';

export default function IncidentRoom() {
  const { id } = useParams();
  const navigate = useNavigate();

  if (!id) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white p-12 rounded-[2.5rem] border border-slate-100 shadow-sm text-center max-w-md">
        <h2 className="text-2xl font-black text-slate-900 mb-2">Incident Not Found</h2>
        <p className="text-slate-500 mb-6">The incident you're looking for doesn't exist or you don't have permission to view it.</p>
        <button 
          onClick={() => navigate('/dashboard')}
          className="bg-slate-900 text-white px-8 py-3 rounded-2xl font-bold hover:bg-slate-800 transition-all"
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 p-3 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: -0 }}
          className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
        >
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
              <div className="bg-red-600 p-2 rounded-xl shadow-lg shadow-red-100">
                <Zap className="w-5 h-5 md:w-6 md:h-6 text-white" />
              </div>
              Command Center
            </h1>
            <p className="text-xs md:text-sm text-slate-500 font-medium mt-1">Real-time emergency reports hub.</p>
          </div>
          <button 
            onClick={() => navigate('/dashboard')}
            className="w-full sm:w-auto bg-white border border-slate-200 text-slate-600 px-6 py-3 rounded-2xl font-bold hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
          >
            Dashboard
          </button>
        </motion.div>

        <div className="bg-white rounded-[2rem] md:rounded-[2.5rem] border-4 border-slate-900 shadow-2xl p-4 md:p-8 min-h-[500px] md:min-h-[700px]">
          <IncidentRoomComponent 
            incidentId={id} 
            onBack={() => navigate('/dashboard')}
            fullScreenLink={false}
          />
        </div>
      </div>
    </div>
  );
}
