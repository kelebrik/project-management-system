import assert from "node:assert/strict";
import test from "node:test";

import { searchScopeOf } from "../app/searchScopes";

test("search results land on the tab the server type belongs to", () => {
  assert.equal(searchScopeOf("project"), "project");
  assert.equal(searchScopeOf("wbs"), "wbs");
  // The server calls risks "risk" and issues needing a decision "decision".
  assert.equal(searchScopeOf("risk"), "raid");
  assert.equal(searchScopeOf("issue"), "issue");
  assert.equal(searchScopeOf("decision"), "issue");
  assert.equal(searchScopeOf("artifact"), "other");
  assert.equal(searchScopeOf("overview"), "other");
  assert.equal(searchScopeOf("something-new"), "other");
});
