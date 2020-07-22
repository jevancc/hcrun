const shell = require("shelljs");
const consola = require("consola");
const fs = require("fs");
const path = require("path");
const request = require("superagent");
const tempy = require("tempy");
const _ = require("lodash");
const chalk = require("chalk");
const execFileSync = require("child_process").execFileSync;
const config = require(path.join(__dirname, "package.json")).config;

function formatNum(x, addPlusSign = false) {
  x = parseInt(x);
  x = isNaN(x) ? -100 : x;
  return (
    (x > 0 && addPlusSign ? "+" : "") +
    x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  );
}

const Loglevel = {
  All: 0,
  OnlyBetter: 1,
  Silent: 2
};
exports.Loglevel = Loglevel;

class Scorer {
  static bestTotalScore = 0;
  static bestTotalScoreUpdated = false;

  constructor(loglevel = Loglevel.All, scorer = null, updateRemote = true) {
    this.scorer = scorer;
    this.loglevel = loglevel;
    this.updateRemote = !!updateRemote;
    this.logger = consola.create();
  }

  evaluate(indata, outdata) {
    const scorerStdin = indata.trim() + "\n" + outdata.trim();
    const score = parseInt(
      execFileSync(this.scorer, [], {
        shell: true,
        input: scorerStdin
      })
    );
    return score;
  }

  evaluateWithShellJS(indata, outdata) {
    const scorerStdin = indata.trim() + "\n" + outdata.trim();
    const tempFile = tempy.file();
    fs.writeFileSync(tempFile, scorerStdin);
    const score = parseInt(
      shell.cat(tempFile).exec(this.scorer, { silent: true })
    );
    shell.rm("-f", tempFile);
    return score;
  }

  async update(infile, indata, outdata) {
    let res = null;
    if (this.scorer) {
      indata = indata || shell.cat(infile).stdout;
      const score = this.evaluate(indata, outdata) || -2;

      res = await request
        .post(`http://${config.server.host}:${config.server.port}/score`)
        .query({ update: this.updateRemote })
        .send({ infile: path.basename(infile), output: outdata, score: score });
    } else {
      res = await request
        .post(`http://${config.server.host}:${config.server.port}/score`)
        .query({ update: this.updateRemote, evaluate: true })
        .send({ infile: path.basename(infile), output: outdata });
    }

    const { score, oldScore, totalScore } = res.body;
    if (Scorer.bestTotalScore < totalScore) {
      Scorer.bestTotalScoreUpdated = true;
      Scorer.bestTotalScore = totalScore;
    }

    this.log(infile, score, oldScore);
    return score;
  }

  log(infile, score, oldScore, color = "blue", colorScore = "white") {
    if (
      this.loglevel === Loglevel.All ||
      (this.loglevel === Loglevel.OnlyBetter && score > oldScore)
    ) {
      const inStr = _.padEnd(path.basename(infile), 30);
      const coloredInStr = chalk[color](inStr);

      const scoreStr = _.padStart(formatNum(score), 20);
      const coloredScoreStr = chalk[colorScore](scoreStr);

      const scoreBiasStr = formatNum(score - oldScore, true);
      const coloredScoreBiasStr =
        score > oldScore ? chalk.green(scoreBiasStr) : chalk.red(scoreBiasStr);

      this.logger.info(
        `${coloredInStr}|${coloredScoreStr}(${coloredScoreBiasStr})`
      );
    }
  }

  logBestTotalScore() {
    if (
      this.loglevel === Loglevel.All ||
      (this.loglevel === Loglevel.OnlyBetter && Scorer.bestTotalScoreUpdated)
    ) {
      const inStr = _.padEnd(path.basename("BestTotalScore"), 30);
      const coloredInStr = chalk.yellow(inStr);

      const scoreStr = _.padStart(formatNum(Scorer.bestTotalScore), 20);
      const coloredScoreStr = chalk.yellow(scoreStr);

      this.logger.info(`${coloredInStr}|${coloredScoreStr}`);
      Scorer.bestTotalScoreUpdated = false;
    }
  }
}
exports.Scorer = Scorer;
