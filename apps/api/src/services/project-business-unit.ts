type BusinessUnitIdentity = {
  id: string;
  name: string;
};

export function projectBusinessUnitFields(businessUnit: BusinessUnitIdentity) {
  return {
    businessUnitId: businessUnit.id,
    portfolio: businessUnit.name,
  };
}
