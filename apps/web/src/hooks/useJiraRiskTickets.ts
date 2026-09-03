import type { JiraSemanticAggregatePublic } from "@pms/shared";
import { useEffect, useRef, useState } from "react";

import { ApiError, apiClient } from "../api/client";
import {
  findPublishedRiskAggregate,
  jiraRiskAggregateQuery,
  jiraRiskTicketsFromResult,
  type JiraRiskAggregateQueryResponse,
  type JiraRiskTicket,
} from "../app/jiraRiskTickets";
import { useJiraCurrentFreshness } from "./useJiraCurrentFreshness";

type Catalog = {
  definitions: JiraSemanticAggregatePublic[];
};

type RiskTicketsState = {
  loading: boolean;
  error: string | null;
  tickets: JiraRiskTicket[];
  total: number;
  available: boolean;
};

const EMPTY_STATE: RiskTicketsState = {
  loading: false,
  error: null,
  tickets: [],
  total: 0,
  available: false,
};

export function useJiraRiskTickets(projectId: string | null | undefined) {
  const [state, setState] = useState<RiskTicketsState>(() => ({
    ...EMPTY_STATE,
    loading: Boolean(projectId),
  }));
  const requestRef = useRef(0);
  const [projectionRevision, setProjectionRevision] = useState(0);
  const currentFreshness = useJiraCurrentFreshness(projectId, () => {
    setProjectionRevision((current) => current + 1);
  });

  useEffect(() => {
    const request = ++requestRef.current;
    if (!projectId) {
      queueMicrotask(() => {
        if (request === requestRef.current) setState(EMPTY_STATE);
      });
      return;
    }

    queueMicrotask(() => {
      if (request === requestRef.current) {
        setState({
          loading: true,
          error: null,
          tickets: [],
          total: 0,
          available: false,
        });
      }
    });
    void (async () => {
      try {
        const catalog = await apiClient.get<Catalog>(
          `/api/projects/${projectId}/jira/semantic-aggregates`,
          "Не удалось загрузить агрегаты",
        );
        const aggregate = findPublishedRiskAggregate(catalog.definitions);
        if (!aggregate || aggregate.publishedVersion === null) {
          if (request !== requestRef.current) return;
          setState({
            loading: false,
            error: null,
            tickets: [],
            total: 0,
            available: false,
          });
          return;
        }
        const response = await apiClient.post<JiraRiskAggregateQueryResponse>(
          `/api/projects/${projectId}/jira/semantic-aggregates/${aggregate.id}/query`,
          jiraRiskAggregateQuery(aggregate.publishedVersion),
          "Не удалось рассчитать агрегат «Тикеты под риском»",
        );
        if (request !== requestRef.current) return;
        setState({
          loading: false,
          error: null,
          tickets: jiraRiskTicketsFromResult(response.result),
          total: response.result.totalRecords,
          available: true,
        });
      } catch (error) {
        if (request !== requestRef.current) return;
        if (error instanceof ApiError && error.status === 404) {
          setState({
            loading: false,
            error: null,
            tickets: [],
            total: 0,
            available: false,
          });
          return;
        }
        setState({
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : "Не удалось загрузить тикеты под риском",
          tickets: [],
          total: 0,
          available: false,
        });
      }
    })();

    return () => {
      if (request === requestRef.current) requestRef.current += 1;
    };
  }, [projectId, projectionRevision]);

  return { ...state, currentFreshness };
}
