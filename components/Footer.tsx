
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Instagram, Twitter, Facebook, Youtube, Link2, Star, ShieldCheck } from 'lucide-react';
import { User, UserRole, AdminSettings } from '../types';
import { getAdminSettings } from '../services/dataService';
import { DEFAULT_ADMIN_SETTINGS } from '../constants';

interface FooterProps {
  user?: User | null;
}

const Footer: React.FC<FooterProps> = ({ user }) => {
  const currentYear = new Date().getFullYear();
  const [settings, setSettings] = useState<AdminSettings | null>(null);

  useEffect(() => {
    let active = true;
    getAdminSettings()
      .then((res) => {
        if (active) setSettings(res);
      })
      .catch((err) => {
        console.warn('Could not load dynamic settings for footer', err);
      });
    return () => {
      active = false;
    };
  }, []);

  const getSocialIcon = (url: string) => {
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes('instagram.com')) return <Instagram className="w-5 h-5" />;
    if (lowerUrl.includes('twitter.com') || lowerUrl.includes('x.com')) return <Twitter className="w-5 h-5" />;
    if (lowerUrl.includes('facebook.com')) return <Facebook className="w-5 h-5" />;
    if (lowerUrl.includes('youtube.com')) return <Youtube className="w-5 h-5" />;
    return <Link2 className="w-5 h-5" />; // Generica icona di fallback
  };

  const bizName = settings?.legalBusinessName || DEFAULT_ADMIN_SETTINGS.legalBusinessName || 'CIAOSTAR S.R.L. a socio unico';
  const office = settings?.legalRegisteredOffice || DEFAULT_ADMIN_SETTINGS.legalRegisteredOffice || "Via dell'Innovazione 42, 20126 Milano (MI), Italia";
  const pIva = settings?.legalVatNumber || DEFAULT_ADMIN_SETTINGS.legalVatNumber || 'IT12345678901';
  const capital = settings?.legalCapitalValue || DEFAULT_ADMIN_SETTINGS.legalCapitalValue || '€100.000,00 i.v.';
  const rea = settings?.legalReaNumber || DEFAULT_ADMIN_SETTINGS.legalReaNumber || 'MI-9876543';
  const email = settings?.legalContactEmail || DEFAULT_ADMIN_SETTINGS.legalContactEmail || 'info@ciaostar.it';
  const pec = settings?.legalPecEmail || DEFAULT_ADMIN_SETTINGS.legalPecEmail || 'legal@pec.ciaostar.it';

  // Fallback se l'admin non ha specificato link o l'array è vuoto
  const socialLinksList = settings?.socialLinks && settings.socialLinks.some(link => link && link.trim() !== '')
    ? settings.socialLinks.filter(link => link && link.trim() !== '')
    : ['https://instagram.com/ciaostar', 'https://twitter.com/ciaostar', 'https://facebook.com/ciaostar'];

  return (
    <footer className="bg-white border-t border-gray-100 pt-16 pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
          <div className="col-span-1 md:col-span-1">
            <div className="flex items-center mb-6">
              {settings?.logoUrl ? (
                <img 
                  src={settings.logoUrl} 
                  alt="CiaoStar Logo" 
                  className="w-auto object-contain mr-2" 
                  style={{ height: settings.logoFooterSize ? `${settings.logoFooterSize}px` : '32px' }}
                  referrerPolicy="no-referrer" 
                />
              ) : (
                <>
                  <div className="bg-amber-500 p-1.5 rounded-xl mr-2.5">
                    <Star className="w-4 h-4 text-white fill-current" />
                  </div>
                  <span className="text-xl font-extrabold text-slate-900 tracking-tight">CIAOSTAR</span>
                </>
              )}
            </div>
            <p className="text-slate-500 text-sm font-medium leading-relaxed mb-6">
              La piattaforma italiana per video messaggi personalizzati dalle tue star preferite. Regala un'emozione unica.
            </p>
            {/* Informazioni Societarie e Fiscali obbligatorie in Italia */}
            <div className="space-y-1.5 text-xs text-slate-400 font-medium">
              <p className="font-extrabold text-slate-700 uppercase tracking-wide text-[10px]">{bizName}</p>
              <p>Sede Legale: {office}</p>
              <p>Partita IVA / C.F.: <span className="font-bold text-slate-600">{pIva}</span></p>
              <p>Cap. Soc.: {capital} — R.E.A.: {rea}</p>
              <p>PEC: <span className="underline">{pec}</span></p>
              <p>Email: <span className="underline">{email}</span></p>
            </div>
          </div>

          <div>
            <h4 className="text-slate-900 font-bold text-sm mb-6 uppercase tracking-wider">Piattaforma</h4>
            <ul className="space-y-4 text-sm font-semibold text-slate-500">
              <li><Link to="/" className="hover:text-indigo-600 transition-colors">Esplora Star</Link></li>
              <li><Link to="/become-star" className="hover:text-indigo-600 transition-colors">Diventa una Star</Link></li>
              {(!user || user.role !== UserRole.ADMIN) && (
                <li><Link to="/dashboard" className="hover:text-indigo-600 transition-colors">I tuoi ordini</Link></li>
              )}
            </ul>
          </div>

          <div>
            <h4 className="text-slate-900 font-bold text-sm mb-6 uppercase tracking-wider">Supporto Legale</h4>
            <ul className="space-y-4 text-sm font-semibold text-slate-500">
              <li><Link to="/terms" className="hover:text-indigo-600 transition-colors">Termini e Condizioni</Link></li>
              <li><Link to="/terms" className="hover:text-indigo-600 transition-colors">Privacy Policy & GDPR</Link></li>
              <li><button onClick={() => { localStorage.removeItem('ciaostar_cookies_accepted'); window.location.reload(); }} className="hover:text-indigo-600 text-left transition-colors font-semibold">Rivoca Consenso Cookie</button></li>
              <li><Link to="/messages" className="hover:text-indigo-600 transition-colors">Contattaci / Assistenza</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-slate-900 font-bold text-sm mb-6 uppercase tracking-wider">Social & Sicurezza</h4>
            <div className="flex flex-wrap gap-2 mb-6">
              {socialLinksList.map((url, index) => (
                <a 
                  key={index} 
                  href={url} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition-all"
                >
                  {getSocialIcon(url)}
                </a>
              ))}
            </div>
            <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-100 rounded-xl text-[11px] font-bold text-amber-800">
              <ShieldCheck className="w-4 h-4 text-amber-500 shrink-0" />
              <span>Transazioni Protette & 3D Secure</span>
            </div>
          </div>
        </div>

        <div className="pt-8 border-t border-gray-100 flex flex-col md:flex-row justify-between items-center gap-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          <p>© {currentYear} {bizName} • TUTTI I DIRITTI RISERVATI</p>
          <div className="flex items-center gap-2">
            CONFORME GDPR • MADE WITH ❤️ IN ITALY
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
