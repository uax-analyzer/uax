import { Node, SyntaxKind } from "ts-morph";
import { safeDiv, normalizeType, createTmpFile, checkTypeEquality, isPublic } from "./util.js";

const g = (maxParamNumber, paramNumber) =>
  paramNumber >= maxParamNumber ? Math.exp(maxParamNumber - paramNumber) : 1;

const spt = declaration => {
  const sequence = [];
  const structure = declaration.getStructure();

  let parameters = structure.parameters
    ?.map(param => param.type || param.initializer || 'any')
    ?.map(type => normalizeType(declaration, type));
  if (parameters) {
    const tmpFile = createTmpFile(declaration.getSourceFile())
    const isEqualType = checkTypeEquality(tmpFile);
    for (let i = 0; i < parameters.length - 1; i++) {
      if (isEqualType(parameters[i], parameters[i + 1])) {
        sequence.push(parameters[i]);
      }
    }
    tmpFile.delete();
  }

  return sequence;
}

const h = declaration => {
  const paramNumber = declaration.getParameters()?.length || 0;

  return paramNumber > 1 ? 1 - safeDiv(spt(declaration).length, paramNumber - 1) : 1;
}

/* const compParamLengthComplexity = (maxParamNumber, ...paramNumbers) =>
  safeDiv(paramNumbers.map(paramNumber => g(maxParamNumber, paramNumber)).reduce((prev, curr) => prev + curr, 0), paramNumbers.length);

const compParamSequenceComplexity = (...declarations) =>
  safeDiv(declarations.map(h).reduce((prev, curr) => prev + curr, 0), declarations.length); */

const reduceComplexities = (complexities) =>
  safeDiv(complexities.reduce((prev, curr) => prev + curr, 0), complexities.length);

const calculateAPXI = (cl, cs) => safeDiv(cl + cs, 2);

const analyseFunction = maxParamNumber => declaration => {
  let paramNumber = declaration.getParameters()?.length || 0;
  const paramLengthComplexity = g(maxParamNumber, paramNumber);
  const paramSequenceComplexity = h(declaration);

  return {
    index: calculateAPXI(paramLengthComplexity, paramSequenceComplexity),
    paramLengthComplexity,
    paramSequenceComplexity
  };
}

const prepareResult = results => (modulePath, name, kind, result, source) => {
  if (!results.has(modulePath)) {
    results.set(modulePath, new Map());
  }
  const constructResults = results.get(modulePath);

  switch (kind) {
    case SyntaxKind.FunctionDeclaration:
      constructResults.set(name, {
        name,
        kind,
        result,
        source
      });
      break;
    case SyntaxKind.ClassDeclaration:
      if (!constructResults.has(name)) {
        constructResults.set(name, {
          name,
          kind,
          result: null,
          sources: []
        });
      }
      const classResult = constructResults.get(name);
      classResult.sources
        .push({ name: source.getName(), kind: source.getKind(), result, source });
      break;
  }
}

/**
 * Calculates the API Parameter List Complexity Index (APXI) metric
 */
export async function computeAPXI(modules, maxParamNumber = 4) {
  let results = new Map();
  const produceResult = prepareResult(results);
  const analyseFnWithMaxParamNumber = analyseFunction(maxParamNumber);

  for (let [module, value] of modules.entries()) {
    for (let [name, declarations] of value.entries()) {
      declarations.forEach((declaration) => {
        if (Node.isFunctionDeclaration(declaration)) {
          const index = analyseFnWithMaxParamNumber(declaration);

          produceResult(module, name, declaration.getKind(), index, declaration);
        } else if (Node.isClassDeclaration(declaration)) {
          declaration.getInstanceMethods().concat(declaration.getStaticMethods())
            ?.forEach(method => {
              if (isPublic(method)) {
                const index = analyseFnWithMaxParamNumber(method);
                produceResult(module, name, declaration.getKind(), index, method);
              }
            });

          // calculate the metric for the class
          const constructResults = results.get(module);
          if (constructResults?.has(name)) {
            const classResult = constructResults.get(name);
            const paramLengthComplexities = classResult.sources.map(source => source.result.paramLengthComplexity) || [];
            const paramSequenceComplexities = classResult.sources.map(source => source.result.paramSequenceComplexity) || [];
            const paramLengthComplexity = reduceComplexities(paramLengthComplexities);
            const paramSequenceComplexity = reduceComplexities(paramSequenceComplexities);

            classResult.result = {
              index: calculateAPXI(paramLengthComplexity, paramSequenceComplexity),
              paramLengthComplexity,
              paramSequenceComplexity
            };
          }
        }
      });
    }
  }
  // calculates the metric for the module
  for (const [moduleName, moduleResult] of results) {
    const moduleResultValues = [...moduleResult.values()];
    const paramLengthComplexities = moduleResultValues.map(source => source.result.paramLengthComplexity) || [];
    const paramSequenceComplexities = moduleResultValues.map(source => source.result.paramSequenceComplexity) || [];

    const paramLengthComplexity = reduceComplexities(paramLengthComplexities);
    const paramSequenceComplexity = reduceComplexities(paramSequenceComplexities);

    results.set(moduleName, {
      module: moduleResult,
      result: {
        index: calculateAPXI(paramLengthComplexity, paramSequenceComplexity),
        paramLengthComplexity,
        paramSequenceComplexity
      }
    });
  }
  const modulesResults = [...results.values()];
  // calculate the metrics for all the modules
  const paramLengthComplexities = modulesResults.map(moduleResult => moduleResult.result.paramLengthComplexity) || [];
  const paramSequenceComplexities = modulesResults.map(moduleResult => moduleResult.result.paramSequenceComplexity) || [];

  const paramLengthComplexity = reduceComplexities(paramLengthComplexities);
  const paramSequenceComplexity = reduceComplexities(paramSequenceComplexities);

  results = {
    metric: 'APXI',
    index: calculateAPXI(paramLengthComplexity, paramSequenceComplexity),
    modules: results
  }

  return results;
}