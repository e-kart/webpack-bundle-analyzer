const _ = require('lodash');
const fs = require('fs');
const del = require('del');
const childProcess = require('child_process');

let nightmare;

describe('Analyzer', function () {
  this.timeout(5000);

  before(function () {
    const Nightmare = require('nightmare');
    nightmare = Nightmare();
    del.sync(`${__dirname}/output`);
  });

  beforeEach(async function () {
    this.timeout(15000);
    await nightmare.goto('about:blank');
  });

  afterEach(function () {
    del.sync(`${__dirname}/output`);
  });

  it('should support stats files with all the information in `children` array', async function () {
    generateReportFrom('with-children-array.json');
    await expectValidReport();
  });

  it('should support stats files with modules inside `chunks` array', async function () {
    generateReportFrom('with-modules-in-chunks/stats.json');
    const chartData = await getChartData();
    expect(chartData).to.containSubset(
      require('./stats/with-modules-in-chunks/expected-chart-data')
    );
  });

  it('should support bundles with invalid dynamic require calls', async function () {
    generateReportFrom('with-invalid-dynamic-require.json');
    await expectValidReport({statSize: 136});
  });

  it('should use information about concatenated modules generated by webpack 4', async function () {
    generateReportFrom('with-module-concatenation-info/stats.json');
    const chartData = await getChartData();
    expect(chartData[0].groups[0]).to.containSubset(
      require('./stats/with-module-concatenation-info/expected-chart-data')
    );
  });

  it("should not filter out modules that we could't find during parsing", async function () {
    generateReportFrom('with-missing-parsed-module/stats.json');
    const chartData = await getChartData();
    let unparsedModules = 0;
    forEachChartItem(chartData, item => {
      if (typeof item.parsedSize !== 'number') {
        unparsedModules++;
      }
    });
    expect(unparsedModules).to.equal(1);
  });

  it('should gracefully parse invalid chunks', async function () {
    generateReportFrom('with-invalid-chunk/stats.json');
    const chartData = await getChartData();
    const invalidChunk = _.find(chartData, {label: 'invalid-chunk.js'});
    expect(invalidChunk.groups).to.containSubset([
      {
        id: 1,
        label: 'invalid.js',
        path: './invalid.js',
        statSize: 24
      }
    ]);
    expect(invalidChunk.statSize).to.equal(24);
    expect(invalidChunk.parsedSize).to.equal(30);
  });

  it('should gracefully process missing chunks', async function () {
    generateReportFrom('with-missing-chunk/stats.json');
    const chartData = await getChartData();
    const invalidChunk = _.find(chartData, {label: 'invalid-chunk.js'});
    expect(invalidChunk).to.exist;
    expect(invalidChunk.statSize).to.equal(24);
    forEachChartItem([invalidChunk], item => {
      expect(typeof item.statSize).to.equal('number');
      expect(item.parsedSize).to.be.undefined;
    });
    const validChunk = _.find(chartData, {label: 'valid-chunk.js'});
    forEachChartItem([validChunk], item => {
      expect(typeof item.statSize).to.equal('number');
      expect(typeof item.parsedSize).to.equal('number');
    });
  });
});

function generateReportFrom(statsFilename) {
  childProcess.execSync(`../lib/bin/analyzer.js -m static -r output/report.html -O stats/${statsFilename}`, {
    cwd: __dirname
  });
}

async function getChartData() {
  return await nightmare
    .goto(`file://${__dirname}/output/report.html`)
    .evaluate(() => window.chartData);
}

function forEachChartItem(chartData, cb) {
  for (const item of chartData) {
    cb(item);

    if (item.groups) {
      forEachChartItem(item.groups, cb);
    }
  }
}

async function expectValidReport(opts) {
  const {
    bundleLabel = 'bundle.js',
    statSize = 141
  } = opts || {};

  expect(fs.existsSync(`${__dirname}/output/report.html`)).to.be.true;
  const chartData = await getChartData();
  expect(chartData[0]).to.containSubset({
    label: bundleLabel,
    statSize
  });
}
