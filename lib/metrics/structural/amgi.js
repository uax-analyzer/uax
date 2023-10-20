import { StructureKind } from "ts-morph";
import { safeDiv } from "./utils.js";

// camel case/pascal case solution based on https://stackoverflow.com/a/54112355
const significantWordFilters =
  word => word.replace(/^(set|get)(?=\w)/g, '')
    .split(/_|\-|^(by|of|to)|(By|Of|To)|\[|\]|([A-Z][a-z]+)/g)
    .filter(w => w);

/**
 * Calculates the API Method Name Grouping Index (AMGI) metric
 */
export default async function computeAPLCI() {
  const functionsNames = new Set();

  for (let [_, mapDeclarations] of this.modules) {
    for (let [name, declarations] of mapDeclarations) {
      declarations.forEach((declaration) => {
        switch (declaration.kind) {
          case StructureKind.Function:
            functionsNames.add(name);
            break;
          case StructureKind.Class:
            declaration.methods
              .filter(method => !method.scope || method.scope === 'public') // public methods
              .forEach(method => {
                functionsNames.add(method.name);
              });
            break;
        }
      });
    }
  }

  const keywords = new Map();

  const filteredFnsNames = [...functionsNames]
    .map(significantWordFilters);

  for (let splittedNames of filteredFnsNames) {
    let nameOccurrences;
    for (let name of splittedNames) {
      if (!keywords.has(name)) {
        keywords.set(name, 0);
      }
      nameOccurrences = keywords.get(name);
      keywords.set(name, ++nameOccurrences);
    }
  }

  let keywordsRuns = new Map(
    [...keywords]
      .filter(([_, val]) => val >= 2)
      .map(keyword => { keyword[1] = Array(this.modules.size).fill(0); return keyword; }));

  let i = 0;
  for (let [_, mapDeclarations] of this.modules) {
    for (let [name, declarations] of mapDeclarations) {
      declarations.forEach((declaration) => {
        switch (declaration.kind) {
          case StructureKind.Function:
            let significantWords = significantWordFilters(name);
            significantWords.forEach(significantWord => {
              if (keywordsRuns.has(significantWord)) {
                let keywordsRun = keywordsRuns.get(significantWord);
                if (declaration.overloads.length) {
                  keywordsRun[i] += declaration.overloads.length;
                } else {
                  keywordsRun[i]++;
                }
              }
            });
            break;
          case StructureKind.Class:
            declaration.methods
              .filter(method => !method.scope || method.scope === 'public') // public methods
              .forEach(method => {
                let significantWords = significantWordFilters(method.name);
                significantWords.forEach(significantWord => {
                  if (keywordsRuns.has(significantWord)) {
                    let keywordsRun = keywordsRuns.get(significantWord);
                    if (method.overloads.length) {
                      keywordsRun[i] += method.overloads.length;
                    } else {
                      keywordsRun[i]++;
                    }
                  }
                });
              });
            break;
        }
      });
    }
    i++;
  }

  keywordsRuns = new Map([...keywordsRuns].map(keywordsRun => {
    keywordsRun[1] = keywordsRun[1].filter(run => run > 0);
    return keywordsRun;
  }));

  let index = 0;
  for (let [_, runs] of keywordsRuns) {
    index += (1 - safeDiv(runs.length - 1, runs.reduce((prev, curr) => prev + curr, 0) - 1));
  }

  console.log(safeDiv(index, keywordsRuns.size));
}