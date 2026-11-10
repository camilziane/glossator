/**
 * The tool's names, in one place: the app, its messages and the API header follow these constants.
 */

/** The command users type: `glossator build`, `glossator serve`. */
export const CLI_NAME = "glossator"

/** The app's name in titles and the top bar's wordmark. */
export const APP_NAME = "glossator"

/** The header a decision on inbox papers needs (`glossator serve` refuses a POST without it). */
export const DECISION_HEADER = "X-Glossator"
export const DECISION_HEADER_VALUE = "1"

/** The ids of inbox papers, as a command line takes them. */
function ids(list: string | readonly string[]): string {
  return typeof list === "string" ? list : list.join(" ")
}

/**
 * Every command the app suggests (empty states, notices, the inbox without its API), built from
 * CLI_NAME: never spell one by hand.
 */
export const commands = {
  build: `${CLI_NAME} build`,
  serve: `${CLI_NAME} serve`,
  /** Build this app once on a computer (web/out/). */
  web: `${CLI_NAME} web`,
  /** Add an article to a bibliography from its DOI (a `<DOI>` placeholder by default). */
  curate: (bib: string, doi = "<DOI>") => `${CLI_NAME} curate ${doi} --bib ${bib}`,
  /** What is wrong with an article's record. */
  check: (key: string, bib: string) => `${CLI_NAME} check ${key} --bib ${bib}`,
  /** Every record of every bibliography. */
  checkAll: `${CLI_NAME} check --all`,
  inboxInit: `${CLI_NAME} inbox init`,
  inboxStart: `${CLI_NAME} inbox start`,
  inboxRun: `${CLI_NAME} inbox run`,
  inboxAccept: (list: string | readonly string[]) => `${CLI_NAME} inbox accept ${ids(list)}`,
  inboxReject: (list: string | readonly string[]) => `${CLI_NAME} inbox reject ${ids(list)}`,
  /** The accepted inbox papers into their bibliographies: the agent's command, then the CLI's. */
  addAccepted: `/${CLI_NAME}-add inbox`,
  curateAccepted: `${CLI_NAME} curate --inbox`,
} as const
