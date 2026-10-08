import assert from "node:assert/strict";
import test from "node:test";
import { auditEventsPath, emptyAuditFilters, hasAuditFilters } from "./useAuditLog";

test("audit journal asks for 100 events and continues after the oldest one shown", () => {
  assert.equal(auditEventsPath(emptyAuditFilters), "/api/audit-events?limit=100");
  assert.equal(auditEventsPath(emptyAuditFilters, "event-100"), "/api/audit-events?limit=100&before=event-100");
  assert.equal(hasAuditFilters({ ...emptyAuditFilters, actor: "  " }), false);
});

test("audit journal period covers whole local days, the end day included", () => {
  const params = new URL(auditEventsPath({
    from: "2026-09-01",
    to: "2026-09-21",
    projectId: "project-1",
    actor: " Иванов ",
    action: "issue.update",
  }), "http://local").searchParams;
  assert.equal(params.get("from"), new Date(2026, 8, 1).toISOString());
  assert.equal(params.get("to"), new Date(2026, 8, 22).toISOString());
  assert.equal(params.get("projectId"), "project-1");
  assert.equal(params.get("actor"), "Иванов");
  assert.equal(params.get("action"), "issue.update");
});
