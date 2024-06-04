import path from 'path';
import { StructureKind, SyntaxKind, SyntaxList } from "ts-morph";

const getMethods = (obj) => {
  let properties = new Set()
  let currentObj = obj
  do {
    Object.getOwnPropertyNames(currentObj).map(item => properties.add(item))
  } while ((currentObj = Object.getPrototypeOf(currentObj)))
  return [...properties.keys()].filter(item => typeof obj[item] === 'function')
}
/**
 * Calculates the API Exception Specificity Index (AESI) metric
 */
export default async function () {
  for (let [modulePath, mapDeclarations] of this.modules) {
    let project = this.projectConfig.project
    let sourceFile = project.getSourceFile(path.resolve(project.getCompilerOptions().configFilePath, modulePath));
    for (let [name, declarations] of mapDeclarations) {
      declarations.forEach((declaration) => {
        switch (declaration.kind) {
          case StructureKind.Function:
            let fn = sourceFile.getFunction(name);
            //console.log(getMethods(fn));
            fn.getStatements().filter(stmt => stmt.isKind(SyntaxKind.ThrowStatement)).forEach(throwStmt => {
              //console.log(val.getExpression().getChildrenOfKind(SyntaxKind.Identifier)[0].getImplementations())
              let exp = throwStmt.getExpression();
              let implementation, sourceFileImp;
              if (exp) {
                switch (exp.getKind()) {
                  case SyntaxKind.NewExpression:
                    implementation = exp.getChildrenOfKind(SyntaxKind.Identifier)[0].getDefinitions()[0];
                    //sourceFileImp = implementation.getCompilerOptions().getFileName();
                    //console.log(sourceFileImp);
                    break;
                  case SyntaxKind.CallExpression:
                    implementation = exp.getChildrenOfKind(SyntaxKind.Identifier)[0].getDefinitions()[0];
                    //sourceFileImp = implementation.getCompilerOptions().getFileName();
                    console.log(getMethods(implementation));
                    break;
                }
              } else {
                implementation = throwStmt.getChildrenOfKind(SyntaxKind.Identifier)[0].getImplementations()[0];
                console.log(implementation);
              }
            });
            /* if (declaration.overloads.length > 0) {
              declaration.overloads.forEach(overload => {
                overload.parameters.map(param => param.name).forEach(parametersName.add, parametersName);
                overload.functionName = name;
                overload.modulePath = modulePath;
                functionsDeclarations.push(overload);
              });
            } else { */
            /* declaration.parameters.map(param => param.name).forEach(parametersName.add, parametersName);
            declaration.functionName = name;
            declaration.modulePath = modulePath;
            functionsDeclarations.push(declaration); */
            //}
            break;
          case StructureKind.Class:
            declaration.methods
              .filter(method => !method.scope || method.scope === 'public') // public methods
              .forEach(method => {
                /* if (method.overloads.length > 0) {
                  method.overloads.forEach(methodOverload => {
                    methodOverload.parameters.map(param => param.name).forEach(parametersName.add, parametersName);
                    methodOverload.declarationInfo = {
                      className: name,
                      modulePath
                    }
                    functionsDeclarations.push(methodOverload);
                  });
                } else { */
                /* method.parameters.map(param => param.name).forEach(parametersName.add, parametersName);
                method.declarationInfo = {
                  className: name,
                  modulePath
                }
                functionsDeclarations.push(method); */
                //}
              });
            break;
        }
      });
    }
  }
}