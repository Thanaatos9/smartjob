// URL fixe de la plateforme — source de vérité unique.
// Si un jour tu changes de domaine, modifie CETTE ligne ET la liste
// "host_permissions" dans manifest.json (les deux doivent correspondre).
const PLATFORM_URL = "https://smartjob.samuelrilos.com";

function getPlatformUrl() {
  return PLATFORM_URL;
}
