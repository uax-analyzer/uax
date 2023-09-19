import path from 'path';
import uniqueFilename from "unique-filename";
import _ from 'lodash';
import _fp from 'lodash/fp.js';
import { Node, SyntaxKind, StructureKind } from "ts-morph";
import os from 'os';

const ERROR_CODE = 2345,
  ERROR_MESSAGE = "Argument of type 'false' is not assignable to parameter of type 'true'.";

const replaceRange = (s, start, end, substitute) =>
  s.substring(0, start) + substitute + s.substring(end);

const safeDiv = (numerator, denominator) => (numerator / denominator || 0);

const hasOverload = declaration => !!(declaration?.getOverloads()?.length > 0);

const isPublic = declaration =>
  !declaration.hasModifier(SyntaxKind.PrivateKeyword) && !declaration.hasModifier(SyntaxKind.ProtectedKeyword);

const createTmpFile = sourceFile => {
  const randomTmpFile = path.basename(uniqueFilename('')) + ".ts";
  const tmpSourceFile = sourceFile.copy(randomTmpFile);

  tmpSourceFile.insertText(tmpSourceFile.getEnd(), `${os.EOL}import { assertType, CanAssign } from 'type-plus';${os.EOL}`);

  return tmpSourceFile;
}

const checkTypeEquality = tmpSourceFile => (a, b, ...paths) => {
  let result = true;
  const endOfFile = tmpSourceFile.getEnd();
  let getA, getB;

  getA = paths[0] ? _fp.get(paths[0]) : _.identity;
  getB = paths[1] ? _fp.get(paths[1]) : _.identity;


  tmpSourceFile.insertText(endOfFile, `
      assertType.isTrue(true as CanAssign<${getA(a) + ',' + getB(b)}>);
      assertType.isTrue(true as CanAssign<${getB(b) + ',' + getA(a)}>);
    `);

  let sourceFileDiagnostics = tmpSourceFile.getPreEmitDiagnostics();
  sourceFileDiagnostics = sourceFileDiagnostics
    .filter(diag => diag.getCode() === ERROR_CODE && diag.getMessageText() == ERROR_MESSAGE);
  if (sourceFileDiagnostics?.length > 0) {
    result = false;
  }

  tmpSourceFile.removeText(endOfFile, tmpSourceFile.getEnd());

  return result;
}

/* const normalizeType = (declaration, type) => {
  const constraint = new Map(), noConstraint = [];
  const structures = [];

  if (Node.isMethodDeclaration(declaration)) {
    const parentDeclaration = declaration.getFirstAncestorByKind(SyntaxKind.ClassDeclaration);
    structures.push(parentDeclaration.getStructure());
  }
  structures.push(declaration.getStructure());

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
  for (let [key, value] of constraint.entries()) {
    let match;
    while ((match = regex2.exec(value))) {
      value = replaceRange(value, match.index, match.index + match[0].length, `\(${constraint.get(match[0])}\)`);
    }
    constraint.set(key, value);
  }

  for (let [key, value] of constraint.entries()) {
    type = type.replace(new RegExp(`(?<![a-zA-Z0-9_$]+)${key}(?![a-zA-Z0-9_$])`, 'g'), value);
  }

  return type;
} */
/**
 * Returns the overlods return types. Automatically infer the runtime type parameters according to
 * the code restrictions (default type and constraint) and TS rules (type any for all other types).
 * @param {[FunctionDeclaration | MethodDeclaration]} overloads 
 * @returns {[string]} overload return types
 */
function returns(overloads) {
  return overloads.map(overload => {
    let structure = overload.getStructure();
    let returnType = structure.returnType?.trim();

    if (structure.typeParameters?.length > 0) {
      const constraint = new Map();
      const noConstraint = [];
      structure.typeParameters.forEach(typeParam => {
        if (typeParam.default) {
          constraint.set(typeParam.name, `(${typeParam.default})`);
        } else if (typeParam.constraint) {
          constraint.set(typeParam.name, `(${typeParam.constraint})`);
        } else {
          noConstraint.push(typeParam.name);
        }
      });
      if (noConstraint.length > 0) {
        const regexSimpleTypes = new RegExp(`(?<![a-zA-Z0-9_$]+)(${noConstraint.join('|')})(?![a-zA-Z0-9_$]+)`, 'g')

        returnType = returnType.replace(regexSimpleTypes, "any");

        for (let [key, value] of constraint.entries()) {
          constraint.set(key, value.replace(regexSimpleTypes, "any"));
        }
      }

      const regex2 = new RegExp(`(?<![a-zA-Z0-9_$]+)(${[...constraint.keys()].join("|")})(?![a-zA-Z0-9_$]+)`);
      for (let [key, value] of constraint.entries()) {
        let match;
        while ((match = regex2.exec(value))) {
          value = replaceRange(value, match.index, match.index + match[0].length, `\(${constraint.get(match[0])}\)`);
        }
        constraint.set(key, value);
      }

      for (let [key, value] of constraint.entries()) {
        returnType = returnType.replace(new RegExp(`(?<![a-zA-Z0-9_$]+)${key}(?![a-zA-Z0-9_$])`, 'g'), value);
      }
    }

    return returnType;
  });
}

/**
 * Creates a set of types (uniqueness) according to TS type equivalence (structural typing).
 * @param {SourceFile} sourceFile 
 * @param {[string]} types 
 * @returns 
 */
function typeSet(sourceFile, types) {

  const tmpSourceFile = createTmpFile(sourceFile);
  const isEqualType = checkTypeEquality(tmpSourceFile);

  const uniqueReturnType = _.uniqWith(types, (a, b) => isEqualType(a, b, 'returnType', 'returnType'));
  tmpSourceFile.delete();

  return uniqueReturnType;
}

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

function calculateChunk(iterablelength, numberOfWorkers) {
  numberOfWorkers *= 4;
  let chunkSize = Math.floor(iterablelength / numberOfWorkers);
  if (iterablelength % numberOfWorkers > 0) {
    chunkSize++;
  }
  return chunkSize;
}

/**
 * Concatanate Map objects
 * @param {*} iterables 
 * @returns Map object containing all passed map Objects
 */
function concatMaps(iterables) {
  const map = new Map();
  for (const iterable of iterables) {
    for (const item of iterable) {
      map.set(...item);
    }
  }
  return map;
}

export {
  ERROR_CODE,
  ERROR_MESSAGE,
  replaceRange,
  safeDiv,
  isPublic,
  hasOverload,
  normalizeType,
  createTmpFile,
  checkTypeEquality,
  returns,
  typeSet,
  calculateChunk,
  concatMaps
};