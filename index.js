#!/usr/bin/env node
const shell = require("shelljs");
const consola = require("consola");
const sleep = require("await-sleep");
const fs = require("fs");
const score = require("./score");
const _ = require("lodash");
const path = require("path");
const config = require(path.join(__dirname, "package.json")).config;

function checkFileExists(file) {
  if (!file || fs.existsSync(file)) {
    return true;
  } else {
    throw new Error(`Argument check failed: "${file}" is not a readable file`);
  }
}

const argv = require("yargs")
  .option("program", {
    alias: "p",
    type: "string"
  })
  .option("nonstop", {
    type: "boolean",
    default: false
  })
  .option("silent", {
    type: "boolean",
    default: false
  })
  .option("jobs", {
    alias: "j",
    type: "number",
    default: 1
  })
  .option("input", {
    alias: "i",
    type: "string",
    default: "a,b,c,d,e,f"
  })
  .option("output", {
    alias: "o",
    type: "array"
  })
  .option("scorer", {
    alias: "s",
    type: "string",
    default: null
  })
  .option("noupdate", {
    type: "boolean",
    default: false
  })
  .check(argv => checkFileExists(argv.scorer))
  .check(argv => checkFileExists(argv.program)).argv;

const infileMap = (mp => {
  for (const key in mp) {
    mp[key] = path.join(__dirname, mp[key]);
    checkFileExists(mp[key]);
  }
  return mp;
})(config.infileMap);

argv.input = argv.input
  .trim()
  .split(",")
  .map(t => {
    if (t in infileMap) {
      return infileMap[t];
    } else {
      consola.error(`Input file token '${t}' not found`);
    }
  })
  .filter(v => !!v);
const infileCache = {};

async function run(jobid) {
  let loglevel = score.Loglevel.All;
  if (argv.slient) {
    loglevel = score.Loglevel.Silent;
  } else if (argv.nonstop) {
    loglevel = score.Loglevel.OnlyBetter;
  }

  let scorer = new score.Scorer(loglevel, argv.scorer, !argv.noupdate);
  let totalScore = 0;

  try {
    for (const f of argv.input) {
      totalScore += await new Promise((resolve, reject) => {
        shell
          .cat(f)
          .exec(
            argv.program,
            { silent: true },
            async (code, stdout, stderr) => {
              const indata =
                infileCache[f] || (infileCache[f] = shell.cat(f).stdout);
              const score = await scorer.update(f, indata, stdout);
              resolve(score);
            }
          );
      });
    }
  } catch (e) {
    consola.error(e);
    return;
  }

  scorer.log(
    "YourTotalScore",
    totalScore,
    score.Scorer.bestTotalScore,
    "cyan",
    "cyan"
  );
  scorer.logBestTotalScore();
  if (argv.nonstop) {
    setTimeout(() => run(jobid), 0);
  }
}

async function evaluate() {
  if (argv.input.length != argv.output.length) {
    consola.error("Number of input files must be the same as the output files");
    process.exit(-1);
  }

  let scorer = new score.Scorer(
    score.Loglevel.All,
    argv.scorer,
    !argv.noupdate
  );
  for (const [f, o] of _.zip(argv.input, argv.output)) {
    await scorer.update(f, shell.cat(f).stdout, shell.cat(o).stdout);
  }
  scorer.logBestTotalScore();
}

async function main() {
  if (argv.output) {
    evaluate();
  } else {
    for (let i = 1; i <= argv.jobs; i++) {
      run(i);
      await sleep(10);
    }
  }
}

main();
