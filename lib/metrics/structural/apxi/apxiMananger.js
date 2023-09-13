import { once } from 'events';
import { setImmediate } from 'timers/promises';
import { Piscina } from 'piscina';
import _ from 'lodash';
import { calculateChunk, concatMaps } from '../utils.js';
import { reduceComplexities, calculateAPXI } from './utils.js';

const piscina = new Piscina({
  filename: new URL('./apxiWorker.js', import.meta.url).href
});

export default async function computeAPXI(configFilePath, modules, maxParamNumber = 4) {
  const chunkSize = calculateChunk(modules.size, piscina.threads.length);

  const chunkedModules = _.chunk([...modules], chunkSize);

  let jobs = [];
  for (let i = 0; i < chunkedModules.length; i++) {
    if (piscina.queueSize == piscina.options.maxQueue) {
      await once(piscina, 'drain');
    }
    // awaits till the next cycle
    // ensures a little of fairness among the managers putting their jobs to be executed
    // in the pool
    if (i != 0 && i % piscina.threads.length === 0) {
      await setImmediate();
    }
    jobs.push(piscina.run({ configFilePath, chunkedModule: chunkedModules[i], maxParamNumber }));
  }

  let modulesResults = await Promise.all(jobs);
  // concat all the maps provided by the workers in the pool
  modulesResults = concatMaps(modulesResults);

  // calculate the metrics for all the modules
  const paramLengthComplexities = [], paramSequenceComplexities = [];
  for (let moduleResult of modulesResults.values()) {
    paramLengthComplexities.push(moduleResult.analysisResult.paramLengthComplexity);
    paramSequenceComplexities.push(moduleResult.analysisResult.paramSequenceComplexity);
  }

  const paramLengthComplexity = reduceComplexities(paramLengthComplexities);
  const paramSequenceComplexity = reduceComplexities(paramSequenceComplexities);

  return {
    metric: 'APXI',
    analysisResult: {
      paramLengthComplexity, paramSequenceComplexity,
      index: calculateAPXI(paramLengthComplexity, paramSequenceComplexity),
    },
    modules: modulesResults
  };
}