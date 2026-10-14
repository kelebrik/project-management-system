import assert from "node:assert/strict";
import test from "node:test";
import {
  editedShiftSessions,
  noteShiftSession,
  onShiftSession,
  restoreShiftSessions,
  setShiftSessionUser,
  shiftSessionsAsked,
  shiftSessionsToAsk,
  takeShiftSessions,
} from "./shiftSessions";

test("a tab keeps the sessions its saves joined, by person and project, and the projects still to ask about", () => {
  setShiftSessionUser(null);
  setShiftSessionUser("anna");
  const heard: string[] = [];
  const stop = onShiftSession((projectId) => heard.push(projectId));
  noteShiftSession("p1", "s1", "anna");
  noteShiftSession("p1", "s2", "anna");
  // A late answer to another person's save is not this person's.
  noteShiftSession("p1", "s9", "boris");
  assert.deepEqual([...editedShiftSessions("p1")!.sessionIds], ["s1", "s2"]);
  assert.deepEqual(heard, ["p1", "p1"]);
  assert.equal(shiftSessionsToAsk("p1"), false);
  assert.deepEqual(takeShiftSessions("p1"), ["s1", "s2"]);
  assert.equal(editedShiftSessions("p1"), null);
  // Taken to end: to be asked about until that is done.
  assert.equal(shiftSessionsToAsk("p1"), true);
  restoreShiftSessions("p1", ["s2"]);
  assert.deepEqual([...editedShiftSessions("p1")!.sessionIds], ["s2"]);
  shiftSessionsAsked("p1");
  assert.equal(shiftSessionsToAsk("p1"), false);
  stop();
});

test("another person signing in forgets the first one's sessions", () => {
  setShiftSessionUser("anna");
  noteShiftSession("p1", "s1", "anna");
  takeShiftSessions("p1");
  noteShiftSession("p1", "s3", "anna");
  setShiftSessionUser("boris");
  assert.equal(editedShiftSessions("p1"), null);
  assert.equal(shiftSessionsToAsk("p1"), false);
  noteShiftSession("p1", "s4", "boris");
  assert.deepEqual(takeShiftSessions("p1"), ["s4"]);
  setShiftSessionUser(null);
  assert.deepEqual(takeShiftSessions("p1"), []);
});
