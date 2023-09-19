import { Project, StructureKind } from "ts-morph";
import { safeDiv, createTmpFile, normalizeType, ERROR_CODE, ERROR_MESSAGE } from "../../utils.js";
import _ from 'lodash';
import os from 'os';
import ManyKeysMap from 'many-keys-map';
import path from 'path';

let project;

const calculateAMNOI = (returnTypesSetCardinality, OverloadCardinality) =>
  1 - safeDiv(returnTypesSetCardinality - 1, OverloadCardinality - 1);

function typeSet(modulePath, types, pathToProperty) {
  const sourceFile = project.getSourceFile(path.resolve(project.getCompilerOptions().configFilePath, modulePath));
  const tmpSourceFile = createTmpFile(sourceFile);

  const getter = pathToProperty ? _fp.get(pathToProperty) : _.identity;

  const equalityChecking = new Map();
  const manyKeysMap = new ManyKeysMap();
  for (let i = 0; i < types.length; i++) {
    for (let j = 0; j < types.length; j++) {
      let [a, b] =
        [getter(types[i]), getter(types[j])];

      //no need to proceed if any type is of type any
      if (a !== 'any' && b !== 'any') {
        let endPos = tmpSourceFile.getEnd();
        tmpSourceFile.insertText(endPos,
          `assertType.isTrue(true as CanAssign<${a + ',' + b}>);` +
          `assertType.isTrue(true as CanAssign<${b + ',' + a}>);` + os.EOL);

        equalityChecking.set(tmpSourceFile.getLineAndColumnAtPos(endPos + 1).line, { a, b });
      }
      manyKeysMap.set([a, b], true);
    }
  }

  const sourceFileDiagnostics =
    tmpSourceFile.getPreEmitDiagnostics()
      .filter(diag => diag.getCode() === ERROR_CODE && diag.getMessageText() == ERROR_MESSAGE);

  sourceFileDiagnostics.forEach(diagnostic => {
    const lineNumber = diagnostic.getLineNumber();

    const notEqualTypes = equalityChecking.get(lineNumber)
    manyKeysMap.set([notEqualTypes.a, notEqualTypes.b], false);
  });

  tmpSourceFile.delete();

  return _.uniqWith(types, (typeA, typeB) => manyKeysMap.get([typeA, typeB]));
}

const analyseFunction = (modulePath, declaration) => {
  const overloads = declaration.overloads;

  const returnTypes =
    overloads
      .map(overload => overload.returnType || 'undefined')
      .map((returnType, i) => normalizeType(overloads[i], returnType));
  const returnTypesSet = typeSet(modulePath, returnTypes);

  return calculateAMNOI(returnTypesSet.length, overloads.length);
}

const prepareResult = results => ({ modulePath, name, kind, methodName, analysisResults }) => {
  if (!results.has(modulePath)) {
    results.set(modulePath, new Map());
  }
  const constructResults = results.get(modulePath);
  let indexes;

  switch (kind) {
    case StructureKind.Function:
      indexes = analysisResults.reduce((prev, curr) => prev + curr.index, 0);

      constructResults.set(name, {
        kind,
        analysisResult: {
          index: safeDiv(indexes, analysisResults.length)
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

      indexes = analysisResults.reduce((prev, curr) => prev + curr.index, 0);

      classResult.methods.push({
        methodName,
        analysisResult: {
          index: safeDiv(indexes, analysisResults.length)
        },
        sources: analysisResults
      });
      break;
  }
}

export default function computeAMNOI({ configFilePath, chunkedModule }) {
  let results = new Map();
  const produceResult = prepareResult(results);

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
              /* const analysisResults = declaration.overloads.map(functionOverload =>
                ({ source: functionOverload, analysisResult: analyseFunction(modulePath, functionOverload) })); */

              const analysisResults = [{ source: declaration.overloads, index: analyseFunction(modulePath, declaration) }];
              produceResult({ modulePath, name, kind: declaration.kind, analysisResults });

            }
            break;
          case StructureKind.Class:
            declaration.methods
              .filter(method => !method.scope || method.scope === 'public')
              .forEach(method => {
                if (method.overloads.length > 0) {
                  /* const analysisResults = method.overloads.map(methodOverload => {
                    methodOverload.classStructure = declaration; //stores a ref to the class (parent) structure
                    return { source: methodOverload, analysisResult: analyseFunction(modulePath, methodOverload) };
                  }); */
                  method.overloads.forEach(methodOverload => {
                    methodOverload.classStructure = declaration; //stores a ref to the class (parent) structure
                  });
                  const analysisResults = [{ source: method.overloads, index: analyseFunction(modulePath, method) }];
                  produceResult({ modulePath, name, kind: declaration.kind, methodName: method.name, analysisResults });
                }
              });
            // calculate the metric for the class
            const constructResults = results.get(modulePath);
            if (constructResults?.has(name)) {
              const classResult = constructResults.get(name);

              let indexes = 0;
              for (let method of classResult.methods) {
                indexes += method.analysisResult.index;
              }

              classResult.analysisResult = {
                index: safeDiv(indexes, classResult.methods.size)
              };
            }
            break;
        }
      });
    }
  }
  // calculates the metric for the module
  for (const [modulePath, moduleResult] of results) {
    let indexes = 0;
    for (let moduleResultValue of moduleResult.values()) {
      indexes += moduleResultValue.analysisResult.index;
    }

    results.set(modulePath, {
      module: moduleResult,
      analysisResult: {
        index: safeDiv(indexes, moduleResult.size)
      }
    });
  }

  return results;
}