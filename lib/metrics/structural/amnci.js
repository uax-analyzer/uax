import { StructureKind } from "ts-morph";
import { safeDiv } from "./utils.js";
/**
 * Calculates the API Method Name Confusion Index (AMNCI) metric
 */

export default async function computeAPLCI() {
  const functionsNames = new Set();

  for (let [modulePath, mapDeclarations] of this.modules) {
    for (let [name, declarations] of mapDeclarations) {
      declarations.forEach((declaration) => {
        switch (declaration.kind) {
          case StructureKind.Function:
            functionsNames.add(name);
            break;
          case StructureKind.Class:
            declaration.methods
              .filter(method => !method.scope || method.scope === 'public') // public methods
              .forEach(method => {
                functionsNames.add(method.name);
              });
            break;
        }
      });
    }
  }
  const canonicalNames = [...functionsNames].map(fnsName => fnsName.replace(/_|\d*$/g, '').toUpperCase());

  const confusingNames = canonicalNames
    .filter((canonicalName, i) => canonicalNames.filter((cN, j) => i !== j && cN === canonicalName).length);

  return {
    metric: 'AMNCI',
    usabilityResult: {
      index: 1 - safeDiv(confusingNames.length, canonicalNames.length)
    }
  }
}