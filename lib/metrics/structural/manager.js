import _ from 'lodash';
import { Piscina } from 'piscina';
import { from, merge, ReplaySubject } from 'rxjs';

import * as metricsFn from './index.js';

const metrics =
  Object.entries(metricsFn).reduce((prev, curr) => prev.concat({ name: curr[0].replace('compute', ''), compute: curr[1] }), []);

class Manager {
  static pool = new Piscina({
    filename: new URL('./tasks/index.js', import.meta.url).href
  });

  #projectConfig
  #modules;
  #metrics;
  #metricsOpts;
  #subject;

  constructor(projectConfig, modules, metricsOpts) {
    this.#projectConfig = projectConfig;
    this.#modules = modules;
    this.#metricsOpts = metricsOpts;
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

  computeMetricsAsObservable() {
    if(!this.#subject){
      this.#subject = new ReplaySubject();
      merge(...this.#metrics.map(metric => from(metric.call(this, this.#metricsOpts)))).subscribe(this.#subject);
    }
    return this.#subject;
  }
}

export default function createManager(projectConfig, modules, metricsFilter = [], metricsOpts){
  const manager = new Manager(projectConfig, modules, metricsOpts);
  manager.metrics = metrics.filter(metric => !metricsFilter.includes(metric.name)).map(metric => metric.compute);

  return manager;
}