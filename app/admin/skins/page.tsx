import Link from "next/link";
import { AdminLevel, getAdminContext, levelName } from "@/lib/adminAuth";
import { ADDON_VPK_DIRECTORIES } from "@/lib/customSkins";
import SkinManager from "@/components/admin/SkinManager";
import { getT } from '@/lib/serverI18n';

export const dynamic = "force-dynamic";

export default async function AdminSkinsPage({
  searchParams,
}: {
  searchParams: { key?: string };
}) {
    const t = getT();

  const ctx = await getAdminContext(searchParams.key);

  if (ctx.level < AdminLevel.Moderator) {
    return (
      <section className="panel">
        <h2>{t("auto.page.custom_skins")}</h2>
        <div className="empty-hint">
          <p style={{ margin: 0 }}>
            {t("auto.page.you_need_an_admin_role_to_open")}{" "}
            <code>{t("auto.page._key")}</code>.
          </p>
          {!ctx.steamId && (
            <a className="btn btn-primary" style={{ marginTop: 12 }} href="/api/auth/steam/login">
              {t("auto.page.sign_in_with_steam")}
                                    </a>
          )}
        </div>
      </section>
    );
  }

  const keyQuery = searchParams.key ? `?key=${encodeURIComponent(searchParams.key)}` : "";

  return (
    <>
      <section className="panel">
        <div className="admin-head">
          <h2>{t("auto.page.custom_skins")}</h2>
          <span className="role-badge">{levelName(ctx.level)}</span>
        </div>
        <p className="muted" style={{ marginTop: -4 }}>
          {t("auto.page.upload_a_packed_weapon_finish")}{" "}
          <Link href={`/admin-log${keyQuery}`}>{t("auto.page.admin_log")}</Link>{t("auto.page._back_to_the")}{" "}
          <Link href={`/admin${keyQuery}`}>{t("auto.page.admin_dashboard")}</Link>.
        </p>
      </section>

      <SkinManager adminKey={searchParams.key} canUpload={ctx.level >= AdminLevel.Admin} />

      <VpkReference />
    </>
  );
}

/**
 * What actually has to be inside the VPK.
 *
 * This is on the page rather than in the docs on purpose — it is the thing
 * that gets forgotten between one skin and the next, and the failure mode
 * (packing content/ instead of game/) produces a VPK that uploads cleanly and
 * then does nothing on the server.
 */
function VpkReference() {
    const t = getT();

  return (
    <>
      <section className="panel">
        <h2>{t("auto.page.what_goes_in_the_vpk")}</h2>
        <p style={{ marginTop: 0, fontSize: 14, maxWidth: "70ch" }}>
          {t("auto.page.the_vpk_rsquo_s_root_is_the_ad")} <strong>{t("auto.page.game")}</strong> {t("auto.page.folder")}{" "}
          <code>{t("auto.page.game_csgo_addons_lt_addon_gt")}</code> {t("auto.page._not_the_folder_above_it_and_n")}{" "}
          <code>{t("auto.page.content")}</code>{t("auto.page._pack_the_folder_rsquo_s")} <em>{t("auto.page.contents")}</em>{t("auto.page._so_that")}{" "}
          <code>{t("auto.page.materials")}</code> {t("auto.page.sits_at_the_archive_root")}
                          </p>

        <pre className="skin-tree">
          <b>{t("auto.page.garden_ak_bloom_vpk")}</b>
          {"\n"}
          {"├── "}{t("auto.page.addoninfo_txt")} <i>{t("auto.page._larr_addon_name_metadata")}</i>
          {"\n"}
          {"└── "}{t("auto.page.materials")}
                            {"\n"}
          {"    └── "}{t("auto.page.models_weapons_customization_p")}
                            {"\n"}
          {"          ├── "}<b>{t("auto.page.garden_ak_bloom_vmat_c")}</b> <i>{t("auto.page._larr_the_finish_compiled")}</i>
          {"\n"}
          {"          ├── "}{t("auto.page.garden_ak_bloom_color_vtex_c")}
                            {"\n"}
          {"          ├── "}{t("auto.page.garden_ak_bloom_normal_vtex_c")}
                            {"\n"}
          {"          ├── "}{t("auto.page.garden_ak_bloom_rough_vtex_c")}
                            {"\n"}
          {"          └── "}{t("auto.page.garden_ak_bloom_masks_vtex_c")}
                          </pre>

        <h3 style={{ fontSize: 15, margin: "var(--space-6) 0 var(--space-2)" }}>{t("auto.page.rules_that_actually_bite")}</h3>
        <ol style={{ fontSize: 14, lineHeight: 1.7, paddingLeft: "1.3em", margin: 0, maxWidth: "72ch" }}>
          <li>
            <strong>{t("auto.page.compiled_files_only")}</strong> <code>{t("auto.page._vmat_c")}</code> {t("auto.page.and")} <code>{t("auto.page._vtex_c")}</code>{t("auto.page._which_the_workshop_tools_writ")} <code>{t("auto.page.game")}</code>{t("auto.page._the")} <code>{t("auto.page._vmat")}</code>, <code>{t("auto.page._tga")}</code> {t("auto.page.and")}{" "}
            <code>{t("auto.page._psd")}</code> {t("auto.page.sources_under")} <code>{t("auto.page.content")}</code> {t("auto.page.are_for_the_compiler_and_the_e")}
                                </li>
          <li>
            <strong>{t("auto.page.no_wrapper_folder")}</strong> {t("auto.page.if_the_archive_root_contains")} <code>{t("auto.page.csgo_addons")}</code> {t("auto.page.or_your_addon_rsquo_s_own_name")}
                                </li>
          <li>
            <strong>{t("auto.page.keep_the_compile_paths")}</strong> A <code>{t("auto.page._vmat_c")}</code> {t("auto.page.stores_the_absolute_engine_pat")} <code>{t("auto.page._vtex_c")}</code> {t("auto.page.after_compiling_breaks_it_re_c")}
                                </li>
          <li>
            <strong>{t("auto.page.only_these_root_folders_are_re")}</strong> {t("auto.page._from_cs2_rsquo_s_own")}{" "}
            <code>{t("auto.page.gameinfo_gi")}</code> {t("auto.page._rarr")} <code>{t("auto.page.addonconfig")}</code> {t("auto.page._rarr")} <code>{t("auto.page.vpkdirectories")}</code>):{" "}
            {ADDON_VPK_DIRECTORIES.map((d, i) => (
              <span key={d}>
                {i > 0 && ", "}
                <code>{d}</code>
              </span>
            ))}
            {t("auto.page._anything_else_in_the_archive")}
                                </li>
          <li>
            <strong>{t("auto.page.a_finish_is_a_material_not_a_m")}</strong> {t("auto.page.you_do_not_repack_the_weapon")}{" "}
            <code>{t("auto.page.models")}</code> {t("auto.page.stays_out_unless_you_genuinely")}
                                </li>
          <li>
            <strong>{t("auto.page.multi_part_sets")}</strong> {t("auto.page.a_split_archive_is")}{" "}
            <code>{t("auto.page._lt_name_gt_dir_vpk")}</code> {t("auto.page.plus")} <code>{t("auto.page._lt_name_gt_000_vpk")}</code>, <code>{t("auto.page._001_vpk")}</code>{t("auto.page._the")} <code>{t("auto.page._dir")}</code> {t("auto.page.file_holds_only_the_tree_so_up")} <em>{t("auto.page.every")}</em> {t("auto.page.part_or_the_content_is_unreach")}
                                </li>
        </ol>
      </section>

      <section className="panel">
        <h2>{t("auto.page.getting_it_onto_players_rsquo")}</h2>
        <p style={{ marginTop: 0, fontSize: 14, maxWidth: "72ch" }}>
          {t("auto.page.uploading_puts_the_vpk_on_the")} <em>{t("auto.page.server")}</em>{t("auto.page._which_is_what_lets_the_server")} <code>{t("auto.page.sv_downloadurl")}</code>{t("auto.page._and_multiaddonmanager_which_i")} <code>{t("auto.page.mm_extra_addons")}</code> {t("auto.page.already_pushes_the_workshop_sk")}
                          </p>
        <ul style={{ fontSize: 14, lineHeight: 1.7, paddingLeft: "1.3em", margin: 0, maxWidth: "72ch" }}>
          <li>
            <strong>{t("auto.page.publish_the_same_addon_to_the")}</strong>{" "}
            {t("auto.page.this_is_the_only_automatic_rou")} <em>{t("auto.page.category")}</em> {t("auto.page.is_closed_but_a_content_addon")} <code>{t("auto.page.materials")}</code> {t("auto.page.tree_is_not_and_clients_downlo")} <code>{t("auto.page.mm_extra_addons")}</code>.
          </li>
          <li>
            <strong>{t("auto.page.have_players_install_it_by_han")}</strong> {t("auto.page.every_upload_here_is_hosted_at")}{" "}
            <code>{t("auto.page._fastdl_lt_file_gt_vpk")}</code> {t("auto.page._the")} <em>{t("auto.page.download")}</em> {t("auto.page.button_on_each_row_players_dro")}{" "}
            <code>{t("auto.page.game_csgo_addons")}</code> {t("auto.page.and_it_mounts_through")} <code>{t("auto.page.addonroot")}</code>.
          </li>
          <li>
            <strong>{t("auto.page.server_side_only")}</strong> {t("auto.page.fine_for_content_the_client_ne")}
                                </li>
        </ul>
      </section>
    </>
  );
}
