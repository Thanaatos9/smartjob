import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Politique de confidentialité — SmartJob",
  description:
    "Politique de confidentialité de SmartJob et de son extension Chrome « Candidature — Envoyer l'offre ».",
  // Discrète : accessible par URL mais non indexée par les moteurs de recherche.
  robots: { index: false, follow: false },
};

const LAST_UPDATED = "6 août 2026";
const CONTACT_EMAIL = "samuel.urls@gmail.com";

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16">
      <article className="space-y-8 text-sm leading-relaxed text-foreground">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold">Politique de confidentialité</h1>
          <p className="text-muted-foreground">
            Dernière mise à jour : {LAST_UPDATED}
          </p>
        </header>

        <section className="space-y-3">
          <p>
            Cette politique décrit comment la plateforme <strong>SmartJob</strong>{" "}
            (<span className="whitespace-nowrap">smartjob.samuelrilos.com</span>) et
            son extension Chrome <strong>« Candidature — Envoyer l&apos;offre »</strong>{" "}
            collectent, utilisent et protègent vos données.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">1. Données que nous collectons</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Compte&nbsp;:</strong> votre adresse e-mail et votre mot de
              passe, utilisés pour créer votre compte et vous authentifier. Le mot
              de passe est stocké de façon sécurisée et chiffrée par notre
              prestataire d&apos;authentification (Supabase) ; nous n&apos;y avons
              jamais accès en clair.
            </li>
            <li>
              <strong>Profil de candidature&nbsp;:</strong> les informations que
              vous renseignez (CV, nom, téléphone, localisation) afin de générer
              vos candidatures et lettres de motivation.
            </li>
            <li>
              <strong>Offres d&apos;emploi&nbsp;:</strong> l&apos;URL de la page que
              vous envoyez ainsi que le texte qui y est affiché au moment où vous
              cliquez, analysés pour en extraire les informations de l&apos;offre
              (intitulé, entreprise, lieu, etc.). Si vous envoyez une offre reçue
              par e-mail, le texte de ce message fait donc partie de ce qui est
              transmis. Rien n&apos;est lu ni envoyé sans ce clic.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">
            2. L&apos;extension Chrome et ses permissions
          </h2>
          <p>
            L&apos;extension demande le minimum de permissions nécessaire à son
            fonctionnement&nbsp;:
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>
                <code>activeTab</code>
              </strong>{" "}
              — donne accès à l&apos;onglet actif{" "}
              <em>uniquement lorsque vous cliquez sur l&apos;icône</em> de
              l&apos;extension, et à cet onglet-là seulement. L&apos;accès retombe
              ensuite. Aucune autre page n&apos;est lue, et aucune navigation
              n&apos;est suivie.
            </li>
            <li>
              <strong>
                <code>scripting</code>
              </strong>{" "}
              — permet, à ce moment précis, de lire le texte affiché dans
              l&apos;onglet pour l&apos;envoyer avec l&apos;URL. C&apos;est
              indispensable pour les offres que nos serveurs ne peuvent pas
              récupérer seuls&nbsp;: annonces reçues par e-mail, sites nécessitant
              une connexion, pages dont le contenu est chargé dynamiquement. Ce
              texte est envoyé à SmartJob, analysé pour en extraire l&apos;offre, et
              rattaché à votre compte.
            </li>
            <li>
              <strong>
                <code>storage</code>
              </strong>{" "}
              — conserve localement, dans votre navigateur, le jeton de session qui
              vous maintient connecté. Ce jeton ne sert qu&apos;à communiquer avec
              SmartJob.
            </li>
          </ul>
          <p>
            L&apos;extension ne collecte aucune donnée de navigation, n&apos;injecte
            aucune publicité et n&apos;exécute aucun code distant.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">3. Utilisation des données</h2>
          <p>Vos données servent exclusivement à&nbsp;:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>vous authentifier et sécuriser votre compte&nbsp;;</li>
            <li>
              extraire et organiser les offres d&apos;emploi que vous soumettez&nbsp;;
            </li>
            <li>générer vos candidatures et lettres de motivation.</li>
          </ul>
          <p>
            Nous ne vendons ni ne louons vos données. Nous ne les utilisons pas à
            des fins publicitaires ou de profilage marketing.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">4. Partage avec des tiers</h2>
          <p>
            Vos données sont hébergées et traitées par des sous-traitants
            techniques, uniquement pour faire fonctionner le service&nbsp;: stockage
            et authentification (Supabase) et traitement automatisé de
            l&apos;extraction des offres. Ces prestataires n&apos;utilisent vos
            données que pour notre compte.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">5. Conservation et suppression</h2>
          <p>
            Vos données sont conservées tant que votre compte est actif. Vous pouvez
            demander à tout moment l&apos;accès, la rectification ou la suppression
            de vos données, ainsi que la suppression de votre compte, en nous
            contactant à l&apos;adresse ci-dessous.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">6. Vos droits</h2>
          <p>
            Conformément au Règlement général sur la protection des données (RGPD),
            vous disposez d&apos;un droit d&apos;accès, de rectification,
            d&apos;effacement, de limitation et d&apos;opposition au traitement de
            vos données personnelles. Pour exercer ces droits, contactez-nous.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">7. Contact</h2>
          <p>
            Pour toute question relative à cette politique ou à vos données,
            écrivez-nous à&nbsp;:{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="font-medium text-[#16a34a] underline underline-offset-2"
            >
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </section>
      </article>
    </main>
  );
}
