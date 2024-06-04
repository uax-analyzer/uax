import { Project, StructureKind } from "ts-morph";
import { safeDiv, createTmpFile, normalizeType, setModuleIfNotSet, ERROR_CODE, ERROR_MESSAGE, Kind } from "../../utils.js";
import _ from 'lodash';
import os from 'os';
import path from 'path';

let tsProject;

function analyzeSequence(modulePath, parameters, pathToProperty) {
  const sourceFile = tsProject.getSourceFile(path.resolve(tsProject.getCompilerOptions().configFilePath, modulePath));
  const tmpSourceFile = createTmpFile(sourceFile);

  const getter = pathToProperty ? _fp.get(pathToProperty) : _.identity;

  const equalityChecking = new Map();
  const sequence = [];

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
      // only `a´ must be stored in accordance with the prescription of the metric
      equalityChecking.set(tmpSourceFile.getLineAndColumnAtPos(endPos + 1).line, a);
    }
  }

  const sourceFileDiagnostics =
    tmpSourceFile.getPreEmitDiagnostics()
      .filter(diag => diag.getCode() === ERROR_CODE && diag.getMessageText() == ERROR_MESSAGE);

  sourceFileDiagnostics.forEach(diagnostic => {
    const lineNumber = diagnostic.getLineNumber();

    equalityChecking.delete(lineNumber);
  });

  tmpSourceFile.delete();

  return sequence.concat([...equalityChecking.values()]);
}

const g = (maxParamNumber, paramNumber) =>
  paramNumber >= maxParamNumber ? Math.exp(maxParamNumber - paramNumber) : 1;

const spt = (modulePath, declaration) => {

  const parameters = declaration.parameters
    ?.map(param => param.type || param.initializer || 'any')
    ?.map(type => normalizeType(declaration, type));

  // sequence
  return parameters ? analyzeSequence(modulePath, parameters) : [];
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
    score: calculateAPXI(paramLengthComplexity, paramSequenceComplexity),
    paramLengthComplexity,
    paramSequenceComplexity
  };
}

const prepareFunctionResult = results => (modulePath, name, kind, analysisResults, className) => {
  const moduleResult = results[modulePath];

  const paramLengthComplexities = [], paramSequenceComplexities = [];
  for (let { usabilityResult } of analysisResults) {
    paramLengthComplexities.push(usabilityResult.paramLengthComplexity);
    paramSequenceComplexities.push(usabilityResult.paramSequenceComplexity);
  }

  const paramLengthComplexity = reduceComplexities(paramLengthComplexities);
  const paramSequenceComplexity = reduceComplexities(paramSequenceComplexities);

  let functionResultId;
  if (className) {
    functionResultId = className + '.' + name;
    moduleResult[functionResultId] = { className };
  } else {
    functionResultId = name;
    moduleResult[functionResultId] = {};
  }

  moduleResult[functionResultId] = Object.assign({
    kind,
    name,
    usability: {
      paramLengthComplexity, paramSequenceComplexity,
      score: calculateAPXI(paramLengthComplexity, paramSequenceComplexity)
    },
    sources: analysisResults
  }, moduleResult[functionResultId]);
}

/**
 * Calculates the API Parameter List Complexity Index (APXI) metric
 */
export default function computeAPXI({ configFilePath, chunkedModule, maxParamNumber = 4 }) {
  let results = {};
  const produceFunctionResult = prepareFunctionResult(results);
  const analyseFnWithMaxParamNumber = analyseFunction(maxParamNumber);

  //reconstruct project
  tsProject = new Project({
    tsConfigFilePath: configFilePath
  });

  let analysisResults;

  // chunkedModule: array of key(string), value (Map)
  for (const [modulePath, mapDeclarations] of chunkedModule) {
    for (const [name, declarations] of mapDeclarations) {
      if (declarations.some(declaration => declaration.kind === StructureKind.Function || StructureKind.Class)) {
        setModuleIfNotSet(results, modulePath);

        declarations.forEach((declaration) => {
          switch (declaration.kind) {
            case StructureKind.Function:
              // if there's an implementation, only consider the overloads since the
              // implementation is not available to the outside world
              if (declaration.overloads.length > 0) {
                analysisResults = declaration.overloads.map(functionOverload =>
                  ({ source: functionOverload, usabilityResult: analyseFnWithMaxParamNumber(modulePath, functionOverload) }));
              } else {
                analysisResults = [{ source: declaration, usabilityResult: analyseFnWithMaxParamNumber(modulePath, declaration) }];
              }
              produceFunctionResult(modulePath, name, Kind.FUNCTION, analysisResults);

              break;
            case StructureKind.Class:
              declaration.methods
                .filter(method => !method.scope || method.scope === 'public') // public methods
                .forEach(method => {

                  if (method.overloads.length > 0) {
                    analysisResults = method.overloads.map(methodOverload => {
                      const classStructure = { ...declaration };
                      delete classStructure.methods; // avoids circular ref
                      methodOverload.classStructure = classStructure; //stores a ref to the class (parent) structure
                      return { source: methodOverload, usabilityResult: analyseFnWithMaxParamNumber(modulePath, methodOverload) };
                    });
                  } else {
                    const classStructure = { ...declaration };
                    delete classStructure.methods; // avoids circular ref
                    method.classStructure = classStructure; //stores a ref to the class (parent) structure

                    analysisResults = [{ source: method, usabilityResult: analyseFnWithMaxParamNumber(modulePath, method) }];
                  }
                  produceFunctionResult(modulePath, method.name, Kind.CLASS_METHOD, analysisResults, name);
                });
              break;
          }
        });
      }
    }
    // calculates the metric for the module
    if (results[modulePath]) {
      const paramLengthComplexities = [], paramSequenceComplexities = [];
      for (const { usability } of Object.values(results[modulePath])) {
        paramLengthComplexities.push(usability.paramLengthComplexity);
        paramSequenceComplexities.push(usability.paramSequenceComplexity);
      }
      const paramLengthComplexity = reduceComplexities(paramLengthComplexities);
      const paramSequenceComplexity = reduceComplexities(paramSequenceComplexities);

      results[modulePath] = {
        moduleComponents: results[modulePath],
        usability: {
          score: calculateAPXI(paramLengthComplexity, paramSequenceComplexity),
          paramLengthComplexity,
          paramSequenceComplexity
        }
      };
    }
  }

  return results;
}