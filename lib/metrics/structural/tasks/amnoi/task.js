import { Project, StructureKind } from "ts-morph";
import { safeDiv, createTmpFile, normalizeType, setModuleIfNotSet, ERROR_CODE, ERROR_MESSAGE } from "../../utils.js";
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

const prepareFunctionResult = results => (modulePath, name, kind, analysisResults) => {
  setModuleIfNotSet(results, modulePath);
  const moduleResult = results[modulePath];
  moduleResult[name] = {
    kind,
    usabilityResult: {
      index: analysisResults.index
    },
    sources: analysisResults.sources
  };
}

const prepareMethodResult = results => (modulePath, name, kind, methodName, analysisResults) => {
  setModuleIfNotSet(results, modulePath);
  const moduleResult = results[modulePath];
  if (!moduleResult.hasOwnProperty(name)) { // check if the class was already set
    moduleResult[name] = {
      kind,
      usabilityResult: null, // to be set after all methods results have been processed
      methods: []
    };
  }
  const classResult = moduleResult[name];

  classResult.methods.push({
    methodName,
    usabilityResult: {
      index: analysisResults.index
    },
    sources: analysisResults.sources
  });
}

// populate the functions, responsible to record the info of the analyzed construct, with the results objects
// then, return the prepopulated functions as an array
const prepareResult = results => [prepareFunctionResult(results), prepareMethodResult(results)];

export default function computeAMNOI({ configFilePath, chunkedModule }) {
  let results = {};
  const [produceFunctionResult, produceMethodResult] = prepareResult(results);

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
              produceFunctionResult(modulePath, name, declaration.kind,
                { sources: declaration.overloads, index: analyseFunction(modulePath, declaration) });
            }
            break;
          case StructureKind.Class:
            declaration.methods
              .filter(method => !method.scope || method.scope === 'public') // public methods
              .forEach(method => {
                if (method.overloads.length > 0) {
                  method.overloads.forEach(methodOverload => {
                    const classStructure = { ...declaration };
                    delete classStructure.methods; // avoids circular ref
                    methodOverload.classStructure = classStructure; //stores a ref to the class (parent) structure
                  });

                  produceMethodResult(modulePath, name, declaration.kind, method.name,
                    { sources: method.overloads, index: analyseFunction(modulePath, method) });
                }
              });
            // calculate the metric for the class
            if (results.hasOwnProperty(modulePath) && (results[modulePath]).hasOwnProperty(name)) {
              const classResult = results[modulePath][name];

              let indexes = 0;
              for (let { usabilityResult } of classResult.methods) {
                indexes += usabilityResult.index;
              }

              classResult.usabilityResult = {
                index: safeDiv(indexes, classResult.methods.length)
              };
            }
            break;
        }
      });
    }
  }
  // calculates the metric for the module
  for (const [modulePath, moduleComponents] of Object.entries(results)) {
    let indexes = 0;
    for (let { usabilityResult } of Object.values(moduleComponents)) {
      indexes += usabilityResult.index;
    }

    results[modulePath] = {
      moduleComponents,
      usabilityResult: {
        index: safeDiv(indexes, Object.keys(moduleComponents).length)
      }
    };
  }

  return results;
}