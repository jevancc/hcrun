const _ = require("lodash");
const fs = require("fs");
const path = require("path");
const consola = require("consola");
const express = require("express");
const bodyParser = require("body-parser");
const shell = require("shelljs");
const spawn = require("child_process").spawn;
const AdmZip = require("adm-zip");
const moment = require("moment");

function checkFileExists(file) {
  if (!file || fs.existsSync(file)) {
    return true;
  } else {
    throw new Error(`Argument check failed: "${file}" is not a readable file`);
  }
}

const config = require(path.join(__dirname, "package.json")).config;
const infileMap = (mp => {
  for (const key in mp) {
    mp[key] = path.join(__dirname, mp[key]);
    checkFileExists(mp[key]);
  }
  return mp;
})(config.infileMap);

let optimalSolution = {};
let totalScore = 0;

try {
  optimalSolution = JSON.parse(
    fs.readFileSync(path.join(__dirname, "./optimalSolution.json"))
  );
  totalScore = _.sum(Object.values(optimalSolution).map(o => o.score));
  consola.info("Past score data loaded, current total score:", totalScore);
} catch (error) {
  consola.error(error);
}

setInterval(() => {
  fs.writeFileSync(
    path.join(__dirname, "./optimalSolution.json"),
    JSON.stringify(optimalSolution)
  );
}, config.server.writeSolutionInterval);

shell.mkdir("-p", path.join(__dirname, "./public/"));

const app = express();
app.use(bodyParser.json({ limit: "100mb", extended: true }));
app.use(bodyParser.urlencoded({ limit: "100mb", extended: true }));
app.use(express.static("public"));
app.set("view engine", "ejs");

const infileCache = {};

async function evaluateScore(infile, indata, outdata) {
  if (config.hcrun.scorerPath) {
    const scorerPath = path.join(__dirname, config.hcrun.scorerPath);
    infile = infileMap[path.basename(infile)[0]];

    if (!indata) {
      indata =
        infileCache[infile] || (infileCache[infile] = shell.cat(infile).stdout);
    }

    const scorerStdin = indata.trim() + "\n" + outdata.trim();

    return await new Promise(resolve => {
      const p = spawn(scorerPath, [], {
        shell: true
      });

      let stdout = "";
      p.stdout.on("data", data => {
        stdout += data.toString();
      });
      p.stdin.write(scorerStdin);
      p.stdin.end();

      p.on("close", () => {
        resolve(parseInt(stdout.trim()));
      });
    });
  } else {
    return -1;
  }
}

app.post("/score", async (req, res) => {
  let { infile, output } = req.body;
  let score = -1;
  if (req.query.evaluate === "true") {
    score = await evaluateScore(infile, null, output);
  } else {
    score = req.body.score || -1;
  }

  infile = path.basename(infile)[0];
  optimalSolution[infile] = optimalSolution[infile] || { score: 0, output: "" };
  let oldScore = optimalSolution[infile].score || 0;

  if (score > oldScore && req.query.update === "true") {
    optimalSolution[infile] = { score, output };
    totalScore += score - oldScore;
    consola.success(`Total score updated: ${totalScore}`);
  }

  res.json({ score, oldScore, totalScore });
});

app.get("/solution", async (req, res) => {
  const zip = new AdmZip();
  for (const infile in optimalSolution) {
    const solution = (optimalSolution[infile].output || "").trim();
    if (solution) {
      zip.addFile(`${infile}.out`, Buffer.alloc(solution.length, solution));
    }
  }

  const zipname = `Solution_${totalScore}_${moment().format("x")}.zip`;
  const zippath = path.join("public", zipname);
  zip.writeZip(zippath);

  res.status(200).download(zippath, zipname);
});

app.get("/hcrun", (req, res) => {
  res.status(200).download("./hcrun-1.0.0.tgz", "hcrun.tgz");
});

app.get("/", (req, res) => {
  const pastSolutions = shell
    .ls("public/Solution*.zip")
    .filter((f, i) => i < 10)
    .map(f => path.basename(f));

  const optimalScore = {};
  for (let [tok, file] of Object.entries(infileMap)) {
    file = path.basename(file);
    score = (optimalSolution[tok] && optimalSolution[tok].score) || 0;
    optimalScore[file] = score;
  }

  res.render("index.ejs", {
    baseUrl: `http://${config.server.host}:${config.server.port}`,
    pastSolutions,
    optimalScore,
    totalScore
  });
});

app.listen(config.server.port, "0.0.0.0");
