// URL de l'offre à envoyer à la plateforme.
//
// Sur beaucoup de sites d'entreprise (Lever, Ashby, Workable, WTTJ…), on arrive
// sur la page « /apply » : elle ne contient que le formulaire (titre, lieu,
// champs) et pas la description du poste. La même adresse sans « /apply » est la
// vraie page de l'offre, que le serveur sait lire en entier.

// Paramètres de suivi sans effet sur le contenu de la page.
const TRACKING_PARAM = /^(utm_|lever-)|^(gh_src|fbclid|gclid)$/i;

// Renvoie { url, fromApplyPage } :
//  - url : l'URL nettoyée (suivi retiré, « /apply » ou « /application » final retiré) ;
//  - fromApplyPage : true si on a remonté d'une page de candidature vers l'offre.
// On ne retire « /apply » que s'il reste au moins deux segments avant lui
// (/société/id/apply) : un simple « /careers/apply » est un formulaire général,
// pas une offre.
function canonicalOfferUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return { url: rawUrl, fromApplyPage: false };
  }

  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAM.test(key)) url.searchParams.delete(key);
  }

  const trailingSlash = url.pathname.endsWith("/");
  const segments = url.pathname.split("/").filter(Boolean);
  let fromApplyPage = false;

  if (segments.length >= 3 && /^(apply|application)$/i.test(segments[segments.length - 1])) {
    segments.pop();
    fromApplyPage = true;
  }

  url.pathname = `/${segments.join("/")}${trailingSlash && segments.length ? "/" : ""}`;
  return { url: url.toString(), fromApplyPage };
}

// Boîtes mail web : le texte de la page est celui du mail, pas d'une offre.
const WEBMAIL_HOST = /^(mail\.google\.com|outlook\.(live|office|office365)\.com|mail\.yahoo\.com|mail\.proton\.me)$/i;

function isWebmail(rawUrl) {
  try {
    return WEBMAIL_HOST.test(new URL(rawUrl).hostname);
  } catch {
    return false;
  }
}
