
import React from 'react';
import { Link } from 'react-router-dom';
import { Instagram, Twitter, Facebook, Star } from 'lucide-react';
import { User, UserRole } from '../types';

interface FooterProps {
  user?: User | null;
}

const Footer: React.FC<FooterProps> = ({ user }) => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-white border-t border-gray-100 pt-16 pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
          <div className="col-span-1 md:col-span-1">
            <div className="flex items-center mb-6">
              <div className="bg-indigo-600 p-1.5 rounded-xl mr-2.5">
                <Star className="w-4 h-4 text-white fill-current" />
              </div>
              <span className="text-xl font-extrabold text-slate-900 tracking-tight">CIAOSTAR</span>
            </div>
            <p className="text-slate-500 text-sm font-medium leading-relaxed">
              La piattaforma italiana per video messaggi personalizzati dalle tue star preferite. Regala un'emozione unica.
            </p>
          </div>

          <div>
            <h4 className="text-slate-900 font-bold text-sm mb-6 uppercase tracking-wider">Piattaforma</h4>
            <ul className="space-y-4 text-sm font-semibold text-slate-500">
              <li><Link to="/" className="hover:text-indigo-600 transition-colors">Esplora Star</Link></li>
              <li><Link to="/login" className="hover:text-indigo-600 transition-colors">Diventa una Star</Link></li>
              {(!user || user.role !== UserRole.ADMIN) && (
                <li><Link to="/dashboard" className="hover:text-indigo-600 transition-colors">I tuoi ordini</Link></li>
              )}
            </ul>
          </div>

          <div>
            <h4 className="text-slate-900 font-bold text-sm mb-6 uppercase tracking-wider">Supporto</h4>
            <ul className="space-y-4 text-sm font-semibold text-slate-500">
              <li><Link to="/terms" className="hover:text-indigo-600 transition-colors">Termini e Condizioni</Link></li>
              <li><Link to="/terms" className="hover:text-indigo-600 transition-colors">Privacy Policy</Link></li>
              <li><Link to="/messages" className="hover:text-indigo-600 transition-colors">Contattaci</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-slate-900 font-bold text-sm mb-6 uppercase tracking-wider">Social</h4>
            <div className="flex space-x-4">
              <a href="#" className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition-all">
                <Instagram className="w-5 h-5" />
              </a>
              <a href="#" className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition-all">
                <Twitter className="w-5 h-5" />
              </a>
              <a href="#" className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition-all">
                <Facebook className="w-5 h-5" />
              </a>
            </div>
          </div>
        </div>

        <div className="pt-8 border-t border-gray-100 flex flex-col md:flex-row justify-between items-center gap-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          <p>© {currentYear} CIAOSTAR S.R.L. • TUTTI I DIRITTI RISERVATI</p>
          <div className="flex items-center gap-2">
            MADE WITH ❤️ IN ITALY
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
