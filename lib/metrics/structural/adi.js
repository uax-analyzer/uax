import { StructureKind } from "ts-morph";
import { safeDiv } from "./utils.js";
import _ from 'lodash';

import { Kind } from './utils.js';

// solution based on https://stackoverflow.com/a/27418136
const wordCount = str => str.match(/(\w+)/g)?.length || 0;

const calculateADI = wordCount =>
  wordCount > 50 ? 1 : safeDiv(wordCount, 50);

/**
 * Calculates the API Documentation Index (ADI) metric
 */
export default async function computeADI() {
  const fnWordsDocs = {};

  for (const [modulePath, mapDeclarations] of this.modules) {
    if (!fnWordsDocs[modulePath]) {
      fnWordsDocs[modulePath] = {};
    }
    for (let [name, declarations] of mapDeclarations) {
      declarations.forEach((declaration) => {
        switch (declaration.kind) {
          case StructureKind.Function:
            let fnResult = {
              name,
              kind: Kind.FUNCTION,
              usability: {
                wordCount: 0,
                score: 0
              },
              sources: declaration
            };

            if (declaration.overloads.length > 0) {
              declaration.overloads.forEach(overload => {
                fnResult.usability.wordCount =
                  fnResult.usability.wordCount +
                  wordCount(overload.docs.reduce((prev, curr) => prev + curr.description, ' '));
              });
            }

            fnResult.usability.wordCount =
              fnResult.usability.wordCount +
              wordCount(declaration.docs.reduce((prev, curr) => prev + curr.description, ' '));

            fnResult.usability.score = calculateADI(fnResult.usability.wordCount);

            fnWordsDocs[modulePath][name] = fnResult;
            break;
          case StructureKind.Class:
            let methodResult;
            // considers both static and instance methods
            declaration.methods
              .filter(method => !method.scope || method.scope === 'public') // public methods
              .forEach(method => {
                methodResult = {
                  name: method.name,
                  className: name,
                  Kind: Kind.CLASS_METHOD,
                  usability: {
                    score: 0,
                    wordCount: 0
                  },
                  sources: method
                };

                if (method.overloads.length > 0) {
                  method.overloads.forEach(methodOverload => {
                    methodResult.usability.wordCount =
                      methodResult.usability.wordCount +
                      wordCount(methodOverload.docs.reduce((prev, curr) => prev + curr.description, ' '));
                  });
                }
                methodResult.usability.wordCount =
                  methodResult.usability.wordCount +
                  wordCount(method.docs.reduce((prev, curr) => prev + curr.description, ' '));

                methodResult.usability.score = calculateADI(methodResult.usability.wordCount);

                fnWordsDocs[modulePath][name + '.' + method.name] = methodResult;
              });

            break;
        }
      });
    }

    if (_.isEmpty(fnWordsDocs[modulePath])) {
      delete fnWordsDocs[modulePath];
    } else {
      // calculates the metric for the module
      let scores = 0;
      for (const { usability } of Object.values(fnWordsDocs[modulePath])) {
        scores += usability.score;
      }

      fnWordsDocs[modulePath] = {
        moduleComponents: fnWordsDocs[modulePath],
        usability: {
          score: safeDiv(scores, Object.keys(fnWordsDocs[modulePath]).length)
        }
      }
    }
  }

  // calculate the metrics for all the modules
  let scores = 0;
  for (const { usability } of Object.values(fnWordsDocs)) {
    scores += usability.score;
  }

  return {
    projectName: this.projectConfig.name,
    metricName: 'ADI',
    usability: {
      score: safeDiv(scores, Object.keys(fnWordsDocs).length)
    },
    modules: fnWordsDocs
  };
}