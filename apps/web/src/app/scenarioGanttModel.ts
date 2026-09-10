import type { ScenarioResult } from '@pms/shared';
import type { WbsDependency, WbsTreeItem } from './domainTypes';
import { createWbsGantt } from './wbsGanttModel';

export function createScenarioGantt(tree: WbsTreeItem[], dependencies: WbsDependency[], rangeDays: 30 | 90 | 180 | null, result: ScenarioResult) {
  // Full calculated dates also cover normalization of unchanged working-plan rows.
  const dates = new Map(result.schedule.items.map((item) => [item.id, item]));
  return createWbsGantt({
    visibleWbsTree: tree.map((item) => ({ ...item, ...dates.get(item.id), forecastStartDate: null, forecastDueDate: null })),
    wbsDependencies: dependencies,
    rangeDays,
    criticalPath: {
      criticalItemIds: result.afterCriticalIds,
      criticalDependencyIds: result.schedule.criticalDependencyIds,
      items: result.schedule.floatById,
    },
  });
}
