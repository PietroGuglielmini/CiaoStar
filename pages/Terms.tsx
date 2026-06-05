
import React, { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Terms: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="bg-white min-h-screen">
      <div className="max-w-4xl mx-auto px-6 py-16">
        <button 
          onClick={() => navigate(-1)} 
          className="flex items-center text-slate-400 hover:text-slate-900 mb-10 transition-colors font-bold text-sm uppercase tracking-widest"
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Torna indietro
        </button>

        <article className="prose prose-slate max-w-none">
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 mb-2 uppercase tracking-tight">
            TERMINI E CONDIZIONI GENERALI DI UTILIZZO - CIAOSTAR
          </h1>
          <p className="text-slate-500 font-bold mb-10 border-b pb-6">
            Ultimo aggiornamento: 27 Dicembre 2025 | Versione: 1.0
          </p>

          <div className="space-y-10 text-slate-700 leading-relaxed font-medium">
            <section>
              <h2 className="text-xl font-black text-slate-900 uppercase mb-4">1. PREMESSA E DEFINIZIONI</h2>
              <p>Benvenuti su CiaoStar (di seguito "Piattaforma"). I presenti Termini e Condizioni (di seguito "Termini") regolano l'accesso e l'utilizzo della Piattaforma web e dei servizi connessi. Accedendo, registrandosi o utilizzando la Piattaforma, l'Utente accetta di essere vincolato da questi Termini.</p>
              <p className="mt-4">Per chiarezza, definiamo le parti coinvolte:</p>
              <ul className="list-disc pl-5 space-y-2 mt-4">
                <li><strong>CIAOSTAR (o "Gestore" / "Admin"):</strong> Il fornitore dell'infrastruttura tecnologica e del marketplace. Agisce come intermediario tecnico e non come venditore diretto dei contenuti.</li>
                <li><strong>VIP (o "Talent" / "Venditore"):</strong> L'utente che si iscrive alla Piattaforma per offrire servizi di video-messaggistica personalizzata. Il VIP è un contraente indipendente e non un dipendente di CiaoStar.</li>
                <li><strong>FAN (o "Utente" / "Acquirente"):</strong> L'utente che naviga sulla Piattaforma per acquistare video-messaggi personalizzati dai VIP.</li>
                <li><strong>CONTENUTO (o "Video CiaoStar"):</strong> Il file video personalizzato creato dal VIP su richiesta del Fan.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-black text-slate-900 uppercase mb-4">2. OGGETTO DEL SERVIZIO E RUOLO DI CIAOSTAR</h2>
              <p><strong>2.1 Ruolo di Intermediario Tecnologico.</strong> L'Utente riconosce e accetta che CiaoStar opera esclusivamente come fornitore di servizi tecnologici (hosting, interfaccia, gestione pagamenti). Il contratto di vendita del Video CiaoStar si conclude direttamente ed esclusivamente tra il FAN e il VIP. CiaoStar non è parte di tale contratto, non crea i contenuti e non ne è responsabile.</p>
              <p className="mt-4"><strong>2.2 Natura del Servizio.</strong> La Piattaforma permette ai Fan di inviare richieste di video personalizzati ai VIP e ai VIP di accettare tali richieste, produrre i video e consegnarli digitalmente tramite l'infrastruttura di CiaoStar.</p>
            </section>

            <section>
              <h2 className="text-xl font-black text-slate-900 uppercase mb-4">3. TERMINI E CONDIZIONI PER I FAN (ACQUIRENTI)</h2>
              <h3 className="font-bold text-slate-900 mb-2">3.1 Processo di Ordine e Pagamento</h3>
              <ul className="list-decimal pl-5 space-y-2">
                <li>Il Fan invia una richiesta specificando destinatario, occasione e istruzioni.</li>
                <li>Il Fan autorizza il pagamento dell'intero importo tramite il processore di pagamento (Stripe).</li>
                <li>Pre-Autorizzazione: L'importo viene "congelato" (pre-autorizzato) sulla carta del Fan. L'addebito definitivo avviene solo al momento della consegna del Video ("Capture").</li>
              </ul>

              <h3 className="font-bold text-slate-900 mt-6 mb-2">3.2 Esclusione del Diritto di Recesso (Rinuncia Esplicita)</h3>
              <p className="mb-4">Si attira l'attenzione del Consumatore sui seguenti aspetti legati alla natura altamente personalizzata del servizio, disciplinato dal d.lgs. n. 206/2005 (Codice del Consumo):</p>
              <ul className="list-disc pl-5 space-y-2">
                <li><strong>Annullamento preventivo:</strong> Il Fan può richiedere l'annullamento della richiesta di video-messaggio gratuitamente e autonomamente finché lo stato dell'ordine è "In Attesa" (Pending).</li>
                <li><strong>Inizio dell'esecuzione:</strong> Non appena il VIP accetta formalmente l'ordine spostandone lo stato in "In Lavorazione", il processo creativo on-demand ha inizio immediato.</li>
                <li><strong>Deroga ed Esclusione del Recesso:</strong> Ai sensi dell'<strong>art. 59, lett. a) e lett. o) del d.lgs. 206/2005 (Codice del Consumo)</strong>, l'acquisto di video-messaggi personalizzati costituisce fornitura di contenuto digitale non fornito su supporto materiale, oltre che fornitura di beni confezionati su misura o chiaramente personalizzati. Pertanto, procedendo all'acquisto ed accettando l'ordine, il Fan riscontra, acconsente e concede espressamente l'<strong>esecuzione immediata</strong> del servizio, accettando la contestuale ed espressa <strong>rinuncia e perdita del diritto di recesso</strong> legale di 14 giorni.</li>
                <li><strong>Rimborso di tutela automatico:</strong> Al fine di tutelare comunque il consumatore, qualora il VIP rifiuti l'ordine, o non lo consegni entro i termini perentori stabiliti (vedi art. 5), il contratto si reputerà automaticamente risolto. L'importo pre-autorizzato sulla carta del Fan verrà integralmente sbloccato ed accreditato nuovamente a favore del consumatore, escludendo ogni pretesa risarcitoria ulteriore.</li>
              </ul>

              <h3 className="font-bold text-slate-900 mt-6 mb-2">3.3 Obblighi del Fan</h3>
              <p>Il Fan si impegna a fornire istruzioni chiare e leggibili (incluse pronunce fonetiche per nomi complessi). È vietato richiedere ai VIP contenuti che incitino all'odio, alla violenza, discriminatori, pornografici o comunque illegali.</p>

              <h3 className="font-bold text-slate-900 mt-6 mb-2">3.4 Licenza d'Uso (Cosa puoi fare col video)</h3>
              <p>Il Fan acquisisce una licenza personale, non esclusiva e non commerciale per utilizzare, scaricare e condividere il Video CiaoStar sui propri social media personali. È vietato l'uso del video per pubblicità aziendali, broadcast televisivi o rivendita, salvo accordi separati "Business".</p>
            </section>

            <section>
              <h2 className="text-xl font-black text-slate-900 uppercase mb-4">4. TERMINI E CONDIZIONI PER I VIP (VENDITORI)</h2>
              <h3 className="font-bold text-slate-900 mb-2">4.1 Autonomia, Natura del Rapporto e Responsabilità Fiscale (Adempimenti Italiani)</h3>
              <p>Il VIP (o "Talent") opera e agisce in qualità di professionista autonomo o prestatore occasionale indipendente, escludendo tassativamente qualsiasi rapporto di lavoro subordinato, para-subordinato, agenzia o associazione in partecipazione con CiaoStar.</p>
              <p className="mt-2">In conformità con il regime tributario della Repubblica Italiana (Agenzia delle Entrate) e le direttive europee DAC7, si stabilisce quanto segue:</p>
              <ul className="list-disc pl-5 space-y-2 mt-2 font-semibold">
                <li><strong>Autonomia Fiscale:</strong> Il VIP è l'unico ed esclusivo responsabile per la corretta qualificazione del proprio reddito (es. prestazione di lavoro autonomo occasionale ex art. 67 lett. l del TUIR, o attività d'impresa/professionale con Partita IVA) e per l’adempimento di tutti i relativi obblighi dichiarativi e di versamento delle imposte (IRPEF, IVA, contributi previdenziali INPS, ecc.).</li>
                <li><strong>Fatturazione e Ricevute:</strong> Poiché CiaoStar agisce esclusivamente come intermediario tecnico e mandatario all'incasso, la transazione economica per la vendita del Video-Messaggio avviene direttamente tra il Fan (acquirente) e il VIP (venditore). Il VIP si assume l’obbligo di emettere idonea documentazione fiscale (es. ricevuta generica con ritenuta d'acconto se applicabile, o fattura elettronica con applicazione di IVA o in regime di esonero come il regime forfettario) direttamente a favore del Fan, qualora richiesto.</li>
                <li><strong>Fattura delle Commissioni (Autofatturazione / Connect Fee):</strong> CiaoStar emetterà regolarmente fattura elettronica nei confronti del VIP per la Commissione del Servizio (Platform Fee) trattenuta in automatico su ciascuna transazione riuscita. Il VIP autorizza CiaoStar e il gestore dei servizi finanziari (Stripe Connect) a trattenere tale commissione all'origine prima dell'erogazione dei fondi sul saldo disponibile.</li>
              </ul>

              <h3 className="font-bold text-slate-900 mt-6 mb-2">4.2 Obbligo di Autenticità (NO AI / NO DELEGHE)</h3>
              <ul className="list-disc pl-5 space-y-2">
                <li><strong>Divieto Assoluto AI:</strong> È severamente vietato utilizzare software di Intelligenza Artificiale, deepfake, sintesi vocale o filtri alteranti per generare i Contenuti.</li>
                <li><strong>Prestazione Personale:</strong> Il video deve essere registrato personalmente dal VIP titolare del profilo. È vietato far registrare il video a sosia, assistenti o terze parti.</li>
                <li><strong>Verifica:</strong> CiaoStar si riserva il diritto di richiedere prove di identità aggiuntive (es. video-selfie di conferma). La violazione comporta il ban immediato e il congelamento dei fondi.</li>
              </ul>

              <h3 className="font-bold text-slate-900 mt-6 mb-2">4.3 Carta della Qualità (Obblighi di Conformità)</h3>
              <p>Il VIP accetta che il pagamento verrà erogato solo se il video rispetta i seguenti standard:</p>
              <ul className="list-disc pl-5 space-y-2 mt-2">
                <li>Durata: Minimo 20 secondi.</li>
                <li>Contenuto: Obbligo di pronunciare il nome del destinatario e l'occasione richiesta.</li>
                <li>Tecnica: Video stabile, audio chiaro, volto visibile, orientamento corretto. In caso di disputa, CiaoStar (Admin) sarà l'arbitro finale per valutare la conformità.</li>
              </ul>

              <h3 className="font-bold text-slate-900 mt-6 mb-2">4.4 Mandato all'Incasso e Fee</h3>
              <p>Il VIP conferisce mandato a CiaoStar (tramite Stripe Connect) di incassare le somme per suo conto. CiaoStar tratterrà una Commissione di Servizio (Application Fee) (es. 20-25%) dall'importo lordo pagato dal Fan. Il VIP riceverà il netto pattuito direttamente sul proprio account connesso.</p>
            </section>

            <section>
              <h2 className="text-xl font-black text-slate-900 uppercase mb-4">5. TEMPISTICHE E SCADENZE</h2>
              <ul className="list-disc pl-5 space-y-2">
                <li><strong>Accettazione:</strong> Il VIP ha 48 ore per accettare o rifiutare una richiesta.</li>
                <li><strong>Consegna:</strong> Dal momento della creazione dell'ordine, il VIP ha un totale di 7 giorni (168 ore) per caricare il video completato.</li>
                <li><strong>Scadenza:</strong> Superato tale termine, l'ordine viene considerato "Scaduto" (Expired), il contratto si risolve e il Fan ottiene il rimborso automatico. Nessun compenso sarà dovuto al VIP per ordini scaduti.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-black text-slate-900 uppercase mb-4">6. GESTIONE DELLE DISPUTE E RUOLO DELL'ADMIN</h2>
              <p>In caso di controversia tra Fan e VIP (es. "Il video non rispetta le istruzioni"), le parti riconoscono a CiaoStar il ruolo di Arbitro Terzo. L'Admin esaminerà il video e le istruzioni:</p>
              <ul className="list-disc pl-5 space-y-2 mt-4">
                <li>Se la contestazione è fondata (violazione Carta della Qualità), verrà emesso rimborso al Fan.</li>
                <li>Se la contestazione è infondata o basata su giudizi soggettivi ("non mi piace"), i fondi saranno rilasciati al VIP. La decisione dell'Admin è inappellabile ai fini della gestione dei fondi sulla Piattaforma.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-black text-slate-900 uppercase mb-4">7. LIMITAZIONE DI RESPONSABILITÀ E MANLEVA</h2>
              <p><strong>7.1 Esclusione Garanzie Tecniche.</strong> CiaoStar fornisce la Piattaforma "così com'è" (As-Is). Non garantiamo che il servizio sarà ininterrotto, privo di errori o sicuro da attacchi informatici, sebbene ci impegniamo ad adottare le migliori misure di sicurezza.</p>
              <p className="mt-4"><strong>7.2 Responsabilità sui Contenuti (Manleva VIP).</strong> Il VIP è l'unico responsabile legale dei contenuti caricati. Il VIP si impegna a manlevare e tenere indenne CiaoStar s.r.l., i suoi amministratori e dipendenti da qualsiasi richiesta risarcitoria, sanzione, spesa legale o danno derivante da:</p>
              <ul className="list-disc pl-5 space-y-2 mt-4">
                <li>Violazione di copyright (es. cantare brani protetti, indossare marchi non autorizzati).</li>
                <li>Contenuti diffamatori, osceni o illegali prodotti dal VIP.</li>
                <li>Violazione dei diritti di terzi.</li>
              </ul>
              <p className="mt-4"><strong>7.3 Responsabilità verso il Fan.</strong> La responsabilità massima complessiva di CiaoStar verso il Fan per qualsiasi reclamo relativo all'uso della Piattaforma è limitata all'importo pagato dal Fan per il singolo video oggetto della contestazione.</p>
            </section>

            <section>
              <h2 className="text-xl font-black text-slate-900 uppercase mb-4">8. PROPRIETÀ INTELLETTUALE DELLA PIATTAFORMA</h2>
              <p>Tutti i diritti sul software, design, marchio "CiaoStar", codice sorgente e database sono di proprietà esclusiva di CiaoStar s.r.l. È vietata la copia, il reverse engineering o l'uso non autorizzato del marchio.</p>
            </section>

            <section>
              <h2 className="text-xl font-black text-slate-900 uppercase mb-4">9. MODIFICHE AI TERMINI</h2>
              <p>CiaoStar si riserva il diritto di modificare i presenti Termini. Le modifiche sostanziali (es. cambio tempistiche consegna) saranno notificate tramite la Piattaforma e richiederanno una nuova accettazione esplicita per poter procedere con nuovi ordini.</p>
            </section>

            <section>
              <h2 className="text-xl font-black text-slate-900 uppercase mb-4">10. LEGGE APPLICABILE E FORO COMPETENTE</h2>
              <p>I presenti Termini sono regolati dalla Legge Italiana. Per qualsiasi controversia derivante dall'utilizzo della Piattaforma:</p>
              <ul className="list-disc pl-5 space-y-2 mt-4">
                <li>Se l'Utente è un Consumatore (Fan), il foro competente è quello di residenza del Consumatore.</li>
                <li>Se l'Utente è un Professionista (VIP), il foro competente esclusivo è il Tribunale di [Tua Città].</li>
              </ul>
            </section>
          </div>
        </article>
      </div>
    </div>
  );
};

export default Terms;
