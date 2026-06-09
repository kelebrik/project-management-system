import type { DictionaryItemDraft } from "./adminTypes";
import type {
  ArtifactFormState,
  ProjectFormState,
  RaidFormState,
} from "./formState";

export function projectPayload(form: ProjectFormState) {
  return {
    ...form,
    parentId: form.parentId || null,
    copyBaselineFromProjectId: form.copyBaselineFromProjectId || null,
    budgetPlanned: Number(form.budgetPlanned),
    budgetForecast: Number(form.budgetForecast),
    scheduleVariance: Number(form.scheduleVariance),
    progress: Number(form.progress),
    sortOrder: Number(form.sortOrder),
  };
}

export function dictionaryPayload(draft: DictionaryItemDraft) {
  return {
    dictionary: draft.dictionary.trim(),
    code: draft.code.trim(),
    label: draft.label.trim(),
    description: draft.description.trim() || null,
    sortOrder: Number(draft.sortOrder) || 0,
    isActive: draft.isActive,
  };
}

export function artifactPayload(form: ArtifactFormState) {
  return {
    ...form,
    url: form.url || null,
    description: form.description || null,
    sortOrder: Number(form.sortOrder),
  };
}

export function raidPayload(form: RaidFormState) {
  return {
    ...form,
    owner: form.owner || "",
    probability: Number(form.probability),
    impact: Number(form.impact),
    mitigationPlan: form.mitigationPlan || null,
    contingencyPlan: form.contingencyPlan || null,
    dueDate: form.dueDate || null,
    residualRisk: Number(form.residualRisk),
    validationDate: form.validationDate || null,
    linkedRiskId: form.linkedRiskId || null,
    dependencyType: form.dependencyType || null,
    predecessor: form.predecessor || null,
    successor: form.successor || null,
    supplier: form.supplier || null,
    jiraTicketKey: form.jiraTicketKey || null,
    jiraTicketUrl: form.jiraTicketUrl || null,
    scheduleImpactDays: Number(form.scheduleImpactDays),
    budgetImpact: Number(form.budgetImpact),
  };
}
