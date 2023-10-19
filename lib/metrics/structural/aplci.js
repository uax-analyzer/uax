import { StructureKind } from "ts-morph";
import ManyKeysMap from 'many-keys-map';
import { safeDiv } from "./utils.js";

/**
 * Calculates the API Parameter List Consistency Index (APLCI) metric
 */
export default async function computeAPLCI() {
  const parametersName = new Set();
  const functionsDeclarations = [];
  for (let [modulePath, mapDeclarations] of this.modules) {
    for (let [name, declarations] of mapDeclarations) {
      declarations.forEach((declaration) => {
        switch (declaration.kind) {
          case StructureKind.Function:
            if (declaration.overloads.length > 0) {
              declaration.overloads.forEach(overload => {
                overload.parameters.map(param => param.name).forEach(parametersName.add, parametersName);
                overload.functionName = name;
                overload.modulePath = modulePath;
                functionsDeclarations.push(overload);
              });
            } else {
              declaration.parameters.map(param => param.name).forEach(parametersName.add, parametersName);
              declaration.functionName = name;
              declaration.modulePath = modulePath;
              functionsDeclarations.push(declaration);
            }
            break;
          case StructureKind.Class:
            declaration.methods
              .filter(method => !method.scope || method.scope === 'public') // public methods
              .forEach(method => {
                if (method.overloads.length > 0) {
                  method.overloads.forEach(methodOverload => {
                    methodOverload.parameters.map(param => param.name).forEach(parametersName.add, parametersName);
                    methodOverload.declarationInfo = {
                      className: name,
                      modulePath
                    }
                    functionsDeclarations.push(methodOverload);
                  });
                } else {
                  method.parameters.map(param => param.name).forEach(parametersName.add, parametersName);
                  method.declarationInfo = {
                    className: name,
                    modulePath
                  }
                  functionsDeclarations.push(method);
                }
              });
            break;
        }
      });
    }
  }
  // based on https://stackoverflow.com/a/54264289
  let paramPairs = [...parametersName].sort().reduce(
    (acc, item, i, arr) => acc.concat(
      arr.slice(i + 1).map(_item => [item, _item])
    ),
    []);

  let mapping = new ManyKeysMap();
  for (const pair of paramPairs) {
    let orderIJ = [];
    let orderJI = [];
    functionsDeclarations.forEach(fnDec => {
      let parametersNames = fnDec.parameters.map(param => param.name);
      let index1 = parametersNames.indexOf(pair[0]);
      let index2 = parametersNames.indexOf(pair[1]);
      if (index1 !== -1 && index2 !== -1) {
        if (index1 < index2) {
          orderIJ.push(fnDec);
        } else {
          orderJI.push(fnDec);
        }
      }
    });
    mapping.set(pair, [orderIJ, orderJI]);
  }

  let greaterThan2 = 0;
  let consistent = 0;
  for (let [_, decs] of mapping) {
    if (decs[0].length + decs[1].length >= 2) {
      greaterThan2++;
      if (decs[0].length === 0 || decs[1].length === 0) {
        consistent++;
      }
    }
  }

  return safeDiv(consistent, greaterThan2);
}