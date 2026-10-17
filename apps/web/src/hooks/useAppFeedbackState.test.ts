import assert from "node:assert/strict";
import test from "node:test";
import { addToast, type Toast } from "./useAppFeedbackState";

const toast = (id: number, tone: Toast["tone"], message = `m${id}`): Toast => ({ id, tone, message });

test("too many toasts: a notice goes before an error, the same message is not shown twice", () => {
  const shown = [toast(1, "error", "e1"), toast(2, "success"), toast(3, "warning"), toast(4, "error", "e4")];
  // The oldest notice goes, both errors stay.
  assert.deepEqual(addToast(shown, toast(5, "success")).map((item) => item.id), [1, 3, 4, 5]);
  // Only errors shown: the oldest error goes.
  const errors = [1, 2, 3, 4].map((id) => toast(id, "error"));
  assert.deepEqual(addToast(errors, toast(5, "error")).map((item) => item.id), [2, 3, 4, 5]);
  // A repeat of a message on screen adds nothing.
  assert.equal(addToast(shown, toast(6, "error", "e1")), shown);
});
