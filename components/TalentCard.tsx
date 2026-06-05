import React, { useState, useEffect } from 'react';
import { Talent } from '../types';
import { Check, Star, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getReviewsForTalent } from '../services/dataService';

interface TalentCardProps {
  talent: Talent;
}

const TalentCard: React.FC<TalentCardProps> = ({ talent }) => {
  const navigate = useNavigate();
  const isAvailable = talent.isAvailable !== false;
  const [averageRating, setAverageRating] = useState<number | null>(null);

  useEffect(() => {
    getReviewsForTalent(talent.id).then(list => {
      if (list.length > 0) {
        const sum = list.reduce((acc, r) => acc + r.rating, 0);
        setAverageRating(Number((sum / list.length).toFixed(1)));
      } else {
        setAverageRating(null);
      }
    });
  }, [talent.id]);

  return (
    <div 
      className="card-star group cursor-pointer h-full flex flex-col"
      onClick={() => navigate(`/talent/${talent.id}`)}
    >
      <div className="relative aspect-[4/5] overflow-hidden">
        <img 
          src={talent.avatarUrl} 
          alt={talent.name} 
          className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-110 ${!isAvailable ? 'grayscale opacity-50' : ''}`}
        />
        
        {/* Overlay Badges */}
        <div className="absolute top-3 left-3 flex flex-col gap-2">
            <span className="badge-category">{talent.category}</span>
        </div>

        {talent.fastDeliveryEnabled && (
            <div className="absolute top-3 right-3 bg-amber-400 text-white p-1.5 rounded-full shadow-lg">
                <Zap className="w-4 h-4 fill-current" />
            </div>
        )}

        <div className="absolute bottom-3 left-3 right-3 bg-black/40 backdrop-blur-md p-3 rounded-xl flex justify-between items-center text-white">
            <span className="text-sm font-bold">Da €{talent.price}</span>
            {averageRating !== null && averageRating > 0 && (
                <div className="flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 text-amber-400 fill-current" />
                    <span className="text-xs font-bold">{averageRating}</span>
                </div>
            )}
        </div>
      </div>
      
      <div className="p-5 flex-1 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-1.5 mb-2">
              <h3 className="font-extrabold text-slate-900 text-lg truncate">{talent.name}</h3>
              <div className="bg-amber-500 rounded-full p-0.5" title="Verificato">
                  <Check className="w-3 h-3 text-white" />
              </div>
          </div>
          
          <p className="text-sm text-slate-500 line-clamp-2 font-medium leading-relaxed mb-4">
              {talent.bio}
          </p>
        </div>
      </div>
    </div>
  );
};

export default TalentCard;
