import { Node, SyntaxKind } from "ts-morph";
import _ from 'lodash';
import { returns, typeSet, safeDiv, hasOverload, isPublic } from "./util.js";

const calculateAMNOI = (returnTypesSetCardinality, OverloadCardinality) =>
  1 - safeDiv(returnTypesSetCardinality - 1, OverloadCardinality - 1);

const analyseFunction = declaration => {
  const overloads = declaration.getOverloads();
  const returnTypes = returns(overloads);
  const returnTypesSet =
    typeSet(declaration.getSourceFile(),
      _.zipWith(overloads, returnTypes, (declaration, returnType) => {
        return { declaration, returnType };
      }));

  return calculateAMNOI(returnTypesSet.length, overloads.length);
}

const prepareResult = results => (modulePath, name, kind, index, sources) => {
  if (!results.has(modulePath)) {
    results.set(modulePath, new Map());
  }
  const constructResults = results.get(modulePath);

  switch (kind) {
    case SyntaxKind.FunctionDeclaration:
      constructResults.set(name, {
        name,
        kind,
        index,
        sources
      });
      break;
    case SyntaxKind.ClassDeclaration:
      if (!constructResults.has(name)) {
        constructResults.set(name, {
          name,
          kind,
          index: 0,
          sources: []
        });
      }
      const classResult = constructResults.get(name);
      classResult.sources
        .push({ name: sources[0].getName(), kind: sources[0].getKind(), index, sources });
      break;
  }
}

/**
 * Computes the API Method Name Overload Index (AMNOI) metric
 */
export async function computeAMNOI(modules) {
  let results = new Map();
  const produceResult = prepareResult(results);

  for (let [module, value] of modules.entries()) {
    for (let [name, declarations] of value.entries()) {
      declarations.forEach((declaration) => {
        if (Node.isFunctionDeclaration(declaration)) {
          if (declaration.isImplementation() && hasOverload(declaration)) {
            const index = analyseFunction(declaration);
            produceResult(module, name, declaration.getKind(), index, declaration.getOverloads());
          }
        } else if (Node.isClassDeclaration(declaration)) {
          declaration.getInstanceMethods().concat(declaration.getStaticMethods())
            .forEach(method => {
              if (isPublic(method) && method.isImplementation() && hasOverload(method)) {
                const index = analyseFunction(method);
                produceResult(module, name, declaration.getKind(), index, method.getOverloads());
              }
            });
          // calculate the metric for the class
          const constructResults = results.get(module);
          if (constructResults?.has(name)) {
            const classResult = constructResults.get(name);
            const index = classResult.sources.reduce((prev, curr) => prev + curr.index, 0);
            classResult.index = safeDiv(index, classResult.sources.length);
          }
        }
      });
    }
  }
  // calculates the metric for the module
  for (const [moduleName, moduleResult] of results) {
    results.set(moduleName, {
      module: moduleResult,
      index:
        safeDiv([...moduleResult.values()].reduce((prev, curr) => prev + curr.index, 0), moduleResult.size)
    });
  }
  // calculate the metrics for all the modules
  results = {
    index:
      safeDiv([...results.values()].reduce((prev, curr) => prev + curr.index, 0), results.size),
    modules: results
  };
  return results;
}
