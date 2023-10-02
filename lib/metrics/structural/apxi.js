import { once } from 'events';
import { setImmediate } from 'timers/promises';
import _ from 'lodash';
import { calculateChunk } from './utils.js';
import { reduceComplexities, calculateAPXI } from './tasks/apxi/utils.js';

export default async function computeAPXI(maxParamNumber = 4) {
  const chunkSize = calculateChunk(this.modules.size, this.constructor.pool.threads.length);

  const chunkedModules = _.chunk([...this.modules], chunkSize);

  const jobs = [];
  for (let i = 0; i < chunkedModules.length; i++) {
    // Checks if there's space on the pool's queue. Othewise, awaits.
    if (this.constructor.pool.queueSize == this.constructor.pool.options.maxQueue) {
      await once(this.constructor.pool, 'drain');
    }
    // awaits till the next cycle
    // ensures a little of fairness among the managers putting their jobs to be executed
    // in the pool
    if (i !== 0 && i % this.constructor.pool.threads.length === 0) {
      await setImmediate();
    }
    jobs.push(this.constructor.pool.run({ configFilePath: this.projectConfig.project.getCompilerOptions().configFilePath, chunkedModule: chunkedModules[i], maxParamNumber }, { name: 'computeAPXI' }));
  }

  let modulesResults = await Promise.all(jobs);
  // concat all the objects provided by the workers in the pool
  modulesResults = modulesResults.reduce((prev, curr) => Object.assign(prev, curr), {});

  // calculate the metrics for all the modules
  const paramLengthComplexities = [], paramSequenceComplexities = [];
  for (let { usabilityResult } of Object.values(modulesResults)) {
    paramLengthComplexities.push(usabilityResult.paramLengthComplexity);
    paramSequenceComplexities.push(usabilityResult.paramSequenceComplexity);
  }

  const paramLengthComplexity = reduceComplexities(paramLengthComplexities);
  const paramSequenceComplexity = reduceComplexities(paramSequenceComplexities);

  return {
    projectName: this.projectConfig.name,
    metric: 'APXI',
    usabilityResult: {
      paramLengthComplexity, paramSequenceComplexity,
      index: calculateAPXI(paramLengthComplexity, paramSequenceComplexity),
    },
    modules: modulesResults
  };
}