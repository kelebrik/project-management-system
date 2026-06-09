import { useState } from "react";
import { emptyRaidForm, type RaidFormState } from "../app/formState";
import type { RaidTypeFilter } from "../app/raidModels";

export function useRaidState() {
  const [raidForm, setRaidForm] = useState<RaidFormState>(emptyRaidForm);
  const [raidDrafts, setRaidDrafts] = useState<Record<string, RaidFormState>>({});
  const [raidStatusDrafts, setRaidStatusDrafts] = useState<
    Record<string, { statusAt: string; text: string }>
  >({});
  const [expandedRaidId, setExpandedRaidId] = useState<string | null>(null);
  const [raidTypeFilter, setRaidTypeFilter] = useState<RaidTypeFilter>("ALL");
  const [raidDecisionOnly, setRaidDecisionOnly] = useState(false);
  const [raidOverdueOnly, setRaidOverdueOnly] = useState(false);
  const [raidHighOnly, setRaidHighOnly] = useState(false);

  return {
    raidForm,
    setRaidForm,
    raidDrafts,
    setRaidDrafts,
    raidStatusDrafts,
    setRaidStatusDrafts,
    expandedRaidId,
    setExpandedRaidId,
    raidTypeFilter,
    setRaidTypeFilter,
    raidDecisionOnly,
    setRaidDecisionOnly,
    raidOverdueOnly,
    setRaidOverdueOnly,
    raidHighOnly,
    setRaidHighOnly,
  };
}
