import { Project, StructureKind } from "ts-morph";
import { safeDiv, createTmpFile, normalizeType, ERROR_CODE, ERROR_MESSAGE } from "../../utils.js";
import _ from 'lodash';
import os from 'os';
import path from 'path';

let project;

function analyzeSequence(modulePath, parameters, pathToProperty) {
  let sourceFile = project.getSourceFile(path.resolve(project.getCompilerOptions().configFilePath, modulePath));
  const tmpSourceFile = createTmpFile(sourceFile);

  const getter = pathToProperty ? _fp.get(pathToProperty) : _.identity;

  const visited = new Map();
  let sequence = [];

  for (let i = 0; i < parameters.length - 1; i++) {

    let [a, b] =
      [getter(parameters[i]), getter(parameters[i + 1])];
    //no need to proceed if any type is of type any
    if (a === 'any' || b === 'any') {
      sequence.push(a);
    } else {
      let endPos = tmpSourceFile.getEnd();
      tmpSourceFile.insertText(endPos,
        `assertType.isTrue(true as CanAssign<${a + ',' + b}>);` +
        `assertType.isTrue(true as CanAssign<${b + ',' + a}>);` + os.EOL);

      visited.set(tmpSourceFile.getLineAndColumnAtPos(endPos + 1).line, a);
    }
  }

  let sourceFileDiagnostics = tmpSourceFile.getPreEmitDiagnostics();
  sourceFileDiagnostics = sourceFileDiagnostics
    .filter(diag => diag.getCode() === ERROR_CODE && diag.getMessageText() == ERROR_MESSAGE);

  sourceFileDiagnostics.forEach(diagnostic => {
    const lineNumber = diagnostic.getLineNumber();

    visited.delete(lineNumber);
  });

  tmpSourceFile.delete();

  //return sequence;
  return sequence.concat([...visited.values()]);
}

const g = (maxParamNumber, paramNumber) =>
  paramNumber >= maxParamNumber ? Math.exp(maxParamNumber - paramNumber) : 1;

const spt = (modulePath, declaration) => {
  let sequence = [];

  let parameters = declaration.parameters
    ?.map(param => param.type || param.initializer || 'any')
    ?.map(type => normalizeType(declaration, type));
  if (parameters) {
    sequence = analyzeSequence(modulePath, parameters);
  }

  return sequence;
}

const h = (modulePath, declaration) => {
  const paramNumber = declaration?.parameters?.length || 0;

  return paramNumber > 1 ? 1 - safeDiv(spt(modulePath, declaration).length, paramNumber - 1) : 1;
}

/* const compParamLengthComplexity = (maxParamNumber, ...paramNumbers) =>
  safeDiv(paramNumbers.map(paramNumber => g(maxParamNumber, paramNumber)).reduce((prev, curr) => prev + curr, 0), paramNumbers.length);

const compParamSequenceComplexity = (...declarations) =>
  safeDiv(declarations.map(h).reduce((prev, curr) => prev + curr, 0), declarations.length); */

const reduceComplexities = (complexities) =>
  safeDiv(complexities.reduce((prev, curr) => prev + curr, 0), complexities.length);

const calculateAPXI = (cl, cs) => safeDiv(cl + cs, 2);

const analyseFunction = maxParamNumber => (modulePath, declaration) => {
  let paramNumber = declaration?.parameters?.length || 0;
  const paramLengthComplexity = g(maxParamNumber, paramNumber);
  const paramSequenceComplexity = h(modulePath, declaration);

  return {
    index: calculateAPXI(paramLengthComplexity, paramSequenceComplexity),
    paramLengthComplexity,
    paramSequenceComplexity
  };
}

const prepareResult = results => ({ modulePath, name, kind, methodName, analysisResults }) => {
  if (!results.has(modulePath)) {
    results.set(modulePath, new Map());
  }
  const constructResults = results.get(modulePath);
  let paramLengthComplexities, paramSequenceComplexities, paramLengthComplexity, paramSequenceComplexity;

  switch (kind) {
    case StructureKind.Function:
      paramLengthComplexities = analysisResults.map(res => res.analysisResult.paramLengthComplexity);
      paramSequenceComplexities = analysisResults.map(res => res.analysisResult.paramSequenceComplexity);

      paramLengthComplexity = reduceComplexities(paramLengthComplexities);
      paramSequenceComplexity = reduceComplexities(paramSequenceComplexities);

      constructResults.set(name, {
        kind,
        analysisResult: {
          paramLengthComplexity, paramSequenceComplexity,
          index: calculateAPXI(paramLengthComplexity, paramSequenceComplexity)
        },
        sources: analysisResults
      });
      break;
    case StructureKind.Class:
      if (!constructResults.has(name)) { // check if the class was already set
        constructResults.set(name, {
          kind,
          analysisResult: null, // to be set after all methods results have been processed
          methods: []
        });
      }
      const classResult = constructResults.get(name);
      paramLengthComplexities = analysisResults.map(res => res.analysisResult.paramLengthComplexity);
      paramSequenceComplexities = analysisResults.map(res => res.analysisResult.paramSequenceComplexity);

      paramLengthComplexity = reduceComplexities(paramLengthComplexities);
      paramSequenceComplexity = reduceComplexities(paramSequenceComplexities);

      classResult.methods.push({
        methodName,
        analysisResult: {
          paramLengthComplexity, paramSequenceComplexity,
          index: calculateAPXI(paramLengthComplexity, paramSequenceComplexity)
        },
        sources: analysisResults
      });
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

  // chunkedModule: array of key(string), value (Map)
  for (let [modulePath, mapDeclarations] of chunkedModule) {
    for (let [name, declarations] of mapDeclarations) {
      declarations.forEach((declaration) => {
        switch (declaration.kind) {
          case StructureKind.Function:
            // if there's an implementation, only consider the overloads since the
            // implementation is not available to the outside world
            if (declaration.overloads.length > 0) {
              const analysisResults = declaration.overloads.map(functionOverload =>
                ({ source: functionOverload, analysisResult: analyseFnWithMaxParamNumber(modulePath, functionOverload) }));
              produceResult({ modulePath, name, kind: declaration.kind, analysisResults });

            } else {
              const analysisResult = analyseFnWithMaxParamNumber(modulePath, declaration);

              produceResult({ modulePath, name, kind: declaration.kind, analysisResults: [{ source: declaration, analysisResult }] });
            }
            break;
          case StructureKind.Class:
            declaration.methods
              .filter(method => !method.scope || method.scope === 'public')
              .forEach(method => {
                if (method.overloads.length > 0) {
                  const analysisResults = method.overloads.map(methodOverload => {
                    methodOverload.classStructure = declaration; //stores a ref to the class (parent) structure
                    return { source: methodOverload, analysisResult: analyseFnWithMaxParamNumber(modulePath, methodOverload) };
                  });
                  produceResult({ modulePath, name, kind: declaration.kind, methodName: method.name, analysisResults });
                } else {
                  method.classStructure = declaration; //stores a ref to the class (parent) structure

                  const analysisResult = analyseFnWithMaxParamNumber(modulePath, method);
                  produceResult({ modulePath, name, kind: declaration.kind, analysisResults: [{ source: method, analysisResult }] });
                }
              });
            // calculate the metric for the class
            const constructResults = results.get(modulePath);
            if (constructResults?.has(name)) {
              const classResult = constructResults.get(name);

              const paramLengthComplexities = [], paramSequenceComplexities = [];
              for (let method of classResult.methods) {
                paramLengthComplexities.push(method.analysisResult.paramLengthComplexity);
                paramSequenceComplexities.push(method.analysisResult.paramSequenceComplexity);
              }

              const paramLengthComplexity = reduceComplexities(paramLengthComplexities);
              const paramSequenceComplexity = reduceComplexities(paramSequenceComplexities);

              classResult.analysisResult = {
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
  for (const [modulePath, moduleResult] of results) {
    const paramLengthComplexities = [], paramSequenceComplexities = [];
    for (let moduleResultValue of moduleResult.values()) {
      paramLengthComplexities.push(moduleResultValue.analysisResult.paramLengthComplexity);
      paramSequenceComplexities.push(moduleResultValue.analysisResult.paramSequenceComplexity);
    }

    const paramLengthComplexity = reduceComplexities(paramLengthComplexities);
    const paramSequenceComplexity = reduceComplexities(paramSequenceComplexities);

    results.set(modulePath, {
      module: moduleResult,
      analysisResult: {
        index: calculateAPXI(paramLengthComplexity, paramSequenceComplexity),
        paramLengthComplexity,
        paramSequenceComplexity
      }
    });
  }

  return results;
}