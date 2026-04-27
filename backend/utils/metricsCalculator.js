function roundMetric(value, digits = 5) {
  if (value == null || Number.isNaN(value)) {
    return null;
  }

  return Number(value.toFixed(digits));
}

function toBinaryLabel(value) {
  return Number(value) === 1 ? 1 : 0;
}

function calculateConfusionMatrix(rows = [], threshold = 0.5) {
  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  let trueNegative = 0;

  for (const row of rows) {
    const actual = toBinaryLabel(row.actual);
    // If the model did not persist a hard class prediction, derive one from the score.
    const predicted =
      typeof row.predicted === "number"
        ? toBinaryLabel(row.predicted)
        : Number(row.probability) >= threshold
          ? 1
          : 0;

    if (predicted === 1 && actual === 1) truePositive += 1;
    if (predicted === 1 && actual === 0) falsePositive += 1;
    if (predicted === 0 && actual === 1) falseNegative += 1;
    if (predicted === 0 && actual === 0) trueNegative += 1;
  }

  const sampleSize = rows.length;
  const accuracy = sampleSize ? (truePositive + trueNegative) / sampleSize : null;
  const precision =
    truePositive + falsePositive ? truePositive / (truePositive + falsePositive) : null;
  const recall =
    truePositive + falseNegative ? truePositive / (truePositive + falseNegative) : null;
  const falseAlarmRate =
    falsePositive + trueNegative ? falsePositive / (falsePositive + trueNegative) : null;

  return {
    truePositive,
    falsePositive,
    falseNegative,
    trueNegative,
    accuracy: roundMetric(accuracy),
    precision: roundMetric(precision),
    recall: roundMetric(recall),
    falseAlarmRate: roundMetric(falseAlarmRate),
    sampleSize,
  };
}

function calculateAUC(data = []) {
  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  const normalized = data
    .map((item) => ({
      actual: toBinaryLabel(item.actual),
      probability: Number(item.probability),
    }))
    .filter((item) => Number.isFinite(item.probability));

  const positiveCount = normalized.filter((item) => item.actual === 1).length;
  const negativeCount = normalized.length - positiveCount;

  if (!positiveCount || !negativeCount) {
    return null;
  }

  normalized.sort((a, b) => b.probability - a.probability);

  let truePositive = 0;
  let falsePositive = 0;
  let previousTruePositiveRate = 0;
  let previousFalsePositiveRate = 0;
  let area = 0;
  let index = 0;

  while (index < normalized.length) {
    const currentProbability = normalized[index].probability;

    // Group equal scores so tied predictions contribute one trapezoid step.
    while (
      index < normalized.length &&
      normalized[index].probability === currentProbability
    ) {
      if (normalized[index].actual === 1) {
        truePositive += 1;
      } else {
        falsePositive += 1;
      }
      index += 1;
    }

    const truePositiveRate = truePositive / positiveCount;
    const falsePositiveRate = falsePositive / negativeCount;

    // Trapezoidal integration across adjacent ROC points.
    area +=
      (falsePositiveRate - previousFalsePositiveRate) *
      (truePositiveRate + previousTruePositiveRate) /
      2;

    previousTruePositiveRate = truePositiveRate;
    previousFalsePositiveRate = falsePositiveRate;
  }

  return roundMetric(area);
}

module.exports = {
  calculateConfusionMatrix,
  calculateAUC,
};
