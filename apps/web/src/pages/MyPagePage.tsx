import { useCallback, useEffect, useState } from "react";
import { pageFromTemplate, type PageScope, type PageTemplate } from "@pms/shared";
import { apiClient } from "../api/client";
import type { PagesList, SavedPage, ScopeOptions } from "../app/pages/pageModel";
import { useConfirm } from "../hooks/useConfirm";
import { PageEditor, type EditorPage } from "../components/pages/PageEditor";
import { PagesGallery } from "../components/pages/PagesGallery";
import { PageShow } from "../components/pages/PageShow";
import { PagesIntro } from "../components/pages/PagesIntro";
import { pageErrorText } from "../app/pages/pageErrors";
import { useI18n } from "../i18n/I18nProvider";
import "../styles/my-page.css";

/**
 * "My page": a person's one-pagers over live project data. The address keeps
 * the open page (?page=…), so a reload or a link opens it again.
 */

const PAGE_PARAM = "page";
const INTRO_HIDDEN_KEY = "pms-my-page-intro-hidden";

function introHidden() {
  try {
    return window.localStorage.getItem(INTRO_HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

function pageIdFromAddress() {
  return new URLSearchParams(window.location.search).get(PAGE_PARAM);
}

function setPageInAddress(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set(PAGE_PARAM, id);
  else url.searchParams.delete(PAGE_PARAM);
  window.history.pushState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

export function MyPagePage() {
  const { t, locale } = useI18n();
  const confirm = useConfirm();
  const [list, setList] = useState<PagesList | null>(null);
  const [options, setOptions] = useState<ScopeOptions | null>(null);
  const [open, setOpen] = useState<EditorPage | null>(null);
  const [openId, setOpenId] = useState<string | null>(() => pageIdFromAddress());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showFrom, setShowFrom] = useState<number | null>(null);
  const [intro, setIntro] = useState(() => !introHidden());
  const hideIntro = () => {
    try {
      window.localStorage.setItem(INTRO_HIDDEN_KEY, "1");
    } catch {
      // Storage may be blocked: the window just closes.
    }
    setIntro(false);
  };
  const introDialog = intro ? <PagesIntro onClose={() => setIntro(false)} onHide={hideIntro} /> : null;

  const loadList = useCallback(() => {
    apiClient.get<PagesList>("/api/pages", t("ui.pages.loadFailed")).then(setList).catch((failure) => setError(pageErrorText(failure, t, t("ui.pages.loadFailed"))));
  }, [t]);
  useEffect(loadList, [loadList]);
  useEffect(() => {
    apiClient.get<ScopeOptions>("/api/pages/scope-options", t("ui.pages.loadFailed")).then(setOptions).catch(() => setOptions({ projects: [], portfolios: [] }));
  }, [t]);
  useEffect(() => {
    const onPop = () => setOpenId(pageIdFromAddress());
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // Leaving the section: the next one should not inherit the page of the address.
      if (pageIdFromAddress()) {
        const url = new URL(window.location.href);
        url.searchParams.delete(PAGE_PARAM);
        window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
      }
    };
  }, []);
  useEffect(() => {
    if (!openId || open?.id === openId) return;
    let alive = true;
    apiClient
      .get<SavedPage>(`/api/pages/${encodeURIComponent(openId)}`, t("ui.pages.loadFailed"))
      .then((page) => alive && setOpen({ id: page.id, title: page.title, document: page.document, revision: page.revision, updatedAt: page.updatedAt }))
      .catch((failure) => {
        if (!alive) return;
        setError(pageErrorText(failure, t, t("ui.pages.loadFailed")));
        setOpenId(null);
        setPageInAddress(null);
      });
    return () => {
      alive = false;
    };
  }, [open?.id, openId, t]);

  const openPage = (page: SavedPage) => {
    setOpen({ id: page.id, title: page.title, document: page.document, revision: page.revision, updatedAt: page.updatedAt });
    setOpenId(page.id);
    setPageInAddress(page.id);
  };
  const create = async (template: PageTemplate, scope: PageScope) => {
    const draft = pageFromTemplate(template, scope, locale);
    if (list?.canSave === false) {
      setOpen({ id: null, title: draft.title, document: draft.document, revision: 0, updatedAt: null });
      return;
    }
    setBusy(true);
    setError("");
    try {
      openPage(await apiClient.post<SavedPage>("/api/pages", draft, t("ui.pages.createFailed")));
      loadList();
    } catch (failure) {
      setError(pageErrorText(failure, t, t("ui.pages.createFailed")));
    } finally {
      setBusy(false);
    }
  };
  const duplicate = async (page: SavedPage) => {
    try {
      await apiClient.post(`/api/pages/${page.id}/duplicate`, undefined, t("ui.pages.createFailed"));
      loadList();
    } catch (failure) {
      setError(pageErrorText(failure, t, t("ui.pages.createFailed")));
    }
  };
  const remove = async (page: SavedPage) => {
    if (!(await confirm({ title: t("ui.pages.gallery.deleteTitle"), message: t("ui.pages.gallery.deleteConfirm", { title: page.title }), confirmLabel: t("ui.pages.gallery.delete"), tone: "danger" }))) return;
    try {
      await apiClient.delete(`/api/pages/${page.id}`, t("ui.pages.deleteFailed"));
      loadList();
    } catch (failure) {
      setError(pageErrorText(failure, t, t("ui.pages.deleteFailed")));
    }
  };
  const back = () => {
    setOpen(null);
    setOpenId(null);
    setPageInAddress(null);
    loadList();
  };

  // A page from the address, or a demo page that is not saved anywhere.
  const shown = open && (open.id === null || open.id === openId) ? open : null;
  if (shown) {
    return (
      <section className="v2-page mp-page">
        <PageEditor canSave={list?.canSave !== false && shown.id !== null} key={shown.id ?? "local"} onBack={back} options={options} page={shown} />
        {introDialog}
      </section>
    );
  }
  return (
    <section className="v2-page mp-page">
      <div className="v2-compact-header">
        <div>
          <h2>{t("ui.pages.title")}</h2>
          <span>
            {t("ui.pages.description")} · <button className="mp-link-button" onClick={() => setIntro(true)} type="button">{t("ui.pages.intro.open")}</button>
          </span>
        </div>
      </div>
      {error && <p className="automation-error" role="alert">{error}</p>}
      {openId && !shown ? <p className="mp-hint">{t("ui.pages.loading")}</p> : <PagesGallery busy={busy} list={list} onShow={setShowFrom} onCreate={(template, scope) => void create(template, scope)} onDelete={(page) => void remove(page)} onDuplicate={(page) => void duplicate(page)} onOpen={openPage} options={options} />}
      {introDialog}
      {showFrom !== null && list && list.pages.length > 0 && <PageShow onExit={() => setShowFrom(null)} options={options} pages={list.pages} start={showFrom} />}
    </section>
  );
}
