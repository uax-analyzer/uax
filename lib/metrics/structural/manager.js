import _ from 'lodash';
import { Piscina } from 'piscina';
import { from, merge, ReplaySubject, firstValueFrom, toArray } from 'rxjs';
import { Node } from "ts-morph";
import path from 'path';

import * as metricsFn from './index.js';

// organize imported metrics functions
const metrics =
  Object.entries(metricsFn)
    .reduce((prev, curr) => prev.concat({ name: curr[0].replace('compute', ''), compute: curr[1] }), []);

function inspectExportedDecs(sourceFile) {
  const modules = new Map();
  let modulePath, declarationsMap;
  for (const [name, declarations] of sourceFile.getExportedDeclarations()) {
    declarations.forEach(declaration => {
      // declaration.isImplementation() is needed since the structure for function overload doesn't
      // have the name property
      if (Node.isClassDeclaration(declaration) || (Node.isFunctionDeclaration(declaration) && declaration.isImplementation())) {
        modulePath = path.relative(declaration.getProject().getCompilerOptions().configFilePath, declaration.getSourceFile().getFilePath());

        if (!modules.has(modulePath)) {
          modules.set(modulePath, new Map());
        }
        declarationsMap = modules.get(modulePath);

        if (!declarationsMap.has(name)) {
          declarationsMap.set(name, []);
        }
        let decs = declarationsMap.get(name);

        decs.push(declaration.getStructure());
      }
    });
  }
  return modules;
}

class Manager {
  static pool = new Piscina({
    filename: new URL('./tasks/index.js', import.meta.url).href
  });

  #projectConfig
  #modules;
  #metrics;
  #metricsOpts;
  #subject;

  constructor(projectConfig, metricsOpts) {
    this.#projectConfig = projectConfig;
    this.#metricsOpts = metricsOpts;
    this.#modules = inspectExportedDecs(projectConfig.sourceFile);
  }

  get projectConfig() {
    return this.#projectConfig;
  }

  get modules() {
    return this.#modules;
  }

  get metrics() {
    return this.#metrics;
  }

  set metrics(metrics) {
    this.#metrics = metrics;
  }

  recomputeMetrics() {
    this.#subject = null;
    return this;
  }

  computeMetricsAsObservable() {
    if (!this.#subject) {
      this.#subject = new ReplaySubject();
      merge(...this.#metrics.map(metric => from(metric.call(this, this.#metricsOpts)))).subscribe(this.#subject);
    }
    // if it was already computed, immediately return the subject
    return this.#subject;
  }

  computeMetrics() {
    return firstValueFrom(this.computeMetricsAsObservable().pipe(toArray()));
  }

}

export default function createManager(projectConfig, metricsFilter = [], metricsOpts) {
  const manager = new Manager(projectConfig, metricsOpts);
  manager.metrics = metrics.filter(metric => !metricsFilter.includes(metric.name)).map(metric => metric.compute);

  return manager;
}