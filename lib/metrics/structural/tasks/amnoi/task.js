import { Project, StructureKind } from "ts-morph";
import { safeDiv, createTmpFile, normalizeType, setModuleIfNotSet, ERROR_CODE, ERROR_MESSAGE, Kind } from "../../utils.js";
import _ from 'lodash';
import os from 'os';
import ManyKeysMap from 'many-keys-map';
import path from 'path';

let tsProject;

const calculateAMNOI = (returnTypesSetCardinality, overloadCardinality) =>
  1 - safeDiv(returnTypesSetCardinality - 1, overloadCardinality - 1);

function typeSet(modulePath, types, pathToProperty) {
  const sourceFile = tsProject.getSourceFile(path.resolve(tsProject.getCompilerOptions().configFilePath, modulePath));
  const tmpSourceFile = createTmpFile(sourceFile);

  const getter = pathToProperty ? _fp.get(pathToProperty) : _.identity;

  const equalityChecking = new Map();
  const manyKeysMap = new ManyKeysMap();

  for (let i = 0; i < types.length; i++) {
    for (let j = 0; j < types.length; j++) {
      let [a, b] =
        [getter(types[i]), getter(types[j])];

      // no need to proceed if any one of the types is of type any
      // the same is true if index i is equal to j
      if (i !== j && (a !== 'any' && b !== 'any')) {
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

const prepareFunctionResult = results => (modulePath, name, kind, sources, score, className) => {
  setModuleIfNotSet(results, modulePath);
  const moduleResult = results[modulePath];

  let functionResultId;
  if (className) {
    functionResultId = className + '.' + name;
    moduleResult[functionResultId] = { className };
  } else {
    functionResultId = name;
    moduleResult[functionResultId] = {};
  }

  moduleResult[functionResultId] = Object.assign({
    name,
    kind,
    sources,
    usability: {
      score
    }
  }, moduleResult[functionResultId]);
}

export default function computeAMNOI({ configFilePath, chunkedModule }) {
  let results = {};
  const produceFunctionResult = prepareFunctionResult(results)

  //reconstruct project
  tsProject = new Project({
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
              produceFunctionResult(modulePath, name, Kind.FUNCTION,
                declaration.overloads, analyseFunction(modulePath, declaration));
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

                  produceFunctionResult(modulePath, method.name, Kind.CLASS_METHOD,
                    method.overloads, analyseFunction(modulePath, method), name);
                }
              });
            break;
        }
      });
    }
    // calculates the metric for the module
    if (results[modulePath]) {
      let scores = 0;
      for (const { usability } of Object.values(results[modulePath])) {
        scores += usability.score;
      }

      results[modulePath] = {
        moduleComponents: results[modulePath],
        usability: {
          score: safeDiv(scores, Object.keys(results[modulePath]).length)
        }
      };
    }
  }

  return results;
}