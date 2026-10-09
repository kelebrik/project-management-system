import type { JiraSemanticAggregatePublic } from "@pms/shared";
import type { Translator } from "../i18n/types";

function standardStatusText(status: NonNullable<JiraSemanticAggregatePublic["standard"]>["status"], t: Translator) {
  if (status === "customized") return t("ui.jira.standardCustomized");
  if (status === "behind") return t("ui.jira.standardBehind");
  if (status === "unpublished") return t("ui.jira.standardUnpublished");
  return null;
}

type VersionedAggregate = Pick<JiraSemanticAggregatePublic, "version" | "publishedVersion" | "standard">;

/**
 * A system aggregate shows the version of its code standard, the same in every
 * project; an aggregate of the project's own shows its local revisions.
 */
export function jiraAggregateVersionLabel(aggregate: VersionedAggregate, t: Translator) {
  if (aggregate.standard) {
    const status = standardStatusText(aggregate.standard.status, t);
    const draft = aggregate.publishedVersion !== null && aggregate.version !== aggregate.publishedVersion;
    return [
      t("ui.jira.standardVersion", { version: aggregate.standard.version }),
      ...(status ? [status] : []),
      ...(draft ? [t("ui.jira.standardHasDraft")] : []),
    ].join(" · ");
  }
  return aggregate.publishedVersion
    ? t("ui.jira.localVersion", { version: aggregate.version, published: aggregate.publishedVersion })
    : `v${aggregate.version}${t("ui.jira.draftSuffix")}`;
}
