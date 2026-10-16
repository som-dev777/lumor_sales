import packageJson from "../../package.json";

/** The app's version, from package.json (bumped once per release, D-004). */
export const APP_VERSION: string = packageJson.version;
