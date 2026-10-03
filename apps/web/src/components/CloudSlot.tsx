import type { ComponentType } from "react";
import type { CurrentUser } from "../app/adminTypes";

type HeaderSlotProps = { user: CurrentUser };

// Parts of the cloud build (src/cloudOnly/*/slot.tsx). The corporate build does
// not ship that folder; then there is nothing to show and nothing to import.
const headerSlots = Object.values(
  import.meta.glob<{ HeaderSlot?: ComponentType<HeaderSlotProps> }>("../cloudOnly/*/slot.tsx", { eager: true }),
).flatMap((module) => (module.HeaderSlot ? [module.HeaderSlot] : []));

/** Whatever the cloud build adds to the header, next to the bell. */
export function CloudHeaderSlot({ user }: HeaderSlotProps) {
  return (
    <>
      {headerSlots.map((Slot, index) => (
        <Slot key={index} user={user} />
      ))}
    </>
  );
}
