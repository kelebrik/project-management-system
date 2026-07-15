import { BusinessUnitSystemSettings } from "../components/BusinessUnitSystemSettings";
import { usePageContext } from "./PageContext";

export function BusinessUnitsPageContent() {
  const { users } = usePageContext();

  return (
    <article className="panel project-card business-units-page">
      <BusinessUnitSystemSettings users={users} />
    </article>
  );
}
