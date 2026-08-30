import Link from "next/link";
import { Building2 } from "lucide-react";

import { getT } from "@/lib/serverI18n";
import { canCreateOrg, getTournamentContext } from "@/lib/tournamentAuth";
import { listOrgs, orgsOrganizedBy, type OrgCard } from "@/lib/tournament/orgs";
import BackToTournament from "@/components/tournament/BackToTournament";
import CreateOrg from "@/components/tournament/CreateOrg";
import "@/components/tournament/org.css";

// force-dynamic, not revalidate: which orgs are listed as YOURS depends on who
// is asking, and a shared cache would hand one organizer's list to the next.
export const dynamic = "force-dynamic";

/**
 * The index of organizations.
 *
 * An org page existed and was reachable only by knowing its slug — there was no
 * page that listed them and no page that made one, so the only route to a brand
 * new org was an admin typing a URL they could not yet know. This is where the
 * tournaments page's Organizations button lands.
 *
 * Public, for the same reason an org page is: it is a shop window. The create
 * form below is drawn only for the people the API will accept.
 */
export default async function OrgsPage() {
  const t = getT();
  const ctx = await getTournamentContext();

  const [orgs, mine] = await Promise.all([listOrgs(), orgsOrganizedBy(ctx.steamId)]);
  const mineIds = new Set(mine.map((o) => o.Id));

  return (
    <>
      <BackToTournament />

      <section className="hero hero-compact">
        <div className="hero-inner">
          <h1 className="grad">{t("orgs.title")}</h1>
          <p className="muted">{t("orgs.blurb")}</p>
        </div>
      </section>

      {canCreateOrg(ctx) && (
        <section className="panel">
          <h3>{t("orgs.create")}</h3>
          <p className="muted">{t("orgs.createHint")}</p>
          <CreateOrg />
        </section>
      )}

      {/* Yours first, and separately. An organizer of one org among forty should
          not have to find it in an alphabetical list to reach the page they came
          here for. No "manage" button beside it: the org page is where every
          control lives, and a second one here would only be a second route to
          the same place. */}
      <OrgList title={t("orgs.mine")} orgs={mine} />

      {orgs.length === 0 ? (
        <section className="panel">
          <p className="muted">{t("orgs.none")}</p>
        </section>
      ) : (
        <OrgList title={t("orgs.all")} orgs={orgs.filter((o) => !mineIds.has(o.Id))} />
      )}
    </>
  );
}

function OrgList({ title, orgs }: { title: string; orgs: OrgCard[] }) {
  // An empty section is worse than none: a heading with nothing under it reads
  // as a page that failed to load.
  if (orgs.length === 0) return null;

  return (
    <section className="panel">
      <h3>{title}</h3>
      <ul className="org-tournaments">
        {orgs.map((org) => (
          <li key={org.Id}>
            <Link href={`/orgs/${org.Slug}`}>
              <Building2 size={15} aria-hidden focusable="false" /> {org.Name}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
