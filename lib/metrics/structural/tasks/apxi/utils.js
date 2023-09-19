import { safeDiv } from "../../utils.js";

const reduceComplexities = (complexities) =>
  safeDiv(complexities.reduce((prev, curr) => prev + curr, 0), complexities.length);

const calculateAPXI = (cl, cs) => safeDiv(cl + cs, 2);

export {
  reduceComplexities,
  calculateAPXI
}