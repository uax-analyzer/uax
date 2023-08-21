import { StructureKind } from "ts-morph";
import { safeDiv } from "./util.js";

const reduceComplexities = (complexities) =>
  safeDiv(complexities.reduce((prev, curr) => prev + curr, 0), complexities.length);

const calculateAPXI = (cl, cs) => safeDiv(cl + cs, 2);

const normalizeType = (declaration, type) => {
  const constraint = new Map(), noConstraint = [];
  const structures = [];

  if (declaration.kind == StructureKind.Method || declaration.kind == StructureKind.MethodOverload) {
    structures.push(declaration.classStructure);
  }
  structures.push(declaration);

  structures.forEach(structure => {
    if (structure.typeParameters?.length > 0) {
      structure.typeParameters.forEach(typeParam => {
        if (typeParam.default) {
          constraint.set(typeParam.name, `(${typeParam.default})`);
        } else if (typeParam.constraint) {
          constraint.set(typeParam.name, `(${typeParam.constraint})`);
        } else {
          if (constraint.has(typeParam.name)) {
            constraint.delete(typeParam.name);
          }
          noConstraint.push(typeParam.name);
        }
      });
    }
  });

  if (noConstraint.length > 0) {
    const regexSimpleTypes = new RegExp(`(?<![a-zA-Z0-9_$]+)(${noConstraint.join('|')})(?![a-zA-Z0-9_$]+)`, 'g')

    type = type.replace(regexSimpleTypes, "any");

    for (let [key, value] of constraint.entries()) {
      constraint.set(key, value.replace(regexSimpleTypes, "any"));
    }
  }

  const regex2 = new RegExp(`(?<![a-zA-Z0-9_$]+)(${[...constraint.keys()].join("|")})(?![a-zA-Z0-9_$]+)`);
  for (let [key, value] of constraint) {
    let match;
    while ((match = regex2.exec(value))) {
      value = replaceRange(value, match.index, match.index + match[0].length, `\(${constraint.get(match[0])}\)`);
    }
    constraint.set(key, value);
  }

  for (let [key, value] of constraint) {
    type = type.replace(new RegExp(`(?<![a-zA-Z0-9_$]+)${key}(?![a-zA-Z0-9_$])`, 'g'), value);
  }

  return type;
}

export {
  reduceComplexities,
  calculateAPXI,
  normalizeType
}