import { StructureKind } from "ts-morph";
import { safeDiv } from "./utils.js";

// solution based on https://stackoverflow.com/a/27418136
const wordCount = str => str.match(/(\w+)/g)?.length || 0;

const calculateADI = wordCount =>
  wordCount > 50 ? 1 : safeDiv(wordCount, 50);


/**
 * Calculates the API Documentation Index (ADI) metric
 */
export default async function computeADI() {
  const fnWordsDocs = {};

  for (let [modulePath, mapDeclarations] of this.modules) {
    if (!fnWordsDocs[modulePath]) {
      fnWordsDocs[modulePath] = {};
    }
    for (let [name, declarations] of mapDeclarations) {
      declarations.forEach((declaration) => {
        switch (declaration.kind) {
          case StructureKind.Function:
            let fnResult = {
              kind: declaration.kind,
              usabilityResult: {
                wordCount: 0,
                index: 0
              },
              sources: declaration
            };
            fnWordsDocs[modulePath][name] = fnResult;

            if (declaration.overloads.length > 0) {
              declaration.overloads.forEach(overload => {
                fnResult.usabilityResult.wordCount =
                  fnResult.usabilityResult.wordCount +
                  wordCount(overload.docs.reduce((prev, curr) => prev + curr.description, ''));
              });
            }

            fnResult.usabilityResult.wordCount =
              fnResult.usabilityResult.wordCount +
              wordCount(declaration.docs.reduce((prev, curr) => prev + curr.description, ''));
            fnResult.usabilityResult.index = calculateADI(fnResult.usabilityResult.wordCount);
            break;
          case StructureKind.Class:

            fnWordsDocs[modulePath][name] = {
              kind: declaration.kind,
              usabilityResult: {
                wordCount: 0,
                index: 0
              },
              methods: []
            }
            let methodResult;
            declaration.methods
              .filter(method => !method.scope || method.scope === 'public') // public methods
              .forEach(method => {
                methodResult = {
                  name: method.name,
                  usabilityResult: {
                    index: 0
                  },
                  sources: method
                };

                if (method.overloads.length > 0) {
                  method.overloads.forEach(methodOverload => {
                    methodResult.usabilityResult.wordCount =
                      methodResult.usabilityResult.wordCount +
                      wordCount(methodOverload.docs.reduce((prev, curr) => prev + curr.description, ''));
                  });
                }
                methodResult.usabilityResult.wordCount =
                  methodResult.usabilityResult.wordCount +
                  wordCount(declaration.docs.reduce((prev, curr) => prev + curr.description, ''));

                methodResult.usabilityResult.index = calculateADI(methodResult.usabilityResult.wordCount);

                fnWordsDocs[modulePath][name].methods.push(methodResult);
              });

            let indexes =
              fnWordsDocs[modulePath][name].methods.reduce((prev, curr) => prev + curr.usabilityResult.index, 0);
            fnWordsDocs[modulePath][name].usabilityResult.index = safeDiv(indexes, fnWordsDocs[modulePath][name].methods.length);
            break;
        }
      });
    }



    let indexes = 0;
    for (let { usabilityResult } of Object.values(fnWordsDocs[modulePath])) {
      indexes += usabilityResult.index;
    }
    fnWordsDocs[modulePath] = {
      moduleComponents: fnWordsDocs[modulePath],
      usabilityResult: {
        index: safeDiv(indexes, Object.keys(fnWordsDocs[modulePath]).length)
      }
    }

  }

  // calculate the metrics for all the modules
  let indexes = 0;
  for (let { usabilityResult } of Object.values(fnWordsDocs)) {
    indexes += usabilityResult.index;
  }


  return {
    projectName: this.projectConfig.name,
    metric: 'ADI',
    usabilityResult: {
      index: safeDiv(indexes, Object.keys(fnWordsDocs).length)
    },
    modules: fnWordsDocs
  };
}