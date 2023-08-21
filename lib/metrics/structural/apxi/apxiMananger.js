import { Piscina } from 'piscina';
import _ from 'lodash';
import { calculateChunk, concatMaps } from '../util.js';
import { reduceComplexities, calculateAPXI } from './util.js';

const piscina = new Piscina({
  filename: new URL('./apxi2.js', import.meta.url).href
});

export default async function computeAPXI(configFilePath, modules, maxParamNumber = 4) {
  let chunkSize = calculateChunk(modules.size, piscina.threads.length);

  let chunkedModules = _.chunk([...modules], chunkSize);

  const resByModules = await Promise.all(chunkedModules.map(chunkedModule => piscina.run({ configFilePath, chunkedModule, maxParamNumber })));

  let results = concatMaps(resByModules);

  // calculate the metrics for all the modules
  const paramLengthComplexities = [], paramSequenceComplexities = [];
  for (let moduleResult of results.values()) {
    paramLengthComplexities.push(moduleResult.result.paramLengthComplexity);
    paramSequenceComplexities.push(moduleResult.result.paramSequenceComplexity);
  }

  const paramLengthComplexity = reduceComplexities(paramLengthComplexities);
  const paramSequenceComplexity = reduceComplexities(paramSequenceComplexities);

  results = {
    metric: 'APXI',
    index: calculateAPXI(paramLengthComplexity, paramSequenceComplexity),
    modules: results
  };

  return results;
}