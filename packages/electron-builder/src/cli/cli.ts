#! /usr/bin/env node

import { cyan, dim, green, reset, underline } from "chalk"
import { exec, log, warn } from "electron-builder-util"
import { printErrorAndExit } from "electron-builder-util/out/promise"
import { readJson } from "fs-extra-p"
import isCi from "is-ci"
import * as path from "path"
import updateNotifier from "update-notifier"
import yargs from "yargs"
import { build, configureBuildCommand } from "../builder"
import { getConfig, getElectronVersion } from "../util/config"
import { getGypEnv } from "../util/yarn"
import { createSelfSignedCert } from "./create-self-signed-cert"
import { configureInstallAppDepsCommand, installAppDeps } from "./install-app-deps"

yargs
  .command(<any>["build", "*"], "Build", configureBuildCommand, wrap(build))
  .command("install-app-deps", "Install app deps", configureInstallAppDepsCommand, wrap(installAppDeps))
  .command("node-gyp-rebuild", "Rebuild own native code", configureInstallAppDepsCommand /* yes, args the same as for install app deps */, wrap(rebuildAppNativeCode))
  .command("create-self-signed-cert", "Create self-signed code signing cert for Windows apps",
    yargs => yargs
      .option("publisher", {
        alias: ["p"],
        type: "string",
        requiresArg: true,
        description: "The publisher name",
      })
      .demandOption("publisher"),
    wrap(argv => createSelfSignedCert(argv.publisher)))
  .help()
  .epilog(`See the Wiki (${underline("https://github.com/electron-userland/electron-builder/wiki")}) for more documentation.`)
  .strict()
  .argv

function wrap(task: (args: any) => Promise<any>) {
  return (args: any) => {
    checkIsOutdated()
    task(args)
      .catch(printErrorAndExit)
  }
}

function checkIsOutdated() {
  if (isCi || process.env.NO_UPDATE_NOTIFIER != null) {
    return
  }

  readJson(path.join(__dirname, "..", "..", "package.json"))
    .then(it => {
      if (it.version === "0.0.0-semantic-release") {
        return
      }

      const notifier = updateNotifier({pkg: it})
      if (notifier.update != null) {
        notifier.notify({
          message: `Update available ${dim(notifier.update.current)}${reset(" → ")}${green(notifier.update.latest)} \nRun ${cyan("yarn upgrade electron-builder")} to update`
        })
      }
    })
    .catch(e => warn(`Cannot check updates: ${e}`))
}

async function rebuildAppNativeCode(args: any) {
  const projectDir = process.cwd()
  const config = await getConfig(projectDir, null, null, null)
  log(`Execute node-gyp rebuild for ${args.platform}:${args.arch}`)
  // this script must be used only for electron
  await exec(process.platform === "win32" ? "node-gyp.cmd" : "node-gyp", ["rebuild"], {
    env: getGypEnv({version: await getElectronVersion(config, projectDir), useCustomDist: true}, args.platform, args.arch, true),
  })
}