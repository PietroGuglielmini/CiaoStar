import { getAdminSettings } from './dataService';

export const updateSEO = (title: string, description: string, ogImage?: string) => {
  try {
    // 1. Titolo del documento
    document.title = title;

    // 2. Meta description
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.setAttribute('name', 'description');
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute('content', description);

    // 3. Open Graph Title
    let ogTitle = document.querySelector('meta[property="og:title"]');
    if (!ogTitle) {
      ogTitle = document.createElement('meta');
      ogTitle.setAttribute('property', 'og:title');
      document.head.appendChild(ogTitle);
    }
    ogTitle.setAttribute('content', title);

    // 4. Open Graph Description
    let ogDesc = document.querySelector('meta[property="og:description"]');
    if (!ogDesc) {
      ogDesc = document.createElement('meta');
      ogDesc.setAttribute('property', 'og:description');
      document.head.appendChild(ogDesc);
    }
    ogDesc.setAttribute('content', description);

    // 5. Open Graph Image
    if (ogImage) {
      let ogImg = document.querySelector('meta[property="og:image"]');
      if (!ogImg) {
        ogImg = document.createElement('meta');
        ogImg.setAttribute('property', 'og:image');
        document.head.appendChild(ogImg);
      }
      ogImg.setAttribute('content', ogImage);
    }
  } catch (err) {
    console.warn("Could not update SEO tags on document", err);
  }
};

export const updateFavicon = (url: string) => {
  if (!url) return;
  try {
    let link: HTMLLinkElement | null = document.querySelector("link[rel*='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = url;
  } catch (err) {
    console.warn("Could not update favicon dynamically", err);
  }
};

/**
 * Carica le impostazioni e applica la SEO globale di default.
 */
export const applyDefaultSEO = async () => {
  try {
    const settings = await getAdminSettings();
    const title = settings.seoDefaultTitle || 'CiaoStar - Videomessaggi personalizzati dalle tue star preferite';
    const desc = settings.seoDefaultDescription || 'Ordina video auguri e messaggi personalizzati dai tuoi influencer e talenti preferiti.';
    const ogImg = settings.seoOgImage || settings.logoUrl || '';
    updateSEO(title, desc, ogImg);
    if (settings.faviconUrl) {
      updateFavicon(settings.faviconUrl);
    }
  } catch (err) {
    console.warn("Could not apply default SEO configurations", err);
  }
};

/**
 * Carica le impostazioni e applica la SEO dinamica per la pagina dell'artista (Talent).
 */
export const applyTalentSEO = async (talentName: string, category: string) => {
  try {
    const settings = await getAdminSettings();
    const platformName = settings.legalBusinessName ? "CiaoStar" : "CiaoStar";
    
    // Controlla se l'indicizzazione dei talenti è attiva (default: true)
    const isIndexed = settings.seoIndexTalents !== false;
    
    let robotsMeta = document.querySelector('meta[name="robots"]');
    if (!robotsMeta) {
      robotsMeta = document.createElement('meta');
      robotsMeta.setAttribute('name', 'robots');
      document.head.appendChild(robotsMeta);
    }
    robotsMeta.setAttribute('content', isIndexed ? 'index, follow' : 'noindex, nofollow');

    const title = `Video personalizzato di ${talentName} (${category}) su ${platformName}`;
    const description = `Ordina ora un videomessaggio di auguri, incoraggiamento o consigli personalizzati da ${talentName}.`;
    const ogImg = settings.seoOgImage || '';

    updateSEO(title, description, ogImg);
    if (settings.faviconUrl) {
      updateFavicon(settings.faviconUrl);
    }
  } catch (err) {
    console.warn("Could not apply talent SEO configurations", err);
  }
};
