import { Project, StructureKind } from "ts-morph";
import { safeDiv, createTmpFile, ERROR_CODE, ERROR_MESSAGE } from "../util.js";
import { normalizeType } from './util.js';
import _ from 'lodash';
import os from 'os';

let project;

function analyzeSequence(module, parameters, path) {
  /* const project = new Project();
  project.addSourceFileAtPath(sourceFilePath);
  project.resolveSourceFileDependencies(); */
  let sourceFile = project.getSourceFile(module);
  const tmpSourceFile = createTmpFile(sourceFile);

  const getter = path ? _fp.get(path) : _.identity;

  const visited = new Map();
  let sequence = [];

  for (let i = 0; i < parameters.length - 1; i++) {

    let [a, b] =
      [getter(parameters[i]), getter(parameters[i + 1])];
    //console.log(a, b);
    if (a === 'any' || b === 'any') {
      sequence.push(a);
    } else {
      let endPos = tmpSourceFile.getEnd();
      tmpSourceFile.insertText(endPos,
        `assertType.isTrue(true as CanAssign<${a + ',' + b}>);` +
        `assertType.isTrue(true as CanAssign<${b + ',' + a}>);` + os.EOL);

      visited.set(tmpSourceFile.getLineAndColumnAtPos(endPos + 1).line, { isEqual: true, a });
    }
  }

  let sourceFileDiagnostics = tmpSourceFile.getPreEmitDiagnostics();
  sourceFileDiagnostics = sourceFileDiagnostics
    .filter(diag => diag.getCode() === ERROR_CODE && diag.getMessageText() == ERROR_MESSAGE);

  sourceFileDiagnostics.forEach(diagnostic => {
    const lineNumber = diagnostic.getLineNumber();

    let test = visited.get(lineNumber);
    test.isEqual = false;
  });

  tmpSourceFile.delete();

  for (let value of visited.values()) {
    if (value.isEqual) {
      sequence.push(value.a);
    }
  }

  return sequence;
}

const g = (maxParamNumber, paramNumber) =>
  paramNumber >= maxParamNumber ? Math.exp(maxParamNumber - paramNumber) : 1;

const spt = (module, declaration) => {
  let sequence = [];

  let parameters = declaration.parameters
    ?.map(param => param.type || param.initializer || 'any')
    ?.map(type => normalizeType(declaration, type));
  if (parameters) {
    /* const tmpFile = createTmpFile(declaration.getSourceFile())
    const isEqualType = checkTypeEquality(tmpFile);
    for (let i = 0; i < parameters.length - 1; i++) {
      if (isEqualType(parameters[i], parameters[i + 1])) {
        sequence.push(parameters[i]);
      }
    }
    tmpFile.delete(); */
    sequence = analyzeSequence(module, parameters);
  }

  return sequence;
}

const h = (module, declaration) => {
  const paramNumber = declaration?.parameters?.length || 0;

  return paramNumber > 1 ? 1 - safeDiv(spt(module, declaration).length, paramNumber - 1) : 1;
}

/* const compParamLengthComplexity = (maxParamNumber, ...paramNumbers) =>
  safeDiv(paramNumbers.map(paramNumber => g(maxParamNumber, paramNumber)).reduce((prev, curr) => prev + curr, 0), paramNumbers.length);

const compParamSequenceComplexity = (...declarations) =>
  safeDiv(declarations.map(h).reduce((prev, curr) => prev + curr, 0), declarations.length); */

const reduceComplexities = (complexities) =>
  safeDiv(complexities.reduce((prev, curr) => prev + curr, 0), complexities.length);

const calculateAPXI = (cl, cs) => safeDiv(cl + cs, 2);

const analyseFunction = maxParamNumber => (module, declaration) => {
  let paramNumber = declaration?.parameters?.length || 0;
  const paramLengthComplexity = g(maxParamNumber, paramNumber);
  const paramSequenceComplexity = h(module, declaration);

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
    case StructureKind.Function:
      constructResults.set(name, {
        name,
        kind,
        result,
        source
      });
      break;
    case StructureKind.Class:
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
        .push({ name: source.name, kind: source.kind, result, source });
      break;
  }
}

/**
 * Calculates the API Parameter List Complexity Index (APXI) metric
 */
export default function computeAPXI({ configFilePath, chunkedModule, maxParamNumber = 4 }) {
  let results = new Map();
  const produceResult = prepareResult(results);
  const analyseFnWithMaxParamNumber = analyseFunction(maxParamNumber);

  //reconstruct project
  project = new Project({
    tsConfigFilePath: configFilePath
  });

  for (let [module, value] of chunkedModule) {
    for (let [name, declarations] of value) {
      declarations.forEach((declaration) => {
        switch (declaration.kind) {
          case StructureKind.Function:
            const index = analyseFnWithMaxParamNumber(module, declaration);

            produceResult(module, name, declaration.kind, index, declaration);
            break;
          case StructureKind.Class:
            declaration.methods.forEach(method => {
              if (!method.scope || method.scope === 'public') {
                method.classStructure = declaration;
                const index = analyseFnWithMaxParamNumber(module, method);
                produceResult(module, name, declaration.kind, index, method);
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
            break;
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
  /* const modulesResults = [...results.values()];
  // calculate the metrics for all the modules
  const paramLengthComplexities = modulesResults.map(moduleResult => moduleResult.result.paramLengthComplexity) || [];
  const paramSequenceComplexities = modulesResults.map(moduleResult => moduleResult.result.paramSequenceComplexity) || [];

  const paramLengthComplexity = reduceComplexities(paramLengthComplexities);
  const paramSequenceComplexity = reduceComplexities(paramSequenceComplexities);

  results = {
    metric: 'APXI',
    index: calculateAPXI(paramLengthComplexity, paramSequenceComplexity),
    modules: results
  } */

  return results;
}